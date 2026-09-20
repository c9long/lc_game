#!/usr/bin/env bash
# Local smoke test. Runs a dev server on its own port against a throwaway D1 directory, seeds a
# session, checks every route and the drill answer flow, then tears everything down. It never
# touches .wrangler/state (your real local data) or any dev server you have running.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-5199}
LOG=${LOG:-/tmp/lc-game-smoke.log}
STATE=$(mktemp -d)
export LC_D1_STATE="$STATE/v3"   # wrangler --persist-to DIR writes under DIR/v3; the Vite proxy wants the v3 directory
W="pnpm exec wrangler d1"

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "port $PORT is already in use; set PORT=<free port> and retry" >&2
  exit 1
fi

TOKEN="smoke-$(openssl rand -hex 8)"
HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)
NOW=$(date +%s000)
EXP=$((NOW + 2592000000))

$W migrations apply lc-game --local --persist-to "$STATE" >/dev/null
$W execute lc-game --local --persist-to "$STATE" --command \
  "INSERT INTO users (id, lc_username, timezone, has_premium, created_at) VALUES ('smoke-user', NULL, 'UTC', 0, $NOW);
   INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('$HASH', 'smoke-user', $EXP, $NOW);" >/dev/null

# Own process group so cleanup kills vite and workerd, not just the pnpm wrapper.
setsid pnpm dev --port "$PORT" --strictPort >"$LOG" 2>&1 &
PID=$!
cleanup() {
  kill -TERM -- -"$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  rm -rf "$STATE"
}
trap cleanup EXIT

for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://localhost:$PORT/auth/login" && break
  if ! kill -0 "$PID" 2>/dev/null; then echo "dev server exited early:"; tail -20 "$LOG"; exit 1; fi
  sleep 1
done

fail=0
check() {
  local expect=$1; shift
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$@")
  if [ "$code" = "$expect" ]; then echo "ok   $code $*"; else echo "FAIL $code (want $expect) $*"; fail=1; fi
}
B="http://localhost:$PORT"
check 200 "$B/auth/login"
check 303 "$B/"
check 401 "$B/api/solve/two-sum/tests"
check 403 -X POST -H "origin: https://evil.example" -H "cookie: lc_session=$TOKEN" "$B/api/sync"
check 200 -H "cookie: lc_session=$TOKEN" "$B/"
check 200 -H "cookie: lc_session=$TOKEN" "$B/tree"
check 200 -H "cookie: lc_session=$TOKEN" "$B/tree/arrays-hashing"
check 200 -H "cookie: lc_session=$TOKEN" "$B/city"
check 200 -H "cookie: lc_session=$TOKEN" "$B/admin"
check 200 -H "cookie: lc_session=$TOKEN" "$B/solve/two-sum"
check 404 -H "cookie: lc_session=$TOKEN" "$B/tree/no-such-node"
check 200 -H "cookie: lc_session=$TOKEN" "$B/api/solve/two-sum/tests"
# every NeetCode 150 problem now has a suite, so 404 needs a slug that is not one of them
check 404 -H "cookie: lc_session=$TOKEN" "$B/api/solve/no-such-problem/tests"
check 400 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"lang":"python3","code":"x","kind":"run","verdict":"Nonsense"}' "$B/api/solve/two-sum/verdict"
check 200 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"lang":"python3","code":"x","kind":"run","verdict":"Wrong Answer","passed":0,"total":3}' "$B/api/solve/two-sum/verdict"
check 200 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"lang":"python3","code":"print(1)"}' "$B/api/solve/two-sum/draft"
check 200 -H "cookie: lc_session=$TOKEN" "$B/drills"
check 400 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"drillId":"nope","answer":"x"}' "$B/api/drills/answer"
check 403 -H "cookie: lc_session=$TOKEN" "$B/api/drills/practice"
check 401 "$B/api/drills/practice"
check 200 "$B/solutions/python/0001-two-sum.py"

