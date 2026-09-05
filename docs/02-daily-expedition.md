# 02. Daily Expedition

Same city as 01, different heartbeat. Each morning the game assembles an expedition: the LeetCode daily challenge plus one or two problems you solved before that are due for a re-solve. Finish the expedition and the party returns with resources. Skip it and the city's morale drops and a building starts to crumble.

Hosting: Cloudflare Workers + D1 + Cron Triggers. Cost: $0/month.

## Game loop

### The expedition

Generated shortly after midnight in your timezone by a cron trigger:

1. **The daily**: `activeDailyCodingChallengeQuestion`. Worth x2 resources.
2. **Repairs**, which is spaced repetition: one or two problems you previously accepted, chosen by an SM-2-style schedule. Intervals run 1, 3, 7, 21, 60 days. A clean re-solve advances the interval. A skipped repair resets it, and the building tied to that topic starts to crumble (loses a level after two missed repairs).
3. **Optional scout**: one unsolved problem from the topic with the lowest essence, so weak areas get pushed rather than avoided.

Re-solves are the feature. You said you are bad at this; the fix is meeting the same problem again after you have half-forgotten it. A repair done in a compiled language when the original was Python counts as a "translation" and earns the x1.5 multiplier plus a flat bonus.

### Rewards and decay

- Expedition complete (daily plus all repairs): full haul plus 20 morale.
- Partial: proportional haul, no morale change.
- Missed: -15 morale and the repairs' intervals reset.
- The Granary stores up to 3 "camp days" that auto-consume to skip a miss.
- Buildings, resources and morale otherwise as in [01-commit-city.md](01-commit-city.md).

### Solutions panel

As in 01. After a repair you also get a side-by-side of your previous submission code and the new one, which needs the session cookie for the `submissionDetails` query.

## Architecture

```
Browser ──> Cloudflare Worker (SvelteKit, adapter-cloudflare)
              ├── routes as in 01
              ├── scheduled() handler
              │     cron "5 * * * *"    hourly; builds the expedition when it is 00:05 in your timezone
              │     cron "*/30 * * * *" syncs accepted submissions
              └── bindings: D1 (SQLite), KV (problem content cache), secrets
```

- **Why Cloudflare here**: free cron triggers with minute granularity, so the expedition is waiting before you wake up and sync happens even on days you never open the app. D1 is SQLite, so the schema from 01 ports nearly verbatim, and `wrangler dev` runs against a real local SQLite file.
- **Runtime caveat**: Workers is not Node. Use fetch-based and Web Crypto libraries only. No `pg`, no native `argon2`. `@simplewebauthn/server` and Drizzle's D1 driver both work.
- **Timezone**: cron runs in UTC. Store your timezone, run the expedition job hourly, and let it no-op unless it is just past midnight locally.

### Schema additions over 01

```
expeditions(id, date PK, daily_slug, status)
expedition_items(expedition_id, slug, kind, done bool)      -- kind: daily | repair | scout
reviews(slug PK, interval_days, ease, due_date, last_reviewed_at)
```

## Auth

Passkey as in 01. Optional outer layer: **Cloudflare Access** on the Zero Trust free plan, with an allow-list of exactly your email and a one-time-PIN login. The Worker is then unreachable without a valid Access JWT. Access is built for hostnames on a domain you manage in Cloudflare, so plan on a domain if you want it.

## Secrets

| Secret | Where |
|---|---|
| `AUTH_SECRET`, `SETTINGS_KEY`, `SETUP_TOKEN` | `wrangler secret put NAME`. Encrypted at rest, never in `wrangler.toml`. |
| D1 | A binding. No connection string exists to leak. |
| LeetCode cookie | `settings` table in D1, encrypted with `SETTINGS_KEY`. |

Locally: `.dev.vars`, git-ignored, same shape as `.env`.

## Cost

- Workers free tier: 100k requests/day, far beyond single-user use.
- D1 free tier: 5 GB, millions of reads/day.
- Cron triggers: free.
- Cloudflare Access: free up to 50 users.
- Domain: optional, about $10/yr at Cloudflare Registrar. Needed only for Access.

## Build outline

1. Repo hygiene as in 01. `pnpm create cloudflare` with the SvelteKit template, D1 binding, Drizzle.
2. LeetCode client module. Fetch-only, so it is shared with every other option unchanged.
3. Passkey auth. Deploy early because WebAuthn needs HTTPS.
4. Sync cron and awards.
5. Review scheduler (SM-2) and the expedition generator cron.
6. City, morale, buildings.
7. Expedition screen as the home page: three cards with big "Open on LeetCode" buttons.
8. Solutions panel and the previous-submission diff.

## Risks

- Workers runtime restrictions bite when a library assumes Node. Stick to Web-standard APIs.
- D1 is single-region with write latency of tens of milliseconds. Irrelevant at this scale.
- Cron can fire a minute or two late. Irrelevant.
- `wrangler` is not installed here yet. One `pnpm add -D wrangler`.
