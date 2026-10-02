# Runbook

How to run, deploy and operate Commit City. Everything here is a single-user setup on Cloudflare's free tier.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars           # then fill in: openssl rand -hex 32 for AUTH_SECRET, any string for SETUP_TOKEN
pnpm dev                                 # http://localhost:5173; first copies Monaco into static/ and applies drizzle/ migrations to the local D1
```

First run: open `http://localhost:5173/auth/register?token=<SETUP_TOKEN>` and create a passkey. Passkeys work on `localhost` without HTTPS. Then remove `SETUP_TOKEN` from `.dev.vars`.

Useful:

```bash
pnpm test                                # vitest: SRS, budget/morale, tree, awards, city rules
pnpm check                               # svelte-check
bash scripts/smoke.sh                    # isolated: own port (5199) and throwaway D1; curls every route and answers a drill
pnpm exec wrangler d1 execute lc-game --local --command "select * from problem_state"
```

**Local database file:** wrangler keys the local D1 file under `.wrangler/state/v3/d1/` by the `database_id` in `wrangler.toml`. Changing that id (for example after `wrangler d1 create`) switches to a fresh, empty file; `pnpm dev` migrates it automatically, but your local passkey and progress stay in the old file. To carry them over:

```bash
OLD=.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<old-hash>.sqlite   # the one with tables and rows
NEW=.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<new-hash>.sqlite   # the freshly migrated one
sqlite3 "$NEW" "ATTACH '$OLD' AS old; $(sqlite3 "$OLD" "select group_concat('INSERT OR IGNORE INTO ' || name || ' SELECT * FROM old.' || name || ';', ' ') from sqlite_master where type='table' and name not in ('d1_migrations','_cf_METADATA','sqlite_sequence')")"
```

Or, on an empty local database, register a passkey again with `SETUP_TOKEN` set in `.dev.vars`. `SETUP_TOKEN` only opens registration while there are no players; after that, new players need an invite.

## First deploy

```bash
pnpm exec wrangler login                                      # one-time, opens a browser
pnpm exec wrangler d1 create lc-game                          # copy database_id into wrangler.toml
pnpm db:migrate:remote
openssl rand -hex 32 | pnpm exec wrangler secret put AUTH_SECRET
openssl rand -hex 16 | tee /dev/stderr | pnpm exec wrangler secret put SETUP_TOKEN   # note the value
pnpm deploy                                                   # prints https://lc-game.<account>.workers.dev
```

Then:

1. Open `https://<your-url>/auth/register?token=<SETUP_TOKEN>` and create a passkey on the device you are using. This first account is the admin. Add your phone later from Settings while signed in.
2. `pnpm exec wrangler secret delete SETUP_TOKEN`. The Admin page nags until you do.
3. Settings: set your LeetCode username and timezone.
4. Open Today and click a plan slot. **This is the Phase 0 egress check:** the problem statement is fetched from LeetCode's public API by the Worker. If it loads, LeetCode accepts calls from Workers. If it fails with "bot-challenge page", see Fallbacks below. Run and Submit are judged in the browser and do not depend on it.

Redeploy after code changes with `pnpm deploy`. Schema changes: edit `src/lib/server/db/schema.ts`, `pnpm db:generate`, `pnpm db:migrate:local`, test, `pnpm db:migrate:remote`, deploy.

## Secrets

| Secret | Purpose | Rotate |
|---|---|---|
| `AUTH_SECRET` | reserved for signed tokens | `wrangler secret put`; sessions are server-side so nothing else changes |
| `SETUP_TOKEN` | one-time gate for creating the first (admin) account; ignored once any player exists | set only while registering, then delete |

Nothing secret lives in `wrangler.toml`, the repo, or the browser. The pre-commit hook (`scripts/hooks/pre-commit`, enabled via `git config core.hooksPath scripts/hooks`) runs gitleaks on staged changes.

## Operating

- **Solves made outside the app** (LeetCode mobile, etc.): Today syncs the last 20 accepted submissions from your public profile every 5 minutes; Settings has a "Sync now" button.
- **Backups**: `pnpm exec wrangler d1 export lc-game --remote --output backup-$(date +%F).sql`. Restore with `wrangler d1 execute lc-game --remote --file backup.sql` on a fresh database.
- **Drill bank updates**: `python3 scripts/mine-python-docs.py` downloads the CPython 3.12 docs into `.cache/` (git-ignored), executes every example, and rewrites `data/drills/python.json`. Then `pnpm drills:generate` rewrites `data/drills/variants.json` (add `--report` to see why a drill did not vary), and `pnpm drills:verify` executes every hand-written drill and every generated instance — run both after any edit to `curation.json`, since a reworded `explain` can make a drill stop varying or start failing the stale-explanation check. Add ids to `exclude` in `curation.json` to drop bad mined drills. Redeploy afterwards; drill ids are content hashes and instances hang off them, so progress survives regeneration.
- **Test-case constraints**: `python3 scripts/fetch-neetcode-constraints.py` refreshes `data/neetcode-constraints.json` from neetcode.io's problem pages. `scripts/constraints.py` holds one validator per problem at the stricter of neetcode.io's and LeetCode's bounds; edit it when either site changes, then `python3 scripts/generate-tests.py --modes all`. CI fails on any case outside the constraints.
- **Curriculum updates**: `git clone --depth 1 https://github.com/neetcode-gh/leetcode.git /tmp/neetcode && pnpm import:neetcode /tmp/neetcode` regenerates `data/neetcode150.json` and `static/solutions/`. It needs network access: each problem's pattern and order come from neetcode.io's own bundle, because the repo's `.problemSiteData.json` lags the site (it still filed Generate Parentheses under Stack). Edit `data/roadmap.json` by hand for the tree's edges.
- **Inviting a player**: Admin → Invite a player → give a name → send the link. It works once, for 7 days, and creates a new account with its own progress, city and drills; the player gets Settings (their LeetCode username, timezone, passkeys, signing out their own devices) but not Admin. Unused links can be revoked from the same card. Only the token's hash is stored, so a lost link is revoked and reissued.
- **Sign out**: Settings → Sign out all my devices (one player). Admin → Sign out every player (truncates sessions).
- **Logs**: `pnpm exec wrangler tail`.

## Optional hardening

- Put a domain on Cloudflare and add a Zero Trust **Access** application in front of the hostname with your email as the only allowed identity. Traffic without a valid Access token never reaches the Worker.
- Add a second passkey (phone) so losing one device does not lock you out.

## Fallbacks if LeetCode blocks Workers egress

Code is judged in the browser, so LeetCode is needed only for problem statements, community solutions, editorials, the daily problem and profile sync, all through its public API. Statements are cached in D1 after the first fetch. If those calls return a "bot-challenge page" error from the deployed app:

1. Try the isolated spike in `spike/leetcode-egress/` to confirm it is egress.
2. Deploy the same app to Vercel: swap `@sveltejs/adapter-cloudflare` for `@sveltejs/adapter-vercel`, replace the D1 driver with Turso (`@libsql/client`) in `src/lib/server/db/index.ts`, and move secrets to Vercel env vars. Everything else is unchanged.
3. If Vercel is blocked too, run the app from this machine behind a Cloudflare Tunnel (docs option 05); a residential IP is what the VS Code LeetCode extension uses successfully.
