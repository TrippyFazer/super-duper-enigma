import { pantryCovers } from "@/food/families";
import { findIngredient, type GroceryCategory } from "@/food/ingredients";
import { requirementsFromMeals, reconcile, type PantryStock } from "@/food/reconcile";
import { deriveRules, preferenceScore, recipeExcluded, validateMeal, type FoodRules } from "@/food/rules";
import { addDays, type ISODate } from "@/lib/dates";
import type { NutritionPrefs } from "@/services/preferences";
import type { RecipeLite } from "./mealTemplates";

/**
 * Template weekly food plan: a handful of recipes that share ingredients,
 * repeated sensibly across the week, priced from the ingredient catalog and
 * trimmed to the grocery budget. Pantry leftovers reduce the shopping list.
 * Deterministic for a seed so a reload never reshuffles the week.
 */
export interface MealsNeeded {
  breakfast: number;
  lunch: number;
  dinner: number;
  snacks: number;
  eatingOut: number;
}
export interface WeekPrefs {
  quickWeekdays: boolean;
  mealPrep: boolean;
  highProtein: boolean;
  reuseIngredients: boolean;
  notes?: string;
}
export interface PantryOnHand {
  name: string;
  servings: number | null; // null = unknown amount, assume ~2
  /** coarse level when the amount is unknown */
  level?: "none" | "some" | "lot" | null;
  /** use-first signals */
  expiring?: boolean;
  opened?: boolean;
}

/** PantryOnHand → the stock model the reconciliation engine reads. */
export function pantryStock(p: PantryOnHand): PantryStock {
  return { name: p.name, qty: p.servings, unit: "servings", level: p.level ?? (p.servings == null ? "some" : null) };
}
export interface WeekMeal {
  date: ISODate;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  recipeId: number | null;
  prepMinutes: number;
  /** leftover of an earlier cook (no new ingredients) */
  leftover?: boolean;
  notes?: string;
}
export interface ShoppingItem {
  name: string;
  category: GroceryCategory;
  qty: number;
  unit: string;
  estPrice: number | null;
  usedIn: string[];
  coveredByPantry: boolean;
  note?: string;
  /** reconciliation detail (servings) */
  requiredServings?: number;
  onHandServings?: number;
  coverage?: "full" | "partial" | "none" | "confirm";
  substitutedFrom?: string | null;
  usedInCounts?: { name: string; count: number }[];
  why?: string;
}
export interface PrepItem {
  name: string;
  servings: number;
  minutes: number;
  supports: string[];
}
export interface GeneratedWeek {
  weekStart: ISODate;
  meals: WeekMeal[];
  shoppingList: ShoppingItem[];
  prepPlan: PrepItem[];
  prepMinutes: number;
  estimatedCost: number;
  reusePct: number;
  staplesAssumed: string[];
  rationale: string;
  distinctRecipes: number;
}

