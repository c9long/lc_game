# 01. Commit City

A city builder. Every accepted LeetCode submission is a shipment of resources into your city. You spend them placing buildings. Buildings pay out coins only on days you show up and solve something, and the city's morale sags when you don't.

Hosting: Vercel Hobby + Neon Postgres. Cost: $0/month.

## Game loop

### Resources

| Source | Resource |
|---|---|
| Easy accepted | Timber x3 |
| Medium accepted | Stone x3 |
| Hard accepted | Iron x3 |
| Any accepted | 1 essence per topic tag on the problem (Array essence, Graph essence, DP essence, ...) |

Multipliers stack:

- Solved in C++, Go or Rust: x1.5. This is the lever for the syntax practice you avoid.
- It is today's LeetCode daily challenge: x2.
- Re-solve of a problem you accepted 7+ days ago: x0.5. Still rewarded, because repetition is the point.

### Buildings

Each building has a resource cost and a topic gate. First cut, tune later:

| Building | Cost | Gate | Effect |
|---|---|---|---|
| Hut | 5 timber | none | +1 coin/day |
| Hash Market | 10 timber, 5 stone | 5 Hash Table solves | +3 coins/day |
| Two-Pointer Bridge | 8 stone | 5 Two Pointers solves | Unlocks the river tiles |
| Graph Roads | 15 stone, 5 iron | 8 Graph solves | +25% production on adjacent buildings |
| DP Academy | 20 stone, 10 iron, 10 DP essence | 10 DP solves | +10 coins/day |
| Granary | 10 timber, 10 stone | none | Stores up to 3 streak-freeze days |
| Walls | 30 stone | 3 Hard solves | Halves morale decay |
| Monument | 50 iron | 100 total solves | Cosmetic; unlocks a second map |

Placement is on a small grid, 8x8 to start, expanded by a Town Hall upgrade. Adjacency bonuses are the only spatial rule. Keep it simple.

### The daily pull

- **Active day** means you logged in and at least one new accepted submission synced that day, in your local timezone.
- Buildings produce coins only on active days. Coins buy cosmetics, map expansions and building upgrades.
- **Morale** runs 0 to 100. +10 per active day, -15 per inactive day. Walls halve the loss. Production is multiplied by morale/100. The Granary spends a freeze day automatically to skip one decay.
- The home screen always shows today's daily challenge, your streak, morale, and what the next building needs. That screen is what makes you open leetcode.com.

### Solutions panel

This is the "connect to LeetCode" feature.

- Community solutions via the `ugcArticleSolutionArticles` query, filtered to your language tags (python3, cpp, golang, rust), sorted by HOT, rendered in-app from the article markdown.
- Editorial: a link to `leetcode.com/problems/<slug>/editorial`, or rendered in-app when the editorial is free (`solution.canSeeDetail`) or you have the session cookie configured.
- "Study a solution" costs 2 essence of that problem's topic. Not punitive, just enough that peeking is a decision rather than a reflex. Solutions for problems you have already accepted are free.
- With the cookie: your own past submissions and their code, so a re-solve can be diffed against what you wrote last time.

## Architecture

```
Browser ──HTTPS──> Vercel (SvelteKit, adapter-vercel)
                     ├── /              home: city grid, morale, daily challenge
                     ├── /problems      list, filters, solutions panel
                     ├── /api/sync      pulls recentAcSubmissionList, awards resources (idempotent on submission id)
                     ├── /api/build     place or upgrade a building (server-validated)
                     ├── /admin         username, timezone, paste a fresh LeetCode cookie
                     └── /auth/*        passkey register/login, session
                          │
                          ├──> Neon Postgres (free tier, scales to zero)
                          └──> leetcode.com/graphql (public queries; cookie optional)
```

