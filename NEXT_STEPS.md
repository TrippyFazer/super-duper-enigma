# Next steps

Shipped in 0.4.0: UX refactor (universal + LOG, unified food logger, Home = today / Planner = future, component splits). See `docs/ux-audit.md`.

Shipped in 0.3.0: Apple Health bridge + aggregation, workout/meal lifecycles, reversible XP ledger, eating-out logging, sleep planning, motivation, scheduled reminders, Sunday weekly food planning with pantry. Highest-value follow-ups now:

0. **Ship the iOS shell.** `native/ios` has the HealthKit bridge; wrapping the PWA in Capacitor and adding the bridge gives background delivery and native notifications (morning motivation and wind-down can then fire with the app closed).
0b. **Photo / barcode food logging.** The Log food sheet has Search · Restaurant · Quick · Estimate · Recipe; a barcode scan (Open Food Facts by EAN) is a small addition, photo estimation is an AI vision call behind the same ESTIMATE label.
0c. **Store price memory.** Actual prices entered after shopping could seed per-ingredient price estimates for future weeks (currently the catalog estimate is used until an actual price is entered for that week).

Everything core ships in the app today. These are optional improvements, roughly in order of value.

1. **Scheduled Oura sync.** Today sync runs on demand (one tap on the Sleep page or in Settings). A small cron/launchd job calling a protected `/api/oura/sync` endpoint would keep sleep data current without opening the app.
2. **Oura workouts and HRV trends.** The client already fetches `workout` scope; mapping Oura workouts into `workouts` (deduplicated against manual logs) and showing an HRV baseline trend on the Sleep page would deepen the Recovery stat.
3. **AI weekly review note.** The provider abstraction and `WeeklyReviewNoteSchema` exist; wiring a cached, optional coaching paragraph into `/progress/review` is a small step.
4. **Web Push.** In-app notices and foreground browser notifications ship today; background reminders (bedtime, expiring special quests) need a push service + VAPID keys and a subscription table.
4b. **AI quest offers in the wild.** AI candidates are validated and capped at 30 % of slots; tune the prompt with real usage and consider letting the model fill `params` (e.g. a specific recipe) once the library has more parameterised templates.
4c. **Workout tracker extras.** Unit toggle (lb/kg), plate calculator, supersets, RPE per set, and importing Oura workouts into sessions.
5. **Data export/import.** JSON export of all tables from Settings, plus import, for moving between devices.
6. **Barcode / food database.** Nutrition entries are manual, quick-add or recipe-based; an Open Food Facts lookup would reduce friction without turning the app into a calorie counter.
7. **Strength benchmarks.** Estimated 1RMs are tracked; mapping them to bodyweight-relative norms (research doc) could inform the Strength substat beyond frequency.
8. **Multi-profile.** The schema is single-user by design; a `profile_id` on each table would allow a household to share one instance.
9. **Lighter rank-down messaging.** Ranks can fall as rolling windows decay; a "grace" note on the dashboard explaining why and how long until recovery would soften it further.
10. **Refresh research.** Several population figures are from SCF 2022 and NHIS 2020–2024. Re-check the by-age net-worth percentiles when DQYDJ publishes SCF 2025 microdata tables.
