import { describe, expect, it } from "vitest";
import { ingredientInfo, pantryCovers, storageName, toServings, toBase } from "@/food/families";
import { deriveRules, resolveIngredientForUser, validateMeal, recipeExcluded } from "@/food/rules";
import { requirementsFromMeals, reconcile, shoppingListFor, parseIngredientRef } from "@/food/reconcile";

const base = { dietPrefs: [] as string[], dislikes: [] as string[], likes: [] as string[] };
const lactose = deriveRules({ ...base, foodRules: [{ id: "1", kind: "prefer-substitute", target: "milk", substitute: "lactose-free milk" }] });

describe("families / variants", () => {
  it("normalises variants into families", () => {
    expect(ingredientInfo("lactose free milk")).toMatchObject({ family: "milk", variant: "lactose-free milk" });
    expect(ingredientInfo("Fairlife 2%")).toMatchObject({ family: "milk", variant: "lactose-free milk" });
    expect(ingredientInfo("2% milk")).toMatchObject({ family: "milk", variant: "milk" });
    expect(ingredientInfo("jasmine rice")).toMatchObject({ family: "rice", variant: "jasmine rice", specific: true });
    expect(ingredientInfo("Rice")).toMatchObject({ family: "rice", variant: "rice", specific: false });
    expect(ingredientInfo("eggs").variant).toBe("eggs");
    expect(ingredientInfo("egg").variant).toBe("eggs");
  });
  it("does not mistake unrelated catalog items for family members", () => {
    expect(ingredientInfo("rice vinegar").family).toBeNull();
    expect(ingredientInfo("coconut milk").family).toBeNull();
    expect(ingredientInfo("peanut butter").family).toBe("peanut butter");
    expect(ingredientInfo("cream cheese").family).toBe("cream cheese");
  });
  it("PANTRY VARIANT: jasmine rice covers rice; INCOMPATIBLE VARIANT: regular milk never covers lactose-free milk", () => {
    expect(pantryCovers("rice", "jasmine rice")).toBe(true);
    expect(pantryCovers("jasmine rice", "rice")).toBe(true);
    expect(pantryCovers("milk", "lactose-free milk")).toBe(true);
    expect(pantryCovers("lactose-free milk", "milk")).toBe(false);
    expect(pantryCovers("lactose-free milk", "2% milk")).toBe(false);
    expect(pantryCovers("gluten-free bread", "bread")).toBe(false);
    expect(pantryCovers("bread", "gluten-free bread")).toBe(true);
    expect(pantryCovers("eggs", "egg")).toBe(true);
    expect(pantryCovers("chicken breast", "rice")).toBe(false);
  });
  it("stores the exact variant, canonical otherwise", () => {
    expect(storageName("lactose free milk")).toBe("lactose-free milk");
    expect(storageName("Jasmine Rice")).toBe("jasmine rice");
    expect(storageName("egg")).toBe("eggs");
    expect(storageName("boneless chicken breasts")).toBe("chicken breast");
  });
  it("converts common purchase and cooking units", () => {
    expect(toBase(1, "lb", "chicken breast")).toBeCloseTo(453.6, 0);
    expect(toBase(2, "cups", "rice")).toBeCloseTo(370, 0);
    expect(toServings(1, "dozen", "eggs")).toBe(6);
    expect(toServings(3, "lb", "chicken breast")).toBe(7.5);
    expect(toServings(16, "oz", "chicken breast")).toBeCloseTo(2.7, 1);
    expect(toServings(1, "bag", "rice")).toBe(10);
    expect(toServings(2, "cups", "milk")).toBe(2);
    expect(toServings(1, "half gallon", "lactose-free milk")).toBeCloseTo(7.9, 0);
    expect(toBase(1, "cup", "chicken breast")).toBeNull();
  });
});

