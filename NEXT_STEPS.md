# Next steps

Everything core ships in the app today. These are optional improvements, roughly in order of value.

1. **Scheduled Oura sync.** Today sync runs on demand (one tap on the Sleep page or in Settings). A small cron/launchd job calling a protected `/api/oura/sync` endpoint would keep sleep data current without opening the app.
2. **Oura workouts and HRV trends.** The client already fetches `workout` scope; mapping Oura workouts into `workouts` (deduplicated against manual logs) and showing an HRV baseline trend on the Sleep page would deepen the Recovery stat.
3. **AI-assisted weekly review.** The review page is fully computed; an optional LLM pass (behind `ANTHROPIC_API_KEY`) could turn the numbers into a short coaching note and propose a custom quest. The core app must keep working without it.
4. **Push notifications / reminders.** Bedtime and routine reminders via the service worker (requires a push service or local notifications when installed).
5. **Data export/import.** JSON export of all tables from Settings, plus import, for moving between devices.
6. **Nutrition flags.** Optional per-meal quality tags (vegetables, protein) are stored but not scored yet; a light "balanced meals" substat could use them without becoming calorie tracking.
7. **Strength benchmarks.** Optional 1RM / grip / push-up logging mapped to the Cooper/NHANES norms in the research doc, feeding the Strength substat.
8. **Multi-profile.** The schema is single-user by design; a `profile_id` on each table would allow a household to share one instance.
9. **Lighter rank-down messaging.** Ranks can fall as rolling windows decay; a "grace" note on the dashboard explaining why and how long until recovery would soften it further.
10. **Refresh research.** Several population figures are from SCF 2022 and NHIS 2020–2024. Re-check the by-age net-worth percentiles when DQYDJ publishes SCF 2025 microdata tables.