export interface GenerateWeekInput {
  weekStart: ISODate;
  recipes: RecipeLite[];
  prefs: NutritionPrefs;
  week: WeekPrefs;
  mealsNeeded: MealsNeeded;
  calorieTarget: number;
  proteinTarget: number;
  budget: number;
  budgetMode: "budget" | "balanced" | "flexible";
  pantry: PantryOnHand[];
  seed?: number;
  recentRecipeIds?: number[];
  /** Number of days the plan covers (default 7). A supply run may cover 3–5 days from today. */
  days?: number;
  /** derived from prefs when absent */
  rules?: FoodRules;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** One rules engine for every planner: hard rules exclude, dislikes exclude, substitutions apply to the chosen meals. */
function excluded(r: RecipeLite, rules: FoodRules): boolean {
  return recipeExcluded(r, rules) != null;
}

/** Catalog-priced marginal cost of a recipe's *new* ingredients given what is already in the basket. */
function marginalCost(r: RecipeLite, basket: Set<string>, pantry: PantryOnHand[]): number {
  let cost = 0;
  for (const ing of r.ingredients) {
    const def = findIngredient(ing);
    if (!def || def.staple) continue;
    const name = def.name;
    if (basket.has(name)) continue;
    if (onHandServings(ing, pantry) >= 2) continue;
    cost += def.price;
  }
  return cost;
}

/** Servings of an ingredient the pantry can cover (compatible variants only). */
function onHandServings(ing: string, pantry: PantryOnHand[]): number {
  let n = 0;
  for (const p of pantry) if (p.level !== "none" && pantryCovers(ing, p.name)) n += p.servings ?? (p.level === "lot" ? 6 : 2);
  return n;
}

const PREP_MINUTES: Record<string, number> = { "chicken breast": 25, "chicken thighs": 30, "ground beef": 20, "ground turkey": 20, salmon: 20, rice: 20, quinoa: 20, potatoes: 35, "sweet potato": 35, broccoli: 20, "bell pepper": 15, eggs: 15, oats: 5, pasta: 15, lentils: 25, chickpeas: 10, "black beans": 10, tofu: 20 };

export function generateTemplateWeek(input: GenerateWeekInput): GeneratedWeek {
  const rand = rng(input.seed ?? 1);
  const rules = input.rules ?? deriveRules(input.prefs);
  const pantry = input.pantry.filter((p) => p.level !== "none");
  const recent = new Set(input.recentRecipeIds ?? []);
  // Substitutions apply to the catalog before selection, so a swapped ingredient is what gets scored and bought.
  const pool = input.recipes
    .filter((r) => r.calories != null && r.proteinG != null && !excluded(r, rules))
    .map((r) => {
      const v = validateMeal({ name: r.name, ingredients: r.ingredients, calories: r.calories!, protein: r.proteinG!, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0 }, rules);
      return v.status === "repaired" ? { ...r, ingredients: v.meal.ingredients, calories: v.meal.calories, proteinG: v.meal.protein, carbsG: v.meal.carbs, fatG: v.meal.fat } : r;
    });
  const byType = (t: string) => pool.filter((r) => r.mealType === t || r.mealType === "any");

  const basket = new Set<string>(); // canonical ingredient names already planned
  const chosen: { recipe: RecipeLite; times: number; slot: "breakfast" | "lunch" | "dinner" }[] = [];
  const canonicalName = (i: string) => findIngredient(i)?.name ?? i.toLowerCase();

  const score = (r: RecipeLite, slot: string, dinnerTime: boolean) => {
    let s = rand() * 6;
    if (r.isFavorite) s += 6;
    if (recent.has(r.id)) s -= 6;
    const density = ((r.proteinG ?? 0) / Math.max(1, r.calories ?? 1)) * 100;
    s += Math.min(12, density * (input.week.highProtein ? 1.2 : 0.8));
    const minutes = r.prepTimeMin + r.cookTimeMin;
    if (input.week.quickWeekdays && slot !== "dinner") s += minutes <= 15 ? 4 : minutes <= 30 ? 1 : -4;
    if (slot === "dinner" && dinnerTime) s += minutes <= input.prefs.maxPrepMin ? 2 : -3;
    s += preferenceScore(r, rules);
    // Reuse: overlap with basket and pantry. PANTRY-FIRST: what you have, what is expiring, what is open.
    const overlap = r.ingredients.filter((i) => basket.has(canonicalName(i))).length;
    const onHand = r.ingredients.filter((i) => onHandServings(i, pantry) > 0).length;
    const urgent = r.ingredients.filter((i) => pantry.some((p) => (p.expiring || p.opened) && pantryCovers(i, p.name))).length;
    s += onHand * 2.5 + urgent * 4;
    if (input.week.reuseIngredients) s += overlap * 3;
    // Cost pressure
    const cost = marginalCost(r, basket, pantry);
    const perMeal = input.budget / Math.max(6, input.mealsNeeded.breakfast + input.mealsNeeded.lunch + input.mealsNeeded.dinner);
    const costFactor = input.budgetMode === "budget" ? 1.6 : input.budgetMode === "balanced" ? 1.0 : 0.5;
    s -= Math.max(0, cost - perMeal * 2) * 0.35 * costFactor;
    // Wide ingredient lists are the enemy of low waste
    s -= Math.max(0, r.ingredients.filter((i) => !findIngredient(i)?.staple).length - 7) * 1.5;
    return s;
  };

  const take = (slot: "breakfast" | "lunch" | "dinner", count: number, repeats: number) => {
    const need = Math.max(0, count);
    let placed = 0;
    let guard = 0;
    while (placed < need && guard++ < 10) {
      const cands = byType(slot)
        .filter((r) => !chosen.some((c) => c.recipe.id === r.id))
        .map((r) => ({ r, s: score(r, slot, true) }))
        .sort((a, b) => b.s - a.s);
      const best = cands[0]?.r;
      if (!best) break;
      const times = Math.min(repeats, need - placed);
      chosen.push({ recipe: best, times, slot });
      for (const i of best.ingredients) basket.add(canonicalName(i));
      placed += times;
    }
  };

  // Dinners: with meal prep, 2–3 recipes repeated; otherwise more variety.
  const dinnerRepeat = input.week.mealPrep ? 3 : 2;
  take("dinner", input.mealsNeeded.dinner, dinnerRepeat);
  // Lunches: leftovers from dinners cover part of them when meal prep is on.
  const leftoverLunches = input.week.mealPrep ? Math.min(input.mealsNeeded.lunch, Math.floor(input.mealsNeeded.dinner / 2)) : 0;
  take("lunch", input.mealsNeeded.lunch - leftoverLunches, 3);
  take("breakfast", input.mealsNeeded.breakfast, 4);

  // --- Budget trim: while over budget, swap the recipe with the highest marginal cost
  // (any slot) for the cheapest alternative in that slot; stop when nothing cheaper exists.
  const buildList = () => shoppingListFor(chosen, pantry, input, rules);
  let list = buildList();
  const ceiling = input.budget * (input.budgetMode === "flexible" ? 1.25 : input.budgetMode === "balanced" ? 1.08 : 1.0);
  let guard = 0;
  while (list.total > ceiling && guard++ < 12) {
    const ranked = chosen.map((c) => ({ c, cost: marginalCost(c.recipe, new Set(), pantry) * c.times })).sort((a, b) => b.cost - a.cost);
    let swapped = false;
    for (const { c } of ranked) {
      const basketWithout = new Set<string>();
      for (const o of chosen) if (o !== c) for (const i of o.recipe.ingredients) basketWithout.add(canonicalName(i));
      const curCost = marginalCost(c.recipe, basketWithout, pantry);
      const alt = byType(c.slot)
        .filter((r) => !chosen.some((o) => o.recipe.id === r.id))
        .map((r) => ({ r, cost: marginalCost(r, basketWithout, pantry) }))
        .filter((x) => x.cost < curCost - 0.5)
        .sort((a, b) => a.cost - b.cost)[0];
      if (!alt) continue;
      c.recipe = alt.r;
      swapped = true;
      break;
    }
    if (!swapped) break;
    list = buildList();
  }

  // --- Schedule across the week (Mon..Sun), eating-out days get no dinner planned.
  const nDays = Math.max(1, Math.min(14, input.days ?? 7));
  const days = Array.from({ length: nDays }, (_, i) => addDays(input.weekStart, i));
  const meals: WeekMeal[] = [];
  const toMeal = (r: RecipeLite, date: ISODate, mealType: WeekMeal["mealType"], leftover = false): WeekMeal => ({ date, mealType, name: leftover ? `Leftover ${r.name}` : r.name, calories: r.calories!, protein: r.proteinG!, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0, ingredients: r.ingredients, recipeId: r.id, prepMinutes: leftover ? 3 : r.prepTimeMin + r.cookTimeMin, leftover });
  const expand = (slot: "breakfast" | "lunch" | "dinner") => chosen.filter((c) => c.slot === slot).flatMap((c) => Array(c.times).fill(c.recipe) as RecipeLite[]);
  const dinnerSeq = expand("dinner");
  const breakfastSeq = expand("breakfast");
  const lunchSeq = expand("lunch");
  // eating out: skip the last N dinner days (weekend first), typical for Fri/Sat.
  const eatOutDays = new Set<ISODate>();
  // Eating-out days are placed on Fri/Sat first (when the plan covers them), then the last days of the plan.
  const eatOut = Math.min(nDays, input.mealsNeeded.eatingOut);
  const weekendFirst = [...days].sort((a, b) => Number(/5|6/.test(String(new Date(b + "T00:00:00Z").getUTCDay()))) - Number(/5|6/.test(String(new Date(a + "T00:00:00Z").getUTCDay()))) || (b > a ? 1 : -1));
  for (let i = 0; i < eatOut; i++) eatOutDays.add(weekendFirst[i]);
  let d = 0;
  for (const day of days) {
    if (breakfastSeq.length) meals.push(toMeal(breakfastSeq[d % breakfastSeq.length], day, "breakfast"));
    d++;
  }
  // dinners in order so leftovers can feed the next day's lunch
  let di = 0;
  const dinnerByDay = new Map<ISODate, RecipeLite>();
  for (const day of days) {
    if (eatOutDays.has(day) || di >= dinnerSeq.length) continue;
    const r = dinnerSeq[di++];
    dinnerByDay.set(day, r);
    meals.push(toMeal(r, day, "dinner"));
  }
  let li = 0;
  let leftoversLeft = leftoverLunches;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (meals.filter((m) => m.mealType === "lunch").length >= input.mealsNeeded.lunch) break;
    const prevDinner = i > 0 ? dinnerByDay.get(days[i - 1]) : undefined;
    if (leftoversLeft > 0 && prevDinner) {
      meals.push(toMeal(prevDinner, day, "lunch", true));
      leftoversLeft--;
    } else if (li < lunchSeq.length) {
      meals.push(toMeal(lunchSeq[li++ % lunchSeq.length], day, "lunch"));
    } else if (lunchSeq.length) {
      meals.push(toMeal(lunchSeq[li++ % lunchSeq.length], day, "lunch"));
    }
  }
  // Snacks to approach protein target on planned days (template protein snacks).
  const SNACKS = snacksFor(rules);
  let snackIdx = 0;
  for (const day of days) {
    const dayMeals = meals.filter((m) => m.date === day);
    if (!dayMeals.length) continue;
    let protein = dayMeals.reduce((a, m) => a + m.protein, 0);
    let cal = dayMeals.reduce((a, m) => a + m.calories, 0);
    let added = 0;
    while (added < Math.max(0, input.mealsNeeded.snacks) && (protein < input.proteinTarget - 20 || cal < input.calorieTarget - 400) && SNACKS.length) {
      const s = SNACKS[snackIdx++ % SNACKS.length];
      if (cal + s.calories > input.calorieTarget + 150) break;
      meals.push({ date: day, mealType: "snack", name: s.name, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat, ingredients: s.ingredients, recipeId: null, prepMinutes: 2 });
      protein += s.protein;
      cal += s.calories;
      added++;
    }
  }