- **Framework**: SvelteKit. Next.js works identically. SvelteKit is lighter and the city UI is mostly server-rendered HTML with a little client JS.
- **Database**: Neon Postgres free tier, 0.5 GB, autosuspends when idle. First request after idle takes about a second. Drizzle ORM with drizzle-kit migrations. `psql` is already on this machine for poking at it.
- **Sync**: runs on every home page load, throttled server-side to once per 5 minutes. Pulls the last 20 accepted submissions. Each new submission id becomes a row in `submissions` and mutates resource totals in one transaction. Decay is computed from `last_active_date` at read time, so no cron is required. Optional: a Vercel Hobby cron (limited to once per day) hitting `/api/sync` late in the evening as a safety net for days you solved but never opened the app.
- **Problem cache**: `problems` table so the API is hit once per problem.
- **Rendering**: the city grid is a CSS grid of tiles with emoji or small SVGs. No game engine.

### Schema, first cut

```
users(id, lc_username, timezone, created_at)
passkeys(id, user_id, credential_id, public_key, counter)
sessions(id, user_id, expires_at)
problems(slug PK, title, difficulty, tags jsonb, content_html, snippets jsonb, fetched_at)
submissions(lc_id PK, slug, lang, accepted_at, awarded bool)
resources(user_id, kind, amount)          -- timber | stone | iron | essence:<topic> | coins
buildings(id, user_id, kind, x, y, level, built_at)
days(user_id, date PK, active bool, morale_after int)
settings(key PK, value_encrypted)         -- LeetCode cookie lives here, AES-GCM with SETTINGS_KEY
```

## Auth

Single passkey. Full pattern in [secrets-and-auth.md](secrets-and-auth.md). In short:

- `/auth/register` only works while the `SETUP_TOKEN` env var is set and matches. Register your passkey on first deploy, then delete the variable.
- Login is a WebAuthn assertion that yields a server-side session and an `HttpOnly; Secure; SameSite=Lax` cookie, 30-day expiry, refreshed on use.
- Every `/api/*` and page route checks the session. Auth endpoints are rate-limited.

## Secrets

| Secret | Where | Notes |
|---|---|---|
| `DATABASE_URL` | Vercel env var, marked Sensitive | Neon's pooled connection string |
| `AUTH_SECRET` | Vercel env var, Sensitive | 32 random bytes |
| `SETTINGS_KEY` | Vercel env var, Sensitive | AES-256-GCM key for the `settings` table |
| `SETUP_TOKEN` | Vercel env var, temporary | Delete after the first passkey is registered |
| LeetCode cookie | `settings` table, encrypted | Pasted via `/admin`; rotated when it expires, no redeploy |

Locally: `.env` is git-ignored and `vercel env pull` fills it. A gitleaks pre-commit hook stops a pasted cookie from ever being committed.

## Cost

- Vercel Hobby: $0. Personal, non-commercial use is exactly what Hobby is for.
- Neon free tier: $0.
- Domain: optional, about $10/yr. A `*.vercel.app` subdomain works fine.

## Build outline

1. `git init`, `.gitignore`, gitleaks hook. SvelteKit scaffold, Drizzle, Neon connection.
2. LeetCode client module: the public queries with typed responses and caching, per [leetcode-api.md](leetcode-api.md).
3. Passkey auth and the setup-token flow. Deploy to Vercel immediately so auth is exercised on HTTPS from day one, because WebAuthn requires it.
4. Sync, awards, resources. Verify by solving one Easy on leetcode.com and watching timber appear.
5. Buildings, grid, morale, days. The city page.
6. Problems list and solutions panel.
7. Admin page: paste cookie, set timezone and username.
8. Polish: streak display, next-goal hints, mobile layout.

## Risks

- LeetCode's API is unofficial. The queries have been stable for years, but a schema change would break sync. The client module is small and isolated, and the app should degrade to "sync unavailable" rather than crash.
- The 20-submission window: if you solve more than 20 problems between visits without the cookie, the oldest are missed. The once-a-day cron closes this in practice, and the cookie removes the limit entirely.
- Neon cold starts of about a second on first request after idle. Acceptable.
