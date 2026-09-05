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
check 401 "$B/api/check/nothing"
check 403 -X POST -H "origin: https://evil.example" -H "cookie: lc_session=$TOKEN" "$B/api/sync"
check 200 -H "cookie: lc_session=$TOKEN" "$B/"
check 200 -H "cookie: lc_session=$TOKEN" "$B/tree"
check 200 -H "cookie: lc_session=$TOKEN" "$B/tree/arrays-hashing"
check 200 -H "cookie: lc_session=$TOKEN" "$B/city"
check 200 -H "cookie: lc_session=$TOKEN" "$B/admin"
check 200 -H "cookie: lc_session=$TOKEN" "$B/solve/two-sum"
check 404 -H "cookie: lc_session=$TOKEN" "$B/tree/no-such-node"
check 424 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"lang":"python3","code":"x","input":"1"}' "$B/api/solve/two-sum/run"
check 200 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"lang":"python3","code":"print(1)"}' "$B/api/solve/two-sum/draft"
check 200 -H "cookie: lc_session=$TOKEN" "$B/drills"
check 400 -X POST -H "cookie: lc_session=$TOKEN" -H "content-type: application/json" -d '{"drillId":"nope","answer":"x"}' "$B/api/drills/answer"
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

if [ "$fail" = 1 ]; then echo "--- dev server log tail"; tail -40 "$LOG"; exit 1; fi
echo "smoke test passed"