# Drill answer flow: the GET above created today's set; answer its first drill correctly.
TODAY=$(date -u +%F)
SET_JSON=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT value FROM game_state WHERE key = 'drillset:$TODAY'" 2>/dev/null)
FIRST_ID=$(printf '%s' "$SET_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;if(!r.length){console.log("");return;}console.log(JSON.parse(r[0].value).ids[0])})')
if [ -z "$FIRST_ID" ]; then
  echo "FAIL no drill set was created for $TODAY"; fail=1
else
  ANSWER=$(node -e 'const id=process.argv[1];const c=require("./data/drills/curation.json").extra;const m=require("./data/drills/python.json").drills;const d=[...c,...m].find(x=>x.id===id);process.stdout.write(d.answer)' "$FIRST_ID")
  BODY=$(node -e 'process.stdout.write(JSON.stringify({drillId:process.argv[1],answer:process.argv[2]}))' "$FIRST_ID" "$ANSWER")
  RESP=$(curl -s -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d "$BODY" "$B/api/drills/answer")
  if printf '%s' "$RESP" | grep -q '"correct":true'; then echo "ok   drill answer accepted ($FIRST_ID)"; else echo "FAIL drill answer: $RESP"; fail=1; fi
  INGOTS=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT amount FROM resources WHERE kind = 'ingots'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?r[0].amount:0)})')
  if [ "$INGOTS" -ge 1 ]; then echo "ok   ingots credited ($INGOTS)"; else echo "FAIL ingots not credited"; fail=1; fi
fi


# Unlimited practice: locked above, unlocks once every drill in the set has been answered (a wrong
# answer still counts as answered), and must never write ingots, schedule or history.
if [ -n "${FIRST_ID:-}" ]; then
  ALL_IDS=$(printf '%s' "$SET_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(JSON.parse(r[0].value).ids.join(" "))})')
  for id in $ALL_IDS; do
    [ "$id" = "$FIRST_ID" ] && continue
    BODY=$(node -e 'process.stdout.write(JSON.stringify({drillId:process.argv[1],answer:"zzz-not-the-answer"}))' "$id")
    curl -s -o /dev/null -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d "$BODY" "$B/api/drills/answer"
  done

  count_state() { $W execute lc-game --local --persist-to "$STATE" --json --command "$1" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?Object.values(r[0])[0]:0)})'; }
  ING_BEFORE=$(count_state "SELECT amount FROM resources WHERE kind = 'ingots'")
  ATT_BEFORE=$(count_state "SELECT COUNT(*) AS n FROM drill_attempts")
  SRS_BEFORE=$(count_state "SELECT COUNT(*) AS n FROM drill_state")

  check 200 -H "cookie: lc_session=$TOKEN" "$B/api/drills/practice"
  PRAC=$(curl -s -H "cookie: lc_session=$TOKEN" "$B/api/drills/practice")
  PRAC_ID=$(printf '%s' "$PRAC" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.drill?j.drill.id:"")})')
  if [ -z "$PRAC_ID" ]; then echo "FAIL practice returned no drill: $PRAC"; fail=1; else
    if printf '%s' "$PRAC" | grep -q '"answer"'; then echo "FAIL practice leaked the answer to the client"; fail=1; else echo "ok   practice drill served without its answer"; fi
    if printf '%s' "$ALL_IDS" | tr ' ' '\n' | grep -qx "$PRAC_ID"; then echo "FAIL practice served a drill from today's set"; fail=1; else echo "ok   practice avoids today's set"; fi
    PBODY=$(node -e 'process.stdout.write(JSON.stringify({drillId:process.argv[1],answer:"zzz-not-the-answer"}))' "$PRAC_ID")
    PRESP=$(curl -s -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d "$PBODY" "$B/api/drills/practice")
    if printf '%s' "$PRESP" | grep -q '"correct":false'; then echo "ok   practice answer checked"; else echo "FAIL practice answer: $PRESP"; fail=1; fi
  fi

  ING_AFTER=$(count_state "SELECT amount FROM resources WHERE kind = 'ingots'")
  ATT_AFTER=$(count_state "SELECT COUNT(*) AS n FROM drill_attempts")
  SRS_AFTER=$(count_state "SELECT COUNT(*) AS n FROM drill_state")
  if [ "$ING_BEFORE" = "$ING_AFTER" ] && [ "$ATT_BEFORE" = "$ATT_AFTER" ] && [ "$SRS_BEFORE" = "$SRS_AFTER" ]; then
    echo "ok   practice awarded and recorded nothing (ingots $ING_AFTER, attempts $ATT_AFTER, schedule $SRS_AFTER)"
  else
    echo "FAIL practice changed state: ingots $ING_BEFORE->$ING_AFTER attempts $ATT_BEFORE->$ATT_AFTER schedule $SRS_BEFORE->$SRS_AFTER"; fail=1
  fi
