# 03. Forge & Keep

Everything in 01, plus a **Forge**: short syntax drills that run in-app against hidden tests on a judge you host. This is the only option that executes code, and the only one with a monthly bill.

Hosting: Hetzner VPS running Docker Compose (app, Postgres, Piston judge) behind Caddy. Cost: about €6/month.

## Game loop

### The Forge

Drills are tiny, 2 to 10 line problems about the language rather than the algorithm:

- "Return the k smallest elements of `nums` using a heap." Python `heapq.nsmallest`; Rust `BinaryHeap` with `Reverse`; Go `container/heap`; C++ `priority_queue` with `greater<>`.
- "Group words by their sorted letters." `defaultdict(list)`; `HashMap<String, Vec<String>>`; `map[string][]string`; `unordered_map<string, vector<string>>`.
- "Parse `s` into ints and skip the non-numeric tokens."
- "Reverse a singly linked list given this struct definition."

Each drill has a prompt, a starter file per language, hidden tests, and a reference solution revealed after two failed runs. Drills live as JSON in the repo and are hand-written. The first 40 cover the idioms that show up in nearly every LeetCode solution: heaps, hash maps, deques, sorting with keys, string building, 2D grids, recursion helpers, bit operations.

Reward: **Ingots**, a separate resource only the Forge produces. Ingots are the cost of **upgrading** buildings to level 2 and 3. Algorithm solves build the city; syntax drills make it prosper. Drills are re-scheduled by the same spaced-repetition rule as [02-daily-expedition.md](02-daily-expedition.md).

### In-app editor for LeetCode problems

A Monaco editor loaded with the problem's starter code for your language. "Run examples" executes against the problem's example test cases on your judge. This needs a per-problem driver that parses LeetCode's input format and calls your function, which is real work (see Risks). Final acceptance still comes from submitting on leetcode.com and syncing. The in-app run is for scratch work.

## Architecture

```
Internet ──> Caddy (TLS) ──> app (SvelteKit, adapter-node)
                               ├── Postgres 16 (Docker volume)
                               └── Piston judge   private Docker network, no published ports,
                                                  no outbound network, CPU/memory/time limits
```

- **VPS**: Hetzner CX22, 2 vCPU and 4 GB, about €4.50/month, Ubuntu 24.04. Enough for Piston with four language runtimes.
- **Judge**: Piston (github.com/engineer-man/piston). One `POST /api/v2/execute` with language, version, files and stdin. Supports python, gcc for C++, go, rust. Each execution runs as an unprivileged user with rlimits. Combined with Docker isolation this is a reasonable sandbox for your own code, not a bulletproof one for hostile code.
- **Deploy**: `docker compose up -d` over SSH, or a GitHub Actions workflow that SSHes in. Backups: nightly `pg_dump` to a Hetzner Storage Box or Backblaze B2 via cron on the box.
- **Local dev**: Docker is not installed in this WSL. Either install it (Docker Desktop or `docker.io` inside WSL) or point local dev at the VPS Postgres over an SSH tunnel and skip the judge locally. Drills need the judge, so Docker locally is the honest answer.

## Auth

Passkey as in 01, **plus** an outer layer, because here an auth bypass means running code on your server:

- **Cloudflare Access** in front of the app, with the VPS firewall accepting HTTP only from Cloudflare IP ranges, or
- **Tailscale**: keep `/admin` and the judge reachable only on the tailnet, and expose the rest via Tailscale Funnel or a Cloudflare Tunnel.

Also: SSH key-only login, `ufw` allowing 22/80/443 only, `fail2ban`, `unattended-upgrades`.

## Secrets

- The repo holds `secrets.env.enc`, encrypted with **sops + age**. The age private key lives only on the VPS (`~/.config/sops/age/keys.txt`, mode 600) and in your password manager. At deploy time `sops -d` writes `.env` into a tmpfs and Docker Compose reads it.
- Alternative: Docker secrets files bind-mounted from a root-only directory.
- Contents: Postgres password, `AUTH_SECRET`, `SETTINGS_KEY`, `SETUP_TOKEN`. The LeetCode cookie still lives encrypted in the database so it can be rotated from the admin page.

## Cost

| Item | Cost |
|---|---|
| Hetzner CX22 | ~€4.50/mo |
| Backups (Storage Box or B2) | ~€1/mo |
| Domain | ~$10/yr |
| **Total** | **~€6/mo** |

## Build outline

1. Everything from 01 steps 1 to 8, using `adapter-node` and a `docker-compose.yml`.
2. Provision the VPS: user, SSH hardening, ufw, Docker, Caddy. Script it as `scripts/provision.sh` so it is reproducible.
3. Piston container, install the four runtimes, smoke test from inside the network.
4. Drill format, the first 10 drills, judge client, Forge UI, ingots.
5. Building upgrades that cost ingots.
6. sops + age, GitHub Actions deploy, backup cron.
7. Cloudflare Access or Tailscale layer. Verify with a port scan from outside.
8. Later and optional: Monaco editor and "run examples" drivers for the most common LeetCode signatures.

## Risks

- **Security**: the highest of any option. You are hosting a code runner on the public internet behind your own auth. The mitigations above are necessary, not optional.
- **"Run examples" is hard**: LeetCode's input format varies per problem. Arrays, linked lists and trees serialised as `[1,null,2]` each need a driver. Writing drivers for every signature is a rabbit hole. Ship drills first and treat the editor as a later bonus.
- **Ops**: OS updates, Docker upgrades, disk filling with Piston temp files, Postgres backups. A few hours a year, but it is on you.
- **Local dev needs Docker**, which this machine does not have.
