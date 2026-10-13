/** Oura sync: payload → sleep_entries / daily_activity upserts with XP, idempotent. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-oura-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { sleepEntries, dailyActivity, xpEvents } = await import("@/db/schema");
const { applyOuraData, getOuraStatus } = await import("@/integrations/oura/sync");
const { buildAuthorizeUrl, redirectUri } = await import("@/integrations/oura/client");

const fixture = {
  dailySleep: [{ id: "a", day: "2026-10-10", score: 82, timestamp: "2026-10-10T07:00:00+00:00" }],
  readiness: [{ id: "r", day: "2026-10-10", score: 77 }],
  sleep: [
    { id: "s1", day: "2026-10-10", type: "long_sleep", bedtime_start: "2026-10-09T23:12:00-04:00", bedtime_end: "2026-10-10T06:58:00-04:00", total_sleep_duration: 7 * 3600 + 600, time_in_bed: 28000, efficiency: 91, latency: 540, average_hrv: 44, lowest_heart_rate: 52, average_heart_rate: 58 },
    { id: "s2", day: "2026-10-10", type: "late_nap", bedtime_start: "2026-10-10T14:00:00-04:00", bedtime_end: "2026-10-10T14:30:00-04:00", total_sleep_duration: 1500, time_in_bed: 1800, efficiency: 83, latency: 60, average_hrv: null, lowest_heart_rate: null, average_heart_rate: null },
  ],
  activity: [{ id: "act", day: "2026-10-10", score: 85, steps: 9450, high_activity_time: 600, medium_activity_time: 1800 }],
};

beforeAll(() => {
  getDb();
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("oura sync", () => {
  it("upserts one sleep row per day (long sleep + naps) and activity, awarding XP once", () => {
    const r1 = applyOuraData(fixture as never, 450, 8000);
    expect(r1).toEqual({ nights: 1, activityDays: 1 });
    const row = getDb().select().from(sleepEntries).all()[0];
    expect(row.source).toBe("oura");
    expect(row.totalSleepMin).toBe(Math.round((7 * 3600 + 600 + 1500) / 60));
    expect(row.sleepScore).toBe(82);
    expect(row.readinessScore).toBe(77);
    expect(row.hrv).toBe(44);
    expect(row.restingHr).toBe(52);
    expect(row.bedtimeStart).toBe("2026-10-09T23:12:00-04:00");
    const act = getDb().select().from(dailyActivity).all()[0];
    expect(act.steps).toBe(9450);
    expect(act.activeMinutes).toBe(40);
    const xp = getDb().select().from(xpEvents).all();
    expect(xp.map((x) => x.key).sort()).toEqual(["sleep_logged:2026-10-10", "sleep_target:2026-10-10", "steps_target:2026-10-10"]);

    // Second sync is idempotent
    applyOuraData(fixture as never, 450, 8000);
    expect(getDb().select().from(sleepEntries).all().length).toBe(1);
    expect(getDb().select().from(xpEvents).all().length).toBe(3);
  });

  it("reports status without credentials", () => {
    const s = getOuraStatus();
    expect(s.connected).toBe(false);
    expect(s.oauthAvailable).toBe(false);
  });

  it("builds the OAuth authorize URL from env", () => {
    process.env.OURA_CLIENT_ID = "abc";
    process.env.APP_URL = "https://ascend.example";
    expect(redirectUri()).toBe("https://ascend.example/api/oura/callback");
    const u = new URL(buildAuthorizeUrl("state123"));
    expect(u.origin + u.pathname).toBe("https://cloud.ouraring.com/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("abc");
    expect(u.searchParams.get("state")).toBe("state123");
    expect(u.searchParams.get("scope")).toContain("daily");
  });
});
