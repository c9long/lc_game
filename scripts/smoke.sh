#!/usr/bin/env bash
# Local smoke test: seeds a throwaway session into the local D1, starts the dev server,
# and checks that public routes are reachable and private routes require a session.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-5173}
LOG=${LOG:-/tmp/lc-game-dev.log}
TOKEN="smoke-$(openssl rand -hex 8)"
HASH=$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)
NOW=$(date +%s000)
EXP=$((NOW + 2592000000))

pnpm exec wrangler d1 execute lc-game --local --command \
  "INSERT OR IGNORE INTO users (id, lc_username, timezone, has_premium, created_at) VALUES ('smoke-user', NULL, 'UTC', 0, $NOW);
   INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('$HASH', 'smoke-user', $EXP, $NOW);" >/dev/null

pnpm dev --port "$PORT" >"$LOG" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  pnpm exec wrangler d1 execute lc-game --local --command "DELETE FROM sessions WHERE id = '$HASH';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://localhost:$PORT/auth/login" && break
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
check 200 "$B/solutions/python/0001-two-sum.py"
if [ "$fail" = 1 ]; then echo "--- dev server log tail"; tail -40 "$LOG"; exit 1; fi
echo "smoke test passed"