describe("food rules", () => {
  it("LACTOSE-FREE MILK: milk resolves to lactose-free milk; dairy stays allowed", () => {
    const r = resolveIngredientForUser("milk", lactose);
    expect(r).toMatchObject({ status: "substituted", name: "lactose-free milk" });
    expect(resolveIngredientForUser("lactose-free milk", lactose).status).toBe("ok");
    expect(resolveIngredientForUser("greek yogurt", lactose).status).toBe("ok");
    expect(resolveIngredientForUser("cheese", lactose).status).toBe("ok");
  });
  it("protein shake keeps protein powder and uses lactose-free milk", () => {
    const v = validateMeal({ name: "Protein shake", ingredients: ["protein powder", "milk"], calories: 220, protein: 30, carbs: 10, fat: 4 }, lactose);
    expect(v.status).toBe("repaired");
    expect(v.meal.ingredients).toEqual(["protein powder", "lactose-free milk"]);
    expect(v.macrosEstimated).toBe(false);
    expect(v.meal.fat).toBeLessThan(4 + 1);
  });
  it("hard allergy with no substitute rejects the meal", () => {
    const rules = deriveRules({ ...base, foodRules: [{ id: "a", kind: "allergy", target: "shellfish" }] });
    const v = validateMeal({ name: "Garlic shrimp", ingredients: ["shrimp", "garlic", "rice"], calories: 400, protein: 30, carbs: 40, fat: 10 }, rules);
    expect(v.status).toBe("rejected");
    expect(recipeExcluded({ name: "Garlic shrimp", ingredients: ["shrimp", "garlic"] }, rules)).toMatch(/shellfish/);
    expect(recipeExcluded({ name: "Chicken rice", ingredients: ["chicken breast", "rice"] }, rules)).toBeNull();
  });
  it("legacy dietPrefs / dislikes keep working", () => {
    const veg = deriveRules({ dietPrefs: ["vegetarian"], dislikes: ["cilantro"], likes: [] });
    expect(resolveIngredientForUser("chicken breast", veg).status).toBe("forbidden");
    expect(recipeExcluded({ name: "Tacos", ingredients: ["black beans", "cilantro"] }, veg)).toMatch(/dislike/);
    const df = deriveRules({ dietPrefs: ["dairy-free"], dislikes: [], likes: [] });
    expect(resolveIngredientForUser("milk", df)).toMatchObject({ status: "substituted", name: "oat milk" });
    expect(resolveIngredientForUser("cheese", df).name).toBe("vegan cheese");
  });
  it("no pork: bacon and pork chops are out, chicken is fine", () => {
    const rules = deriveRules({ ...base, foodRules: [{ id: "p", kind: "religious", target: "pork" }] });
    expect(resolveIngredientForUser("bacon", rules).status).toBe("forbidden");
    expect(resolveIngredientForUser("pork chops", rules).status).toBe("forbidden");
    expect(resolveIngredientForUser("chicken thighs", rules).status).toBe("ok");
  });
  it("avoid peanuts with a substitute swaps peanut butter for almond butter", () => {
    const rules = deriveRules({ ...base, foodRules: [{ id: "p", kind: "avoid", target: "peanut", substitute: "almond butter" }] });
    expect(resolveIngredientForUser("peanut butter", rules)).toMatchObject({ status: "substituted", name: "almond butter" });
  });
});

