/**
 * Apple Health ingest: token auth, idempotent storage, de-duplicated aggregation
 * (no double-counted steps), nights from sleep stages, unavailable metrics stay
 * unavailable, manual entries win, workout matching/linking.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-health-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;
delete process.env.HEALTH_INGEST_TOKEN;

const { getDb } = await import("@/db/client");
const { dailyActivity, sleepEntries, workouts } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const agg = await import("@/health/aggregate");
const ah = await import("@/health/apple");
const m = await import("@/services/mutations");
const { eq } = await import("drizzle-orm");

const today = () => getProfile().today;
const ts = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;

beforeAll(() => {
  getDb();
  updateProfile({ name: "Health", timezone: "UTC", activeDomains: ["fitness", "sleep"], onboardingCompletedAt: new Date().toISOString(), targets: { stepsTarget: 8000, sleepTargetMin: 450 } });
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("aggregation (pure)", () => {
  it("does not double count overlapping sources; sums non-overlapping intervals", () => {
    const r = agg.mergeCumulative([
      { start: 0, end: 3600_000, value: 1000, source: "iPhone" },
      { start: 0, end: 3600_000, value: 1100, source: "Oura" }, // same hour, different device → keep Oura (priority), drop iPhone
      { start: 3600_000, end: 7200_000, value: 500, source: "iPhone" }, // next hour only on phone → counts
    ]);
    expect(r.total).toBe(1600);
    expect(r.dominant).toBe("Oura");
    const naive = 1000 + 1100 + 500;
    expect(r.total).toBeLessThan(naive);
  });

  it("builds one night per morning from staged sleep samples, best source wins", () => {
    const d = "2026-05-10";
    const mk = (src: string, start: string, end: string, stage: string) => ({ id: 0, type: "sleep", value: 1, unit: "min", startAt: start, endAt: end, sourceName: src, sourceBundle: null, device: null, uuid: `${src}${start}`, metadata: JSON.stringify({ stage }), ingestedAt: "" });
    const nights = agg.buildNights(
      [
        mk("Oura", ts("2026-05-09", "23:30"), ts(d, "01:00"), "asleepCore"),
        mk("Oura", ts(d, "01:00"), ts(d, "02:30"), "asleepDeep"),
        mk("Oura", ts(d, "02:30"), ts(d, "02:45"), "awake"),
        mk("Oura", ts(d, "02:45"), ts(d, "07:10"), "asleepREM"),
        mk("Apple Watch", ts("2026-05-09", "23:40"), ts(d, "07:00"), "asleepUnspecified"),
      ],
      "UTC",
    );
    expect(nights.length).toBe(1);
    expect(nights[0].date).toBe(d);
    expect(nights[0].source).toBe("Oura");
    expect(nights[0].totalSleepMin).toBe(90 + 90 + 265);
    expect(nights[0].stages?.deep).toBe(90);
    expect(nights[0].efficiency).toBeLessThanOrEqual(100);
  });

  it("matches a health workout to a logged session by time, duration and type", () => {
    const d = "2026-05-10";
    const app = { date: d, startedAt: ts(d, "17:00"), durationMin: 50, type: "strength" };
    expect(agg.workoutsLikelySame({ startAt: ts(d, "17:05"), endAt: ts(d, "17:58"), activityType: "HKWorkoutActivityTypeTraditionalStrengthTraining" }, app, "UTC")).toBe(true);
    expect(agg.workoutsLikelySame({ startAt: ts(d, "17:05"), endAt: ts(d, "17:58"), activityType: "HKWorkoutActivityTypeRunning" }, app, "UTC")).toBe(false);
    expect(agg.workoutsLikelySame({ startAt: ts(d, "07:00"), endAt: ts(d, "07:50"), activityType: "HKWorkoutActivityTypeTraditionalStrengthTraining" }, app, "UTC")).toBe(false);
    expect(agg.mapActivityType("HKWorkoutActivityTypeWalking")).toBe("walk");
  });
});

describe("ingest + apply", () => {
  let token = "";
  it("connect issues a token; wrong tokens are rejected", () => {
    token = ah.connectAppleHealth().token;
    expect(ah.verifyIngestToken(token)).toBe(true);
    expect(ah.verifyIngestToken("nope")).toBe(false);
    expect(ah.verifyIngestToken(null)).toBe(false);
    expect(ah.isAppleHealthConnected()).toBe(true);
  });

  it("stores samples idempotently and aggregates steps/sleep without faking missing metrics", async () => {
    const d = today();
    const y = (() => {
      const t = new Date(d + "T00:00:00Z");
      t.setUTCDate(t.getUTCDate() - 1);
      return t.toISOString().slice(0, 10);
    })();
    const payload = {
      bridge: "shortcut" as const,
      permissions: { steps: "granted" as const, sleep: "granted" as const, hrv: "denied" as const },
      samples: [
        { type: "steps" as const, value: 3000, start: ts(d, "08:00"), end: ts(d, "09:00"), source: "iPhone", uuid: "s1" },
        { type: "steps" as const, value: 3200, start: ts(d, "08:00"), end: ts(d, "09:00"), source: "Oura", uuid: "s2" },
        { type: "steps" as const, value: 2500, start: ts(d, "12:00"), end: ts(d, "13:00"), source: "iPhone", uuid: "s3" },
        { type: "sleep" as const, value: 1, start: ts(y, "23:00"), end: ts(d, "06:45"), source: "Oura", uuid: "sl1", metadata: { stage: "asleepCore" } },
        { type: "resting_hr" as const, value: 52, start: ts(d, "06:00"), end: ts(d, "06:00"), source: "Oura", uuid: "r1" },
      ],
    };
    const r1 = await ah.ingestAppleHealth(payload);
    expect(r1.stored).toBe(5);
    const r2 = await ah.ingestAppleHealth(payload);
    expect(r2.stored).toBe(0); // idempotent
    const act = getDb().select().from(dailyActivity).where(eq(dailyActivity.date, d)).get()!;
    expect(act.steps).toBe(3200 + 2500); // Oura kept for the overlapping hour, iPhone dropped, noon hour summed
    expect(act.source).toBe("health");
    const night = getDb().select().from(sleepEntries).where(eq(sleepEntries.date, d)).get()!;
    expect(night.totalSleepMin).toBe(465);
    expect(night.source).toBe("health");
    expect(night.restingHr).toBe(52);
    expect(night.hrv).toBeNull(); // no HRV samples → not invented
    const status = ah.appleHealthStatus();
    const avail = Object.fromEntries(status.metrics.map((x) => [x.metric, x]));
    expect(avail.steps.available).toBe(true);
    expect(avail.sleep.available).toBe(true);
    expect(avail.hrv.available).toBe(false);
    expect(avail.hrv.permission).toBe("denied");
    expect(avail.workout.available).toBe(false);
    expect(status.bridge).toBe("shortcut");
    expect(status.lastSyncAt).toBeTruthy();
  });

  it("manual entries are never overwritten by health data", async () => {
    const d = "2026-05-20";
    m.logSteps({ date: d, steps: 12000 });
    await ah.ingestAppleHealth({ samples: [{ type: "steps", value: 500, start: ts(d, "10:00"), end: ts(d, "11:00"), source: "iPhone", uuid: "man1" }] });
    expect(getDb().select().from(dailyActivity).where(eq(dailyActivity.date, d)).get()!.steps).toBe(12000);
  });

  it("health workouts: unmatched ones count toward stats without XP; matched ones are suggested for linking", async () => {
    const d = today();
    const { totalXp } = await import("@/services/xp");
    const before = totalXp();
    const r = await ah.ingestAppleHealth({ workouts: [{ activityType: "HKWorkoutActivityTypeRunning", start: ts(d, "06:00"), end: ts(d, "06:35"), source: "Apple Watch", uuid: "w1" }] });
    expect(r.applied.workoutsCounted).toBe(1);
    const counted = getDb().select().from(workouts).where(eq(workouts.source, "health")).all();
    expect(counted.length).toBe(1);
    expect(counted[0].type).toBe("cardio");
    expect(totalXp()).toBe(before); // stats yes, XP no

    // Now a logged session + an overlapping health workout → suggestion, no duplicate row.
    const w = await import("@/services/workouts");
    const s = w.startSession({ date: d, name: "Upper", focus: "upper", exercises: [{ slug: "push-up", name: "Push-Up", sets: 3, reps: "12", restSeconds: 60, muscles: [] }] });
    for (let i = 0; i < 3; i++) w.logSet({ sessionExerciseId: s.exercises[0].id, setIndex: i, weight: null, reps: 12, completed: true });
    const fin = w.finishSession(s.id)!;
    const startedAt = fin.session.startedAt;
    const endAt = new Date(new Date(startedAt).getTime() + Math.max(1, fin.session.durationMin ?? 1) * 60000).toISOString();
    const r2 = await ah.ingestAppleHealth({ workouts: [{ activityType: "HKWorkoutActivityTypeTraditionalStrengthTraining", start: startedAt, end: endAt, source: "Apple Watch", uuid: "w2" }] });
    expect(r2.applied.workoutsCounted).toBe(0);
    const pend = ah.pendingWorkoutMatches();
    expect(pend.length).toBe(1);
    expect(pend[0].suggested?.id).toBe(fin.session.workoutId);
    ah.linkHealthWorkout(pend[0].id, fin.session.workoutId);
    expect(ah.pendingWorkoutMatches().length).toBe(0);
    expect(getDb().select().from(workouts).all().length).toBe(2); // run + session; nothing duplicated
  });

  it("sync re-applies and disconnect clears", async () => {
    const r = await ah.AppleHealthProvider.sync({ days: 30 });
    expect(r.ok).toBe(true);
    ah.disconnectAppleHealth({ deleteSamples: true });
    expect(ah.isAppleHealthConnected()).toBe(false);
    expect(ah.sampleCount()).toBe(0);
    expect(ah.appleHealthStatus().metrics.every((x) => !x.available)).toBe(true);
  });
});