  // Final list including snacks (ingredient demand from the actual schedule, not just chosen recipes).
  const finalList = shoppingListFromMeals(meals, pantry, input, rules);

  // --- Prep plan from repeated proteins/grains/veg in dinners+lunches.
  const prepPlan = buildPrepPlan(meals.filter((m) => !m.leftover && (m.mealType === "dinner" || m.mealType === "lunch")));

  const distinct = new Set(meals.filter((m) => !m.leftover && m.mealType !== "snack").map((m) => m.name)).size;
  return {
    weekStart: input.weekStart,
    meals,
    shoppingList: finalList.items,
    prepPlan: prepPlan.items,
    prepMinutes: prepPlan.minutes,
    estimatedCost: Math.round(finalList.total * 100) / 100,
    reusePct: finalList.reusePct,
    staplesAssumed: finalList.staples,
    rationale: `${distinct} recipes cover ${meals.filter((m) => m.mealType !== "snack").length} meals${leftoverLunches ? `, ${leftoverLunches} lunches are leftovers` : ""}; ${finalList.reusePct}% of ingredients are used in more than one meal${finalList.covered ? `; ${finalList.covered} item${finalList.covered === 1 ? "" : "s"} skipped because you still have them` : ""}. Prices are estimates — enter actual prices after shopping.`,
    distinctRecipes: distinct,
  };
}

