# Changelog

## 0.3.0 — 2026-10-13 · "Real life is messy"

Product-quality pass from beta testing: the app now separates **plan** from **reality**, and every record can be corrected.

### Data correction & XP ledger
* XP events carry a source (`sourceType`/`sourceId`); deleting or invalidating a source voids exactly its XP (audit trail kept, keys freed so the action can earn again). No phantom XP.
* Reconcile reverts quests whose progress source disappeared and revokes achievements unlocked in the last 48 h whose condition no longer holds.
* Delete / undo everywhere: workouts, sleep nights, meals, food entries, planned meals, habit checks, routine checks, special-quest completions, grocery items, pantry items, meal prep.

### Workout lifecycle
* Sessions have real states: active · paused · completed · cancelled · discarded. ⋯ menu offers Pause, End early (keeps completed sets, partial credit), Cancel workout (nothing happened) and Discard session (removed entirely, XP voided, records recomputed). History lists cancelled/empty sessions with Discard; quick-logged workouts can be deleted.
* Finishing with zero sets never logs a workout; very short sessions log without XP.

### Meal lifecycle
* Planned meals are rows with status planned → prepared → eaten | skipped | replaced | discarded. Only *eaten* food counts. Ate this / Skip / Replace / Edit / Remove / "I didn't actually eat this", all reversible; regenerating keeps eaten history.
* Eating out: Log food → Search (saved foods · 180+ chain menu items · your recipes · Open Food Facts), Restaurant, Quick macros (calories only mandatory), AI estimate (clearly labelled ESTIMATE, editable, only when no verified data), Recipe. Saved/common foods with one-tap recents. Logged food can replace the planned slot.
* Smart day adjustment: after an unplanned meal the app *offers* to rebalance the rest of the day (AI or recipe/pantry template); nothing changes without Adjust.

### Apple Health
* `HealthProvider` abstraction + `AppleHealthProvider` fed by an iOS bridge (Shortcut automation or the native Swift bridge in `native/ios`). Ingest endpoint with token auth, idempotent samples with source/device/timestamps, overlapping-source de-duplication (no double-counted steps), nights from sleep stages, daily HRV/RHR, body mass → profile, workouts matched to logged sessions (confirm Same/Different) and otherwise counted for stats without XP. Manual entries always win.
* Settings → Connected services: Connected / permissions / last sync / data available (✓ or — per metric, never fake zeros) / Sync now / Manage permissions / Rotate token / Disconnect. Oura direct sync kept as optional.
* Home: Today's steps card with an evening walk quest offer for the remaining steps; Last night card with bed/wake/consistency.

### Sleep planning, motivation, reminders
* Target wake time → derived wind-down / in bed / asleep targets (editable), Tonight card, planned vs actual verdict per night.
* "Why I'm doing this": personal reasons (onboarding + profile), used sparingly in morning messages with rotating templates (personal why, XP to next level, score deltas, streaks, first quest, short lines) that never repeat recently.
* Scheduled reminders (independently switchable): morning motivation at wake time, wind-down (0/15/30/60/custom minutes before), workout reminder on training days, Sunday weekly planning, Sunday meal-prep, evening protein nudge.

### Sunday weekly food planning
* Weekly preparation (Sunday reset) stepper: Review → Leftovers → Budget/targets/meals needed/preferences → Generate week → Shopping list → Prep plan → Training days → Weekly quests → Next week ready.
* Budget-aware week planner (AI with structured inventory context, or template): few recipes reused across the week, leftover lunches, snacks to protein target, budget trimming, catalog-priced consolidated shopping list by category with "used in", pantry leftovers skipped/reduced, prep plan with time estimate.
* Shopping list: check / purchased / skip / edit quantity & price; budget vs estimated vs actual vs remaining; Done shopping moves purchases into the pantry (reversible).
* Pantry: lightweight inventory (levels or quantities, purchase/expiry dates), "What can I eat tonight?" suggestions from what you have (expiring first), Cook this logs the meal and consumes ingredients. End-of-week leftover review feeds the next list.
* Feedback card (spend vs budget, reuse %, leftovers carried, meals cooked, eating out). Weekly quests: plan meals +50, shop within budget +40, complete meal prep +60; new achievements.

