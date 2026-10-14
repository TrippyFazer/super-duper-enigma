/**
 * SHOPPING → PANTRY → COOKING LOOP, end to end against the database.
 * The exact beta failures: rice in the pantry still on the list; the planner
 * recommending regular milk to someone who prefers lactose-free.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-loop-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { pantryItems, groceryItems, plannedMeals } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { updateProfile, getProfile } = await import("@/services/profile");
const { seedRecipes } = await import("@/db/seed");
const fw = await import("@/services/foodWeek");
const pantry = await import("@/services/pantry");
const { generateTemplateWeek, snacksFor } = await import("@/planner/weekTemplates");
const { generateTemplateMealPlan, quickAddsFor } = await import("@/planner/mealTemplates");
const { loadRecipes } = await import("@/services/loaders");
const { ingredientInfo } = await import("@/food/families");
const { deriveRules } = await import("@/food/rules");
const { DEFAULT_PREFERENCES } = await import("@/services/preferences");
type FoodRulePref = import("@/services/preferences").FoodRulePref;

const lite = () => loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));
const LACTOSE: FoodRulePref[] = [{ id: "lf", kind: "prefer-substitute", target: "milk", substitute: "lactose-free milk" }];
const clearPantry = () => getDb().delete(pantryItems).run();
const setRules = (foodRules: FoodRulePref[], dietPrefs: string[] = []) => updateProfile({ preferences: { nutrition: { ...DEFAULT_PREFERENCES.nutrition, foodRules, dietPrefs, proteinTarget: 180 } } });

beforeAll(() => {
  getDb();
  updateProfile({ name: "Cook", timezone: "UTC", activeDomains: ["fitness", "cooking"], onboardingCompletedAt: new Date().toISOString() });
  seedRecipes();
  setRules(LACTOSE);
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("pantry stores variants and prevents duplicates", () => {
  it("stores the exact variant and family; egg/eggs and milk/2% milk merge", () => {
    clearPantry();
    const lf = pantry.upsertPantry({ name: "Lactose free milk", qty: 1, unit: "half gallon" });
    expect(lf.name).toBe("lactose-free milk");
    expect(lf.family).toBe("milk");
    expect(lf.variant).toBe("lactose-free milk");
    pantry.upsertPantry({ name: "eggs", qty: 6, unit: "each" });
    pantry.upsertPantry({ name: "egg", qty: 4, unit: "each", add: true });
    const eggs = pantry.listPantry().filter((p) => p.name === "eggs");
    expect(eggs).toHaveLength(1);
    expect(eggs[0].qty).toBe(10);
    pantry.upsertPantry({ name: "milk", level: "some" });
    expect(pantry.findPantryMatch("2% milk").exact?.name).toBe("milk");
    expect(pantry.findPantryMatch("whole milk").exact?.name).toBe("milk");
  });
  it("asks before creating a second rice: jasmine rice exists, user types rice", () => {
    clearPantry();
    pantry.upsertPantry({ name: "Jasmine Rice", level: "lot" });
    const m = pantry.findPantryMatch("rice");
    expect(m.exact).toBeNull();
    expect(m.similar.map((x) => x.name)).toEqual(["jasmine rice"]);
  });
});

describe("full loop: avoid regular milk, prefer lactose-free; rice A lot, eggs Some, chicken 1 lb", () => {
  let weekId = 0;
  it("I'M SHOPPING TODAY → meals favour the pantry, never regular milk; list is the difference", async () => {
    clearPantry();
    setRules(LACTOSE);
    pantry.upsertPantry({ name: "rice", level: "lot" });
    pantry.upsertPantry({ name: "eggs", level: "some" });
    pantry.upsertPantry({ name: "chicken breast", qty: 1, unit: "lb" });
    const p = getProfile();
    const r = await fw.startSupplyRun({ today: p.today, days: 5, budget: 70, usePantry: true, profile: p });
    weekId = r.week.id;
    const wk = fw.getWeekById(weekId)!;
    const meals = wk.days.flatMap((d) => d.meals);
    expect(meals.length).toBeGreaterThan(5);
    // never regular milk, lactose-free when milk is useful
    for (const m of meals) for (const ing of m.ingredientsParsed) expect(ingredientInfo(ing).variant, `${m.name}: ${ing}`).not.toBe("milk");
    const names = wk.items.map((i) => i.name);
    expect(names).not.toContain("milk");
    const rice = wk.items.find((i) => i.name === "rice");
    if (rice) {
      expect(rice.coveredByPantry).toBe(true);
      expect(rice.coverage).toBe("full");
      expect(rice.note).toMatch(/Used in/);
    }
    const chicken = wk.items.find((i) => i.name === "chicken breast");
    if (chicken) {
      // 1 lb = 2.5 servings on hand: only the additional amount is bought
      expect(chicken.onHandServings).toBe(2.5);
      expect(["partial", "full"]).toContain(chicken.coverage);
      if (chicken.coverage === "partial") expect(chicken.qty).toBeLessThan(chicken.requiredServings! / 2.5 + 0.01);
    }
    const eggs = wk.items.find((i) => i.name === "eggs");
    if (eggs) expect(["confirm", "full"]).toContain(eggs.coverage);
    const lf = wk.items.find((i) => i.name === "lactose-free milk");
    if (lf) {
      expect(lf.coverage).toBe("none");
      expect(lf.substitutedFrom).toBe("milk");
    }
  });
  it("quick pantry check: Yes marks eggs as enough; Out puts them on the list", () => {
    const wk = fw.getWeekById(weekId)!;
    const eggs = wk.items.find((i) => i.name === "eggs");
    if (!eggs || eggs.coverage !== "confirm") return;
    const yes = fw.pantryCheck(eggs.id, "yes")!;
    expect(yes.items.find((i) => i.name === "eggs")!.coverage).toBe("full");
    const out = fw.pantryCheck(eggs.id, "out")!;
    const row = out.items.find((i) => i.name === "eggs")!;
    expect(row.coverage).toBe("none");
    expect(row.qty).toBeGreaterThan(0);
  });
  it("shopping completion: purchased rows increase the pantry with the actual quantity, skipped rows do not", () => {
    const wk = fw.getWeekById(weekId)!;
    const toBuy = wk.items.filter((i) => !i.coveredByPantry && i.coverage !== "confirm");
    expect(toBuy.length).toBeGreaterThan(1);
    const [a, b, ...rest] = toBuy;
    fw.updateGroceryItem(a.id, { purchased: true, actualQty: a.qty + 1 });
    fw.updateGroceryItem(b.id, { skipped: true });
    for (const it of rest) fw.updateGroceryItem(it.id, { purchased: true });
    const before = pantry.listPantry({ includeEmpty: true }).find((p) => p.name === a.name);
    fw.finishShopping(weekId, getProfile().today);
    const after = pantry.listPantry().find((p) => p.name === a.name)!;
    expect(after).toBeTruthy();
    expect(after.qty).toBe((before?.qty ?? 0) + a.qty + 1);
    expect(after.source).toBe("grocery");
    expect(pantry.listPantry().find((p) => p.name === b.name && p.source === "grocery")).toBeUndefined();
    expect(fw.getWeekById(weekId)!.status).toBe("shopped");
  });
  it("cooking decreases the pantry by requirement × servings; a double batch takes double", () => {
    pantry.upsertPantry({ name: "chicken breast", qty: 4, unit: "lb" });
    const q = () => pantry.listPantry().find((p) => p.name === "chicken breast")!.qty!;
    const start = q();
    pantry.consumeForRecipe(["chicken breast", "rice", "broccoli"], 1);
    const one = start - q();
    expect(one).toBeCloseTo(0.4, 1); // one serving = 1/2.5 lb
    pantry.consumeForRecipe(["chicken breast", "rice", "broccoli"], 2);
    expect(start - q()).toBeCloseTo(one * 3, 1);
    // a lot of rice stays a lot after a normal cook
    expect(pantry.listPantry().find((p) => p.name === "rice")!.level).toBe("lot");
  });
});

describe("pantry changes reconcile the list without regenerating meals", () => {
  it("PANTRY RICE after the fact: rice moves to Already have, meal ids unchanged", async () => {
    clearPantry();
    setRules(LACTOSE);
    const p = getProfile();
    const r = await fw.startSupplyRun({ today: p.today, days: 4, budget: 60, usePantry: true, profile: p });
    const wk = fw.getWeekById(r.week.id)!;
    const rice = wk.items.find((i) => i.name === "rice");
    if (!rice) return; // seed-dependent; the unit tests cover the pure case
    expect(rice.coveredByPantry).toBe(false);
    const mealIds = wk.days.flatMap((d) => d.meals.map((m) => m.id)).sort();
    pantry.upsertPantry({ name: "rice", level: "lot" });
    const res = fw.onPantryChanged(p.today)!;
    expect(res.weekId).toBe(wk.id);
    expect(res.changes.join(" ")).toMatch(/rice: buy → have/);
    const after = fw.getWeekById(wk.id)!;
    expect(after.items.find((i) => i.name === "rice")!.coveredByPantry).toBe(true);
    expect(after.days.flatMap((d) => d.meals.map((m) => m.id)).sort()).toEqual(mealIds);
    expect(after.summaryParsed.reconciled?.note).toMatch(/rice/);
    // PANTRY PARTIAL RICE: 2 servings on hand → buy only the rest
    pantry.updatePantry(pantry.listPantry().find((x) => x.name === "rice")!.id, { qty: 0.2, unit: "bag" });
    fw.onPantryChanged(p.today);
    const partial = fw.getWeekById(wk.id)!.items.find((i) => i.name === "rice")!;
    if (partial.requiredServings! > 2) {
      expect(partial.coverage).toBe("partial");
      expect(partial.onHandServings).toBe(2);
      expect(partial.note).toMatch(/buy/);
    }
    // incompatible variant: regular milk in the pantry never covers lactose-free milk
    pantry.upsertPantry({ name: "milk", level: "lot" });
    fw.onPantryChanged(p.today);
    const lf = fw.getWeekById(wk.id)!.items.find((i) => i.name === "lactose-free milk");
    if (lf) expect(lf.coveredByPantry).toBe(false);
  });
  it("I already have this / Buy anyway / Replace item", async () => {
    const p = getProfile();
    const wk = fw.relevantWeek(p.today)!;
    const buy = wk.items.find((i) => !i.coveredByPantry && !i.purchased && i.usedIn.length && i.name !== "rice")!;
    const have = fw.setCoverageOverride(buy.id, "manual")!;
    const row = have.items.find((i) => i.id === buy.id)!;
    expect(row.coveredByPantry).toBe(true);
    expect(row.coverage).toBe("manual");
    expect(pantry.listPantry().some((x) => x.name === buy.name)).toBe(true);
    const anyway = fw.setCoverageOverride(buy.id, "stock-up")!;
    expect(anyway.items.find((i) => i.id === buy.id)!.coveredByPantry).toBe(false);
    // replace: the meals that use it are updated, rules are respected
    const chicken = wk.items.find((i) => i.name === "chicken breast");
    if (chicken) {
      const r = fw.replaceGroceryItem(chicken.id, "chicken thighs");
      expect(r.ok).toBe(true);
      const after = fw.getWeekById(wk.id)!;
      expect(after.items.find((i) => i.name === "chicken thighs")?.substitutedFrom).toBe("chicken breast");
      const uses = after.days.flatMap((d) => d.meals).filter((m) => m.ingredientsParsed.some((x) => ingredientInfo(x).variant === "chicken thighs"));
      expect(uses.length).toBeGreaterThan(0);
    }
    // substitution survives grocery → pantry
    const lf = fw.getWeekById(wk.id)!.items.find((i) => i.name === "lactose-free milk");
    if (lf) {
      fw.updateGroceryItem(lf.id, { purchased: true });
      fw.finishShopping(wk.id, p.today);
      const row = pantry.listPantry().find((x) => x.name === "lactose-free milk")!;
      expect(row.variant).toBe("lactose-free milk");
      expect(pantry.listPantry().some((x) => x.name === "milk" && x.source === "grocery")).toBe(false);
    }
  });
  it("Don't recommend: a new rule repairs the pending planned meals in place", async () => {
    clearPantry();
    setRules(LACTOSE);
    const p = getProfile();
    const r = await fw.startSupplyRun({ today: p.today, days: 3, budget: 50, usePantry: false, profile: p });
    const usesCheese = fw.getWeekById(r.week.id)!.days.flatMap((d) => d.meals).filter((m) => m.ingredientsParsed.some((x) => ingredientInfo(x).variant === "cheese"));
    setRules([...LACTOSE, { id: "c", kind: "prefer-substitute", target: "cheese", substitute: "lactose-free cheese" }]);
    const res = fw.applyRulesToWeek(r.week.id);
    expect(res.repaired).toBe(usesCheese.length);
    const after = fw.getWeekById(r.week.id)!;
    for (const m of after.days.flatMap((d) => d.meals)) for (const ing of m.ingredientsParsed) expect(ingredientInfo(ing).variant).not.toBe("cheese");
    if (usesCheese.length) expect(after.items.some((i) => i.name === "lactose-free cheese")).toBe(true);
  });
});

describe("every planner follows the same rules", () => {
  const base = () => ({ weekStart: "2026-10-19", recipes: lite(), prefs: DEFAULT_PREFERENCES.nutrition, week: { quickWeekdays: true, mealPrep: true, highProtein: true, reuseIngredients: true }, mealsNeeded: { breakfast: 7, lunch: 5, dinner: 5, snacks: 2, eatingOut: 2 }, calorieTarget: 2600, proteinTarget: 200, budget: 90, budgetMode: "balanced" as const, pantry: [], seed: 3 });
  it("template week + snacks: lactose-free milk replaces milk; AI-style regular milk never survives", () => {
    const rules = deriveRules({ ...DEFAULT_PREFERENCES.nutrition, foodRules: LACTOSE });
    const w = generateTemplateWeek({ ...base(), rules });
    const all = w.meals.flatMap((m) => m.ingredients);
    expect(all.some((i) => ingredientInfo(i).variant === "milk")).toBe(false);
    const shake = snacksFor(rules).find((s) => s.name === "Protein shake")!;
    expect(shake.ingredients).toEqual(["protein powder", "lactose-free milk"]);
    expect(quickAddsFor(rules).find((s) => s.name === "Protein shake")!.ingredients).toContain("lactose-free milk");
    expect(w.shoppingList.map((i) => i.name)).not.toContain("milk");
  });
  it("hard allergy (shellfish) never appears in template week, day plan or snacks", () => {
    const rules = deriveRules({ ...DEFAULT_PREFERENCES.nutrition, foodRules: [{ id: "s", kind: "allergy", target: "shellfish" }, { id: "p", kind: "allergy", target: "peanut" }] });
    const w = generateTemplateWeek({ ...base(), rules });
    for (const m of w.meals) for (const i of m.ingredients) expect(ingredientInfo(i).tags, `${m.name}: ${i}`).not.toContain("shellfish");
    const day = generateTemplateMealPlan({ recipes: lite(), prefs: { ...DEFAULT_PREFERENCES.nutrition, foodRules: [{ id: "s", kind: "allergy", target: "shellfish" }, { id: "p", kind: "allergy", target: "peanut" }] }, calorieTarget: 2400, proteinTarget: 170, seed: 5 });
    for (const m of day.meals) for (const i of m.ingredients) expect(ingredientInfo(i).tags).not.toContain("peanut");
    expect(snacksFor(rules).some((s) => /peanut/.test(s.name))).toBe(false);
  });
  it("legacy dietPrefs keep working: dairy-free week has no dairy; pescatarian has no meat", () => {
    const df = generateTemplateWeek({ ...base(), prefs: { ...DEFAULT_PREFERENCES.nutrition, dietPrefs: ["dairy-free"] } });
    for (const m of df.meals) for (const i of m.ingredients) expect(ingredientInfo(i).tags, `${m.name}: ${i}`).not.toContain("dairy");
    const pesc = generateTemplateWeek({ ...base(), prefs: { ...DEFAULT_PREFERENCES.nutrition, dietPrefs: ["pescatarian"] } });
    for (const m of pesc.meals) for (const i of m.ingredients) expect(ingredientInfo(i).tags, `${m.name}: ${i}`).not.toContain("meat");
  });
  it("expiring pantry items pull their recipes into the plan", () => {
    const without = generateTemplateWeek({ ...base(), pantry: [{ name: "salmon", servings: 3 }] });
    const withExpiring = generateTemplateWeek({ ...base(), pantry: [{ name: "salmon", servings: 3, expiring: true }] });
    const salmonMeals = (w: typeof without) => w.meals.filter((m) => !m.leftover && m.ingredients.some((i) => ingredientInfo(i).canonical === "salmon")).length;
    expect(salmonMeals(withExpiring)).toBeGreaterThanOrEqual(salmonMeals(without));
    expect(salmonMeals(withExpiring)).toBeGreaterThan(0);
  });
  it("rows and meals are consistent in the database (no boolean-only coverage left behind)", () => {
    const rows = getDb().select().from(groceryItems).all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) if (r.usedIn !== "[]") expect(r.coverage).toBeTruthy();
    const planned = getDb().select().from(plannedMeals).where(eq(plannedMeals.status, "planned")).all();
    expect(planned.length).toBeGreaterThan(0);
  });
});
