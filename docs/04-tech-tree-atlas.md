# 04. Tech Tree Atlas

A Civilization-style research tree instead of a city grid. Topics are nodes. Solving problems in a node generates research; enough research unlocks the next nodes and reveals their problem lists. Progression is about unlocking a curriculum, which suits someone who wants the path from "arrays" to "hard graph problems" laid out in front of them.

Hosting: Vercel Hobby + Turso (libSQL). Cost: $0/month.

## Game loop

### The tree

A hand-authored `curriculum.json`, ordered like NeetCode 150 and the LeetCode study plans:

```
Arrays & Hashing ─┬─> Two Pointers ─> Sliding Window ─> Stack ─> Monotonic Stack
                  ├─> Binary Search ─> Trees ─> Tries ─> Heaps
                  │                     └─> Backtracking ─> Graphs ─> Advanced Graphs
                  └─> Linked Lists ─> 1-D DP ─> 2-D DP ─> Greedy ─> Intervals ─> Bit Manipulation
```

Each node holds 6 to 12 curated problem slugs and a **wonder**, a cosmetic drawn on the atlas when the node completes.

### Research

- Accepted submission on a node's problem: +10 research for Easy, +25 for Medium, +60 for Hard. Compiled-language x1.5 as elsewhere.
- A node unlocks at 50% of its problems solved and completes at 100%.
- Problems outside the current frontier still count at half research, so the LeetCode daily is never wasted.

### Daily login

- **Inspiration**: a research multiplier that starts at x2 on login, decays to x1 over 24 hours, and drops to x0.5 after 48 hours away. Opening the app daily is worth it even if you do not solve; solving daily is worth double.
- **Eureka**: once a day the atlas highlights one problem in the frontier. Solving it gives a flat +100 research.

### Solutions panel

As in [01-commit-city.md](01-commit-city.md). Node pages also show which of your own past submissions exist for each problem (cookie required), so a re-solve is one click away.

## Architecture

Identical shape to 01 with two swaps:

- **Turso** (libSQL, SQLite-compatible, generous free tier) instead of Neon. Chosen here so the same schema runs against a local SQLite file during dev with zero setup, and `sqlite3` is already installed.
- The atlas is a server-rendered SVG generated from `curriculum.json` plus your research totals. Nodes are links. No canvas, and no client framework beyond a little JS for hover.

```
users, passkeys, sessions, problems, submissions, settings   -- as in 01
research(user_id, node_id, points)
node_state(user_id, node_id, status, completed_at)           -- status: locked | available | complete
logins(user_id, at)                                          -- drives Inspiration decay
```

## Auth

Passkey as in 01.

## Secrets

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `SETTINGS_KEY` and the temporary `SETUP_TOKEN` as Vercel env vars marked Sensitive. LeetCode cookie in the encrypted `settings` table.

## Cost

$0. Domain optional.

## Build outline

1. Repo hygiene, SvelteKit, Drizzle with the libSQL driver.
2. `curriculum.json` for the first six nodes.
3. LeetCode client, passkey auth, deploy.
4. Sync, research, node state.
5. SVG atlas page.
6. Inspiration and Eureka.
7. Solutions panel.

## Risks

- Less daily pull than a city with morale decay. Inspiration is the substitute and will need tuning.
- Curated lists go stale if LeetCode retires problems. Keep the JSON small and easy to edit.
