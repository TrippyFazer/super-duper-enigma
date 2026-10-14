import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dailyActivity, healthSamples, healthWorkouts, integrations, sleepEntries, workoutSessions, workouts, type HealthSample } from "@/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import { getProfile, updateProfile } from "@/services/profile";
import { awardXp, voidXpByKey } from "@/services/xp";
import { buildNights, dailyPoint, dailyTotals, dayOf, mapActivityType, workoutsLikelySame } from "./aggregate";
import { dateFrom, normalizeSample, samplesIn, workoutsIn } from "./normalize";
import { HEALTH_METRICS, type HealthMetric, type HealthProvider, type HealthProviderStatus, type HealthSampleInput, type MetricAvailability } from "./provider";

const PROVIDER = "apple_health";
const METRIC_IDS = new Set(HEALTH_METRICS.map((m) => m.id));

interface Meta {
  permissions?: Partial<Record<HealthMetric, "granted" | "denied">>;
  bridge?: "shortcut" | "native" | null;
  backgroundDelivery?: boolean | null;
  lastIngestAt?: string | null;
  lastIngestCount?: number;
  lastBridgeVersion?: string | null;
}

function row() {
  return getDb().select().from(integrations).where(eq(integrations.provider, PROVIDER)).get() ?? null;
}
function meta(): Meta {
  return parseJson<Meta>(row()?.lastError, {});
}
function saveMeta(patch: Partial<Meta>) {
  const cur = meta();
  getDb().update(integrations).set({ lastError: toJson({ ...cur, ...patch }), updatedAt: new Date().toISOString() }).where(eq(integrations.provider, PROVIDER)).run();
}

/** Create (or rotate) the ingest token. The token is shown once in Settings and stored hashed. */
export function connectAppleHealth(): { token: string } {
  const db = getDb();
  const token = "ah_" + randomBytes(24).toString("base64url");
  const hash = hashToken(token);
  const now = new Date().toISOString();
  db.insert(integrations)
    .values({ provider: PROVIDER, authType: "ingest_token", accessToken: hash, enabled: true, updatedAt: now, lastError: toJson({ bridge: null, backgroundDelivery: null }) })
    .onConflictDoUpdate({ target: integrations.provider, set: { accessToken: hash, enabled: true, updatedAt: now } })
    .run();
  return { token };
}

