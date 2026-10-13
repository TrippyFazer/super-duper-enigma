# Ascend

A mobile-first self-improvement RPG. Your real life is the game: training, sleep, cooking, money, personal care, sobriety and habits each get a rank from **E to S**, calibrated against population statistics and expert guidelines, and roll up into an overall adventurer rank, level and XP.

> "If my real life were an RPG, what rank would my character be?"

Single-user, self-hosted, works offline-first as an installable PWA. No accounts, no cloud, one SQLite file.

## Quick start

```bash
npm install
cp .env.example .env.local      # optional: only needed for Oura
npm run db:migrate              # creates data/ascend.db and seeds the recipe catalog
npm run dev                     # http://localhost:3000
```

Open it on your phone: run on your machine and visit `http://<your-computer-ip>:3000`, or deploy (see below). On iOS use Share → **Add to Home Screen** to install it as an app.

Want to see it populated? `npm run db:seed -- --force` creates a character with 75 days of realistic history (this wipes the database).

### Production

```bash
npm run build
npm start                       # serves on port 3000
```

The database path defaults to `./data/ascend.db`; set `DATABASE_PATH` to move it. Back up by copying that file.

### Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Vitest: ranking engine + progression service tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply migrations + seed recipes (also happens automatically on first request) |
| `npm run db:seed -- --force` | Wipe and create a demo character with 75 days of data |
| `npm run db:reset` | Delete the database |
| `npm run db:generate` | Generate a new Drizzle migration after editing `src/db/schema.ts` |

## Environment variables

Copy `.env.example` to `.env.local`. Everything is optional.

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | SQLite file location (default `./data/ascend.db`) |
| `APP_URL` | Public URL of the app, used to build the Oura OAuth redirect (`<APP_URL>/api/oura/callback`) |
| `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` | Oura OAuth2 application credentials (recommended path; see `docs/oura-integration.md`) |
| `OURA_PERSONAL_ACCESS_TOKEN` | A legacy Oura personal token, if you still have one |
| `AI_PROVIDER` | `openai` (any OpenAI-compatible chat API) or `anthropic`. Optional. |
| `AI_API_KEY` | API key for that provider. Optional; can also be entered in Settings → AI provider (stored only in your local database). |
| `AI_MODEL` | Model id (defaults: `gpt-4o-mini` / `claude-haiku-5-5`) |
| `AI_BASE_URL` | Override the API base URL, e.g. a local Ollama or Groq endpoint |
| `APP_PASSWORD` | When set, every page needs this password (one sign-in per device, kept 400 days). Set it on any public deployment: the app has no accounts. |
| `AUTH_SECRET` | Signs the sign-in cookie. Optional; defaults to the password, so changing the password signs everyone out. |
| `OURA_AUTO_SYNC_HOURS` | How often the server pulls the last 3 days from Oura by itself (default `3`; `0` = off). |
| `TZ` | Server clock zone for server-rendered times. Match the profile's time zone (set in `compose.tfhealth.yml`). |
| `HEALTH_INGEST_TOKEN` | Optional static Bearer token for `POST /api/health/ingest` (Apple Health bridge). A token can also be generated in Settings → Connected services. |
| `FOOD_SEARCH_LIVE` | Set to `off` to disable live Open Food Facts product lookups in food search |

**The whole app works without an AI key.** Workouts, meal plans, special quests and the coach fall back to deterministic templates, the recipe catalog and a rule-based coach. With a key, results are cached per day in `ai_cache` so the home screen never makes a model call; only explicit "generate / regenerate / ask" actions do.

Never commit `.env.local`.

## What's inside

