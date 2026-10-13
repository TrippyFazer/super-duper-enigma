/**
 * Sleep planning (wake time → schedule, planned vs actual), personal reasons,
 * morning-message variety, and scheduled reminders recalculating on change.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-sleep-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { notifications } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const sp = await import("@/services/sleepPlan");
const mo = await import("@/services/motivation");
type MotivationInput = import("@/services/motivation").MotivationInput;
const { runScheduledNotifications } = await import("@/services/scheduler");
const { listNotifications } = await import("@/services/notifications");
const { eq, like } = await import("drizzle-orm");

beforeAll(() => {
  getDb();
  updateProfile({ name: "Tripp", timezone: "UTC", activeDomains: ["fitness", "sleep", "habits"], onboardingCompletedAt: new Date().toISOString(), targets: { sleepTargetMin: 480 } });
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("sleep schedule", () => {
  it("derives wind-down / in-bed / asleep from a wake target", () => {
    const s = sp.computeSleepSchedule({ stepsTarget: 8000, bedtimeTarget: null, sleepTargetMin: 480, workoutsPerWeekTarget: 3, mealsPerWeekTarget: 7 }, { wakeTarget: "07:30", windDownMin: 30, fallAsleepMin: 15 })!;
    expect(s).toMatchObject({ wake: "07:30", asleep: "23:30", inBed: "23:15", windDown: "22:45", derived: true });
    const early = sp.computeSleepSchedule({ stepsTarget: 8000, bedtimeTarget: null, sleepTargetMin: 540, workoutsPerWeekTarget: 3, mealsPerWeekTarget: 7 }, { wakeTarget: "05:00", windDownMin: 60, fallAsleepMin: 20 })!;
    expect(early.asleep).toBe("20:00");
    expect(early.windDown).toBe("18:40");
  });

  it("falls back to a legacy bedtime target and compares actual nights", () => {
    const s = sp.computeSleepSchedule({ stepsTarget: 8000, bedtimeTarget: "23:00", sleepTargetMin: 450, workoutsPerWeekTarget: 3, mealsPerWeekTarget: 7 }, { wakeTarget: null, windDownMin: 30, fallAsleepMin: 15 })!;
    expect(s.derived).toBe(false);
    expect(s.wake).toBe("06:45");
    const cmp = sp.compareNight({ date: "2026-05-10", totalSleepMin: 430, bedtimeStart: "2026-05-10T00:04:00", bedtimeEnd: "2026-05-10T07:24:00" }, { ...s, asleep: "23:30", wake: "07:30", targetMin: 480 });
    expect(cmp.bedDeltaMin).toBe(34);
    expect(cmp.wakeDeltaMin).toBe(-6);
    expect(cmp.verdict).toBe("Close");
    expect(sp.compareNight({ date: "2026-05-11", totalSleepMin: 485, bedtimeStart: "2026-05-10T23:35:00", bedtimeEnd: "2026-05-11T07:35:00" }, { ...s, asleep: "23:30", wake: "07:30", targetMin: 480 }).verdict).toBe("On plan");
  });
});

describe("motivation", () => {
  it("stores personal reasons and quotes them, varying templates and avoiding repeats", () => {
    mo.addReason("I want more discipline.");
    mo.addReason("I want to become someone I am proud of.");
    expect(mo.listReasons().length).toBe(2);
    const input: MotivationInput = { name: "Tripp", reasons: mo.listReasons().map((r) => r.text), xpToNext: 43, level: 24, nearLevel: true, bestStreak: 5, activeWeekStreak: 2, firstQuest: "Train today", overallRank: "B", nextRank: "A", scoreDelta30: { domain: "fitness", delta: 6 }, sobrietyDays: null, weekday: 2 };
    const seen = new Set<string>();
    const recent: string[] = [];
    let referencedReason = false;
    for (let i = 0; i < 12; i++) {
      const m = mo.buildMorningMessage(input, recent, i * 7919);
      expect(recent.slice(-6)).not.toContain(m.key);
      recent.push(m.key);
      seen.add(m.key);
      if (/discipline|proud of/.test(m.text)) referencedReason = true;
      expect(m.text.length).toBeLessThan(220);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
    expect(referencedReason).toBe(true);
    // Level + progress facts appear somewhere in the rotation.
    const all = Array.from({ length: 30 }, (_, i) => mo.buildMorningMessage(input, [], i * 31).text).join(" ");
    expect(all).toMatch(/43 XP until Level 25/);
    expect(all).toMatch(/up 6 points/);
    // Turning reasons off removes personal quotes.
    const noReason = mo.buildMorningMessage({ ...input, reasons: [] }, [], 3);
    expect(noReason.text).not.toMatch(/discipline/);
    const r = mo.listReasons()[0];
    mo.updateReason(r.id, { active: false });
    expect(mo.listReasons().length).toBe(1);
    mo.deleteReason(r.id);
    expect(mo.listReasons(true).length).toBe(1);
  });
});

describe("scheduled reminders", () => {
  it("fires morning + wind-down once at the right times and recalculates after a wake-time change", () => {
    const db = getDb();
    updateProfile({ preferences: { sleep: { wakeTarget: "07:30", windDownMin: 30, fallAsleepMin: 15 }, notifications: { morningMotivation: true, windDown: true, windDownLeadMin: 15 } } });
    const p = getProfile();
    const at = (hhmm: string) => ({ ...p, localTime: hhmm + ":00" });
    expect(runScheduledNotifications(at("06:00"))).toEqual([]); // before wake
    const morning = runScheduledNotifications(at("07:35"));
    expect(morning).toContain(`n:morning:${p.today}`);
    expect(runScheduledNotifications(at("07:40"))).not.toContain(`n:morning:${p.today}`); // once
    const notes = listNotifications(10);
    expect(notes[0].title).toBe("7:30 AM");
    expect(notes[0].body.length).toBeGreaterThan(10);
    // wind-down at 22:45 minus 15 min lead = 22:30
    expect(runScheduledNotifications(at("22:00"))).toEqual([]);
    expect(runScheduledNotifications(at("22:31"))).toContain(`n:winddown:${p.today}`);
    expect(db.select().from(notifications).where(like(notifications.key, "n:winddown:%")).all().length).toBe(1);
    // Change wake time → the wind-down key for today is cleared by the action path; emulate it and verify a new time computes.
    updateProfile({ preferences: { sleep: { wakeTarget: "06:00" } } });
    db.delete(notifications).where(eq(notifications.key, `n:winddown:${p.today}`)).run();
    const p2 = getProfile();
    const s2 = sp.computeSleepSchedule(p2.targets, p2.preferences.sleep)!;
    expect(s2.windDown).toBe("21:15");
    expect(runScheduledNotifications({ ...p2, localTime: "21:05:00" })).toContain(`n:winddown:${p.today}`); // 21:15 − 15 = 21:00 window
    // Turning the category off stops it.
    updateProfile({ preferences: { notifications: { windDown: false } } });
    db.delete(notifications).where(eq(notifications.key, `n:winddown:${p.today}`)).run();
    expect(runScheduledNotifications({ ...getProfile(), localTime: "21:05:00" })).not.toContain(`n:winddown:${p.today}`);
  });
});
