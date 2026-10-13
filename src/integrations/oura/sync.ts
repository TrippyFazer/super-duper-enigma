import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dailyActivity, integrations, sleepEntries } from "@/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { awardXp, voidXpByKey } from "@/services/xp";
import { getProfile } from "@/services/profile";
import { fetchOuraRange, OuraError, refreshAccessToken, type OuraFetchResult } from "./client";

export interface OuraStatus {
  configured: boolean; // any credential path available
  connected: boolean; // we hold a usable token
  authType: "personal_token" | "oauth" | "env" | null;
  oauthAvailable: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  enabled: boolean;
}

export function getOuraStatus(): OuraStatus {
  const row = getDb().select().from(integrations).where(eq(integrations.provider, "oura")).get();
  const envToken = process.env.OURA_PERSONAL_ACCESS_TOKEN;
  const oauthAvailable = !!process.env.OURA_CLIENT_ID && !!process.env.OURA_CLIENT_SECRET;
  const hasDbToken = !!row?.accessToken;
  return {
    configured: !!envToken || hasDbToken || oauthAvailable,
    connected: !!envToken || hasDbToken,
    authType: hasDbToken ? (row!.authType as "personal_token" | "oauth") : envToken ? "env" : null,
    oauthAvailable,
    lastSyncAt: row?.lastSyncAt ?? null,
    lastSyncStatus: row?.lastSyncStatus ?? null,
    lastError: row?.lastError ?? null,
    enabled: row?.enabled ?? !!envToken,
  };
}

export function saveOuraToken(input: { accessToken: string; refreshToken?: string | null; expiresIn?: number | null; authType: "personal_token" | "oauth" }) {
  const db = getDb();
  const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000).toISOString() : null;
  db.insert(integrations)
    .values({ provider: "oura", authType: input.authType, accessToken: input.accessToken, refreshToken: input.refreshToken ?? null, expiresAt, enabled: true, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: integrations.provider,
      set: { authType: input.authType, accessToken: input.accessToken, refreshToken: input.refreshToken ?? null, expiresAt, enabled: true, lastError: null, updatedAt: new Date().toISOString() },
    })
    .run();
}

export function disconnectOura() {
  getDb().delete(integrations).where(eq(integrations.provider, "oura")).run();
}

async function resolveToken(): Promise<string | null> {
  const db = getDb();
  const row = db.select().from(integrations).where(eq(integrations.provider, "oura")).get();
  if (row?.accessToken) {
    // Refresh OAuth tokens that expire within the hour.
    if (row.authType === "oauth" && row.refreshToken && row.expiresAt && new Date(row.expiresAt).getTime() - Date.now() < 3600_000) {
      try {
        const t = await refreshAccessToken(row.refreshToken);
        saveOuraToken({ accessToken: t.access_token, refreshToken: t.refresh_token ?? row.refreshToken, expiresIn: t.expires_in ?? null, authType: "oauth" });
        return t.access_token;
      } catch (e) {
        db.update(integrations).set({ lastError: (e as Error).message }).where(eq(integrations.provider, "oura")).run();
        return null;
      }
    }
    return row.accessToken;
  }
  return process.env.OURA_PERSONAL_ACCESS_TOKEN ?? null;
}

export interface SyncResult {
  ok: boolean;
  nights: number;
  activityDays: number;
  error?: string;
}

