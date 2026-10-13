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

Never commit `.env.local`.

## What's inside

```
src/
  app/            Next.js App Router pages: home, onboarding, quests, progress, recipes, profile, domains/[domain], API routes
  actions/        Server actions (Zod-validated) — the only write path from the UI
  services/       Data access + the progression service (reconcile: quests, achievements, XP, rank history)
  ranking/        Pure ranking engine: scale, ranks, gating, levels, XP rules, quests, achievements, domains/*
  db/             Drizzle schema, migrations, SQLite client, recipe seed
  integrations/   Oura API v2 client + sync
  components/     UI (mobile-first, dark RPG aesthetic)
docs/
  ranking-research.md     Sources and population statistics behind every threshold
  ranking-methodology.md  How scores, ranks, gating, XP and levels are computed
  oura-integration.md     Oura setup
tests/            Vitest suites for the engine and the progression service
```

Stack: Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind 4, Drizzle ORM + better-sqlite3, Zod, Recharts, Motion. PWA via web manifest + a small service worker.

## How ranking works (short version)

* Each domain computes a 0–100 score from rolling 30/90-day windows of your logs, through anchor tables placed at research thresholds (e.g. 150 moderate minutes/week ≈ median → 50).
* Ranks: E <30, D 30–49, C 50–69, B 70–84, A 85–94, S 95+.
* Ranks are **time-gated**: max D in the first two weeks, C at 14 days, B at 30, A at 60, S at 120. One great week never makes an S.
* Overall rank is the weighted mean of active domains, capped at two ranks above your weakest domain.
* XP is the daily loop (workout 25, meal 15, routine 10, habit 8…), idempotent and capped so nothing can be farmed. Level L needs 60·L^1.7 XP.

Full detail with sources: `docs/ranking-methodology.md` and `docs/ranking-research.md`.

## Oura Ring

Connect in **Profile → Settings → Oura Ring**. Oura retired personal access tokens in Dec 2025, so the supported route is an OAuth app (two env vars). Without Oura, sleep and steps are logged manually in two taps. See `docs/oura-integration.md`.

## Data & privacy

Everything lives in `data/ascend.db` on the machine running the app. Financial figures are personal estimates, not advice. No analytics, no third-party calls except Oura when you connect it.

## Testing

```bash
npm test          # 46 tests: anchors, rank mapping, gating, levels, each domain scorer, XP ledger, quests, achievements
npm run typecheck
```
