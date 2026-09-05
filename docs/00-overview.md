# LeetCode Game: options overview

> **Decision made 2026-09-04.** The build merges 01, 03 and 04: NeetCode 150 as a refreshable tech tree, a city, and an in-app Monaco editor driven by LeetCode's own judge. See [06-merged-design.md](06-merged-design.md). The options below stay as the record of alternatives.

Five self-contained options, one per file. Each pairs a game concept with the hosting that fits it, and each uses the same section headings so they compare cleanly. Two shared references at the end cover the LeetCode API and secrets/auth so the option docs stay short.

## The insight that shapes everything

LeetCode's GraphQL endpoint at `https://leetcode.com/graphql` answers unauthenticated requests for problem content, starter code, your last 20 accepted submissions (looked up by username), community solutions, and the daily challenge. Verified with curl from this machine on 2026-09-04; exact queries in [leetcode-api.md](leetcode-api.md).

So: you solve on leetcode.com, in Python, C++, Go or Rust, with their real judge and hidden tests. The game watches your account and turns accepted submissions into progress. **The app never runs your code.** That removes the hardest and riskiest piece of infrastructure (sandboxed execution of compiled languages), and it means the only secret worth stealing is an optional LeetCode session cookie.

Every option builds on this. Option 03 adds an in-app judge on top, for syntax drills only.

## The options at a glance

| | 01 Commit City | 02 Daily Expedition | 03 Forge & Keep | 04 Tech Tree Atlas | 05 Local Keep |
|---|---|---|---|---|---|
| Game loop | Build a city from solve resources; morale decays if you skip days | Daily quest = daily challenge + spaced-repetition re-solves | 01 plus in-app syntax drills that produce an upgrade resource | Unlock a Civ-style research tree of topics | Same as 01 |
| Hosting | Vercel Hobby + Neon Postgres | Cloudflare Workers + D1 | Hetzner VPS + Docker Compose | Vercel Hobby + Turso | This WSL box + Cloudflare Tunnel |
| Monthly cost | $0 | $0 | ~€6 | $0 | $0 |
| Runs your code? | No | No | Yes (Piston, private network) | No | No |
| Scheduled jobs | Once/day (Hobby cron), sync on page load | Free minute-level cron triggers | systemd timers, anything | Once/day, sync on page load | WSL cron |
| Live when this PC is off | Yes | Yes | Yes | Yes | **No** |
| Ops burden | Very low | Low | Medium-high (OS, Docker, backups) | Very low | Low but fragile |
| Secrets live in | Vercel env vars | wrangler secrets | sops+age on the VPS | Vercel env vars | .env on this disk |
| Local dev needs | Node | Node + wrangler | Node + Docker (not installed here) | Node | Node |
| Time to first playable | ~1 weekend | ~1 weekend | ~2 weekends | ~1 weekend | ~1 weekend |

## The layers are swappable

Each doc pairs a game concept with the hosting that fits it most naturally, but the two layers are independent. The city grid from 01 runs fine on Cloudflare; the expedition loop from 02 runs fine on Vercel. Pick the game you would actually open every day first, then the hosting you are happiest operating.

## Recommendation

Build **01 Commit City on Vercel + Neon**, then add **02's expedition loop** (daily challenge plus spaced-repetition re-solves) as the first feature after launch.

Why:

- A single user means "sync when I open the page" replaces cron entirely, and decay is computed from timestamps. So the simplest hosting wins, and the Vercel CLI is already installed on this machine.
- The city loop gives the daily-login pull you asked for. Spaced repetition is the thing most likely to actually make you better at this, so it is the first addition.
- 03's in-app judge is the only option with real security exposure: an auth bypass there means running code on your server. Only take that on if in-app syntax drills matter more than simplicity. You get most of the syntax benefit anyway from the 1.5x compiled-language multiplier and from viewing community solutions filtered to Rust, Go or C++.
- 05 fails "keep it live" unless this machine never sleeps.

## Needed before build, whichever option

- Your LeetCode username. The public profile must be visible, which is the default.
- Whether you have LeetCode Premium. Many editorials are free now. Premium-only ones need the session cookie to render in-app; otherwise the app links out.
- Whether you want a domain. Vercel and Cloudflare give free subdomains. A domain is about $10/yr at Cloudflare Registrar and is only required if you want Cloudflare Access in front of the app.

## Reading order

1. This file.
2. [01-commit-city.md](01-commit-city.md), [02-daily-expedition.md](02-daily-expedition.md), [03-forge-and-keep.md](03-forge-and-keep.md), [04-tech-tree-atlas.md](04-tech-tree-atlas.md), [05-local-keep.md](05-local-keep.md).
3. [leetcode-api.md](leetcode-api.md) and [secrets-and-auth.md](secrets-and-auth.md) when you want the details the options refer to.
