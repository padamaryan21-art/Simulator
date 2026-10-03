# Running the worker on Railway

The dashboard can live on Vercel, but **sending on your duty schedule needs a process that stays running**. That is the
worker (`npm run worker`). Railway runs it for about US$5 a month. The worker and the dashboard share the same Supabase
database and Redis, so the dashboard on Vercel controls the worker on Railway.

**Rules that matter**

- Run exactly **one** worker (`railway.json` already pins 1 replica). Two workers, or a worker on your PC at the same time,
  fight over the Telegram sessions and Telegram signs them out.
- The worker has **no web address**. Do not generate a public domain for it.
- The worker needs the same secrets as the dashboard. Enter them only in Railway's Variables tab, never in the repository.

## 1. Before Railway

1. The code must be in a **private GitHub repository** (Railway deploys from it). The repo must not contain any `.env` file.
2. The **new rotated keys** must be ready (OpenRouter, Groq, OpenAI, Redis), and your current `SESSION_ENCRYPTION_KEY`.
3. Connect your Telegram accounts once, from the dashboard, before or after the worker starts. The worker only uses the
   sessions already saved in the database.

## 2. Create the service

1. Railway → **New Project** → **Deploy from GitHub repo** → pick the repository.
2. Railway reads `railway.json` in the repo: nothing to build, start command `npm run worker`, one replica, always restart.
3. Open the service → **Settings**:
   - **Region:** the one closest to your Supabase project (fewer slow database calls).
   - **Networking:** leave it without a public domain.

## 3. Variables

Service → **Variables** → **Raw Editor**, paste your own values for these names:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase **pooler** URL (transaction mode), same as the dashboard |
| `NEXT_PUBLIC_SUPABASE_URL` | same as the dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as the dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | same as the dashboard (the worker reads images from private storage) |
| `REDIS_URL` | the Redis Cloud URL |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | same as the dashboard |
| `SESSION_ENCRYPTION_KEY` | **exactly the same value** as the dashboard, or the saved sessions cannot be read |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, ... | the new keys; the worker generates conversations too |
| `LLM_MODELS`, `LLM_STRATEGY` | same as the dashboard |
| `DB_POOL_MAX` | `4` |
| `LOG_LEVEL` | `info` |
| `NEXT_PUBLIC_APP_URL` | your Vercel address |

Leave `SIMULATION_DRY_RUN` unset (set it to `true` only to rehearse without sending).

## 4. Check that it works

1. **Deployments → View logs:** you should see the worker start. Common failure: a missing variable is named in the error.
2. The dashboard's **Queue** page shows the worker **online** (the dashboard and the worker meet through Redis).
3. Only then: Scheduler → set your duty calendar and volume → enable the schedule → START ALL.
4. Optional rehearsal first: set `SIMULATION_DRY_RUN=true` on Railway, redeploy, watch **History** fill, then remove it.

## 5. Day to day

- **Update:** push to GitHub; Railway redeploys the worker automatically (the dashboard on Vercel redeploys too).
- **Database changes** (a new release with a migration): run `npm run db:migrate` from your PC, then push.
- **Stop sending:** use PAUSE ALL / STOP ALL on the dashboard. To switch the worker off completely, remove the service's
  deployment in Railway.
- **Cost:** Railway's Hobby plan includes US$5 of usage; a mostly idle worker usually stays near that. Set a usage limit in
  Railway → Account → Usage so it can never surprise you.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Queue page says worker offline | Railway logs; usually a wrong `REDIS_URL` or missing variable |
| "Invalid environment configuration" in logs | the variable it names is missing or malformed |
| Account "in use by another process" | a second copy is running (your PC, an old deploy); stop it |
| Sessions suddenly unreadable | `SESSION_ENCRYPTION_KEY` on Railway differs from the dashboard's |
| Redeploy loop | read the first error in the logs; Railway restarts on every crash |