```
src/
  app/            Next.js App Router pages: home, onboarding, quests, progress, planner (workout, session, meals, history), coach, notifications, recipes, profile, domains/[domain], API routes
  actions/        Server actions (Zod-validated) — the only write path from the UI
  services/       Data access + progression (reconcile), XP ledger (sources + voids), quest offers, workouts/sessions/PRs, nutrition + planned-meal lifecycle, food weeks (grocery/pantry/prep), sleep plan, motivation, scheduler, notifications, preferences
  health/         HealthProvider interface, Apple Health ingest + aggregation (de-dup, nights, workout matching)
  food/           Ingredient catalog (categories, price estimates), chain menu data, unified food search (saved · menu · recipes · Open Food Facts)
  ranking/        Pure ranking engine: scale, ranks, gating, levels, XP rules, quests, quest library + safety guardrails, achievements, rank visuals, domains/*
  planner/        Exercise catalog, template workout generator, template meal planner, weekly food planner (reuse + budget), pantry suggestions, day adjustment
native/ios/       Swift HealthKit bridge (read-only, anchored + observer queries with background delivery)
  ai/             Provider abstraction (OpenAI-compatible / Anthropic), Zod output contracts, context builder, generation + cache
  db/             Drizzle schema, migrations, SQLite client, recipe + nutrition seed
  integrations/   Oura API v2 client + sync
  components/     UI (mobile-first, knight/RPG aesthetic; hero, quests, planner, session tracker, nutrition, coach)
public/art/       Procedurally generated crest + backdrop art per rank (E Novice Squire → S Legendary Paladin)
docs/
  ranking-research.md     Sources and population statistics behind every threshold
  ranking-methodology.md  How scores, ranks, gating, XP and levels are computed
  oura-integration.md     Oura setup
tests/            Vitest suites for the engine and the progression service
```

Stack: Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind 4, Drizzle ORM + better-sqlite3, Zod, Recharts, Motion. PWA via web manifest + a small service worker.

## Logging

One floating **+ LOG** button on every tab opens Food · Workout · Sleep · Routine/Habit · More (ordered by what you log most). Food logging is one sheet everywhere: Recent, Search, Restaurant, Quick macros, Estimate, Recipe, with "I cooked this" on the confirm step. The UX audit behind the 0.4.0 layout is in `docs/ux-audit.md`.

## How ranking works (short version)

* Each domain computes a 0–100 score from rolling 30/90-day windows of your logs, through anchor tables placed at research thresholds (e.g. 150 moderate minutes/week ≈ median → 50).
* Ranks: E <30, D 30–49, C 50–69, B 70–84, A 85–94, S 95+.
* Ranks are **time-gated**: max D in the first two weeks, C at 14 days, B at 30, A at 60, S at 120. One great week never makes an S.
* Overall rank is the weighted mean of active domains, capped at two ranks above your weakest domain.
* XP is the daily loop (workout 25, meal 15, routine 10, habit 8…), idempotent and capped so nothing can be farmed. Level L needs 60·L^1.7 XP.

Full detail with sources: `docs/ranking-methodology.md` and `docs/ranking-research.md`.

## Oura Ring (the source)

Oura supplies sleep and steps. Connect in **Profile → Settings → Connected services → Connect with
Oura** (an OAuth app: `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET`, redirect URI
`<APP_URL>/api/oura/callback`; do the connect step in a browser, not the home-screen app). The server
then syncs by itself every 3 hours (`src/services/autoSync.ts`). A night is Oura's main sleep;
naps are not added to it. See `docs/oura-integration.md`.

## Apple Health (optional, not in use)

Kept working but tucked away under Connected services: a Shortcut or the native bridge can post
samples to `/api/health/ingest` (UUID optional; duplicates caught server-side). Don't run it
alongside Oura if the ring also writes to Apple Health. See `docs/apple-health.md` and
`docs/apple-health-shortcut.md`.

## Hosting (TFHealth)

Live at `https://tfhealth.tfwebapps.com`, one container on a shared server:

```bash
docker compose -f compose.tfhealth.yml up -d --build   # build + (re)start; data is in the tfhealth-data volume
```

Secrets live in `.env.production` on the server (never committed): `APP_PASSWORD`, `AUTH_SECRET`,
`APP_URL`, `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `AI_PROVIDER`, `AI_API_KEY`.
`scripts/publish-tfhealth.sh` added the HTTPS site to the shared Caddy once. `master` is what runs.

## Data & privacy

Everything lives in `data/ascend.db` on the machine running the app. Financial figures are personal estimates, not advice. No analytics, no third-party calls except Oura when you connect it.

## Testing

```bash
npm test          # 128 tests: engine, XP ledger, quests, achievements, quest offers (no-penalty decline, expiry, XP bands, guardrails), AI contracts + fallback + cache, workout sessions/PRs, nutrition + meal plans, UX rules (health sources, + LOG ordering, meal-type inference, weight steppers)
npm run typecheck
```
