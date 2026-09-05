# 06. The chosen design: Commit City + Tech Tree + in-app IDE

This is the option being built. It merges [01-commit-city.md](01-commit-city.md), the in-app editor idea from [03-forge-and-keep.md](03-forge-and-keep.md), and the research tree from [04-tech-tree-atlas.md](04-tech-tree-atlas.md), with the refinements Chris made on 2026-09-04.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Curriculum | NeetCode 150, as a tech tree of its 18 patterns | Finite, ordered, community-maintained; reference solutions exist in every language |
| Refreshing techs | Per-problem spaced repetition; a node's freshness is the share of its solved problems not overdue | "Unlocked" must not mean "done forever" |
| Pace | 2 problems/day as a rolling weekly budget of 14 | A missed day is recoverable; morale tracks the weekly average |
| IDE | Monaco in the browser | Self-contained, VS Code keybindings, no coding on leetcode.com |
| Execution | LeetCode's judge, driven through the session cookie | Real hidden tests for every language, zero test authoring, no server executes code |
| Languages | Python, Go, C# front-line; C++ and Rust selectable | The judge supports all of them; non-Python solves earn x1.5 |
| Hosting | Cloudflare Workers + D1 | $0, SQLite locally and in prod, secrets in one place. No cron: morale and coins tick lazily on the next request |
| Fallback hosting | Vercel + Turso, then Cloudflare Tunnel from the WSL box | Only if LeetCode blocks run/submit from Workers egress |
| AI | None | Chris's call |

## Phase 0 result: LeetCode egress from Workers

_Pending Chris's first deploy._ The app itself is the test: after deploying and pasting the cookie, press Run on any problem. A verdict means Workers egress is accepted; a "bot-challenge page" error means it is blocked, and the fallback ladder in [runbook.md](runbook.md) applies. `spike/leetcode-egress/` remains as an isolated check.

## Build status (2026-09-04)

Phases 1 to 8 are implemented in one pass: repo hygiene, passkey auth, admin/cookie management, LeetCode client, Monaco solve page with Run/Submit/check, tech tree with freshness, weekly budget and morale, daily plan, city with buildings, solutions drawer, profile sync, runbook. Unit tests cover the pure rules; a curl smoke test covers every route. Not yet exercised: a real browser session (passkey ceremony, Monaco rendering) and a real LeetCode round-trip, both of which need Chris's device and cookie.

## How a solve flows

1. Home shows today's two plan slots. Click one to open `/solve/<slug>`.
2. Monaco loads the starter code for the chosen language from LeetCode's `codeSnippets`. Drafts autosave.
3. **Run** posts the code and the example input to the Worker, which forwards to LeetCode's `interpret_solution` with your cookie and returns an id. The browser polls `/api/check/<id>` once a second until `state` is `SUCCESS`, then shows expected vs actual per case.
4. **Submit** does the same through LeetCode's `submit` endpoint. On `Accepted` the Worker records the attempt and awards research, resources and a weekly-budget credit, idempotently on the submission id.
5. The tree, the budget bar and the city update. The solutions drawer unlocks for free.

## Game rules

### Tech tree

- Nodes are the 18 NeetCode patterns with prerequisite edges in `data/roadmap.json`. A node is **available** when its prerequisites are unlocked, **unlocks** at 50% of its problems solved, **completes** at 100%.
- **Research** per accepted solve: Easy 10, Medium 25, Hard 60. Non-Python x1.5. Daily-challenge overlap x2. It is a score on the node; unlocking is driven by solved counts so the rule is legible.
- **Freshness**: each solved problem is scheduled at 3, 7, 21, 60, 120, 240 days (`src/lib/game/srs.ts`). A clean re-solve advances the interval; a re-solve made after peeking at solutions ("assisted") resets it to 3 days; a badly overdue re-solve holds the interval. Overdue problems appear as **refresh** tasks. A node under 50% freshness is **rusting**, which scales its buildings' output through the freshness factor.
- Re-solves count toward the budget and yield x0.5 resources, or x1 when done in a different language from the last accepted attempt.

### Weekly budget, morale, daily plan

