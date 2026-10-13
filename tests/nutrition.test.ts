/**
 * Nutrition: targets, totals, logging with XP rules (no XP for eating less,
 * unsafe targets never pay), portion edits, meal plans + caching, template
 * meal generator preferences, cooking-domain integration.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-nutrition-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { meals } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const { totalXp } = await import("@/services/xp");
const n = await import("@/services/nutrition");
const { seedRecipes } = await import("@/db/seed");
const { loadRecipes } = await import("@/services/loaders");
const { generateTemplateMealPlan } = await import("@/planner/mealTemplates");
const { DEFAULT_PREFERENCES, estimateTargets, targetWarning, SAFE_MIN_CALORIES } = await import("@/services/preferences");
const { getOrGenerateMeals } = await import("@/services/planner");
const { reconcile } = await import("@/services/progression");

beforeAll(() => {
  getDb();
  updateProfile({ name: "Eater", timezone: "UTC", sex: "male", age: 30, heightCm: 178, weightKg: 76, activeDomains: ["fitness", "cooking"], onboardingCompletedAt: new Date().toISOString() });
  seedRecipes();
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

const recipesLite = () => loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));

describe("targets", () => {
  it("estimates sane targets from body data and flags unsafe manual targets", () => {
    const est = estimateTargets({ sex: "male", age: 30, heightCm: 178, weightKg: 76, goal: "maintain" });
    expect(est.calories).toBeGreaterThan(2000);
    expect(est.calories).toBeLessThan(3200);
    expect(est.protein).toBeGreaterThanOrEqual(100);
    const lose = estimateTargets({ sex: "male", age: 30, heightCm: 178, weightKg: 76, goal: "lose" });
    expect(lose.calories).toBeLessThan(est.calories);
    expect(lose.calories).toBeGreaterThanOrEqual(SAFE_MIN_CALORIES("male"));
    expect(targetWarning({ ...DEFAULT_PREFERENCES.nutrition, calorieTarget: 900 }, "female")).toMatch(/1200/);
    expect(targetWarning({ ...DEFAULT_PREFERENCES.nutrition, calorieTarget: 2200 }, "male")).toBeNull();
    const p = getProfile();
    const t = n.resolveTargets(p.preferences.nutrition, p);
    expect(t.estimated).toBe(true);
    expect(t.carbs + t.fat + t.protein).toBeGreaterThan(0);
  });
});

describe("logging + XP", () => {
  const ctx = { proteinTarget: 140, calorieTarget: 2400, unsafeTargets: false };
  const today = () => getProfile().today;

  it("sums totals and awards logging XP once per day", () => {
    const before = totalXp();
    const r1 = n.logNutrition({ date: today(), mealType: "breakfast", name: "Eggs", calories: 300, protein: 20, carbs: 2, fat: 22 }, ctx);
    expect(r1.xp.some((x) => x.key.startsWith("nutrition_logged:"))).toBe(true);
    const r2 = n.logNutrition({ date: today(), mealType: "lunch", name: "Bowl", calories: 700, protein: 45, carbs: 80, fat: 20 }, ctx);
    expect(r2.xp.some((x) => x.key.startsWith("nutrition_logged:"))).toBe(false);
    const t = n.dayTotals(today());
    expect(t).toMatchObject({ calories: 1000, protein: 65, carbs: 82, fat: 42 });
    expect(totalXp()).toBe(before + 5);
  });

  it("pays protein XP only when the target is hit with adequate calories", () => {
    const before = totalXp();
    // Protein target met but calories far too low → no protein XP.
    const low = n.logNutrition({ date: "2026-05-01", mealType: "dinner", name: "Shake", calories: 300, protein: 150 }, ctx);
    expect(low.xp.some((x) => x.key.startsWith("protein_target:"))).toBe(false);
    // Proper day
    n.logNutrition({ date: "2026-05-02", mealType: "lunch", name: "A", calories: 900, protein: 70 }, ctx);
    const ok = n.logNutrition({ date: "2026-05-02", mealType: "dinner", name: "B", calories: 900, protein: 75 }, ctx);
    expect(ok.xp.some((x) => x.key.startsWith("protein_target:"))).toBe(true);
    expect(totalXp()).toBe(before + 5 + 5 + 15);
  });

  it("never rewards unsafe targets and never rewards eating less", () => {
    const before = totalXp();
    const r = n.logNutrition({ date: "2026-05-03", mealType: "dinner", name: "Big", calories: 2000, protein: 160 }, { proteinTarget: 100, calorieTarget: 900, unsafeTargets: true });
    expect(r.xp.some((x) => x.key.startsWith("protein_target:"))).toBe(false);
    expect(r.xp.map((x) => x.key.split(":")[0])).toEqual(["nutrition_logged"]);
    // Deleting food or logging tiny days yields nothing extra.
    n.logNutrition({ date: "2026-05-04", mealType: "snack", name: "Air", calories: 50, protein: 0 }, ctx);
    expect(totalXp()).toBe(before + 5 + 5);
  });

  it("cooked entries create a cooking log row that counts toward the cooking rank", () => {
    const before = getDb().select().from(meals).all().length;
    const r = n.logNutrition({ date: "2026-05-05", mealType: "dinner", name: "Stir fry", calories: 600, protein: 40, cooked: true }, ctx);
    expect(r.entry.mealId).not.toBeNull();
    expect(getDb().select().from(meals).all().length).toBe(before + 1);
    expect(r.xp.some((x) => x.key.startsWith("meal_cooked:"))).toBe(true);
  });

  it("portion edits scale macros and deletes remove entries", () => {
    const r = n.logNutrition({ date: "2026-05-06", mealType: "lunch", name: "Burrito", calories: 800, protein: 40, carbs: 90, fat: 30 }, ctx);
    const half = n.updateEntry(r.entry.id, { portion: 0.5 })!;
    expect(half.calories).toBe(400);
    expect(half.protein).toBe(20);
    expect(half.carbs).toBe(45);
    const renamed = n.updateEntry(r.entry.id, { name: "Half burrito", calories: 410 })!;
    expect(renamed.name).toBe("Half burrito");
    expect(renamed.calories).toBe(410);
    n.deleteEntry(r.entry.id);
    expect(n.entriesForDate("2026-05-06").length).toBe(0);
  });

  it("consistency counts logged days and protein days excluding starvation days", () => {
    const c = n.nutritionConsistency("2026-05-07", 30, 140, 1500);
    // 05-01 (starvation day, excluded from protein), 05-02, 05-03, 05-04, 05-05 logged; 05-06 deleted.
    expect(c.loggedDays).toBe(5);
    expect(c.proteinDays).toBe(2); // 05-02 and 05-03 hit 140 g with adequate calories
  });
});

describe("meal plans", () => {
  it("template generator honours diet prefs, dislikes and approaches targets", () => {
    const recipes = recipesLite();
    const plan = generateTemplateMealPlan({ recipes, prefs: { ...DEFAULT_PREFERENCES.nutrition, dietPrefs: ["vegetarian"], dislikes: ["mushroom"], mealsPerDay: 4 }, calorieTarget: 2400, proteinTarget: 150, seed: 7 });
    expect(plan.meals.length).toBeGreaterThanOrEqual(3);
    for (const m of plan.meals) {
      const text = `${m.name} ${m.ingredients.join(" ")}`.toLowerCase();
      expect(text).not.toMatch(/\b(chicken|beef|pork|salmon|tuna|shrimp|turkey)\b/);
      expect(text).not.toContain("mushroom");
    }
    const totals = plan.meals.reduce((a, m) => ({ c: a.c + m.calories, p: a.p + m.protein }), { c: 0, p: 0 });
    expect(totals.p).toBeGreaterThanOrEqual(100);
    expect(totals.c).toBeGreaterThan(1200);
  });

  it("on-hand ingredients bias selection", () => {
    const recipes = recipesLite();
    const plan = generateTemplateMealPlan({ recipes, prefs: DEFAULT_PREFERENCES.nutrition, calorieTarget: 2400, proteinTarget: 150, onHand: ["chicken", "rice"], seed: 3 });
    const hits = plan.meals.filter((m) => m.ingredients.some((i) => /chicken|rice/.test(i))).length;
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  it("getOrGenerateMeals persists one plan per day and marks planned meals eaten", async () => {
    const r1 = await getOrGenerateMeals();
    expect(r1.plan).not.toBeNull();
    expect(r1.source).toBe("template");
    const r2 = await getOrGenerateMeals();
    expect(r2.plan!.id).toBe(r1.plan!.id);
    const today = getProfile().today;
    const meal = r1.plan!.meals[0];
    expect(n.plannedMealEaten(today, meal.index)).toBe(false);
    const before = totalXp();
    const log = n.logNutrition({ date: today, mealType: meal.mealType, name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, source: "plan", plannedMealId: meal.id, recipeId: meal.recipeId ?? null }, { proteinTarget: 999, calorieTarget: 2400, unsafeTargets: false });
    expect(log.xp.some((x) => x.key.startsWith("planned_meal:"))).toBe(true);
    expect(totalXp()).toBe(before + 10);
    expect(n.plannedMealEaten(today, meal.index)).toBe(true);
    const r3 = await getOrGenerateMeals({ force: true });
    expect(r3.generated).toBe(true);
    // One plan row per day (upsert), so the id is stable but the content is regenerated.
    expect(n.getMealPlan(today)!.id).toBe(r3.plan!.id);
    expect(r3.plan!.meals.filter((m) => m.status === "planned").length).toBeGreaterThanOrEqual(2);
  });

  it("cooking rank sees nutrition substats once enough days are logged", () => {
    const today = getProfile().today;
    for (let i = 1; i <= 4; i++) {
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      n.logNutrition({ date: d.toISOString().slice(0, 10), mealType: "dinner", name: "Dinner", calories: 2000, protein: 150 }, { proteinTarget: 140, calorieTarget: 2400, unsafeTargets: false });
    }
    const { assessment } = reconcile();
    const cooking = assessment.domains.find((d) => d.domain === "cooking")!;
    expect(cooking.substats.some((s) => s.key === "protein" || s.name.toLowerCase().includes("protein"))).toBe(true);
  });
});
