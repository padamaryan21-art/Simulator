# Allyono Telegram Community Simulation

An admin dashboard that manages connected Telegram accounts, writes natural Tagalog/Taglish conversations
between personas (with free AI models), and sends them to a private test group on a schedule that follows
your duty shifts. The real AllYono Community is never automated: everything for it goes through human approval.

**Stack:** Next.js 16 (App Router) · Supabase (Auth + Postgres) · Drizzle · GramJS (Telegram user accounts) ·
BullMQ + Redis · Vitest · Playwright.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Supabase, database, Telegram API id/hash, a
   `SESSION_ENCRYPTION_KEY`, at least one AI provider key, `REDIS_URL`).
3. Create a dashboard user in Supabase → Authentication → Users.
4. `npm run db:migrate`, then `npm run db:seed`.
5. `npm run dev` and sign in at http://localhost:3000.

## Running it

| Command | What it does |
|---|---|
| `npm run dev` | Dashboard only (manual sending works without Redis or the worker). |
| `npm run worker` | The background worker: scheduler tick, generation, sending, memory, knowledge. |
| `npm run dev:all` | Dashboard and worker together. |
| `npm run db:migrate` / `db:seed` | Apply migrations / seed accounts, personas, groups, topics. |

Scheduled conversations only run while the worker is up **and** START ALL has been pressed **and** you are on duty.

To host it on a server (aaPanel / any VPS, dashboard and worker together), follow [DEPLOY.md](DEPLOY.md). To run only the worker on Railway (with the dashboard on Vercel), follow [RAILWAY.md](RAILWAY.md).

## Typical day-to-day flow

1. **Accounts / Groups:** connect each Telegram account; give the private group a Telegram link and Resolve it.
2. **Personas / Relationships / Topics / AllYono Knowledge:** fill them in; confirm facts before the AI may use them.
3. **Content:** generate in the **Simulator**, bulk-generate drafts, or **Import conversations** (Excel/CSV/PDF written elsewhere). Add pictures in **Images** (see below).
4. **Scheduler:** set your duty calendar (day / night / custom / days off) and volume, enable the schedule, START ALL.
5. **History / Logs / Queue:** watch what was generated, sent, or failed.

## Images

Upload JPG/PNG pictures in **Content → Images** and assign each one a **topic** and a **persona** who sends it. When a
generated conversation's topic has an unused picture whose sender takes part, it is added as a photo message (after the
opening lines, at most one per conversation, with a configurable chance).

- **Each picture is used once.** The database allows an image on only one message, a picture is retired the moment it is
  really posted, and it never comes back, even if its conversation is deleted from History.
- Files sit in a **private** Supabase Storage bucket and are shown only to signed-in users. Uploads are re-encoded: GPS and
  other metadata are stripped, size is capped, transparent PNGs become JPEG.
- The library has no "win / payout" kind and captions get the same checks as conversation lines (no winning claims, links or
  promotional wording). In the real community every picture, like every message, needs a person's approval.
- Attaching or removing a picture on a message revokes that message's approval. A dry run never uses up library images.

## Prompt library

**AI → Prompt library** holds ready-made prompts for ChatGPT, each for a different everyday topic. A prompt asks for 80
conversations of 26 to 36 lines (2,080 to 2,880 lines in total), in batches of 5, as a CSV block in the exact format
**Import conversations** reads. The cast (your active personas, with their personality, style and favourite expressions) is
filled in live, so a prompt never goes stale.

- Paste one prompt per ChatGPT chat, type `continue` after each reply until it says `DONE`, put all CSV blocks into one file
  (header row once) and upload it in **Import conversations**.
- 12 built-in prompts (read-only). Use **Duplicate** to make your own copy, or **New prompt**. A custom prompt is refused
  unless it can reach 2,000 lines.
- Every prompt carries the same safety rules (no links, winning claims, promotion, invented facts). The importer checks the
  reply again, and you should still read a sample before importing.

## Safety rails

- `REAL_COMMUNITY` groups can never be automated or skip approval (service check **and** a database CHECK constraint).
  Messages there need a signed-in person's approval, and editing an approved message revokes the approval.
- Automation is private-simulation only, runs only while you are on duty, and honours PAUSE ALL / STOP ALL before every message.
- Per-account daily quota and a minimum gap between messages from the same account.
- AI output is checked (links, winning claims, promotional wording, unverified figures, repetition). The AI is told never to
  give tips or claim winnings. Only **Confirmed** knowledge facts may be stated.
- Telegram sessions are AES-GCM encrypted at rest and never reach the browser. A Redis lock per account keeps the dashboard
  and the worker from using one session at once (Telegram would invalidate it).
- All 21 tables have Row Level Security with no public policies. Every API route requires a signed-in user, rejects
  cross-site writes, and validates input. Security headers are set; `npm audit` is clean.
- `SIMULATION_DRY_RUN=true` runs everything without contacting Telegram (testing only).

## Tests

| Command | Scope |
|---|---|
| `npm test` | Unit tests (rules, validators, parsers, scheduler maths, security checks). Fast, no network. |
| `npm run test:integration` | Database services against the real Supabase DB, on records it creates itself (`ZZ-IT-`) and deletes. |
| `npm run test:e2e` | Browser tests (Edge) against their own server on port 3100, with a throwaway user. Never sends to Telegram. |

The browser tests call the AI models once (the simulator flow); if every free model is rate-limited they skip that test with the real reason.

## Troubleshooting

- **"All AI models are unavailable right now":** the free tiers are rate-limited or out of daily quota. Wait, add another
  provider key (Cerebras, Gemini, Mistral are free), or add credits. Imported/bulk drafts need no AI.
- **Pages hang or queries time out:** Supabase's free pooler has ~15 connections shared by every process. Keep `DB_POOL_MAX` small.
- **Worker says offline:** start it with `npm run worker`; check `REDIS_URL`. Set Redis eviction to `noeviction`.
- **Account shows "in use by another process":** the dashboard and worker take turns on a session; retry in a minute.

## Known limits

- Sending speed is bounded by Telegram's limits; start with a modest quota per account.
- Free AI models and Redis Cloud's free plan have daily/connection limits; Redis has no persistence (the plan lives in Postgres, so nothing is lost).
- Imported files: up to 4 MB / 20,000 lines each (Vercel caps a request at 4.5 MB); Excel macros are never run.
