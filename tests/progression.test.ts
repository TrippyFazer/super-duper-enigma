/**
 * Service-level tests: XP ledger idempotency, quest generation/completion,
 * achievements, rank history. Runs against a throwaway SQLite file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { profiles, quests, xpEvents, userAchievements, rankHistory, recipes, sobrietyRuns, routineCompletions } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const { reconcile, getQuests } = await import("@/services/progression");
const { awardXp, totalXp } = await import("@/services/xp");
const m = await import("@/services/mutations");
const { seedRecipes } = await import("@/db/seed");
const { eq } = await import("drizzle-orm");

beforeAll(() => {
  getDb();
  updateProfile({
    name: "Test",
    age: 30,
    timezone: "UTC",
    activeDomains: ["fitness", "sleep", "cooking", "skincare", "habits", "sobriety", "wealth"],
    baseline: { workoutsPerWeek: 2 },
    onboardingCompletedAt: new Date().toISOString(),
  });
  seedRecipes();
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("xp ledger", () => {
  it("awards once per key and respects daily caps", () => {
    const p = getProfile();
    const a = awardXp("workout", p.today, { suffix: 1 });
    const b = awardXp("workout", p.today, { suffix: 1 });
    expect(a.awarded).toBe(true);
    expect(b.awarded).toBe(false);
    const c = awardXp("workout", p.today, { suffix: 2 });
    const d = awardXp("workout", p.today, { suffix: 3 }); // cap is 2/day
    expect(c.awarded).toBe(true);
    expect(d.awarded).toBe(false);
    expect(totalXp()).toBe(50);
    getDb().delete(xpEvents).run();
  });
});

describe("logging + reconcile", () => {
  it("creates quests, completes them from logs, unlocks achievements, writes rank history", () => {
    const p = getProfile();
    const before = totalXp();
    const r0 = reconcile();
    expect(r0.assessment.domains.length).toBe(7);
    const q0 = getQuests(p.today);
    expect(q0.daily.length).toBeGreaterThan(0);
    expect(q0.weekly.length).toBeGreaterThan(0);
    const train = q0.daily.find((q) => q.templateKey === "daily.workout");
    expect(train?.done).toBe(false);

    const res = m.logWorkout({ date: p.today, type: "strength", durationMin: 60, intensity: 2 });
    expect(res.xp.map((x) => x.amount).reduce((a, b) => a + b, 0)).toBe(35); // 25 + 10 long bonus
    const r1 = reconcile();
    expect(r1.completedQuests.some((q) => q.templateKey === "daily.workout")).toBe(true);
    expect(r1.newAchievements.map((a) => a.key)).toEqual(expect.arrayContaining(["warm_up", "first_step"]));
    expect(totalXp()).toBeGreaterThan(before + 35);

    // Idempotent: a second reconcile awards nothing new
    const xpAfter = totalXp();
    const r2 = reconcile();
    expect(r2.newAchievements).toEqual([]);
    expect(r2.completedQuests).toEqual([]);
    expect(totalXp()).toBe(xpAfter);

    // Rank history exists for overall + domains
    const hist = getDb().select().from(rankHistory).all();
    expect(hist.some((h) => h.domain === "overall")).toBe(true);
    expect(getDb().select().from(userAchievements).all().length).toBeGreaterThanOrEqual(2);
  });

  it("meal logging detects new recipes and caps meal XP at 3/day", () => {
    const p = getProfile();
    const recipe = getDb().select().from(recipes).get()!;
    const first = m.logMeal({ date: p.today, mealType: "dinner", name: recipe.name, recipeId: recipe.id });
    expect(first.xp.some((x) => x.key.startsWith("new_recipe"))).toBe(true);
    const again = m.logMeal({ date: p.today, mealType: "lunch", name: recipe.name, recipeId: recipe.id });
    expect(again.xp.some((x) => x.key.startsWith("new_recipe"))).toBe(false);
    m.logMeal({ date: p.today, mealType: "snack", name: "x" });
    const fourth = m.logMeal({ date: p.today, mealType: "snack", name: "y" });
    expect(fourth.xp.length).toBe(0);
  });

  it("sobriety reset ends the current run and starts a new one", () => {
    const id = m.createSobrietyTracker({ name: "Alcohol", category: "alcohol", startedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() });
    reconcile();
    const milestoneXp = getDb().select().from(xpEvents).all().filter((x) => x.key.startsWith("sobriety_milestone"));
    expect(milestoneXp.length).toBeGreaterThanOrEqual(5); // 1,3,7,14,30 day milestones
    m.resetSobriety({ trackerId: id, at: new Date().toISOString() });
    const runs = getDb().select().from(sobrietyRuns).where(eq(sobrietyRuns.trackerId, id)).all();
    expect(runs.length).toBe(2);
    expect(runs.filter((r) => r.endedAt == null).length).toBe(1);
    // Milestones are not re-awarded for the old run
    const r = reconcile();
    const after = getDb().select().from(xpEvents).all().filter((x) => x.key.startsWith("sobriety_milestone"));
    expect(after.length).toBe(milestoneXp.length);
    expect(r.assessment.domains.find((d) => d.domain === "sobriety")!.score).toBeGreaterThan(0);
  });

  it("routine and habit completion are idempotent and reversible", () => {
    const p = getProfile();
    const rid = m.createRoutine({ name: "AM", timeOfDay: "morning", steps: ["Cleanser", "SPF"] });
    const a = m.completeRoutine({ routineId: rid, date: p.today });
    const b = m.completeRoutine({ routineId: rid, date: p.today });
    expect(a.xp.length).toBe(1);
    expect(b.xp.length).toBe(0);
    m.uncompleteRoutine(rid, p.today);
    expect(getDb().select().from(routineCompletions).all().filter((c) => c.routineId === rid).length).toBe(0);

    const hid = m.createHabit({ name: "Read", scheduleType: "daily" });
    expect(m.completeHabit({ habitId: hid, date: p.today }).xp.length).toBe(1);
    expect(m.completeHabit({ habitId: hid, date: p.today }).xp.length).toBe(0);
  });

  it("financial snapshot gives a wealth rank capped at B on first check-in", () => {
    const p = getProfile();
    m.addFinancialSnapshot({ date: p.today, liquidSavings: 30000, monthlyExpenses: 3000, monthlyIncome: 7000, savingsRatePct: 25, highInterestDebt: 0, netWorth: 200000, retirementBalance: 90000, investsMonthly: true });
    const r = reconcile();
    const w = r.assessment.domains.find((d) => d.domain === "wealth")!;
    expect(w.rank).toBe("B");
    expect(w.rankCap).toBe("B");
    expect(r.newAchievements.map((a) => a.key)).toEqual(expect.arrayContaining(["financial_apprentice", "rainy_day"]));
  });

  it("quests for the same period are not duplicated", () => {
    const p = getProfile();
    reconcile();
    reconcile();
    const rows = getDb().select().from(quests).where(eq(quests.periodStart, p.today)).all();
    const keys = rows.map((q) => q.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("profile persists", () => {
    const row = getDb().select().from(profiles).get()!;
    expect(row.name).toBe("Test");
    expect(row.onboardingCompletedAt).not.toBeNull();
  });
});
