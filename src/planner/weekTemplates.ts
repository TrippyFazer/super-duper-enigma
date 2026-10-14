import { CATEGORY_LABEL, canonicalName, findIngredient, type GroceryCategory } from "@/food/ingredients";
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
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const MEAT = /\b(chicken|beef|pork|turkey|steak|bacon|ham|lamb|sausage)\b/;
const FISH = /\b(salmon|tuna|shrimp|fish|cod)\b/;
function excluded(r: RecipeLite, prefs: NutritionPrefs): boolean {
  const text = `${r.name} ${r.ingredients.join(" ")}`.toLowerCase();
  for (const d of prefs.dislikes) if (d && text.includes(d.toLowerCase())) return true;
  if (prefs.dietPrefs.includes("vegetarian") && (MEAT.test(text) || FISH.test(text))) return true;
  if (prefs.dietPrefs.includes("pescatarian") && MEAT.test(text)) return true;
  if (prefs.dietPrefs.includes("dairy-free") && /\b(cheese|milk|yogurt|butter|cream|feta|parmesan)\b/.test(text)) return true;
  if (prefs.dietPrefs.includes("gluten-free") && /\b(bread|pasta|tortilla|flour|bagel|couscous)\b/.test(text)) return true;
  return false;
}

/** Catalog-priced marginal cost of a recipe's *new* ingredients given what is already in the basket. */
function marginalCost(r: RecipeLite, basket: Set<string>, pantry: Map<string, number>): number {
  let cost = 0;
  for (const ing of r.ingredients) {
    const def = findIngredient(ing);
    if (!def || def.staple) continue;
    const name = def.name;
    if (basket.has(name)) continue;
    if ((pantry.get(name) ?? 0) >= 2) continue;
    cost += def.price;
  }
  return cost;
}

const PREP_MINUTES: Record<string, number> = { "chicken breast": 25, "chicken thighs": 30, "ground beef": 20, "ground turkey": 20, salmon: 20, rice: 20, quinoa: 20, potatoes: 35, "sweet potato": 35, broccoli: 20, "bell pepper": 15, eggs: 15, oats: 5, pasta: 15, lentils: 25, chickpeas: 10, "black beans": 10, tofu: 20 };

