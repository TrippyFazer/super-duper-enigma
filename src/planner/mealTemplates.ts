import type { NutritionPrefs } from "@/services/preferences";

/**
 * Template meal planner — the no-AI fallback. Assembles a day from the recipe
 * catalog (built-in + the user's own) to land near calorie and protein
 * targets while respecting diet preferences and dislikes.
 */
export interface RecipeLite {
  id: number;
  name: string;
  mealType: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tags: string[];
  ingredients: string[];
  prepTimeMin: number;
  cookTimeMin: number;
  isFavorite: boolean;
}

export interface PlannedMeal {
  index: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  recipeId?: number | null;
  notes?: string;
}

export interface GeneratedMealPlan {
  calorieTarget: number;
  proteinTarget: number;
  meals: PlannedMeal[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  rationale: string;
}

const QUICK_ADDS: PlannedMeal[] = [
  { index: 0, mealType: "snack", name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4, ingredients: ["protein powder", "milk"] },
  { index: 0, mealType: "snack", name: "Greek yogurt + berries", calories: 180, protein: 18, carbs: 20, fat: 3, ingredients: ["greek yogurt", "berries"] },
  { index: 0, mealType: "snack", name: "Cottage cheese + fruit", calories: 240, protein: 24, carbs: 20, fat: 6, ingredients: ["cottage cheese", "fruit"] },
  { index: 0, mealType: "snack", name: "Apple + peanut butter", calories: 280, protein: 8, carbs: 32, fat: 16, ingredients: ["apple", "peanut butter"] },
  { index: 0, mealType: "snack", name: "Two hard-boiled eggs", calories: 156, protein: 12, carbs: 1, fat: 10, ingredients: ["eggs"] },
];

function excluded(r: RecipeLite, prefs: NutritionPrefs): boolean {
  const text = `${r.name} ${r.ingredients.join(" ")}`.toLowerCase();
  for (const d of prefs.dislikes) if (d && text.includes(d.toLowerCase())) return true;
  const veg = prefs.dietPrefs.includes("vegetarian");
  const pesc = prefs.dietPrefs.includes("pescatarian");
  const meat = /\b(chicken|beef|pork|turkey|steak|bacon|ham|lamb)\b/;
  const fish = /\b(salmon|tuna|shrimp|fish|cod)\b/;
  if (veg && (meat.test(text) || fish.test(text))) return true;
  if (pesc && meat.test(text)) return true;
  if (prefs.dietPrefs.includes("dairy-free") && /\b(cheese|yogurt|milk|butter|ricotta|mozzarella|feta|parmesan|cottage)\b/.test(text)) return true;
  if (prefs.dietPrefs.includes("gluten-free") && /\b(bread|pasta|tortilla|noodle|bun|granola|oats|flour)\b/.test(text)) return true;
  if (prefs.dietPrefs.includes("low-carb") && (r.carbsG ?? 0) > 50) return true;
  if (r.prepTimeMin + r.cookTimeMin > prefs.maxPrepMin + 15) return true;
  return false;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function generateTemplateMealPlan(input: { recipes: RecipeLite[]; prefs: NutritionPrefs; calorieTarget: number; proteinTarget: number; onHand?: string[]; seed?: number; recentRecipeIds?: number[] }): GeneratedMealPlan {
  const rand = rng(input.seed ?? Date.now());
  const pool = input.recipes.filter((r) => r.calories != null && r.proteinG != null && !excluded(r, input.prefs));
  const recent = new Set(input.recentRecipeIds ?? []);
  const onHand = (input.onHand ?? []).map((s) => s.toLowerCase());

  const score = (r: RecipeLite, slot: string) => {
    let s = rand() * 10;
    if (r.mealType === slot) s += 20;
    else if (r.mealType === "any") s += 10;
    else return -1;
    if (r.isFavorite) s += 6;
    for (const l of input.prefs.likes) if (l && `${r.name} ${r.ingredients.join(" ")}`.toLowerCase().includes(l.toLowerCase())) s += 5;
    if (recent.has(r.id)) s -= 8;
    if (onHand.length) s += r.ingredients.filter((i) => onHand.some((h) => i.includes(h) || h.includes(i))).length * 4;
    // Favour protein density relative to the target.
    s += Math.min(10, ((r.proteinG ?? 0) / Math.max(1, r.calories ?? 1)) * 100);
    return s;
  };

  const slots: PlannedMeal["mealType"][] = input.prefs.mealsPerDay >= 4 ? ["breakfast", "lunch", "dinner", "snack"] : input.prefs.mealsPerDay === 2 ? ["lunch", "dinner"] : ["breakfast", "lunch", "dinner"];
  const used = new Set<number>();
  const meals: PlannedMeal[] = [];
  for (const slot of slots) {
    if (slot === "snack") continue;
    const best = pool.filter((r) => !used.has(r.id)).map((r) => ({ r, s: score(r, slot) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0];
    if (!best) continue;
    used.add(best.r.id);
    meals.push({ index: meals.length, mealType: slot, name: best.r.name, calories: best.r.calories!, protein: best.r.proteinG!, carbs: best.r.carbsG ?? 0, fat: best.r.fatG ?? 0, ingredients: best.r.ingredients, recipeId: best.r.id });
  }

  // Fill the gap to targets with snacks (protein first).
  const totals = () => meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  let t = totals();
  let guard = 0;
  while (guard++ < 3 && (t.protein < input.proteinTarget - 15 || t.calories < input.calorieTarget - 350)) {
    const needProtein = t.protein < input.proteinTarget - 15;
    const usedSnacks = new Set(meals.filter((m) => m.mealType === "snack").map((m) => m.name));
    const candidates = QUICK_ADDS.filter((q) => !usedSnacks.has(q.name))
      .filter((q) => !input.prefs.dislikes.some((d) => d && q.name.toLowerCase().includes(d.toLowerCase())))
      .filter((q) => !(input.prefs.dietPrefs.includes("dairy-free") && /yogurt|cottage|milk/.test(q.name.toLowerCase())))
      .filter((q) => t.calories + q.calories <= input.calorieTarget + 150)
      .sort((a, b) => (needProtein ? b.protein - a.protein : b.calories - a.calories));
    const q = candidates[0];
    if (!q) break;
    meals.push({ ...q, index: meals.length });
    t = totals();
  }

  // If we overshot calories badly, drop the heaviest snack.
  if (t.calories > input.calorieTarget + 300 && meals.some((m) => m.mealType === "snack")) {
    const idx = meals.findIndex((m) => m.mealType === "snack");
    meals.splice(idx, 1);
    t = totals();
  }

  return {
    calorieTarget: input.calorieTarget,
    proteinTarget: input.proteinTarget,
    meals: meals.map((m, i) => ({ ...m, index: i })),
    totals: t,
    rationale: `Built from your recipe catalog to land near ${input.calorieTarget} kcal and ${input.proteinTarget} g protein${onHand.length ? ", favouring what you have on hand" : ""}.`,
  };
}
