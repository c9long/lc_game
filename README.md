# Commit City

A single-player LeetCode practice game: the NeetCode 150 as a tech tree you must keep fresh, a city that grows from your solves, and a self-contained Monaco editor that submits to LeetCode's own judge through your session cookie. No AI, no code execution on the server, $0 hosting on Cloudflare Workers + D1.

- Design and the alternatives that were considered: [docs/](docs/) (start with [docs/06-merged-design.md](docs/06-merged-design.md)).
- Running, deploying, rotating the cookie, backups: [docs/runbook.md](docs/runbook.md).
- LeetCode endpoints used and their limits: [docs/leetcode-api.md](docs/leetcode-api.md).

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in
pnpm db:migrate:local
pnpm dev
```

Syntax drills in `data/drills/` are mined from the CPython documentation (PSF / Zero-Clause BSD) by `scripts/mine-python-docs.py`. Reference solutions under `static/solutions/` are from [neetcode-gh/leetcode](https://github.com/neetcode-gh/leetcode) (MIT).