fi


# Regenerating the plan after the drills are finished must not lose the Forge tick. The stored flag
# is written once, when the set completes, so a plan built later never receives it; doneness has to
# come from the drill set itself.
if [ -n "${FIRST_ID:-}" ]; then
  $W execute lc-game --local --persist-to "$STATE" --command \
    "DELETE FROM plan_items WHERE plan_date = '$TODAY'; DELETE FROM plans WHERE date = '$TODAY';" >/dev/null
  curl -s -o /dev/null -H "cookie: lc_session=$TOKEN" "$B/"   # rebuilds today's plan
  DRILLS_DONE=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT done FROM plan_items WHERE plan_date = '$TODAY' AND kind = 'drills'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?r[0].done:"missing")})')
  if [ "$DRILLS_DONE" = "1" ]; then echo "ok   regenerated plan keeps the drills slot done"; else echo "FAIL regenerated plan lost the drills tick (done=$DRILLS_DONE)"; fail=1; fi
fi


# Daily production. The reported bug: coins were paid inside a tick that fired on the first page
# load of the day, when today's ledger is still empty — so a day with buildings and solves earned
# nothing, and never got another chance. Two huts must yield two coins.
$W execute lc-game --local --persist-to "$STATE" --command \
  "INSERT OR IGNORE INTO buildings (id, kind, x, y, level, built_at) VALUES ('smoke-hut-a','hut',0,0,1,$NOW), ('smoke-hut-b','hut',1,0,1,$NOW);" >/dev/null
curl -s -o /dev/null -H "cookie: lc_session=$TOKEN" "$B/"   # first load of the day: nothing solved yet
COINS_BEFORE=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT amount FROM resources WHERE kind='coins'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?r[0].amount:0)})')
curl -s -o /dev/null -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" \
  -d '{"lang":"python3","code":"x","kind":"submit","verdict":"Accepted","passed":3,"total":3}' "$B/api/solve/two-sum/verdict"
curl -s -o /dev/null -H "cookie: lc_session=$TOKEN" "$B/"   # same day, now with a solve on the ledger
COINS_AFTER=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT amount FROM resources WHERE kind='coins'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?r[0].amount:0)})')
if [ "$COINS_BEFORE" = "0" ] && [ "$COINS_AFTER" = "2" ]; then
  echo "ok   two huts produced two coins on the day they were solved on"
else
  echo "FAIL production: coins $COINS_BEFORE -> $COINS_AFTER (want 0 -> 2)"; fail=1
fi
curl -s -o /dev/null -H "cookie: lc_session=$TOKEN" "$B/"   # a reload must not pay twice
COINS_AGAIN=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT amount FROM resources WHERE kind='coins'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?r[0].amount:0)})')
if [ "$COINS_AGAIN" = "2" ]; then echo "ok   reloading does not pay production twice"; else echo "FAIL production paid again on reload: $COINS_AGAIN"; fail=1; fi

# A look at a solution only counts against a refresh taken while the problem is DUE. two-sum was
# solved above, so it is not due: "Last accepted" (kind=own) must be free and write nothing, which
# is the case of comparing a fresh answer with the old one straight after a clean refresh.
q() { $W execute lc-game --local --persist-to "$STATE" --json --command "$1" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?Object.values(r[0])[0]:"")})'; }
check 200 -H "cookie: lc_session=$TOKEN" "$B/api/solve/two-sum/solutions?kind=own"
VIEWS=$(q "SELECT count(*) AS n FROM solution_views WHERE slug='two-sum'")
if [ "$VIEWS" = "0" ]; then echo "ok   a look at a problem that is not due is free"; else echo "FAIL a not-due look left $VIEWS solution_views rows (want 0)"; fail=1; fi
# Once it falls due, the same look is recorded.
$W execute lc-game --local --persist-to "$STATE" --command "UPDATE problem_state SET due_at = $((NOW - 1000)) WHERE slug='two-sum';" >/dev/null
check 200 -H "cookie: lc_session=$TOKEN" "$B/api/solve/two-sum/solutions?kind=own"
VIEWS=$(q "SELECT count(*) AS n FROM solution_views WHERE slug='two-sum'")
if [ "$VIEWS" = "1" ]; then echo "ok   a look at a due problem is recorded"; else echo "FAIL a due look left $VIEWS solution_views rows (want 1)"; fail=1; fi

