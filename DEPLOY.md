# Deploying on your VPS (aaPanel)

Runs the dashboard **and** the worker on one server. Supabase (database, login, images) and Redis Cloud stay
where they are; the server only needs outbound internet.

**Rules that matter**

- Run exactly **one** dashboard process and **one** worker. Some state lives in the process (Telegram login codes,
  bulk-generation progress, rate limits). Do not scale to several copies.
- Keep `.env.local` on the server only. Never commit it, never paste it in chat.
- The dashboard listens on `127.0.0.1:3000`. Only the reverse proxy (HTTPS) is public.

## 0. Before you start

1. **Rotate the API keys you pasted in chat earlier** (OpenRouter, Groq, OpenAI, Redis) and use the new ones below.
2. In Supabase → Authentication, "Allow new users to sign up" must stay **off**. Add your team under Users → Add user.
3. Have a domain (or subdomain) pointing at the VPS IP, for example `sim.yourdomain.com` (A record).

## 1. Prepare the server

Over SSH (use an SSH key, not a password, if you can):

```bash
# Node.js 22 or newer (aaPanel: App Store -> Node.js version manager, or use nvm)
node -v            # must print v22.x or higher
npm i -g pm2
```

Optional, only for the **AllYono Knowledge** page when a site needs a real browser (single-page sites):

```bash
npx playwright install --with-deps chromium
```

## 2. Put the project on the server

Upload the project folder (zip it without `node_modules`, `.next`, `.env.local`, `tests/e2e/.auth`) to, for example,
`/www/wwwroot/allyono`, or `git clone` it if you use a private repository.

```bash
cd /www/wwwroot/allyono
npm ci             # a FULL install: the worker runs through tsx, which is a dev dependency
```

## 3. Environment file

Create `/www/wwwroot/allyono/.env.local` (copy `.env.example` and fill it in). The values to double check on a server:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://sim.yourdomain.com` |
| `ADMIN_EMAILS` | your team's emails, comma-separated (extra lock on top of closed sign-ups) |
| `DB_POOL_MAX` | `4` |
| `SESSION_ENCRYPTION_KEY` | **the same value you use now.** A different key makes every saved Telegram session unreadable |
| `SIMULATION_DRY_RUN` | leave unset (set to `true` only to rehearse without sending) |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `REDIS_URL` / database + Supabase + AI keys | as in your local file |

`NEXT_PUBLIC_*` values are baked in at build time, so set them **before** step 4. Lock the file down:

```bash
chmod 600 .env.local
```

## 4. Build and start

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # run the command it prints, so both processes come back after a reboot
pm2 status         # allyono-web and allyono-worker should both be "online"
```

Database changes (only when a new release adds a migration): `npm run db:migrate`, then restart (step 7).

## 5. Domain and HTTPS in aaPanel

1. Website -> **Add site** with your domain (a plain static site is fine).
2. Site settings -> **Reverse proxy** -> add: target URL `http://127.0.0.1:3000`, send domain `$host`.
3. Site settings -> **SSL** -> Let's Encrypt -> apply, and turn on **Force HTTPS**.
4. Supabase -> Authentication -> URL Configuration: set **Site URL** to `https://sim.yourdomain.com` and add
   `https://sim.yourdomain.com/**` under Redirect URLs. Without this, password-reset links break.

For long requests (AI generation, imports), raise the proxy timeout to at least 180 seconds
(Reverse proxy -> Config file: `proxy_read_timeout 180s;`) and set the maximum upload size to 5 MB
(`client_max_body_size 5m;`).

## 6. Lock the server down

- Firewall (aaPanel -> Security, and the VPS provider's firewall): open only **22** (SSH, ideally restricted to your IP),
  **80**, **443** and the aaPanel port. Do **not** open 3000.
- Change the aaPanel default port and enable its security entrance; use a strong password; keep the OS updated.

## 7. Day-to-day

```bash
pm2 status                      # are both running?
pm2 logs allyono-worker --lines 100
pm2 restart allyono-web allyono-worker
```

Updating to a new version:

```bash
cd /www/wwwroot/allyono
# replace the files (keep .env.local), then:
npm ci && npm run build
pm2 restart allyono-web allyono-worker
```

Logs are in `logs/` (rotate them with `pm2 install pm2-logrotate`).

## 8. First-run checklist

1. Open the site, sign in with a user you created in Supabase.
2. **Queue** page: Redis connected and the worker shows **online**.
3. **Telegram -> Accounts**: connect each account from the live dashboard (it asks for the Telegram code). If an account
   was already connected on your PC, stop the PC's dashboard/worker first: Telegram signs out a session that is used from two
   places at once.
4. Your private test group: Resolve it, set Active and Automation as you want. The real AllYono Community stays manual.
5. **Scheduler**: set your duty calendar and volume, enable the schedule, press START ALL.
6. Optional rehearsal: set `SIMULATION_DRY_RUN=true`, restart, watch **History** fill without anything reaching Telegram,
   then remove it and restart.

## 9. Backups

Supabase holds all data. Take a manual backup before big changes (Supabase -> Database -> Backups, or `pg_dump`). The
server itself only needs `.env.local` and the project files, so keep a private copy of `.env.local` in a password manager.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site shows 502 | `pm2 status`; if `allyono-web` is errored, `pm2 logs allyono-web` |
| Worker "offline" on the Queue page | `pm2 logs allyono-worker`; usually a wrong or missing `REDIS_URL` |
| Telegram account says "in use by another process" | Another copy (your PC, an old worker) is connected; stop it and retry in a minute |
| Password reset link goes to localhost | `NEXT_PUBLIC_APP_URL` and the Supabase Site URL still say localhost; fix, rebuild, restart |
| Telegram sessions stop working after a move | `SESSION_ENCRYPTION_KEY` differs from the one that encrypted them |
| Knowledge page "could not render" | run the Playwright Chromium install in step 1 |
