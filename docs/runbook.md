# Runbook

How to run, deploy and operate Commit City. Everything here is a single-user setup on Cloudflare's free tier.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars           # then fill in: openssl rand -hex 32 for AUTH_SECRET and SETTINGS_KEY, any string for SETUP_TOKEN
pnpm db:migrate:local                    # applies drizzle/ migrations to the local D1 in .wrangler/state
pnpm dev                                 # http://localhost:5173 (copies Monaco into static/ first)
```

First run: open `http://localhost:5173/auth/register?token=<SETUP_TOKEN>` and create a passkey. Passkeys work on `localhost` without HTTPS. Then remove `SETUP_TOKEN` from `.dev.vars`.

Useful:

```bash
pnpm test                                # vitest: SRS, budget/morale, tree, awards, city rules
pnpm check                               # svelte-check
bash scripts/smoke.sh                    # seeds a temporary session and curls every route
pnpm exec wrangler d1 execute lc-game --local --command "select * from problem_state"
```

## First deploy

```bash
pnpm exec wrangler login                                      # one-time, opens a browser
pnpm exec wrangler d1 create lc-game                          # copy database_id into wrangler.toml
pnpm db:migrate:remote
openssl rand -hex 32 | pnpm exec wrangler secret put AUTH_SECRET
openssl rand -hex 32 | pnpm exec wrangler secret put SETTINGS_KEY
openssl rand -hex 16 | tee /dev/stderr | pnpm exec wrangler secret put SETUP_TOKEN   # note the value
pnpm deploy                                                   # prints https://lc-game.<account>.workers.dev
```

Then:

1. Open `https://<your-url>/auth/register?token=<SETUP_TOKEN>` and create a passkey on the device you are using. Add your phone later from Admin while signed in.
2. `pnpm exec wrangler secret delete SETUP_TOKEN`. The Admin page nags until you do.
3. Admin: set your LeetCode username, timezone and whether you have Premium.
4. Admin: paste `LEETCODE_SESSION` and `csrftoken` from leetcode.com (DevTools → Application → Cookies). The app validates them against LeetCode before storing them encrypted.
5. Open Today, click a plan slot, press Run. **This is the Phase 0 egress check.** If it returns a verdict, LeetCode accepts calls from Workers and everything works. If it fails with "bot-challenge page", see Fallbacks below.

Redeploy after code changes with `pnpm deploy`. Schema changes: edit `src/lib/server/db/schema.ts`, `pnpm db:generate`, `pnpm db:migrate:local`, test, `pnpm db:migrate:remote`, deploy.

## Secrets

| Secret | Purpose | Rotate |
|---|---|---|
| `AUTH_SECRET` | reserved for signed tokens | `wrangler secret put`; sessions are server-side so nothing else changes |
| `SETTINGS_KEY` | AES-256-GCM key for the LeetCode cookie in D1 | rotating it invalidates the stored cookie; paste it again in Admin |
| `SETUP_TOKEN` | one-time gate for passkey registration | set only while registering, then delete |
| LeetCode cookie | stored encrypted in the `settings` table | paste a fresh one in Admin when the banner says it expired (every few weeks) |

Nothing secret lives in `wrangler.toml`, the repo, or the browser. The pre-commit hook (`scripts/hooks/pre-commit`, enabled via `git config core.hooksPath scripts/hooks`) runs gitleaks on staged changes.

## Operating

- **Cookie expired**: Today shows a banner; Admin → paste new values → Validate and save.
- **Solves made outside the app** (LeetCode mobile, etc.): Today syncs the last 20 accepted submissions from your public profile every 5 minutes; Admin has a "Sync now" button.
- **Backups**: `pnpm exec wrangler d1 export lc-game --remote --output backup-$(date +%F).sql`. Restore with `wrangler d1 execute lc-game --remote --file backup.sql` on a fresh database.
- **Drill bank updates**: `python3 scripts/mine-python-docs.py` downloads the CPython 3.12 docs into `.cache/` (git-ignored), executes every example, and rewrites `data/drills/python.json`; `python3 scripts/verify-drills.py` executes the hand-written drills in `data/drills/curation.json`. Add ids to `exclude` there to drop bad mined drills. Redeploy afterwards; drill ids are content hashes, so progress survives regeneration.
- **Curriculum updates**: `git clone --depth 1 https://github.com/neetcode-gh/leetcode.git /tmp/neetcode && pnpm import:neetcode /tmp/neetcode` regenerates `data/neetcode150.json` and `static/solutions/`. Edit `data/roadmap.json` by hand for the tree's edges.
- **Sign out everywhere**: Admin → Sign out everywhere (truncates sessions).
- **Logs**: `pnpm exec wrangler tail`. The LeetCode cookie is never logged.

## Optional hardening

- Put a domain on Cloudflare and add a Zero Trust **Access** application in front of the hostname with your email as the only allowed identity. Traffic without a valid Access token never reaches the Worker.
- Add a second passkey (phone) so losing one device does not lock you out.

## Fallbacks if LeetCode blocks Workers egress

The app runs code only through LeetCode's judge, so this is the one external dependency. If Run/Submit return a "bot-challenge page" error from the deployed app:

1. Try the isolated spike in `spike/leetcode-egress/` to confirm it is egress and not the cookie.
2. Deploy the same app to Vercel: swap `@sveltejs/adapter-cloudflare` for `@sveltejs/adapter-vercel`, replace the D1 driver with Turso (`@libsql/client`) in `src/lib/server/db/index.ts`, and move secrets to Vercel env vars. Everything else is unchanged.
3. If Vercel is blocked too, run the app from this machine behind a Cloudflare Tunnel (docs option 05); a residential IP is what the VS Code LeetCode extension uses successfully.