# End to end through the award: two refreshes, each with one recorded look, differing only in
# whether the look came before or after the due date. The early look is a row the old rule left
# behind -- the case that charged a comparison made after one refresh to the next one.
DAY=86400000
for spec in "contains-duplicate:$((NOW - 5 * DAY)):1:a look before the due date leaves the refresh clean" \
            "valid-anagram:$((NOW - DAY / 2)):0:a look after the due date marks the refresh assisted"; do
  IFS=: read -r SLUG VIEW_AT WANT_STEP LABEL <<<"$spec"
  $W execute lc-game --local --persist-to "$STATE" --command \
    "INSERT INTO problem_state (slug, first_solved_at, last_solved_at, solve_count, last_lang, srs_step, due_at) VALUES ('$SLUG', $((NOW - 10 * DAY)), $((NOW - 10 * DAY)), 1, 'python3', 0, $((NOW - DAY)));
     INSERT INTO solution_views (slug, date, created_at) VALUES ('$SLUG', '2000-01-01', $VIEW_AT);" >/dev/null
  curl -s -o /dev/null -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" \
    -d '{"lang":"python3","code":"x","kind":"submit","verdict":"Accepted","passed":3,"total":3}' "$B/api/solve/$SLUG/verdict"
  STEP=$(q "SELECT srs_step FROM problem_state WHERE slug='$SLUG'")
  if [ "$STEP" = "$WANT_STEP" ]; then echo "ok   $LABEL"; else echo "FAIL $LABEL: srs_step $STEP (want $WANT_STEP)"; fail=1; fi
done


# Destroy refunds the level 1 base cost and removes the building. The huts above cost 5 timber each.
check 401 -X POST -H "content-type: application/json" -d '{"id":"smoke-hut-a"}' "$B/api/city/destroy"
check 404 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"id":"no-such-building"}' "$B/api/city/destroy"
TIMBER_BEFORE=$(count_state "SELECT amount FROM resources WHERE kind='timber'")
check 200 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"id":"smoke-hut-a"}' "$B/api/city/destroy"
TIMBER_AFTER=$(count_state "SELECT amount FROM resources WHERE kind='timber'")
LEFT=$(count_state "SELECT COUNT(*) AS n FROM buildings WHERE id='smoke-hut-a'")
if [ "$((TIMBER_AFTER - TIMBER_BEFORE))" = "5" ] && [ "$LEFT" = "0" ]; then
  echo "ok   destroy refunded the level 1 cost (timber $TIMBER_BEFORE -> $TIMBER_AFTER) and removed the building"
else
  echo "FAIL destroy: timber $TIMBER_BEFORE -> $TIMBER_AFTER (want +5), rows left $LEFT"; fail=1
fi


# Cities and terrain. A building left over from the old open 8x8 is moved onto a tile that exists
# and that its kind is allowed to stand on, the first time the city is loaded.
$W execute lc-game --local --persist-to "$STATE" --command \
  "INSERT OR IGNORE INTO buildings (id, kind, city, x, y, level, built_at) VALUES ('smoke-far','hut',0,7,7,2,$NOW), ('smoke-wet','pointer-bridge',0,4,0,1,$NOW), ('smoke-clock','interval-clock',0,3,1,1,$NOW), ('smoke-mill','window-mill',0,5,0,1,$NOW);" >/dev/null
