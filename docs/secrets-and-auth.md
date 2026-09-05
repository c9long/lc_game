# Secrets and single-user auth

Applies to every option. The threat model is small but real: the app is on the public internet, it may hold a cookie that can act as you on LeetCode, and in option 03 it can run code on your server. "Only me" does not mean "no one will poke it". Bots scan every hostname within hours of it getting a certificate.

## Login: passkey (WebAuthn)

Recommended for all options.

- One user with one or two registered passkeys: your laptop's platform authenticator, your phone, or a hardware key.
- No password exists, so there is nothing to phish, stuff or leak.
- Library: `@simplewebauthn/server` plus `@simplewebauthn/browser`. Works on Node and on Cloudflare Workers.
- Registration is the dangerous endpoint, since whoever registers first owns the app. Gate it with a one-time `SETUP_TOKEN` environment variable: `/auth/register?token=...` only works while the variable is set and matches. Register on first deploy, then delete the variable. To add a second passkey later, set it again temporarily.
- Sessions: a random 32-byte id stored server-side in a `sessions` table, sent as a cookie with `HttpOnly; Secure; SameSite=Lax; Path=/`, 30-day expiry, refreshed on use. Server-side sessions mean truncating the table revokes everything.
- WebAuthn requires HTTPS and a stable origin, which is why every build outline says "deploy early".

Fallback if passkeys are awkward on some device: a password hashed with argon2id (or scrypt via Web Crypto on Workers) plus TOTP. Still single-user, still rate-limited.

## Outer layer: Cloudflare Access (optional)

Free on the Zero Trust plan up to 50 users. Put the hostname behind an Access application with an allow-list of exactly your email and one-time-PIN login. Traffic without a valid Access JWT never reaches your app. Access is built for hostnames on a domain you manage in Cloudflare, so budget for a domain. Strongly recommended for options 03 and 05.

## Where secrets live

| Platform | Mechanism | Notes |
|---|---|---|
| Vercel | Project settings, Environment Variables, marked **Sensitive** | Sensitive values cannot be read back from the dashboard. `vercel env pull` writes a local `.env` for dev. |
| Cloudflare Workers | `wrangler secret put NAME` | Encrypted, never in `wrangler.toml`. Local dev reads `.dev.vars`. |
| VPS (option 03) | `sops` + `age` | `secrets.env.enc` is committed. The age private key lives only on the server (mode 600) and in your password manager. Decrypt at deploy into a tmpfs. |
| This machine (option 05) | `.env`, `chmod 600` | git-ignored; `direnv` if you like. |

## The LeetCode session cookie

It is optional. Without it the app still gets problem content, your last 20 accepted submissions, community solutions and the daily challenge. With it the app gets your full submission history and code, and Premium editorials if you subscribe.

- It is a bearer credential for your LeetCode account. Treat it like a password.
- Store it encrypted in the database (a `settings` table, AES-256-GCM with a `SETTINGS_KEY` from the environment) rather than as an env var, because it expires and you will want to rotate it from your phone via an admin page without redeploying.
- Never log it. Redact it in error messages. The LeetCode client module is the only code that touches it.
- Getting it: log in to leetcode.com, open DevTools, Application, Cookies, and copy `LEETCODE_SESSION` and `csrftoken`.

## Repo hygiene from the first commit

```
git init
printf '.env\n.env.*\n!.env.example\n.dev.vars\nnode_modules/\ndata/\n' > .gitignore
```

- Commit `.env.example` with variable names and empty values.
- Install gitleaks and add it as a pre-commit hook (`gitleaks protect --staged`) so a pasted cookie cannot be committed by accident.
- If a secret ever lands in git, rotate it. Do not rely on rewriting history.

## Other checklist items

- Rate-limit `/auth/*`. A per-IP counter is enough.
- Security headers: `Strict-Transport-Security`, and a `Content-Security-Policy` with no inline scripts. Community solution content is third-party HTML or markdown; sanitise it server-side before rendering.
- The app's database role has only the permissions it needs. Migrations run with a separate role or at deploy time.
- Option 03 extras: SSH key-only, `ufw`, `fail2ban`, `unattended-upgrades`, judge on a private network with no outbound access, CPU/memory/time limits per execution.