export function disconnectAppleHealth(opts: { deleteSamples?: boolean } = {}) {
  const db = getDb();
  db.delete(integrations).where(eq(integrations.provider, PROVIDER)).run();
  if (opts.deleteSamples) {
    db.delete(healthSamples).run();
    db.delete(healthWorkouts).run();
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyIngestToken(token: string | null): boolean {
  const envToken = process.env.HEALTH_INGEST_TOKEN;
  if (envToken && token === envToken) return true;
  const r = row();
  return !!(r?.enabled && r.accessToken && token && r.accessToken === hashToken(token));
}

export function isAppleHealthConnected(): boolean {
  return !!row()?.enabled || !!process.env.HEALTH_INGEST_TOKEN;
}

/** Which metrics actually have data (never assume Apple Health has something because Oura tracks it). */
export function metricAvailability(): MetricAvailability[] {
  const db = getDb();
  const rows = db
    .select({ type: healthSamples.type, last: sql<string>`max(${healthSamples.startAt})`, sources: sql<string>`group_concat(distinct ${healthSamples.sourceName})` })
    .from(healthSamples)
    .groupBy(healthSamples.type)
    .all();
  const wk = db.select({ last: sql<string>`max(${healthWorkouts.startAt})`, sources: sql<string>`group_concat(distinct ${healthWorkouts.sourceName})`, n: sql<number>`count(*)` }).from(healthWorkouts).get();
  const perms = meta().permissions ?? {};
  return HEALTH_METRICS.map((m) => {
    const r = m.id === "workout" ? (wk && wk.n > 0 ? { last: wk.last, sources: wk.sources } : null) : (rows.find((x) => x.type === m.id) ?? null);
    return { metric: m.id, label: m.label, available: !!r, lastSampleAt: r?.last ?? null, sources: r?.sources ? String(r.sources).split(",") : [], permission: perms[m.id] ?? "unknown" };
  });
}

export function appleHealthStatus(): HealthProviderStatus {
  const r = row();
  const m = meta();
  return {
    id: PROVIDER,
    name: "Apple Health",
    connected: isAppleHealthConnected(),
    lastSyncAt: r?.lastSyncAt ?? m.lastIngestAt ?? null,
    lastError: r?.lastSyncStatus === "error" ? "Last sync failed" : null,
    metrics: metricAvailability(),
    backgroundDelivery: m.backgroundDelivery ?? null,
    bridge: m.bridge ?? null,
  };
}

// ------------------------------------------------------------- ingest ----
export interface IngestPayload {
  samples?: HealthSampleInput[];
  workouts?: { uuid?: string; activityType: string; start: string; end: string; activeEnergyKcal?: number | null; distanceKm?: number | null; source?: string }[];
  permissions?: Partial<Record<HealthMetric, "granted" | "denied">>;
  bridge?: "shortcut" | "native";
  backgroundDelivery?: boolean;
  bridgeVersion?: string;
}

export interface IngestResult {
  received: number;
  stored: number;
  updated: number;
  duplicates: number;
  /** The first 20, with why; rejectedCount has them all. */
  rejected: { index: number; reason: string }[];
  rejectedCount: number;
  workouts: number;
  applied: Record<string, number>;
}

/**
 * Store raw samples, then apply aggregation to the app tables.
 *
 * With a uuid (native bridge): idempotent by uuid, as before.
 * Without one (iOS Shortcut): keyed by type + start + end + source (+ sleep
 * stage) — see normalize.ts. Seen before with the same value: a duplicate,
 * ignored. Seen before with a different value: the same sample re-reported,
 * so the value is replaced, never added to.
 */
export async function ingestAppleHealth(payload: IngestPayload | unknown): Promise<IngestResult> {
  const db = getDb();
  const p = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as IngestPayload;
  const raw = samplesIn(payload).slice(0, 20000);
  const rejected: IngestResult["rejected"] = [];
  let stored = 0;
  let updated = 0;
  let duplicates = 0;
  const touched = new Set<ISODate>();
  const tz = getProfile().timezone;
  db.transaction((tx) => {
    raw.forEach((item, index) => {
      const n = normalizeSample(item);
      if (!n.ok) {
        rejected.push({ index, reason: n.reason });
        return;
      }
      const s = n.sample;
      const unit = s.unit ?? HEALTH_METRICS.find((m) => m.id === s.type)?.unit ?? "";
      const existing = tx.select({ id: healthSamples.id, value: healthSamples.value }).from(healthSamples).where(eq(healthSamples.uuid, s.dedupeKey)).get();
      if (!existing) {
        tx.insert(healthSamples)
          .values({ type: s.type, value: s.value, unit, startAt: s.start, endAt: s.end, sourceName: s.source || "unknown", sourceBundle: s.sourceBundle ?? null, device: s.device ?? null, uuid: s.dedupeKey, metadata: toJson(s.metadata ?? {}) })
          .run();
        stored++;
      } else if (s.fallback && Math.abs(existing.value - s.value) > 1e-9) {
        tx.update(healthSamples).set({ value: s.value, unit, ingestedAt: new Date().toISOString() }).where(eq(healthSamples.id, existing.id)).run();
        updated++;
      } else {
        duplicates++;
        return;
      }
      touched.add(dayOf(s.start, tz));
      if (s.type === "sleep") touched.add(dayOf(s.end, tz));
    });
  });
  let nWorkouts = 0;
  for (const w of workoutsIn(payload).slice(0, 2000) as NonNullable<IngestPayload["workouts"]>) {
    if (!w || !w.start || !w.end || !dateFrom(w.start) || !dateFrom(w.end)) continue;
    const uuid = w.uuid || createHash("sha1").update(`workout|${w.start}|${w.end}|${w.source ?? ""}`).digest("hex");
    const durationMin = Math.max(1, Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60000));
    const r = db
      .insert(healthWorkouts)
      .values({ uuid, activityType: w.activityType || "Other", startAt: new Date(w.start).toISOString(), endAt: new Date(w.end).toISOString(), durationMin, activeEnergyKcal: w.activeEnergyKcal ?? null, distanceKm: w.distanceKm ?? null, sourceName: w.source || "unknown", date: dayOf(w.start, tz) })
      .onConflictDoNothing()
      .run();
    if (r.changes > 0) nWorkouts++;
    touched.add(dayOf(w.start, tz));
  }
  const now = new Date().toISOString();
  if (!row()) db.insert(integrations).values({ provider: PROVIDER, authType: "ingest_token", enabled: true, updatedAt: now }).onConflictDoNothing().run();
  saveMeta({ ...(p.permissions ? { permissions: { ...(meta().permissions ?? {}), ...p.permissions } } : {}), ...(p.bridge ? { bridge: p.bridge } : {}), ...(p.backgroundDelivery != null ? { backgroundDelivery: p.backgroundDelivery } : {}), lastIngestAt: now, lastIngestCount: stored + updated + nWorkouts, lastBridgeVersion: p.bridgeVersion ?? meta().lastBridgeVersion ?? null });
  // Nothing new or changed: nothing to re-apply. A re-sent payload costs one read per sample.
  const applied = touched.size ? applyHealthData({ dates: [...touched] }) : {};
  db.update(integrations).set({ lastSyncAt: now, lastSyncStatus: "ok" }).where(eq(integrations.provider, PROVIDER)).run();
  return { received: raw.length, stored, updated, duplicates, rejected: rejected.slice(0, 20), rejectedCount: rejected.length, workouts: nWorkouts, applied };
}

// -------------------------------------------------------------- apply ----
/**
 * Turn stored samples into the app's activity / sleep / workout rows. Manual
 * entries are never overwritten by health data (the user corrected something
 * on purpose); health-sourced rows are refreshed in place.
 */
export function applyHealthData(opts: { days?: number; dates?: ISODate[] } = {}): Record<string, number> {
  const db = getDb();
  const profile = getProfile();
  const tz = profile.timezone;
  const today = profile.today;
  const since = opts.dates?.length ? [...opts.dates].sort()[0] : addDays(today, -(opts.days ?? 30));
  const sinceTs = new Date(since + "T00:00:00Z").toISOString();
  const applied: Record<string, number> = { activityDays: 0, nights: 0, workoutsLinked: 0, workoutsCounted: 0, bodyMass: 0 };

  const sampleRows = db.select().from(healthSamples).where(gte(healthSamples.startAt, addDays(since, -1) + "T00:00:00Z")).all();
  const byType = (t: HealthMetric) => sampleRows.filter((s) => s.type === t);

  // Steps / exercise minutes → daily_activity (health source), never over manual.
  const steps = dailyTotals(byType("steps"), tz);
  const exMin = dailyTotals(byType("exercise_minutes"), tz);
  const energy = dailyTotals(byType("active_energy"), tz);
  const days = new Set<ISODate>([...steps.keys(), ...exMin.keys()]);
  for (const d of days) {
    if (d < since || d > today) continue;
    const cur = db.select().from(dailyActivity).where(eq(dailyActivity.date, d)).get();
    if (cur && cur.source === "manual") continue;
    const st = steps.get(d)?.total ?? null;
    const am = exMin.get(d)?.total ?? null;
    const values = { date: d, steps: st, activeMinutes: am, activityScore: cur?.activityScore ?? null, source: "health" };
    db.insert(dailyActivity).values(values).onConflictDoUpdate({ target: dailyActivity.date, set: values }).run();
    if (st != null && st >= profile.targets.stepsTarget) awardXp("steps_target", d, { source: { type: "steps", id: d } });
    else voidXpByKey(`steps_target:${d}`, "health steps below target");
    applied.activityDays++;
  }
  void energy;

  // Sleep → sleep_entries (health source). HRV / RHR enrich the night.
  const nights = buildNights(byType("sleep"), tz);
  const hrv = dailyPoint(byType("hrv"), tz, "mean");
  const rhr = dailyPoint(byType("resting_hr"), tz, "mean");
  for (const n of nights) {
    if (n.date < since || n.date > today) continue;
    const cur = db.select().from(sleepEntries).where(eq(sleepEntries.date, n.date)).get();
    if (cur && cur.source === "manual") continue;
    const values = {
      date: n.date,
      source: "health",
      totalSleepMin: n.totalSleepMin,
      bedtimeStart: toLocalIso(n.bedtimeStart, tz),
      bedtimeEnd: toLocalIso(n.bedtimeEnd, tz),
      efficiency: n.efficiency,
      latencyMin: null,
      sleepScore: cur?.source === "oura" ? cur.sleepScore : null,
      readinessScore: cur?.readinessScore ?? null,
      restingHr: rhr.get(n.date) ?? rhr.get(addDays(n.date, -1)) ?? cur?.restingHr ?? null,
      hrv: hrv.get(n.date) ?? hrv.get(addDays(n.date, -1)) ?? cur?.hrv ?? null,
      quality: cur?.quality ?? null,
      notes: n.stages ? `Stages: ${n.stages.deep}m deep · ${n.stages.rem}m REM · ${n.stages.core}m core (${n.source})` : `via ${n.source}`,
    };
    db.insert(sleepEntries).values(values).onConflictDoUpdate({ target: sleepEntries.date, set: values }).run();
    awardXp("sleep_logged", n.date, { source: { type: "sleep", id: n.date } });
    if (n.totalSleepMin >= profile.targets.sleepTargetMin) awardXp("sleep_target", n.date, { source: { type: "sleep", id: n.date } });
    else voidXpByKey(`sleep_target:${n.date}`, "health sleep below target");
    applied.nights++;
  }

  // Body mass → profile weight (last value wins; only if newer than what we have).
  const mass = dailyPoint(byType("body_mass"), tz, "last");
  const lastMassDay = [...mass.keys()].sort().pop();
  if (lastMassDay && mass.get(lastMassDay)! > 20) {
    updateProfile({ weightKg: Math.round(mass.get(lastMassDay)! * 10) / 10 });
    applied.bodyMass = 1;
  }

  // Workouts: match to app sessions/logs; unmatched ones count toward stats without XP.
  const pending = db.select().from(healthWorkouts).where(and(gte(healthWorkouts.date, since), inArray(healthWorkouts.status, ["pending"]))).all();
  for (const hw of pending) {
    const dayWorkouts = db.select().from(workouts).where(eq(workouts.date, hw.date)).all();
    const sessions = db.select().from(workoutSessions).where(eq(workoutSessions.date, hw.date)).all();
    let match: { id: number; startedAt: string | null; durationMin: number; type: string } | null = null;
    for (const w of dayWorkouts) {
      if (w.source === "health") continue;
      const s = sessions.find((x) => x.workoutId === w.id);
      if (workoutsLikelySame({ startAt: hw.startAt, endAt: hw.endAt, activityType: hw.activityType }, { date: w.date, startedAt: s?.startedAt ?? null, durationMin: w.durationMin, type: w.type }, tz)) {
        match = { id: w.id, startedAt: s?.startedAt ?? null, durationMin: w.durationMin, type: w.type };
        break;
      }
    }
    if (match) {
      // Likely the same workout: suggest linking, don't duplicate. The user confirms in Settings → Apple Health.
      db.update(healthWorkouts).set({ suggestedWorkoutId: match.id }).where(eq(healthWorkouts.id, hw.id)).run();
    } else {
      // Nothing logged for it: count it toward fitness stats (no XP — the app didn't witness it).
      const w = db.insert(workouts).values({ date: hw.date, type: mapActivityType(hw.activityType), durationMin: hw.durationMin, intensity: hw.activeEnergyKcal && hw.activeEnergyKcal / hw.durationMin > 9 ? 3 : 2, notes: `${hw.activityType} · ${hw.sourceName}`, source: "health" }).returning({ id: workouts.id }).get();
      db.update(healthWorkouts).set({ status: "counted", workoutId: w.id }).where(eq(healthWorkouts.id, hw.id)).run();
      applied.workoutsCounted++;
    }
  }
  return applied;
}

function toLocalIso(utcIso: string, tz: string): string {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")}T${hour}:${g("minute")}:${g("second")}`;
}

/** Confirm a suggested link: the health workout is the same as the logged one (no duplicate, no extra XP). */
export function linkHealthWorkout(id: number, workoutId: number | null) {
  const db = getDb();
  const hw = db.select().from(healthWorkouts).where(eq(healthWorkouts.id, id)).get();
  if (!hw) return;
  if (workoutId == null) {
    // Not the same workout after all → count it on its own.
    const w = db.insert(workouts).values({ date: hw.date, type: mapActivityType(hw.activityType), durationMin: hw.durationMin, intensity: 2, notes: `${hw.activityType} · ${hw.sourceName}`, source: "health" }).returning({ id: workouts.id }).get();
    db.update(healthWorkouts).set({ status: "counted", workoutId: w.id, suggestedWorkoutId: null }).where(eq(healthWorkouts.id, id)).run();
    return;
  }
  db.update(healthWorkouts).set({ status: "linked", workoutId, suggestedWorkoutId: null }).where(eq(healthWorkouts.id, id)).run();
}

export function ignoreHealthWorkout(id: number) {
  getDb().update(healthWorkouts).set({ status: "ignored", suggestedWorkoutId: null }).where(eq(healthWorkouts.id, id)).run();
}

export function pendingWorkoutMatches() {
  const db = getDb();
  return db
    .select()
    .from(healthWorkouts)
    .where(and(eq(healthWorkouts.status, "pending"), sql`${healthWorkouts.suggestedWorkoutId} is not null`))
    .orderBy(desc(healthWorkouts.startAt))
    .limit(10)
    .all()
    .map((hw) => ({ ...hw, suggested: hw.suggestedWorkoutId ? (db.select().from(workouts).where(eq(workouts.id, hw.suggestedWorkoutId)).get() ?? null) : null }));
}

export function recentHealthWorkouts(limit = 10) {
  return getDb().select().from(healthWorkouts).orderBy(desc(healthWorkouts.startAt)).limit(limit).all();
}

/** Today's merged health snapshot for home cards; null fields = no data. */
export function todayHealthSnapshot(): { steps: number | null; stepsSource: string | null; exerciseMin: number | null; lastNight: { totalSleepMin: number; bedtimeStart: string | null; bedtimeEnd: string | null; source: string } | null; restingHr: number | null; hrv: number | null } {
  const db = getDb();
  const profile = getProfile();
  const today = profile.today;
  const act = db.select().from(dailyActivity).where(eq(dailyActivity.date, today)).get();
  const sleep = db.select().from(sleepEntries).where(eq(sleepEntries.date, today)).get() ?? db.select().from(sleepEntries).where(eq(sleepEntries.date, addDays(today, -1))).get();
  const stepsAgg = act?.source === "health" ? dailyTotals(db.select().from(healthSamples).where(and(eq(healthSamples.type, "steps"), gte(healthSamples.startAt, addDays(today, -1) + "T00:00:00Z"))).all(), profile.timezone).get(today) : null;
  return {
    steps: act?.steps ?? null,
    stepsSource: act ? (act.source === "health" ? (stepsAgg?.dominant ?? "Apple Health") : act.source) : null,
    exerciseMin: act?.activeMinutes ?? null,
    lastNight: sleep ? { totalSleepMin: sleep.totalSleepMin, bedtimeStart: sleep.bedtimeStart, bedtimeEnd: sleep.bedtimeEnd, source: sleep.source } : null,
    restingHr: sleep?.restingHr ?? null,
    hrv: sleep?.hrv ?? null,
  };
}

export const AppleHealthProvider: HealthProvider = {
  id: PROVIDER,
  name: "Apple Health",
  status: appleHealthStatus,
  async sync(opts = {}) {
    try {
      const applied = applyHealthData({ days: opts.days ?? 30 });
      getDb().update(integrations).set({ lastSyncAt: new Date().toISOString(), lastSyncStatus: "ok" }).where(eq(integrations.provider, PROVIDER)).run();
      const n = getDb().select({ n: sql<number>`count(*)` }).from(healthSamples).get()?.n ?? 0;
      return { ok: true, message: n ? `Re-applied ${n.toLocaleString()} samples: ${applied.activityDays} activity days, ${applied.nights} nights, ${applied.workoutsCounted} workouts counted.` : "No samples received yet. Run the Shortcut or open the iOS bridge once.", applied };
    } catch (e) {
      getDb().update(integrations).set({ lastSyncStatus: "error" }).where(eq(integrations.provider, PROVIDER)).run();
      return { ok: false, message: (e as Error).message, applied: {} };
    }
  },
};

export function sampleCount(): number {
  return getDb().select({ n: sql<number>`count(*)` }).from(healthSamples).get()?.n ?? 0;
}

export function samplesSince(type: HealthMetric, since: ISODate): HealthSample[] {
  return getDb().select().from(healthSamples).where(and(eq(healthSamples.type, type), gte(healthSamples.startAt, since + "T00:00:00Z"))).all();
}