/** The template snack library, passed through the same rules as everything else (dairy-free → no yogurt; lactose-free → lactose-free milk in the shake). */
export function snacksFor(rules: FoodRules): { name: string; calories: number; protein: number; carbs: number; fat: number; ingredients: string[] }[] {
  const base = [
    { name: "Greek yogurt + berries", calories: 180, protein: 18, carbs: 20, fat: 3, ingredients: ["greek yogurt", "berries"] },
    { name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4, ingredients: ["protein powder", "milk"] },
    { name: "Cottage cheese + fruit", calories: 240, protein: 24, carbs: 20, fat: 6, ingredients: ["cottage cheese", "fruit"] },
    { name: "Apple + peanut butter", calories: 280, protein: 8, carbs: 32, fat: 16, ingredients: ["apple", "peanut butter"] },
    { name: "Two hard-boiled eggs", calories: 156, protein: 12, carbs: 1, fat: 10, ingredients: ["eggs"] },
  ];
  const out: typeof base = [];
  for (const sn of base) {
    if (recipeExcluded(sn, rules)) continue;
    const v = validateMeal(sn, rules);
    if (v.status === "rejected") continue;
    out.push(v.meal);
  }
  return out;
}

function shoppingListFor(chosen: { recipe: RecipeLite; times: number }[], pantry: PantryOnHand[], input: GenerateWeekInput, rules?: FoodRules) {
  const meals: WeekMeal[] = chosen.flatMap((c) => Array.from({ length: c.times }, () => ({ date: input.weekStart, mealType: "dinner" as const, name: c.recipe.name, calories: 0, protein: 0, carbs: 0, fat: 0, ingredients: c.recipe.ingredients, recipeId: c.recipe.id, prepMinutes: 0 })));
  return shoppingListFromMeals(meals, pantry, input, rules);
}

