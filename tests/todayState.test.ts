import { describe, expect, it } from "vitest";
import { nutritionState, sleepState, stepsState, workoutState } from "../src/services/todayState";
import { metricFreshness } from "../src/health/freshness";

const now = new Date("2026-10-14T18:00:00Z");

describe("nutrition is not binary", () => {
  it("protein hit at noon is a success STATE, not end-of-day completion", () => {
    const s = nutritionState({ calories: 1400, protein: 165, calorieTarget: 2400, proteinTarget: 165, finished: false, plannedRemaining: 2, localHour: 13 });
    expect(s.proteinHit).toBe(true);
    expect(s.resolved).toBe(false);
    expect(s.text).toMatch(/Protein goal hit/);
    expect(s.sub).toMatch(/1,400 \/ 2,400 kcal/);
    expect(s.sub).toMatch(/2 planned meals left/);
  });
  it("explicit finish settles the day", () => {
    const s = nutritionState({ calories: 1400, protein: 100, calorieTarget: 2400, proteinTarget: 165, finished: true, plannedRemaining: 0, localHour: 20 });
    expect(s.resolved).toBe(true);
    expect(s.tone).toBe("resolved");
  });
  it("nothing logged is ordinary at 7am and noteworthy at 8:30pm", () => {
    expect(nutritionState({ calories: 0, protein: 0, calorieTarget: 2400, proteinTarget: 165, finished: false, plannedRemaining: 3, localHour: 7 }).tone).toBe("neutral");
    expect(nutritionState({ calories: 0, protein: 0, calorieTarget: 2400, proteinTarget: 165, finished: false, plannedRemaining: 3, localHour: 20 }).tone).toBe("attention");
  });
  it("never encourages eating just to complete a metric: late + in calorie range resolves quietly", () => {
    const s = nutritionState({ calories: 2300, protein: 140, calorieTarget: 2400, proteinTarget: 165, finished: false, plannedRemaining: 0, localHour: 22 });
    expect(s.resolved).toBe(true);
    expect(s.sub).not.toMatch(/to go/);
  });
});

describe("resolved vs successful (sleep)", () => {
  it("7h02 against 8h is resolved but not successful, and informs tonight", () => {
    const s = sleepState({ lastNightMin: 422, targetMin: 480, freshness: metricFreshness({ automatic: true, hasValueToday: true, value: 422, lastSyncAt: now.toISOString(), now }), localHour: 18 });
    expect(s.resolved).toBe(true);
    expect(s.success).toBe(false);
    expect(s.tone).toBe("resolved");
    expect(s.text).toBe("7h 02m");
    expect(s.sub).toMatch(/0h 58m below target/);
    expect(s.windDownEarlierMin).toBe(30);
    expect(s.sub).toMatch(/wind down 30 min earlier/);
  });
  it("at target is a success", () => {
    const s = sleepState({ lastNightMin: 490, targetMin: 480, freshness: metricFreshness({ automatic: false, hasValueToday: true, value: 490, lastSyncAt: null, now }), localHour: 9 });
    expect(s.success).toBe(true);
    expect(s.tone).toBe("success");
  });
  it("Oura/Apple pending is not 'no sleep'", () => {
    const s = sleepState({ lastNightMin: null, targetMin: 480, freshness: metricFreshness({ automatic: true, hasValueToday: false, value: null, lastSyncAt: new Date(now.getTime() - 5 * 3600_000).toISOString(), now }), localHour: 9 });
    expect(s.tone).toBe("pending");
    expect(s.text).toBe("Sleep data pending");
    expect(s.sub).toMatch(/Last sync 5h ago/);
  });
});

describe("zero vs not synced (steps)", () => {
  it("pending when automatic and nothing arrived today", () => {
    const s = stepsState({ value: null, target: 8000, automatic: true, lastSyncAt: now.toISOString(), sourceLabel: "Oura", now });
    expect(s.freshness.state).toBe("pending");
    expect(s.text).toBe("Activity syncing…");
  });
  it("an actual zero is a zero", () => {
    expect(metricFreshness({ automatic: true, hasValueToday: true, value: 0, lastSyncAt: now.toISOString(), now }).state).toBe("zero");
  });
  it("stale sync becomes obvious only when relevant", () => {
    const fresh = stepsState({ value: 6421, target: 8000, automatic: true, lastSyncAt: new Date(now.getTime() - 20 * 60_000).toISOString(), sourceLabel: "Oura", now });
    expect(fresh.sub).not.toMatch(/last synced/);
    const stale = stepsState({ value: 6421, target: 8000, automatic: true, lastSyncAt: new Date(now.getTime() - 5 * 3600_000).toISOString(), sourceLabel: "Oura", now });
    expect(stale.sub).toMatch(/Oura last synced 5h ago/);
  });
  it("manual users see a quiet unavailable state, never '0 steps'", () => {
    const s = stepsState({ value: null, target: 8000, automatic: false, lastSyncAt: null, sourceLabel: null, now });
    expect(s.text).toBe("—");
    expect(s.freshness.state).toBe("unavailable");
  });
});

describe("workout row actionability", () => {
  it("incomplete at 9am is normal; at 9pm it is attention, with a short option", () => {
    const base = { planned: true, planName: "Full body", exercises: 6, minutes: 45, activeSession: false, logged: [], restDay: false };
    expect(workoutState({ ...base, localHour: 9 }).tone).toBe("neutral");
    const late = workoutState({ ...base, localHour: 21 });
    expect(late.tone).toBe("attention");
    expect(late.sub).toMatch(/still time/);
  });
  it("done only when an actual workout occurred; rest day resolves without guilt", () => {
    expect(workoutState({ planned: true, planName: "x", exercises: 1, minutes: 1, activeSession: false, logged: [{ type: "walk", durationMin: 30 }], restDay: false, localHour: 12 }).done).toBe(true);
    const rest = workoutState({ planned: false, planName: "", exercises: 0, minutes: 0, activeSession: false, logged: [], restDay: true, localHour: 12 });
    expect(rest.tone).toBe("resolved");
    expect(rest.sub).toMatch(/nothing owed/);
  });
});