### Home
* Cards prioritised by time of day (morning message, quests, plan; midday progress; evening remaining calories/protein, special quest, tonight's sleep schedule, tomorrow preview). Sunday card for weekly preparation.

### Tests
* 36 new tests (118 total): ledger voids, workout lifecycle, meal lifecycle, saved foods, Apple Health aggregation/ingest/matching, sleep schedule, motivation variety, reminders, ingredient catalog, weekly planner, Sunday flow end to end.

## 0.2.0 — 2026-10-13

Knight-themed expansion: the home screen is now a character hero with rank art, optional special quests, an AI-optional planner for training and meals, a full workout session tracker, nutrition tracking, a coach, notifications, and expanded onboarding/settings.

### Visual & navigation
* Character hero: procedurally generated crest + castle backdrop per rank, knight titles (Novice Squire → Rising Adventurer → Seasoned Knight → Elite Knight → Royal Champion → Legendary Paladin), rank quote, level + XP bar, notification bell.
* New home hierarchy: hero → special quest (when offered) → today's quests → training & meal plan card → domain stats → next-rank requirements → recent achievements.
* Bottom navigation is now Home / Quests / Progress / Planner / Profile. Local display fonts (Cinzel, Cormorant Garamond), chamfered "plate" panels, shield badges.
* Overall rank-ups show the new crest, title and quote; personal records get their own celebration.

### Optional special quests
* Curated library of ~30 quests across all domains with signal-weighted selection, difficulty tiers (common / uncommon / rare, with epic / legendary reserved for boss quests) and XP bands.
* Seeded per-slot rolls (stable across reloads), quiet hours, one open offer at a time, 3-hour cooldown after a decline, frequency setting (low / normal / high).
* Accept / decline / complete / expire states; **declining never costs anything**. Quest journal shows active, daily, weekly, boss and special-quest history.

### AI (optional) and fallbacks
* Provider abstraction for OpenAI-compatible and Anthropic APIs via `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` or the Settings screen (key stored only in the local DB). Every model response is parsed through strict Zod contracts; exercises are normalised against the catalog and unsafe content is dropped.
* Daily cache (`ai_cache`) so the home screen never triggers a model call. Full template fallbacks: rotation-based workouts with 40-hour muscle-fatigue avoidance and readiness-aware recovery days, recipe-based meal plans that honour diet preferences, dislikes and on-hand ingredients, rule-based coach.

### Training
* Workout plan per day (generate / regenerate / adjust / skip) and a session tracker: sets with weight × reps, prefilled from last time, previous performance, rest timer, add set, skip / swap / remove / add exercise, finish or abandon.
* Finishing a session logs a normal workout (counts toward the fitness rank), awards XP, and detects personal records (weight and Epley e1RM; first record is a baseline). Training history and PR list. New "Progress" fitness substat once 2+ lifts are tracked.

### Nutrition
* Calorie / protein / carbs / fat targets (manual or Mifflin-St Jeor estimate), daily totals ring, quick-add foods, recipe logging, custom entries, portion scaling, edit / delete.
* Daily meal plan with "Ate this" (portion + cooked toggle). XP for logging (5/day), eating a planned meal (10, max 3), hitting protein (15/day). No XP is ever tied to eating less; targets under the safe floor are warned about and never pay out. Cooking rank gains protein-consistency and logging substats.

### Everything else
* Coach page (AI or rules) with quick prompts and suggestion chips. Notifications centre with category toggles and optional browser notifications. Settings: AI provider, training profile, nutrition targets, special-quest frequency, notification categories. Onboarding: training goal / experience / days / equipment / length, nutrition goal / targets / diet / dislikes, quest frequency, height / weight.
* New achievements and titles (Under the Bar, Trailblazer, Well Fed, Side Quest, Errand Knight, Wanderer…). Progress page shows tracked sessions, PRs, volume and nutrition consistency.
* Schema: `quest_offers`, `workout_plans`, `workout_sessions`, `session_exercises`, `exercise_sets`, `personal_records`, `meal_plans`, `nutrition_entries`, `ai_cache`, `notifications`, `profiles.preferences`, recipe carbs/fat (migration `0001_planner`).
* 33 new tests (82 total) covering quest offers, guardrails, AI contracts, fallback + caching, sessions, PRs, nutrition and meal plans.

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