/**
 * Planned meals → requirements → pantry coverage → list. Quantity-aware: an
 * item is "covered" only when compatible pantry stock meets the servings the
 * plan needs; otherwise the list carries the difference.
 */
export function shoppingListFromMeals(meals: WeekMeal[], pantry: PantryOnHand[], input: Pick<GenerateWeekInput, "budgetMode">, rules?: FoodRules | null): { items: ShoppingItem[]; total: number; reusePct: number; staples: string[]; covered: number } {
  void input;
  const reqs = requirementsFromMeals(meals.map((m) => ({ name: m.name, ingredients: m.ingredients, leftover: m.leftover })), rules);
  const r = reconcile(reqs, pantry.map(pantryStock));
  const reused = reqs.filter((q) => q.usedIn.length >= 2).length;
  const items: ShoppingItem[] = r.items.map((c) => ({
    name: c.name,
    category: c.category,
    qty: c.qty,
    unit: c.unit,
    estPrice: c.estPrice,
    usedIn: c.usedIn.map((u) => u.name),
    coveredByPantry: c.status === "full",
    note: c.status === "full" ? `You still have enough for ~${Math.round(c.onHand)} servings` : c.status === "partial" ? `Reduced — you have ~${Math.round(c.onHand)} servings` : c.status === "confirm" ? "Check your pantry" : undefined,
    requiredServings: c.required,
    onHandServings: c.onHand,
    coverage: c.status,
    substitutedFrom: c.substitutedFrom,
    usedInCounts: c.usedIn,
    why: c.why,
  }));
  return { items, total: r.total, reusePct: reqs.length ? Math.round((reused / reqs.length) * 100) : 0, staples: r.staples, covered: r.counts.have };
}

export function buildPrepPlan(meals: WeekMeal[]): { items: PrepItem[]; minutes: number } {
  const agg = new Map<string, { servings: number; supports: Set<string> }>();
  for (const m of meals) {
    for (const ing of m.ingredients) {
      const def = findIngredient(ing);
      if (!def || !(def.name in PREP_MINUTES)) continue;
      const cur = agg.get(def.name) ?? { servings: 0, supports: new Set<string>() };
      cur.servings += 1;
      cur.supports.add(m.name);
      agg.set(def.name, cur);
    }
  }
  const items: PrepItem[] = [...agg.entries()]
    .filter(([, v]) => v.servings >= 2)
    .map(([name, v]) => ({ name: prepLabel(name), servings: v.servings, minutes: PREP_MINUTES[name], supports: [...v.supports] }))
    .sort((a, b) => b.servings - a.servings)
    .slice(0, 6);
  // Parallel cooking: total ≈ longest + 40% of the rest.
  const sorted = items.map((i) => i.minutes).sort((a, b) => b - a);
  const minutes = sorted.length ? Math.round(sorted[0] + sorted.slice(1).reduce((a, b) => a + b, 0) * 0.4) : 0;
  return { items, minutes };
}

function prepLabel(name: string): string {
  if (/chicken/.test(name)) return "Cook chicken";
  if (name === "rice" || name === "quinoa" || name === "pasta" || name === "lentils") return `Cook ${name}`;
  if (name === "potatoes" || name === "sweet potato" || name === "broccoli" || name === "bell pepper") return `Roast ${name}`;
  if (name === "eggs") return "Hard-boil eggs";
  if (/beef|turkey/.test(name)) return `Brown ${name}`;
  if (name === "oats") return "Overnight oats jars";
  if (name === "salmon") return "Bake salmon";
  if (name === "tofu") return "Press & bake tofu";
  return `Prep ${name}`;
}
