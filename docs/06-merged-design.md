# 06. The chosen design: Commit City + Tech Tree + in-app IDE

This is the option being built. It merges [01-commit-city.md](01-commit-city.md), the in-app editor idea from [03-forge-and-keep.md](03-forge-and-keep.md), and the research tree from [04-tech-tree-atlas.md](04-tech-tree-atlas.md), with the refinements Chris made on 2026-09-04.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Curriculum | NeetCode 150, as a tech tree of its 18 patterns | Finite, ordered, community-maintained; reference solutions exist in every language |
| Refreshing techs | Per-problem spaced repetition; a node's freshness is the share of its solved problems not overdue | "Unlocked" must not mean "done forever" |
| Pace | 2 problems/day as a rolling weekly budget of 14 | A missed day is recoverable; morale tracks the weekly average |
| IDE | Monaco in the browser | Self-contained, VS Code keybindings, no coding on leetcode.com |
| Execution | ~~LeetCode's judge, driven through the session cookie~~ → **Pyodide in the browser**, see [07-pyodide-judge.md](07-pyodide-judge.md) | Superseded 2026-09-06: LeetCode's judge is Cloudflare-blocked to all server callers. Still no server executes code |
| Languages | Python, Go, C# front-line; C++ and Rust selectable | The judge supports all of them; non-Python solves earn x1.5 |
| Hosting | Cloudflare Workers + D1 | $0, SQLite locally and in prod, secrets in one place. No cron: morale and coins tick lazily on the next request |
| Fallback hosting | Vercel + Turso, then Cloudflare Tunnel from the WSL box | Only if LeetCode blocks run/submit from Workers egress |
| Syntax drills | Recall drills (cloze and output prediction) mined from CPython's documentation, verified by execution at generation time; no runtime execution | Added 2026-09-04. Ingots from drills are the only way to upgrade buildings |
| AI | None | Chris's call |

## Phase 0 result: LeetCode egress from Workers

**Resolved 2026-09-06: blocked.** It worked from the deployed Worker for about a day, then stopped with no deploy in between — LeetCode raised Cloudflare's protection level on the judge path.

Confirmed with bare `curl` and **no cookie**: `graphql` returns 200, while `interpret_solution` / `submit` / `check` return 403 "Just a moment". The decision is made at Cloudflare's edge before authentication, so no cookie fixes it, and `client.ts` is unchanged since the initial commit, so no code change of ours caused it.

The fallback ladder in [runbook.md](runbook.md) does not apply, because it assumed a *hosting* problem: every server egress hits the same wall, so moving to Vercel or a Tunnel changes nothing. Execution moves into the browser instead — [07-pyodide-judge.md](07-pyodide-judge.md).

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

### Syntax drills (the Forge)

- A drill is a recall exercise, never executed at runtime. Two kinds: **cloze** (an API name in a documentation example is blanked; the produced output is shown as a hint) and **output** (what does this example print). Answers are checked with whitespace-, quote- and spacing-insensitive matching plus an optional alternatives list.
- Content comes from `scripts/mine-python-docs.py`, which reads CPython 3.12 `Doc/library/*.rst` for an allowlist of LeetCode-relevant modules (heapq, bisect, collections, itertools, functools, math, operator, string, builtin types and functions), executes every doctest example locally, and keeps only the ones whose output reproduces. Setup blocks are executed so examples work, but examples that depend on doc-only helper functions, bytes literals, or non-allowlisted APIs are dropped. Output: `data/drills/python.json`. Licence: PSF and Zero-Clause BSD for documentation examples.
- `data/drills/curation.json` holds hand-written drills (`extra`, verified by `scripts/verify-drills.py`), ids to exclude, and a per-module cap. Hand-written drills are served first.
- **Language fundamentals (added 2026-09-06).** Mining the library docs could only ever produce stdlib-API trivia — `heapreplace`, `bisect_right` — because those docs have no page on what a `for` loop does. 87 hand-authored fundamentals now lead the bank: variables and numbers, strings and slicing, lists, loops, conditionals, dicts, sets and tuples, comprehensions, functions. They are pitched above an intro course, each targeting a semantic that actually bites in a solution: `-7 // 2`, list aliasing, the `[[0]*n]*m` trap, mutable default arguments, `sort()` returning `None`. Every one is executed by `verify-drills.py` before it ships.
- `buildDrillSet` round-robins across modules as well as alternating kinds. The bank is grouped by module, so taking unseen drills in bank order handed out a whole day of one module; a set now spans five.
- Each day gets a set of 5 (`buildDrillSet`): due drills first on a 1, 3, 7, 21, 60 day ladder, then unseen drills alternating kinds. A wrong answer resets the drill to 1 day.
- Rewards: 1 **Ingot** per correct answer, +2 for a perfect set. Upgrading any building past level 1 costs 3 Ingots per level on top of the scaled resource cost, so drills are the only route to a prosperous city.
- **Unlimited practice** (added 2026-09-06) unlocks once every drill in the day's set has been answered, and runs as long as you like over the rest of the bank. It earns **nothing**: no Ingots, and no writes to `drill_state` or `drill_attempts`. That is deliberate — the daily set is drawn from the spaced-repetition ladder, so letting practice advance `srsStep` would let an evening of practice empty tomorrow's set, consuming the schedule it is meant to support. The unlock is enforced in `/api/drills/practice`, not just in the page, and answers are checked server-side there as they are for the daily set.
- The daily plan has a third slot pointing at `/drills`; it does not count toward the weekly budget, which remains about problems.
- Go and C# banks are future work: Go's `example_test.go` files with `// Output:` comments and the dotnet API docs snippets are the analogous sources.

### Solutions

Three tabs on the solve page: the NeetCode reference solution vendored from the MIT-licensed repo (served from `static/solutions/`), LeetCode community solutions filtered to the current language, and the editorial (in-app when free, a link when Premium). Opening the drawer is free (changed 2026-09-06: it used to cost 2 essence, which taxed the thing that actually teaches you). Opening it before a **refresh** is accepted still marks that solve assisted, halving its award and resetting its interval, since a repetition you needed help with has not stuck. A first solve carries no penalty either way. A "Last accepted" button loads your previous accepted code into the editor for comparison.

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
  /drills, /api/drills/answer  daily drill set (stored in game_state), server-side answer checking, ingots
  No cron: loadSnapshot() advances morale and accrues coins for elapsed days on each request; the daily plan is created on first load of the day.

D1: users, passkeys, sessions, challenges, settings (encrypted rows), problems (cache), problem_state,
    attempts, awards, ledger, resources, buildings, game_state, plans, plan_items, solution_views,
    drill_state, drill_attempts
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
