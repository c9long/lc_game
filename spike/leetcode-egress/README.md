# Phase 0 spike: LeetCode run/submit from a Cloudflare Worker

Answers one question before anything else is built: does LeetCode accept `interpret_solution` and
`submit` calls from Cloudflare Workers egress IPs when sent with a valid session cookie?

## Run it (about five minutes)

From the repo root, with dependencies installed (`pnpm install`):

```bash
pnpm exec wrangler login                                   # opens a browser once
W="pnpm exec wrangler --config spike/leetcode-egress/wrangler.toml"
$W secret put LEETCODE_SESSION                             # paste from leetcode.com cookies
$W secret put CSRF                                         # the csrftoken cookie
$W secret put SPIKE_KEY                                    # any random string, e.g. openssl rand -hex 16
$W deploy                                                  # prints https://lc-egress-spike.<you>.workers.dev
```

Then:

```bash
curl -s "https://lc-egress-spike.<you>.workers.dev/status?key=KEY" | head -c 400   # expect isSignedIn true
curl -s "https://lc-egress-spike.<you>.workers.dev/?key=KEY"                        # expect runResult with run_success true
curl -s "https://lc-egress-spike.<you>.workers.dev/submit?key=KEY"                  # expect submitResult.status_msg "Accepted"
```

The submit call makes a real Two Sum submission on your LeetCode account.

## Reading the result

- `run.status` 200 and `runResult.run_success` true: **go**. Record it in `docs/06-merged-design.md`.
- `run.status` 403, or `run.snippet` contains an HTML challenge page: Workers egress is blocked. Retry the
  same logic as a Vercel function; if that fails too, host the app from this machine via Cloudflare Tunnel
  (docs option 05).
- `userStatus` shows `isSignedIn: false`: the cookie is wrong or expired; fix that before judging egress.

## Clean up

```bash
$W delete
```

The cookie never appears in any response; the `key` query parameter only gates who can trigger the spike.