- Every accepted solve (new or refresh, one per problem per day) is a ledger entry. Budget is 14 per rolling 7 days.
- Morale moves toward `100 * min(1, weekly / 14)` by 15 points per day. Production is multiplied by morale/100. The Granary holds up to 3 freeze days that hold morale on a zero-solve day.
- The daily plan has two slots: the most overdue refresh if any (else a new problem), and the next new problem in roadmap order from the lowest available incomplete node. If LeetCode's daily challenge is in the NeetCode 150 it takes slot two with x2.

### City

- Resources per accepted solve: Easy 3 timber, Medium 3 stone, Hard 3 iron, plus 1 essence per topic tag, with the multipliers above.
- Buildings are gated by tree nodes (Hash Market needs Arrays & Hashing unlocked, DP Academy needs 1-D DP unlocked, and so on), and by solve counts for Walls and the Monument. Production is scaled by the node's freshness and by morale, and only accrues on days with at least one solve. Coins buy upgrades and Granary freeze days; grid expansion and cosmetics are future work.
- 8x8 grid with adjacency bonuses only. Emoji or SVG tiles.

### Solutions

Three tabs on the solve page: the NeetCode reference solution vendored from the MIT-licensed repo (served from `static/solutions/`), LeetCode community solutions filtered to the current language, and the editorial (in-app when free, a link when Premium). Opening the drawer before the problem is accepted costs 2 essence drawn from the problem's topic tags and marks that day's solve as assisted. After acceptance it is free. A "Last accepted" button loads your previous accepted code into the editor for comparison.

## Architecture

```
Browser (SvelteKit + Monaco)
  /            today: plan slots, budget bar, morale, tree frontier, city summary
  /tree        atlas SVG of 18 nodes with freshness rings
  /tree/<id>   node problems and state
  /solve/<slug> editor, run/submit, results, solutions drawer
  /city        grid, buildings, resources
  /admin       username, timezone, cookie paste + validate
  /auth/*      passkey register (setup-token gated), login, logout

Worker
  /api/solve/<slug>/run        → leetcode interpret_solution
  /api/solve/<slug>/submit     → leetcode submit
  /api/check/<id>              → leetcode check; on an Accepted submit it applies the award (idempotent on submission id)
  /api/solve/<slug>/draft      autosaved editor drafts
  /api/solve/<slug>/solutions  community / article / editorial proxy; records solution views
  /api/city/build, /api/city/freeze   server-validated placement, upgrade, freeze days
  /api/sync                    recentAcSubmissionList fallback (also runs on Today, throttled to 5 min)
  No cron: loadSnapshot() advances morale and accrues coins for elapsed days on each request; the daily plan is created on first load of the day.

D1: users, passkeys, sessions, challenges, settings (encrypted rows), problems (cache), problem_state,
    attempts, awards, ledger, resources, buildings, game_state, plans, plan_items, solution_views
    (node status and research are derived from problem_state and awards; no node table)
```

All database access goes through Drizzle (`src/lib/server/db/`) and bindings are read in one place (`getDb`/`getEnv`), so the Vercel fallback is an adapter swap and a driver change.

## Secrets and auth

- Passkey login via SimpleWebAuthn. Registration is gated by a temporary `SETUP_TOKEN` secret, deleted after the first passkey.
- Secrets via `wrangler secret put`: `AUTH_SECRET`, `SETTINGS_KEY`, `SETUP_TOKEN`. Locally in `.dev.vars`, git-ignored.
- The LeetCode cookie and csrftoken are pasted on `/admin`, validated against LeetCode immediately, stored AES-256-GCM encrypted in the `settings` table, never logged. Only the `src/lib/server/leetcode/` module reads them.
- The cookie expires every few weeks. The app detects it (authenticated calls come back null) and shows a reconnect banner.
- Full rules in [secrets-and-auth.md](secrets-and-auth.md); endpoint details in [leetcode-api.md](leetcode-api.md).

## Build phases

0. Egress spike (go/no-go).
1. Repo, skeleton, vendored data, this doc.
2. Auth and admin.
3. LeetCode client and the solve page.
4. Tree.
5. Budget, morale, plan.
6. City.
7. Solutions drawer and sync fallback.
8. Polish and runbook.