describe("requirements → pantry → list", () => {
  const meals = [
    { name: "Chicken rice bowl", ingredients: ["chicken breast", "rice", "broccoli"] },
    { name: "Chicken rice bowl", ingredients: ["chicken breast", "rice", "broccoli"] },
    { name: "Chicken rice bowl", ingredients: ["chicken breast", "rice", "broccoli"] },
    { name: "Fried rice", ingredients: ["rice", "eggs", "soy sauce"] },
    { name: "Leftover Fried rice", ingredients: ["rice", "eggs"], leftover: true },
  ];
  it("parses quantities and sums servings per ingredient", () => {
    expect(parseIngredientRef("2 cups rice")).toEqual({ name: "rice", qty: 2, unit: "cups" });
    expect(parseIngredientRef("3 eggs")).toEqual({ name: "eggs", qty: 3, unit: "each" });
    expect(parseIngredientRef("chicken breast")).toEqual({ name: "chicken breast", qty: null, unit: null });
    const reqs = requirementsFromMeals(meals);
    const rice = reqs.find((r) => r.name === "rice")!;
    expect(rice.servings).toBe(4);
    expect(rice.usedIn).toEqual([{ name: "Chicken rice bowl", count: 3 }, { name: "Fried rice", count: 1 }]);
    expect(reqs.find((r) => r.name === "soy sauce")!.staple).toBe(true);
  });
  it("PANTRY RICE: rice in pantry → not in buy list, under Already have, with why", () => {
    const r = shoppingListFor(meals, [{ name: "rice", qty: 1, unit: "bag", level: "lot" }]);
    const rice = r.items.find((i) => i.name === "rice")!;
    expect(rice.status).toBe("full");
    expect(rice.toBuy).toBe(0);
    expect(rice.why).toMatch(/Used in Chicken rice bowl ×3/);
    expect(r.counts.have).toBe(1);
  });
  it("PANTRY PARTIAL RICE: 2 servings on hand, 4 needed → buy ~2", () => {
    const r = shoppingListFor(meals, [{ name: "rice", qty: 0.2, unit: "bag", level: "some" }]);
    const rice = r.items.find((i) => i.name === "rice")!;
    expect(rice.status).toBe("partial");
    expect(rice.onHand).toBe(2);
    expect(rice.toBuy).toBe(2);
    expect(rice.why).toMatch(/buy/);
  });
  it("quantity difference: chicken 3 lb needed, 1 lb on hand → buy 2 lb; eggs 10 − 6 = 4", () => {
    const m = [{ name: "Big batch", ingredients: ["3 lb chicken breast", "10 eggs"] }];
    const r = shoppingListFor(m, [
      { name: "chicken breast", qty: 1, unit: "lb", level: "some" },
      { name: "eggs", qty: 6, unit: "each", level: "some" },
    ]);
    const ch = r.items.find((i) => i.name === "chicken breast")!;
    expect(ch.status).toBe("partial");
    expect(ch.qty).toBe(2);
    expect(ch.unit).toBe("lb");
    const eggs = r.items.find((i) => i.name === "eggs")!;
    expect(eggs.toBuy).toBe(2); // 4 eggs = 2 servings
    expect(eggs.why).toMatch(/buy 4/);
  });
  it("A lot covers normal demand; Some asks a question; unusually high demand on A lot asks too", () => {
    const some = shoppingListFor(meals, [{ name: "rice", qty: null, unit: "bag", level: "some" }]).items.find((i) => i.name === "rice")!;
    expect(some.status).toBe("confirm");
    expect(some.question).toMatch(/Rice is marked Some. Need ~/);
    const lot = shoppingListFor(meals, [{ name: "rice", qty: null, unit: "bag", level: "lot" }]).items.find((i) => i.name === "rice")!;
    expect(lot.status).toBe("full");
    const heavy = shoppingListFor(Array.from({ length: 30 }, (_, i) => ({ name: `Rice ${i}`, ingredients: ["rice"] })), [{ name: "rice", qty: null, unit: "bag", level: "lot" }]).items[0];
    expect(heavy.status).toBe("confirm");
  });
  it("PANTRY VARIANT: jasmine rice in pantry covers a rice requirement", () => {
    const r = shoppingListFor(meals, [{ name: "jasmine rice", qty: 1, unit: "bag", level: "lot" }]).items.find((i) => i.name === "rice")!;
    expect(r.status).toBe("full");
    expect(r.pantry[0].name).toBe("jasmine rice");
  });
  it("INCOMPATIBLE VARIANT: regular milk gives NO coverage for lactose-free milk; the rules make the list ask for lactose-free milk", () => {
    const r = shoppingListFor([{ name: "Protein shake", ingredients: ["protein powder", "milk"] }], [{ name: "milk", qty: 1, unit: "half gallon", level: "lot" }], lactose);
    expect(r.items.map((i) => i.name)).toContain("lactose-free milk");
    expect(r.items.map((i) => i.name)).not.toContain("milk");
    const lf = r.items.find((i) => i.name === "lactose-free milk")!;
    expect(lf.status).toBe("none");
    expect(lf.substitutedFrom).toBe("milk");
    expect(lf.why).toMatch(/swapped in for milk/);
  });
  it("overrides: I already have this / buy anyway", () => {
    const reqs = requirementsFromMeals(meals);
    const have = reconcile(reqs, [], { overrides: { rice: "manual" } }).items.find((i) => i.name === "rice")!;
    expect(have.status).toBe("full");
    const anyway = reconcile(reqs, [{ name: "rice", qty: 1, unit: "bag", level: "lot" }], { overrides: { rice: "stock-up" } }).items.find((i) => i.name === "rice")!;
    expect(anyway.toBuy).toBe(4);
    expect(anyway.qty).toBeGreaterThan(0);
  });
  it("double batch doubles the requirement", () => {
    const one = requirementsFromMeals([{ name: "Chili", ingredients: ["ground beef", "black beans"] }])[0].servings;
    const two = requirementsFromMeals([{ name: "Chili", ingredients: ["ground beef", "black beans"], servings: 2 }])[0].servings;
    expect(two).toBe(one * 2);
  });
});