/** Pull the last `days` days from Oura and upsert into sleep_entries / daily_activity. */
export async function syncOura(days = 30): Promise<SyncResult> {
  const db = getDb();
  const profile = getProfile();
  const token = await resolveToken();
  if (!token) return { ok: false, nights: 0, activityDays: 0, error: "No Oura token configured." };

  // Oura's end_date is EXCLUSIVE, and it files last night under today's date.
  // Ending at today left last night out of every sync.
  const end = addDays(profile.today, 1);
  const start = addDays(profile.today, -days);
  let data: OuraFetchResult;
  try {
    data = await fetchOuraRange(token, start, end);
  } catch (e) {
    const msg = e instanceof OuraError ? e.message : (e as Error).message;
    db.insert(integrations)
      .values({ provider: "oura", lastSyncStatus: "error", lastError: msg, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: integrations.provider, set: { lastSyncStatus: "error", lastError: msg, updatedAt: new Date().toISOString() } })
      .run();
    return { ok: false, nights: 0, activityDays: 0, error: msg };
  }

  const { nights, activityDays } = applyOuraData(data, profile.targets.sleepTargetMin, profile.targets.stepsTarget);

  db.insert(integrations)
    .values({ provider: "oura", lastSyncAt: new Date().toISOString(), lastSyncStatus: "ok", lastError: null, enabled: true, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: integrations.provider, set: { lastSyncAt: new Date().toISOString(), lastSyncStatus: "ok", lastError: null, enabled: true, updatedAt: new Date().toISOString() } })
    .run();
  return { ok: true, nights, activityDays };
}

/** Pure-ish upsert of Oura payloads. Exported so tests can feed fixture data. */
export function applyOuraData(data: OuraFetchResult, sleepTargetMin: number, stepsTarget: number): { nights: number; activityDays: number } {
  const db = getDb();
  const scoreByDay = new Map(data.dailySleep.map((d) => [d.day, d.score]));
  const readinessByDay = new Map(data.readiness.map((d) => [d.day, d.score]));

  // One row per day: prefer the long_sleep session; fall back to the longest.
  const byDay = new Map<string, (typeof data.sleep)[number]>();
  for (const s of data.sleep) {
    const cur = byDay.get(s.day);
    if (!cur || (s.type === "long_sleep" && cur.type !== "long_sleep") || ((s.total_sleep_duration ?? 0) > (cur.total_sleep_duration ?? 0) && cur.type !== "long_sleep")) {
      byDay.set(s.day, s);
    }
  }
  // Naps are NOT added to the night. Oura files an afternoon rest under the
  // next morning's day, and can record the same rest twice as overlapping
  // periods (seen: 4:13-7:15 PM and 4:13-5:05 PM on one afternoon), so adding
  // them turned an 8h20m night into "10h09m". A night is the main sleep only.

  let nights = 0;
  for (const [day, s] of byDay) {
    const total = Math.round((s.total_sleep_duration ?? 0) / 60);
    if (total <= 0) continue;
    const row = {
      date: day as ISODate,
      source: "oura",
      totalSleepMin: total,
      bedtimeStart: s.bedtime_start,
      bedtimeEnd: s.bedtime_end,
      efficiency: s.efficiency ?? null,
      latencyMin: s.latency != null ? Math.round(s.latency / 60) : null,
      sleepScore: scoreByDay.get(day) ?? null,
      readinessScore: readinessByDay.get(day) ?? null,
      restingHr: s.lowest_heart_rate ?? null,
      hrv: s.average_hrv ?? null,
    };
    db.insert(sleepEntries)
      .values(row)
      .onConflictDoUpdate({ target: sleepEntries.date, set: row })
      .run();
    awardXp("sleep_logged", day, { source: { type: "sleep", id: day } });
    if (total >= sleepTargetMin) awardXp("sleep_target", day, { source: { type: "sleep", id: day } });
    // Re-synced below target (e.g. a night that only "hit" it with a nap added,
    // before naps stopped counting): the target XP goes, as for a manual correction.
    else voidXpByKey(`sleep_target:${day}`, "Oura re-sync: night below target");
    nights++;
  }

  let activityDays = 0;
  for (const a of data.activity) {
    if (a.steps == null) continue;
    const activeMinutes = Math.round(((a.high_activity_time ?? 0) + (a.medium_activity_time ?? 0)) / 60) || null;
    db.insert(dailyActivity)
      .values({ date: a.day, steps: a.steps, activeMinutes, activityScore: a.score ?? null, source: "oura" })
      .onConflictDoUpdate({ target: dailyActivity.date, set: { steps: a.steps, activeMinutes, activityScore: a.score ?? null, source: "oura" } })
      .run();
    if (a.steps >= stepsTarget) awardXp("steps_target", a.day, { source: { type: "steps", id: a.day } });
    activityDays++;
  }
  return { nights, activityDays };
}
