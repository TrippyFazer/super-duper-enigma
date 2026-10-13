import { describe, expect, it } from "vitest";
import { resolveHealthSources } from "../src/health/sources";
import { orderByUsage, bump, type UsageCounts } from "../src/lib/logUsage";
import { inferMealType } from "../src/food/mealType";
import { weightStepFor, stepWeight } from "../src/planner/weightStep";

describe("health source rules", () => {
  it("manual sleep/steps are shown only when no automatic source covers them", () => {
    const none = resolveHealthSources({ appleConnected: false, appleMetrics: [], appleLastSyncAt: null, ouraConnected: false });
    expect(none.showManualSleep).toBe(true);
    expect(none.showManualSteps).toBe(true);
    expect(none.anyConnected).toBe(false);
  });
  it("Apple Health connected without samples does NOT count as automatic (never fake availability)", () => {
    const s = resolveHealthSources({ appleConnected: true, appleMetrics: [{ metric: "sleep", available: false }, { metric: "steps", available: false }], appleLastSyncAt: null, ouraConnected: false });
    expect(s.sleepAutomatic).toBe(false);
    expect(s.showManualSleep).toBe(true);
    expect(s.anyConnected).toBe(true);
  });
  it("Apple Health with real samples hides manual entry for that metric only", () => {
    const s = resolveHealthSources({ appleConnected: true, appleMetrics: [{ metric: "sleep", available: true }, { metric: "steps", available: false }], appleLastSyncAt: "2026-10-13T06:00:00Z", ouraConnected: false });
    expect(s.showManualSleep).toBe(false);
    expect(s.showManualSteps).toBe(true);
    expect(s.sleepSourceLabel).toBe("Apple Health");
  });
  it("Oura connected supplies sleep and steps, so the UI never prompts for them", () => {
    const s = resolveHealthSources({ appleConnected: false, appleMetrics: [], appleLastSyncAt: null, ouraConnected: true });
    expect(s.showManualSleep).toBe(false);
    expect(s.showManualSteps).toBe(false);
    expect(s.stepsSourceLabel).toBe("Oura");
  });
  it("with both connected, Oura is the named source", () => {
    const s = resolveHealthSources({ appleConnected: true, appleMetrics: [{ metric: "sleep", available: true }, { metric: "steps", available: true }], appleLastSyncAt: "2026-10-13T06:00:00Z", ouraConnected: true });
    expect(s.sleepSourceLabel).toBe("Oura");
    expect(s.stepsSourceLabel).toBe("Oura");
  });
});

describe("+ LOG ordering by recent use", () => {
  const items = [{ key: "food" }, { key: "workout" }, { key: "sleep" }, { key: "routine" }];
  it("keeps default order with no history", () => {
    expect(orderByUsage(items, {}).map((i) => i.key)).toEqual(["food", "workout", "sleep", "routine"]);
  });
  it("moves the most recently used option first", () => {
    const now = Date.now();
    let counts: UsageCounts = {};
    counts = bump(counts, "sleep", now - 1000);
    expect(orderByUsage(items, counts, { now }).map((i) => i.key)[0]).toBe("sleep");
  });
  it("frequency breaks ties between equally recent options; stale use decays", () => {
    const now = Date.now();
    const day = 86_400_000;
    let counts: UsageCounts = {};
    for (let i = 0; i < 5; i++) counts = bump(counts, "workout", now - day);
    counts = bump(counts, "food", now - day);
    counts = bump(counts, "routine", now - 40 * day);
    const order = orderByUsage(items, counts, { now }).map((i) => i.key);
    // fresh + frequent first, fresh second, stale-but-used third, never-used last
    expect(order).toEqual(["workout", "food", "routine", "sleep"]);
  });
});

describe("meal type inference", () => {
  it("infers from the clock and is never the first decision", () => {
    expect(inferMealType(7)).toBe("breakfast");
    expect(inferMealType(12.5)).toBe("lunch");
    expect(inferMealType(16)).toBe("snack");
    expect(inferMealType(19)).toBe("dinner");
    expect(inferMealType(23)).toBe("snack");
  });
});

describe("equipment-aware weight steppers", () => {
  it("steps 5 lb for barbell/dumbbell, 10 for machines, 8 for kettlebells, none for bodyweight", () => {
    expect(weightStepFor(["barbell"])).toBe(5);
    expect(weightStepFor(["dumbbell"])).toBe(5);
    expect(weightStepFor(["machine"])).toBe(10);
    expect(weightStepFor(["kettlebell"])).toBe(8);
    expect(weightStepFor(["bodyweight"])).toBeNull();
    expect(weightStepFor(["band"])).toBeNull();
    expect(weightStepFor(undefined)).toBe(5);
  });
  it("never goes below zero and starts from the previous value when empty", () => {
    expect(stepWeight(null, 5, -1)).toBe(0);
    expect(stepWeight(135, 5, 1)).toBe(140);
    expect(stepWeight(2.5, 5, -1)).toBe(0);
  });
});
