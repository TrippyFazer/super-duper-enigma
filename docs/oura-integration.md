# Oura Ring integration

Ascend syncs sleep, readiness, HRV, resting heart rate and steps from the Oura API v2. The app works fully without it (manual sleep and step logging); when connected, Oura data replaces manual entries for the same dates.

## What you need

Oura **deprecated Personal Access Tokens in December 2025**. New tokens can no longer be created, though existing ones may still work. The supported path is OAuth2 with your own Oura application. Either way you need an **active Oura membership** (Gen3 / Ring 4) or the API returns 403.

### Option A — OAuth2 (recommended)
1. Create an application at https://cloud.ouraring.com/oauth/applications (Oura developer portal).
2. Set the redirect URI to `<APP_URL>/api/oura/callback`, e.g. `http://localhost:3000/api/oura/callback` or your phone-reachable URL.
3. Put the credentials in `.env.local`:
   ```
   OURA_CLIENT_ID=...
   OURA_CLIENT_SECRET=...
   APP_URL=http://localhost:3000
   ```
4. Restart the app, open **Profile → Settings → Oura Ring → Connect with Oura**, approve the scopes (`daily heartrate personal workout`).
5. The callback stores the access + refresh token in the `integrations` table and immediately syncs 90 days. Tokens refresh automatically when within an hour of expiry.

### Option B — Existing personal token
If you still hold a working PAT, either set `OURA_PERSONAL_ACCESS_TOKEN` in `.env.local` or paste it in Settings → Oura Ring. It is stored only in your local SQLite database.

## What is synced (`src/integrations/oura/sync.ts`)
| Endpoint | Fields used | Stored in |
|---|---|---|
| `/v2/usercollection/sleep` | `total_sleep_duration`, `bedtime_start`, `bedtime_end`, `efficiency`, `latency`, `average_hrv`, `lowest_heart_rate`, `type` | `sleep_entries` (one row per day: the `long_sleep` session plus naps) |
| `/v2/usercollection/daily_sleep` | `score` | `sleep_entries.sleep_score` |
| `/v2/usercollection/daily_readiness` | `score` | `sleep_entries.readiness_score` |
| `/v2/usercollection/daily_activity` | `steps`, `score`, `high/medium_activity_time` | `daily_activity` |

Syncing awards the same XP a manual log would (sleep logged / target / steps target), idempotently.

## Sync cadence
* Manual: Settings → "Sync 90 days", or the Sync button on the Sleep page (30 days).
* Automatic: run `curl -X POST` against a server action is not exposed; instead schedule `npm run oura:sync`-style jobs by calling the settings sync, or simply open the app — the Sleep page button is one tap. (A cron-driven sync is listed in NEXT_STEPS.)

## Errors
| Status | Meaning | App behaviour |
|---|---|---|
| 401 | token expired/revoked | refresh attempted (OAuth); otherwise "reconnect" shown |
| 403 | membership lapsed | error surfaced in Settings |
| 429 | rate limit (5,000 req / 5 min) | retry later |

## Privacy
Tokens and synced data never leave the machine running Ascend. Disconnecting deletes the token; synced entries remain.