export function generateTemplateWeek(input: GenerateWeekInput): GeneratedWeek {
  const rand = rng(input.seed ?? 1);
  const pantry = new Map<string, number>();
  for (const p of input.pantry) pantry.set(canonicalName(p.name), p.servings ?? 2);
  const recent = new Set(input.recentRecipeIds ?? []);
  const pool = input.recipes.filter((r) => r.calories != null && r.proteinG != null && !excluded(r, input.prefs));
  const byType = (t: string) => pool.filter((r) => r.mealType === t || r.mealType === "any");

  const basket = new Set<string>(); // canonical ingredient names already planned
  const chosen: { recipe: RecipeLite; times: number; slot: "breakfast" | "lunch" | "dinner" }[] = [];
  const likes = input.prefs.likes.map((l) => l.toLowerCase());

  const score = (r: RecipeLite, slot: string, dinnerTime: boolean) => {
    let s = rand() * 6;
    if (r.isFavorite) s += 6;
    if (recent.has(r.id)) s -= 6;
    const density = ((r.proteinG ?? 0) / Math.max(1, r.calories ?? 1)) * 100;
    s += Math.min(12, density * (input.week.highProtein ? 1.2 : 0.8));
    const minutes = r.prepTimeMin + r.cookTimeMin;
    if (input.week.quickWeekdays && slot !== "dinner") s += minutes <= 15 ? 4 : minutes <= 30 ? 1 : -4;
    if (slot === "dinner" && dinnerTime) s += minutes <= input.prefs.maxPrepMin ? 2 : -3;
    for (const l of likes) if (l && `${r.name} ${r.ingredients.join(" ")}`.toLowerCase().includes(l)) s += 4;
    // Reuse: overlap with basket and pantry
    const overlap = r.ingredients.filter((i) => basket.has(canonicalName(i))).length;
    const onHand = r.ingredients.filter((i) => (pantry.get(canonicalName(i)) ?? 0) > 0).length;
    if (input.week.reuseIngredients) s += overlap * 3 + onHand * 2.5;
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
  const buildList = () => shoppingListFor(chosen, pantry, input);
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
  const SNACKS = [
    { name: "Greek yogurt + berries", calories: 180, protein: 18, carbs: 20, fat: 3, ingredients: ["greek yogurt", "berries"] },
    { name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4, ingredients: ["protein powder", "milk"] },
    { name: "Cottage cheese + fruit", calories: 240, protein: 24, carbs: 20, fat: 6, ingredients: ["cottage cheese", "fruit"] },
    { name: "Two hard-boiled eggs", calories: 156, protein: 12, carbs: 1, fat: 10, ingredients: ["eggs"] },
  ].filter((s) => !input.prefs.dislikes.some((dk) => dk && s.name.toLowerCase().includes(dk.toLowerCase()))).filter((s) => !(input.prefs.dietPrefs.includes("dairy-free") && /yogurt|cottage|milk/.test(s.name.toLowerCase())));
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
  const finalList = shoppingListFromMeals(meals, pantry, input);

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

function shoppingListFor(chosen: { recipe: RecipeLite; times: number }[], pantry: Map<string, number>, input: GenerateWeekInput) {
  const meals: WeekMeal[] = chosen.flatMap((c) => Array.from({ length: c.times }, () => ({ date: input.weekStart, mealType: "dinner" as const, name: c.recipe.name, calories: 0, protein: 0, carbs: 0, fat: 0, ingredients: c.recipe.ingredients, recipeId: c.recipe.id, prepMinutes: 0 })));
  return shoppingListFromMeals(meals, pantry, input);
}

export function shoppingListFromMeals(meals: WeekMeal[], pantry: Map<string, number>, input: Pick<GenerateWeekInput, "budgetMode">): { items: ShoppingItem[]; total: number; reusePct: number; staples: string[]; covered: number } {
  // servings demanded per canonical ingredient, and which meals use it
  const demand = new Map<string, { servings: number; usedIn: Set<string>; raw: string }>();
  for (const m of meals) {
    if (m.leftover) continue;
    for (const ing of m.ingredients) {
      const key = canonicalName(ing);
      const cur = demand.get(key) ?? { servings: 0, usedIn: new Set<string>(), raw: ing };
      cur.servings += 1;
      cur.usedIn.add(m.name);
      demand.set(key, cur);
    }
  }
  const items: ShoppingItem[] = [];
  const staples: string[] = [];
  let total = 0;
  let covered = 0;
  let reused = 0;
  for (const [name, d] of demand) {
    if (d.usedIn.size >= 2) reused++;
    const def = findIngredient(name);
    const onHand = pantry.get(name) ?? 0;
    if (def?.staple) {
      staples.push(name);
      continue;
    }
    const needServings = Math.max(0, d.servings - onHand);
    if (needServings <= 0) {
      items.push({ name, category: def?.category ?? "other", qty: 0, unit: def?.unit ?? "each", estPrice: 0, usedIn: [...d.usedIn], coveredByPantry: true, note: `You still have enough for ~${Math.round(onHand)} meals` });
      covered++;
      continue;
    }
    const units = def ? Math.max(0.5, Math.ceil((needServings / def.servingsPerUnit) * 2) / 2) : 1;
    const est = def ? Math.round(units * def.price * 100) / 100 : null;
    if (est) total += est;
    items.push({ name, category: def?.category ?? "other", qty: units, unit: def?.unit ?? "each", estPrice: est, usedIn: [...d.usedIn], coveredByPantry: false, note: onHand > 0 ? `Reduced — you have ~${Math.round(onHand)} servings` : undefined });
  }
  const reusePct = demand.size ? Math.round((reused / demand.size) * 100) : 0;
  items.sort((a, b) => Object.keys(CATEGORY_LABEL).indexOf(a.category) - Object.keys(CATEGORY_LABEL).indexOf(b.category) || a.name.localeCompare(b.name));
  return { items, total: Math.round(total * 100) / 100, reusePct, staples, covered };
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