curl -s -o /dev/null -H "cookie: lc_session=$TOKEN" "$B/city"
FAR=$(q "SELECT x || ',' || y AS at FROM buildings WHERE id='smoke-far'")
WET=$(q "SELECT x || ',' || y AS at FROM buildings WHERE id='smoke-wet'")
LVL=$(q "SELECT level AS n FROM buildings WHERE id='smoke-far'")
# Hopper's Humble Hamlet has its river at (1,1), (2,1), (2,2) and (2,3).
case "$WET" in 1,1|2,1|2,2|2,3) WETOK=yes ;; *) WETOK=no ;; esac
if [ "$FAR" != "7,7" ] && [ "$LVL" = "2" ] && [ "$WETOK" = "yes" ]; then
  echo "ok   the old grid was relocated onto the 6x6 map (hut 7,7 -> $FAR at level 2; bridge -> river $WET)"
else
  echo "FAIL relocation: hut at $FAR level $LVL, bridge at $WET (want it on the river)"; fail=1
fi
curl -s -o /dev/null -H "cookie: lc_session=$TOKEN" "$B/city"
AGAIN=$(q "SELECT x || ',' || y AS at FROM buildings WHERE id='smoke-far'")
if [ "$AGAIN" = "$FAR" ]; then echo "ok   a second load relocates nothing"; else echo "FAIL relocation ran again: $FAR -> $AGAIN"; fail=1; fi

post_json() { curl -s --max-time 30 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d "$2" "$B/api/city/$1"; }
wants() { case "$(post_json "$1" "$2")" in *"\"$3\""*) echo "ok   $4" ;; *) echo "FAIL $4: $(post_json "$1" "$2")"; fail=1 ;; esac; }
wants move '{"id":"smoke-wet","city":0,"x":0,"y":0}' terrain "a bridge cannot be moved off the river"
wants move '{"id":"smoke-far","city":0,"x":2,"y":2}' terrain "a hut cannot be moved onto the river"
wants build '{"kind":"hut","city":1,"x":0,"y":0}' locked "an unfounded city refuses a building"
wants build '{"kind":"hut","city":0,"x":9,"y":0}' bad_request "a tile off the 6x6 grid is refused"
wants move '{"id":"smoke-far","city":0,"x":3,"y":0}' ok "a hut moves to a free plains tile"
MOVED=$(q "SELECT x || ',' || y AS at FROM buildings WHERE id='smoke-far'")
if [ "$MOVED" = "3,0" ]; then echo "ok   the move was written ($MOVED)"; else echo "FAIL move wrote $MOVED (want 3,0)"; fail=1; fi

# The clocktower stands on plains, but only on the bank: (3,1) and (2,4) touch the river, (5,5) is dry.
CLOCK=$(q "SELECT x || ',' || y AS at FROM buildings WHERE id='smoke-clock'")
if [ "$CLOCK" = "3,1" ]; then echo "ok   a riverside clocktower was left where it stood"; else echo "FAIL the clocktower moved off (3,1) to $CLOCK"; fail=1; fi
wants move '{"id":"smoke-clock","city":0,"x":5,"y":5}' terrain "a clocktower cannot be moved inland"
wants move '{"id":"smoke-clock","city":0,"x":2,"y":4}' ok "a clocktower moves along the bank"
# A mill names two terrains, so it is at home on the bank and on the water, and nowhere else.
wants move '{"id":"smoke-mill","city":0,"x":2,"y":2}' ok "a mill moves onto the river"
wants move '{"id":"smoke-mill","city":0,"x":0,"y":3}' terrain "a mill cannot be moved onto the mountain"

# The resource bar overlays most views but is hidden while solving, drilling or reading the tree.
has_bar() { curl -s -H "cookie: lc_session=$TOKEN" "$B$1" | grep -qi 'aria-label="Resources"' && echo yes || echo no; }
for route in / /city /admin; do
  [ "$(has_bar $route)" = "yes" ] && echo "ok   resource bar shown on $route" || { echo "FAIL resource bar missing on $route"; fail=1; }
done
for route in /tree /drills /solve/two-sum; do
  [ "$(has_bar $route)" = "no" ] && echo "ok   resource bar hidden on $route" || { echo "FAIL resource bar should be hidden on $route"; fail=1; }
done

if [ "$fail" = 1 ]; then echo "--- dev server log tail"; tail -40 "$LOG"; exit 1; fi
echo "smoke test passed"
