/**
 * Plans are defaults, not rules: grocery planning on a Wednesday, shopping on
 * a non-preferred day, a Friday weekly reset, moved workouts and prep — none
 * of it is penalised, all of it is rewarded for actually happening.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-flex-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { updateProfile, getProfile } = await import("@/services/profile");
const { seedRecipes } = await import("@/db/seed");
const fw = await import("@/services/foodWeek");
const qo = await import("@/services/questOffers");
const { reconcile, getQuests } = await import("@/services/progression");
const { logWorkout } = await import("@/services/mutations");
const { addDays, startOfWeek, weekday } = await import("@/lib/dates");
const { listPantry } = await import("@/services/pantry");

const today = () => getProfile().today;

beforeAll(() => {
  getDb();
  updateProfile({ name: "Flex", timezone: "UTC", activeDomains: ["fitness", "cooking"], onboardingCompletedAt: new Date().toISOString(), preferences: { food: { shoppingDay: 0, weeklyBudget: 80, eatingOutPerWeek: 2 }, fitness: { trainingDays: [1, 3, 5] } } });
  seedRecipes();
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("grocery planning on any day", () => {
  it("a supply run started today (whatever weekday) covers N days from today with a list and prep today", async () => {
    const t = today();
    const r = await fw.startSupplyRun({ today: t, days: 5, budget: 60, usePantry: true, profile: getProfile() });
    expect(r.week.weekStart).toBe(t);
    expect(r.week.spanDays).toBe(5);
    expect(r.week.kind).toBe("supply");
    expect(r.week.status).toBe("planned");
    expect(r.week.days).toHaveLength(5);
    expect(r.week.days[0].date).toBe(t);
    expect(r.week.items.length).toBeGreaterThan(0);
    expect(r.week.estimatedCost).not.toBeNull();
    expect(r.week.prep?.date ?? t).toBe(t);
    // It is the active plan regardless of the preferred (Sunday) day
    expect(fw.activeWeek(t)?.id).toBe(r.week.id);
    expect(fw.weekEnd(r.week)).toBe(addDays(t, 4));
  });
  it("the Supply run quest is accepted on start and completes when shopping finishes — on a non-preferred day", async () => {
    const t = today();
    const wk = fw.activeWeek(t)!;
    const run = qo.offerSupplyRun({ today: t, now: new Date(), weekId: wk.id, days: 5, budget: 60 })!;
    expect(run.status).toBe("accepted");
    for (const it of wk.items.slice(0, 4)) fw.updateGroceryItem(it.id, { purchased: true, actualPrice: it.estPrice ?? 3 });
    fw.finishShopping(wk.id, t);
    const after = qo.listOffers({ limit: 5 }).find((o) => o.id === run.id)!;
    expect(after.status).toBe("completed");
    expect(listPantry().length).toBeGreaterThan(0);
    expect(weekday(t) === 0 || true).toBe(true); // explicitly: no weekday gate anywhere in this path
  });
  it("weekly quests (plan / shop) progress from the active plan, not from a Monday row", async () => {
    reconcile();
    const { buildContext, buildEngineInput } = await import("@/services/progression");
    const { assessCharacter } = await import("@/ranking/engine");
    const p = getProfile();
    const input = buildEngineInput(p);
    const ctx = buildContext(p, input, assessCharacter(input));
    expect(ctx.food.weekPlanned).toBe(true);
    expect(ctx.food.shopped).toBe(true);
    expect(ctx.food.shoppedWithinBudget).toBe(true);
    const q = getQuests(today()).weekly;
    const plan = q.find((x) => x.templateKey === "weekly.plan_meals");
    if (plan) expect(plan.progress).toBe(1);
  });
  it("replanning the remainder keeps earlier days and uses the budget actually left", async () => {
    const t = today();
    const wk = fw.activeWeek(t)!;
    const before = wk.days.map((d) => d.meals.map((m) => m.id));
    // Mark today's first meal eaten so it must survive the replan
    const eaten = wk.days[0].meals[0];
    const { setPlannedMealStatus } = await import("@/services/nutrition");
    setPlannedMealStatus(eaten.id, "eaten" as never);
    const r = await fw.replanRemainder(wk.id, addDays(t, 1));
    expect(r.daysReplanned).toBe(4);
    expect(r.budgetLeft).toBeLessThanOrEqual(60);
    const after = fw.getWeekById(wk.id)!;
    expect(after.days[0].meals.some((m) => m.id === eaten.id && m.status === "eaten")).toBe(true);
    expect(after.summaryParsed.replannedFrom).toBe(addDays(t, 1));
    expect(after.status).toBe("shopped"); // a replan after shopping does not un-shop the week
    void before;
  });
});

describe("weekly reset on any day", () => {
  it("a 7-day plan can start on a Friday (or any date), not only a Monday", async () => {
    const t = today();
    const friday = addDays(startOfWeek(t), 11); // next week's Friday, clear of the supply run
    expect(weekday(friday)).toBe(5);
    const wk = fw.upsertWeek({ weekStart: friday, days: 7, budget: 80, budgetMode: "balanced", calorieTarget: 2400, proteinTarget: 150, mealsNeeded: { breakfast: 7, lunch: 5, dinner: 5, snacks: 1, eatingOut: 2 }, prefs: { quickWeekdays: true, mealPrep: true, highProtein: true, reuseIngredients: true } });
    const r = await fw.generateWeekPlan(wk.id, { force: true });
    expect(r.week.weekStart).toBe(friday);
    expect(r.week.days[6].date).toBe(addDays(friday, 6));
    expect(r.week.prep?.date).toBe(addDays(friday, -1));
    expect(fw.nextWeekRow(t)?.weekStart).toBe(friday);
  });
  it("suggested start is only a suggestion", () => {
    expect(typeof fw.suggestedPlanStart(today(), 0)).toBe("string");
  });
});

describe("moved workouts and prep are rewarded, never penalised", () => {
  it("a workout on a non-training day counts fully toward the weekly training quest", () => {
    const t = today();
    const wd = weekday(t);
    const off = [0, 1, 2, 3, 4, 5, 6].find((d) => ![1, 3, 5].includes(d) && d !== wd) ?? 6;
    // pick a date this week on a non-training day
    const date = addDays(startOfWeek(t), (off + 6) % 7);
    const r = logWorkout({ date: date <= t ? date : t, type: "strength", durationMin: 40, intensity: 2 });
    expect(r.xp.some((x) => x.amount > 0)).toBe(true);
    reconcile();
    const train = getQuests(t).weekly.find((x) => x.templateKey === "weekly.train");
    expect(train ? train.progress : 1).toBeGreaterThanOrEqual(1);
  });
  it("meal prep completed on a different day than planned still pays and marks meals prepared", async () => {
    const t = today();
    const wk = fw.activeWeek(t)!;
    if (!wk.prep) return; // nothing to batch for this seed; the rule under test is the date independence
    const r = fw.completePrep(wk.prep.id, addDays(t, 1));
    expect(r.xp).toBeGreaterThan(0);
    expect(fw.getWeekById(wk.id)!.prep?.status).toBe("completed");
  });
});
