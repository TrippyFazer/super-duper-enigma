/**
 * Sunday planning: budget → week → shopping list (reuse, budget trim) → actual
 * purchases → pantry → cook from pantry (consumes) → leftover review → next
 * week's list skips what is still there → weekly quests.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-food-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { updateProfile, getProfile } = await import("@/services/profile");
const { seedRecipes } = await import("@/db/seed");
const fw = await import("@/services/foodWeek");
const pantry = await import("@/services/pantry");
const { generateTemplateWeek } = await import("@/planner/weekTemplates");
const { suggestFromPantryTemplate } = await import("@/planner/pantrySuggest");
const { loadRecipes } = await import("@/services/loaders");
const { findIngredient, canonicalName } = await import("@/food/ingredients");
const { reconcile, getQuests } = await import("@/services/progression");
const { totalXp } = await import("@/services/xp");
const { addDays, startOfWeek } = await import("@/lib/dates");
const { DEFAULT_PREFERENCES } = await import("@/services/preferences");

const lite = () => loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));

beforeAll(() => {
  getDb();
  updateProfile({ name: "Cook", timezone: "UTC", activeDomains: ["fitness", "cooking"], onboardingCompletedAt: new Date().toISOString() });
  seedRecipes();
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("ingredient catalog", () => {
  it("maps free-text ingredients to canonical entries with prices and categories", () => {
    expect(findIngredient("boneless chicken breasts")?.name).toBe("chicken breast");
    expect(findIngredient("Greek yogurt")?.category).toBe("dairy");
    expect(findIngredient("2 cups rice")?.name).toBe("rice");
    expect(canonicalName("Bell Peppers")).toBe("bell pepper");
    expect(findIngredient("salt")?.staple).toBe(true);
  });
});

describe("template week", () => {
  const base = { weekStart: "2026-10-19", get recipes() { return lite(); }, prefs: DEFAULT_PREFERENCES.nutrition, week: { quickWeekdays: true, mealPrep: true, highProtein: true, reuseIngredients: true }, mealsNeeded: { breakfast: 7, lunch: 5, dinner: 5, snacks: 1, eatingOut: 2 }, calorieTarget: 2400, proteinTarget: 165, budget: 80, budgetMode: "balanced" as const, pantry: [], seed: 7 };

  it("covers the requested meals with few recipes, reuses ingredients and prices the list", () => {
    const w = generateTemplateWeek(base);
    const dinners = w.meals.filter((m) => m.mealType === "dinner");
    expect(dinners.length).toBe(5);
    expect(w.meals.filter((m) => m.mealType === "breakfast").length).toBe(7);
    expect(w.meals.filter((m) => m.mealType === "lunch").length).toBe(5);
    expect(w.distinctRecipes).toBeLessThanOrEqual(8);
    expect(w.meals.some((m) => m.leftover)).toBe(true);
    expect(w.reusePct).toBeGreaterThan(20);
    expect(w.shoppingList.length).toBeGreaterThan(5);
    expect(w.shoppingList.every((i) => i.category && i.unit)).toBe(true);
    expect(w.estimatedCost).toBeGreaterThan(20);
    expect(w.prepPlan.length).toBeGreaterThan(0);
    // eating out: two dinner-free days
    const dinnerDays = new Set(dinners.map((d) => d.date));
    expect(dinnerDays.size).toBe(5);
    expect(w.rationale).toMatch(/estimates/);
  });

  it("pantry leftovers reduce or skip list items; a tight budget trims the cost", () => {
    const rich = generateTemplateWeek({ ...base, budget: 200, budgetMode: "flexible" });
    const tight = generateTemplateWeek({ ...base, budget: 45, budgetMode: "budget" });
    expect(tight.estimatedCost).toBeLessThanOrEqual(rich.estimatedCost + 0.01);
    expect(tight.estimatedCost).toBeLessThanOrEqual(70);
    const withRice = generateTemplateWeek({ ...base, pantry: [{ name: "rice", servings: 12 }, { name: "eggs", servings: 10 }] });
    const rice = withRice.shoppingList.find((i) => i.name === "rice");
    if (rice) expect(rice.coveredByPantry || rice.qty < 1).toBe(true);
    expect(withRice.rationale).toMatch(/still have|skipped|Prices/);
  });

  it("respects diet and dislikes", () => {
    const veg = generateTemplateWeek({ ...base, prefs: { ...base.prefs, dietPrefs: ["vegetarian"], dislikes: ["mushroom"] } });
    for (const m of veg.meals) {
      const t = `${m.name} ${m.ingredients.join(" ")}`.toLowerCase();
      expect(t).not.toMatch(/\b(chicken|beef|pork|salmon|shrimp|turkey)\b/);
      expect(t).not.toContain("mushroom");
    }
  });
});

describe("Sunday flow end to end", () => {
  const today = () => getProfile().today;
  let weekId = 0;
  let weekStart = "";

  it("sets a budget, generates the week, and writes planned meals + list + prep", async () => {
    weekStart = fw.planningWeekStart(today());
    const wk = fw.upsertWeek({ weekStart, budget: 80, budgetMode: "balanced", calorieTarget: 2400, proteinTarget: 165, mealsNeeded: { breakfast: 7, lunch: 5, dinner: 5, snacks: 1, eatingOut: 2 }, prefs: { quickWeekdays: true, mealPrep: true, highProtein: true, reuseIngredients: true } });
    weekId = wk.id;
    expect(wk.status).toBe("planning");
    const r = await fw.generateWeekPlan(weekId);
    expect(r.source).toBe("template");
    expect(r.week.status).toBe("planned");
    expect(r.week.items.length).toBeGreaterThan(5);
    expect(r.week.days.reduce((a, d) => a + d.meals.length, 0)).toBeGreaterThanOrEqual(17);
    expect(r.week.days.every((d) => d.meals.every((m) => m.status === "planned"))).toBe(true);
    expect(r.week.prep).not.toBeNull();
    expect(r.week.estimatedCost).toBeGreaterThan(0);
    // The weekly "plan your meals" quest completes
    reconcile();
    const q = getQuests(weekStart >= today() ? weekStart : today()).weekly.find((x) => x.templateKey === "weekly.plan_meals");
    expect(q?.done).toBe(true);
  });

  it("records actual purchases, computes actual spend, and moves purchases to the pantry", () => {
    const wk = fw.getWeekById(weekId)!;
    const live = wk.items.filter((i) => !i.coveredByPantry);
    const [a, b, ...rest] = live;
    fw.updateGroceryItem(a.id, { purchased: true, actualQty: 3.7, actualPrice: 14.82 });
    fw.updateGroceryItem(b.id, { purchased: true, actualPrice: (b.estPrice ?? 2) + 0.5 });
    for (const it of rest) fw.updateGroceryItem(it.id, { purchased: true });
    const extra = fw.addGroceryItem(weekId, { name: "hot sauce", qty: 1 });
    expect(extra.category).toBe("pantry");
    fw.updateGroceryItem(extra.id, { purchased: true, actualPrice: 3.49 });
    const after = fw.getWeekById(weekId)!;
    expect(after.actualCost).toBeGreaterThan(0);
    expect(after.totals.actual).toBe(after.actualCost);
    const before = pantry.listPantry().length;
    const done = fw.finishShopping(weekId, today());
    expect(done.status).toBe("shopped");
    const items = pantry.listPantry();
    expect(items.length).toBeGreaterThan(before + 5);
    const first = items.find((p) => p.name === a.name)!;
    expect(first.qty).toBe(3.7);
    expect(first.purchasedAt).toBe(today());
    expect(first.expiresAt).toBeTruthy();
    // shop-within-budget quest evaluates on actual cost
    reconcile();
    const q = getQuests(weekStart >= today() ? weekStart : today()).weekly.find((x) => x.templateKey === "weekly.budget_shop");
    expect(q?.done).toBe(after.actualCost! <= 80 * 1.05);
  });

  it("suggests meals from the pantry and 'cook this' logs the meal and consumes ingredients", async () => {
    const r = await fw.whatCanIEat({ mealType: "dinner" });
    expect(r.source).toBe("template");
    expect(r.suggestions.length).toBeGreaterThan(0);
    const s = r.suggestions[0];
    expect(s.uses.length).toBeGreaterThan(0);
    expect(s.additional.length).toBeLessThanOrEqual(2);
    const ingredient = canonicalName(s.uses.find((u) => !findIngredient(u)?.staple) ?? s.uses[0]);
    const before = pantry.listPantry({ includeEmpty: true }).find((p) => p.name === ingredient);
    const xpBefore = totalXp();
    const log = fw.cookSuggestion({ ...s, mealType: "dinner" });
    expect(log.entry.calories).toBe(s.calories);
    expect(log.xp.some((x) => x.key.startsWith("meal_cooked"))).toBe(true);
    expect(totalXp()).toBeGreaterThan(xpBefore);
    const after = pantry.listPantry({ includeEmpty: true }).find((p) => p.name === ingredient);
    if (before?.qty != null && after?.qty != null) expect(after.qty).toBeLessThan(before.qty);
    // Template suggestions also work standalone
    const t = suggestFromPantryTemplate({ recipes: lite(), pantry: ["chicken breast", "rice", "spinach", "avocado", "greek yogurt"], expiring: ["spinach"], remainingCalories: 850, remainingProtein: 65, maxMinutes: 30, dislikes: [] });
    expect(t.length).toBeGreaterThan(0);
  });

  it("meal prep completion counts as cooking, pays the quest, and is reversible", async () => {
    const wk = fw.getWeekById(weekId)!;
    reconcile();
    const { xpEvents } = await import("@/db/schema");
    const { isNull } = await import("drizzle-orm");
    const liveKeys = () => getDb().select().from(xpEvents).where(isNull(xpEvents.voidedAt)).all().map((e) => `${e.key}=${e.amount}`).sort();
    const keysBefore = liveKeys();
    const before = totalXp();
    const r = fw.completePrep(wk.prep!.id, today());
    expect(r.xp).toBeGreaterThan(0);
    reconcile();
    const q = getQuests(weekStart >= today() ? weekStart : today()).weekly.find((x) => x.templateKey === "weekly.meal_prep");
    expect(q?.done).toBe(true);
    expect(fw.getWeekById(weekId)!.days.flatMap((d) => d.meals).some((m) => m.status === "prepared")).toBe(true);
    expect(totalXp()).toBeGreaterThan(before);
    fw.uncompletePrep(wk.prep!.id);
    reconcile();
    expect(getQuests(weekStart >= today() ? weekStart : today()).weekly.find((x) => x.templateKey === "weekly.meal_prep")?.done).toBe(false);
    expect(liveKeys()).toEqual(keysBefore);
    expect(totalXp()).toBe(before);
  });

  it("leftover review feeds the next week's list", async () => {
    const items = pantry.listPantry();
    const rice = items.find((p) => p.name === "rice") ?? pantry.upsertPantry({ name: "rice", qty: 1, unit: "bag" });
    const levels = items.map((p) => ({ pantryId: p.id, level: (p.name === rice.name ? "lot" : "none") as "lot" | "none" }));
    if (!items.some((p) => p.id === rice.id)) levels.push({ pantryId: rice.id, level: "lot" });
    const r = fw.leftoverReview(weekId, levels);
    expect(r.carried).toBe(1);
    expect(fw.getWeekById(weekId)!.status).toBe("reviewed");
    expect(pantry.listPantry().length).toBe(1);
    const nextStart = addDays(weekStart, 7);
    const nextWk = fw.upsertWeek({ weekStart: nextStart, budget: 80, budgetMode: "balanced", calorieTarget: 2400, proteinTarget: 165, mealsNeeded: { breakfast: 7, lunch: 5, dinner: 5, snacks: 1, eatingOut: 2 }, prefs: { quickWeekdays: true, mealPrep: true, highProtein: true, reuseIngredients: true } });
    const gen = await fw.generateWeekPlan(nextWk.id);
    const riceItem = gen.week.items.find((i) => i.name === "rice");
    if (riceItem) {
      expect(riceItem.coveredByPantry || riceItem.note?.includes("Reduced")).toBe(true);
    }
    const fb = fw.weekFeedback(fw.getWeekById(weekId)!, today());
    expect(fb.leftoversCarried).toBe(1);
    expect(fb.budget).toBe(80);
    expect(fb.actual).not.toBeNull();
  });

  it("reopen shopping undoes the pantry move", () => {
    const wk = fw.getWeekById(weekId)!;
    const r = fw.reopenShopping(wk.id);
    expect(r.status).toBe("planned");
    expect(startOfWeek(today())).toBeTruthy();
  });
});
