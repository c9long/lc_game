# 05. Local Keep

The 01 game, hosted on this WSL machine and exposed through a Cloudflare Tunnel. No cloud accounts beyond Cloudflare's free tier, no monthly cost, and every secret stays on this disk.

Stated plainly: **the app is only up while this machine is awake and WSL is running.** If "keep it live for myself" means reachable from your phone at lunch while the desktop sleeps, this option fails that requirement. It is here because it is the cheapest, most private, and easiest to hack on.

## Game loop

Identical to [01-commit-city.md](01-commit-city.md).

## Architecture

```
Phone / laptop ──> Cloudflare edge ──tunnel──> WSL: node server (SvelteKit, adapter-node) ──> SQLite file
```

- `cloudflared` runs as a systemd service inside WSL (requires `systemd=true` in `/etc/wsl.conf`) and serves `https://lc.<your-domain>`. A free `*.trycloudflare.com` quick tunnel also works but its URL changes every run, so a domain is worth having here.
- SQLite via `better-sqlite3`, one file at `data/game.db`. Backup: nightly `sqlite3 .backup` committed to a private GitHub repo, or `rclone` to any cloud drive.
- Sync on page load as in 01, with a WSL cron entry as the once-a-day safety net.
- Alternative to cloudflared: **Tailscale Funnel** gives a public HTTPS URL too, and Tailscale Serve keeps it tailnet-only.

## Auth

- **Cloudflare Access** in front of the tunnel: free, email one-time PIN, one allowed email. This is the primary gate and stops unauthenticated traffic from reaching the node process at all.
- Passkey inside the app as well, so a lost Access session is not the whole story.

## Secrets

- `.env` in the project directory, `chmod 600`, git-ignored. `direnv` if you like.
- The tunnel credential JSON lives in `~/.cloudflared/`, mode 600.
- Nothing leaves this disk except the tunnel token to Cloudflare.

## Cost

$0. A domain is optional but recommended so the URL is stable, about $10/yr.

## Build outline

1. Steps 1 to 8 of 01 with `adapter-node` and `better-sqlite3`.
2. Enable systemd in WSL, install `cloudflared`, create a named tunnel, route the hostname.
3. Cloudflare Access application for that hostname.
4. Backup script and cron.

## Risks

- Machine asleep means app down. Windows sleep, WSL idle shutdown and reboots all take it out.
- WSL networking occasionally changes on restart. A systemd service copes, but expect some fiddling.
- Backups are your responsibility. A dead disk is a dead city.
