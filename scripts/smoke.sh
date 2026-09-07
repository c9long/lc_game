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


# Daily production. The reported bug: coins were paid inside the morale tick, which fires on the
# first page load of the day, when today's ledger is still empty — so a day with buildings and
# solves earned nothing, and never got another chance. Two huts must yield two coins.
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


# Morale has to be persisted on first sight, or its fallback (dated today) makes the "asOf < today"
# tick permanently unreachable and morale never moves at all.
MORALE_ROW=$($W execute lc-game --local --persist-to "$STATE" --json --command "SELECT COUNT(*) AS n FROM game_state WHERE key='morale'" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results;console.log(r.length?r[0].n:0)})')
if [ "$MORALE_ROW" = "1" ]; then echo "ok   morale state persisted on first load"; else echo "FAIL morale never persisted, so it can never tick"; fail=1; fi


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
