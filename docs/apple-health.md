# Apple Health / HealthKit integration

Ascend is a web app (Next.js + SQLite, installable as a PWA). **A web app cannot read
HealthKit.** HealthKit is only reachable from native iOS code running on the phone, so
the integration is split into two honest halves:

```
Oura Ring ──► Apple Health (HealthKit, on the iPhone)
                   │
                   │  read-only, only the metrics below
                   ▼
   iOS bridge (Shortcut automation  –or–  native Swift bridge)
                   │
                   │  HTTPS POST /api/health/ingest  (Bearer token, JSON)
                   ▼
            Ascend server (this repo)
     health_samples ──► de-duplication + aggregation ──► daily_activity / sleep_entries / workouts
```

Nothing is faked: a metric shows as available in **Settings → Connected services → Apple
Health** only when real samples for it have arrived. Metrics with no data show "—" and
manual logging keeps working for them. Direct Oura API sync still exists but is optional;
if your ring already writes to Apple Health, use Apple Health and leave Oura off so
nothing is counted twice.

## What the server does (`src/health/`)

| File | Role |
|---|---|
| `provider.ts` | `HealthProvider` interface, metric catalog (HealthKit identifiers), availability types |
| `apple.ts` | `AppleHealthProvider`: ingest token, idempotent sample storage, aggregation into app tables, workout matching, status |
| `aggregate.ts` | Pure functions: overlapping-source de-duplication, nights from sleep stages, daily point metrics, workout matching |
| `src/app/api/health/ingest/route.ts` | `POST /api/health/ingest` (and `GET` for status) |

### Permissions requested (read-only)

Steps, active energy, walking + running distance, exercise minutes, sleep analysis,
resting heart rate, heart rate (optional), HRV (SDNN), body mass, workouts. Nothing is
written to HealthKit.

### De-duplication rules

HealthKit stores overlapping records from every source (iPhone, Watch, Oura, other apps).
Summing them double counts. Ascend:

* **Cumulative metrics** (steps, energy, distance, exercise minutes): per day, intervals
  from different sources that overlap in time are de-duplicated by keeping the
  higher-priority source (Oura > Apple Watch > other wearables > iPhone > manual) and
  dropping the other; non-overlapping intervals are summed. This matches what Health.app
  shows when source priority is set the same way.
* **Sleep**: samples are split into sessions per source (gaps > 3 h start a new session);
  one night per morning, best source wins (Oura over Watch), stages (core/deep/REM/awake)
  preserved when present. Efficiency = asleep ÷ in-bed.
* **Resting HR / HRV**: daily mean; **body mass**: last value, written to the profile.
* **Workouts**: an Apple Health workout that overlaps a logged session on the same day
  (≤ 30 min apart, duration within 40 %, compatible type) is *suggested* as the same
  workout; you confirm "Same" or "Different" in Settings. Confirmed links never duplicate
  or add XP. Unmatched health workouts are added as `source = health` workout rows so they
  count toward fitness stats, but they earn no XP (the app didn't witness them).
* **Manual entries always win**: a day or night you logged by hand is never overwritten.

Source, device and timestamps are preserved on every stored sample (`health_samples`).

## Option A — iOS Shortcut (no code, works today)

1. Settings → Connected services → **Connect Apple Health**. Copy the token (shown once).
2. On the iPhone, open **Shortcuts** and create "Ascend Health Sync":
   * **Find Health Samples** — Type: *Steps*, Start Date is in the last 2 days, sort by Start
     Date. (Health will ask for read permission the first time.)
   * **Repeat with Each** sample → **Dictionary** with keys
     `type` = `steps`, `value` = Value, `start` = Start Date (ISO 8601), `end` = End Date
     (ISO 8601), `source` = Source Name, `uuid` = UUID → **Add to Variable** `samples`.
   * Repeat the Find/Repeat block for *Sleep Analysis* (`type` = `sleep`, add `metadata` =
     `{ "stage": Value }` where Value is inBed/asleepCore/asleepDeep/asleepREM/awake),
     *Heart Rate Variability* (`hrv`), *Resting Heart Rate* (`resting_hr`), *Active Energy*
     (`active_energy`), *Workouts* (append to a `workouts` variable with `activityType`,
     `start`, `end`, `activeEnergyKcal`, `source`, `uuid`).
   * **Dictionary** `{ "bridge": "shortcut", "samples": samples, "workouts": workouts }`.
   * **Get Contents of URL** — `https://<your-app>/api/health/ingest`, Method POST,
     Headers `Authorization: Bearer <token>`, `Content-Type: application/json`, Request
     Body: JSON (the dictionary).
3. Add an **Automation** (Time of Day, e.g. 7:30 AM and 9:00 PM, *Run Immediately*) so
   it syncs without you. Sending the same samples twice is harmless (idempotent by UUID).
4. "Sync now" in Settings re-applies everything already received; "Manage permissions"
   points to iOS Settings → Health → Data Access & Devices.

Limits: Shortcuts cannot register HealthKit background delivery, so updates arrive on the
automation schedule (or when you run the shortcut). That is why the native bridge exists.

## Option B — native Swift bridge (background delivery)

`native/ios/AscendHealthBridge/` contains a small Swift package that:

* requests read-only authorization for exactly the types above (`HKHealthStore.requestAuthorization`),
* runs an `HKAnchoredObjectQuery` per type and keeps the anchor, so only new/deleted
  samples are fetched,
* registers `HKObserverQuery` + `enableBackgroundDelivery(for:frequency:.hourly)` so iOS
  wakes the app when new data lands (steps/energy are delivered at most hourly by iOS),
* posts batches to `/api/health/ingest` with the Bearer token, reporting `bridge: "native"`,
  `backgroundDelivery: true` and the per-type permission result.

It is deliberately independent of the web code: wrap the PWA in **Capacitor** (recommended;
`npx cap add ios`, add the bridge files to the Xcode target, call
`HealthBridge.shared.start(endpoint:token:)` from `AppDelegate`) or in a plain WKWebView
shell. Required Xcode settings: the *HealthKit* capability, `NSHealthShareUsageDescription`
in Info.plist, and the `processing` background mode is **not** required (HealthKit
background delivery uses its own mechanism). The bridge never breaks the app: if
authorization is denied or background delivery is unavailable, manual refresh and the
Shortcut path keep working.

## Environment

* `HEALTH_INGEST_TOKEN` — optional static token accepted in addition to the one generated
  in Settings (useful for CI or a fixed Shortcut). Never commit it.
* `APP_URL` — used to show the ingest endpoint in Settings.

## Testing

`tests/health.test.ts` covers token auth, idempotent ingest, overlapping-source
de-duplication (no double-counted steps), nights built from sleep stages, "unavailable"
metrics staying unavailable, manual-wins, workout matching/linking, sync and disconnect.
