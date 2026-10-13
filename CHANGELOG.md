# Changelog

## 0.1.0 — 2026-10-13

Initial build of Ascend, a mobile-first self-improvement RPG.

### Application
* Next.js 15 + React 19 + TypeScript app with a persistent SQLite database (Drizzle ORM, migrations in `src/db/migrations`), auto-migrated on first request.
* Installable PWA: web manifest, generated icons, service worker with offline shell, safe-area aware layout, bottom tab navigation (Home, Quests, Progress, Recipes, Profile).
* Onboarding wizard: name, age, domain selection, per-domain baselines (training, sleep, cooking, skincare), routine setup, sobriety trackers, starter habits, targets.

### Ranking engine (`src/ranking`)
* Centralised, pure engine with research-calibrated anchor tables for seven domains: fitness, sleep, cooking, wealth, skincare, sobriety, habits.
* Substats per domain (e.g. fitness: consistency, frequency, strength, endurance, activity, recovery), 30/90-day rolling windows, baseline blending for new users, time-gated rank caps (D → C → B → A → S at 0/14/30/60/120 days), balance-gated overall rank.
* XP ledger with idempotency keys and daily caps; level curve 60·L^1.7.
* Quest templates (daily, weekly, boss) personalised from recent behaviour; achievements with equippable titles; sobriety milestones; rank/level/milestone character history.

### Features
* One-tap logging: workouts, meals (linked to recipes), sleep, steps, financial check-ins, routines, habits.
* Domain pages with stats, charts (weekly bars, 13-week heatmaps, score history), recent entries, explanations ("why this rank"), and next-rank requirements.
* Recipe finder (43 built-in recipes): search by on-hand ingredients, meal type, time, difficulty and tags; save/favourite; "I cooked this" counts toward cooking rank; custom recipes.
* Skincare routine manager, habit manager (daily / specific days / N× per week, archive), sobriety trackers with live timers, milestones, and non-punitive resets.
* Progress page with 7/30/90-day views, XP chart, overall score history, rank-change log; weekly review with per-domain deltas, strongest/needs-attention, suggested focus.
* Character sheet with stats, domain ranks, titles, 48 achievements, chronicle.
* Oura Ring integration layer: OAuth2 flow, legacy token support, sync of sleep/readiness/HRV/RHR/steps, graceful fallback to manual logging.
* Feedback system: XP toasts, level-up / rank-up / achievement overlays.

### Docs & tests
* `docs/ranking-research.md` (sources per domain), `docs/ranking-methodology.md`, `docs/oura-integration.md`, README with setup and env vars.
* 49 Vitest tests covering scale helpers, rank mapping, gating, levels, every domain scorer, the overall engine, the XP ledger and the reconcile loop.
* `npm run db:seed` demo data generator.
