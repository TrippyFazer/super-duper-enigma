import { pantryCovers } from "@/food/families";
import { recipeExcluded, validateMeal, type FoodRules } from "@/food/rules";
import type { RecipeLite } from "./mealTemplates";

/**
 * Template fallback for "adjust the rest of today": pick replacements for the
 * remaining planned meals that land the day near its targets, preferring
 * recipes whose ingredients are on hand.
 */
export interface RemainingSlot {
  id: number;
  slot: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein: number;
}

export interface AdjustProposal {
  meals: { replacesId: number; replacesSlot: number; mealType: string; name: string; calories: number; protein: number; carbs: number; fat: number; ingredients: string[]; recipeId: number | null; notes: string }[];
  rationale: string;
}

const SNACKS = [
  { name: "Greek yogurt + berries", calories: 180, protein: 18, carbs: 20, fat: 3, ingredients: ["greek yogurt", "berries"] },
  { name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4, ingredients: ["protein powder", "milk"] },
  { name: "Cottage cheese + fruit", calories: 240, protein: 24, carbs: 20, fat: 6, ingredients: ["cottage cheese", "fruit"] },
  { name: "Two hard-boiled eggs", calories: 156, protein: 12, carbs: 1, fat: 10, ingredients: ["eggs"] },
  { name: "Apple + peanut butter", calories: 280, protein: 8, carbs: 32, fat: 16, ingredients: ["apple", "peanut butter"] },
  { name: "Light salad with chicken", calories: 320, protein: 35, carbs: 10, fat: 14, ingredients: ["chicken breast", "lettuce", "olive oil"] },
];

export function proposeDayAdjustment(input: { remaining: RemainingSlot[]; remainingCalories: number; remainingProtein: number; recipes: RecipeLite[]; pantry: string[]; maxPrepMin: number; dislikes: string[]; rules?: FoodRules | null }): AdjustProposal | null {
  const remaining = [...input.remaining].sort((a, b) => a.slot - b.slot);
  if (!remaining.length) return null;
  const covered = (ings: string[]) => (ings.length ? ings.filter((i) => input.pantry.some((p) => pantryCovers(i, p))).length / ings.length : 0);
  const rules = input.rules ?? null;
  const allowed = (r: { name: string; ingredients: string[] }) => !rules || !recipeExcluded(r, rules);
  const repair = <T extends { name: string; ingredients: string[]; calories: number; protein: number; carbs: number; fat: number }>(m: T): T | null => {
    if (!rules) return m;
    const v = validateMeal(m, rules);
    return v.status === "rejected" ? null : v.meal;
  };
  let calLeft = input.remainingCalories;
  let proLeft = input.remainingProtein;
  const meals: AdjustProposal["meals"] = [];
  const perMealCal = Math.max(150, calLeft / remaining.length);
  for (const slot of remaining) {
    const budget = Math.max(150, Math.min(900, perMealCal));
    const proNeed = Math.max(10, proLeft / Math.max(1, remaining.length - meals.length));
    let pick: AdjustProposal["meals"][number] | null = null;
    if (slot.mealType !== "snack") {
      const cands = input.recipes
        .filter((r) => r.calories != null && r.proteinG != null && (r.mealType === slot.mealType || r.mealType === "any") && r.prepTimeMin + r.cookTimeMin <= input.maxPrepMin + 10)
        .filter((r) => !input.dislikes.some((d) => d && `${r.name} ${r.ingredients.join(" ")}`.toLowerCase().includes(d.toLowerCase())) && allowed(r))
        .map((r) => ({ r, score: -Math.abs((r.calories ?? 0) - budget) / 50 + Math.min(10, ((r.proteinG ?? 0) / proNeed) * 5) + covered(r.ingredients) * 12 }))
        .sort((a, b) => b.score - a.score);
      const best = cands[0]?.r;
      if (best) pick = repair({ replacesId: slot.id, replacesSlot: slot.slot, mealType: slot.mealType, name: best.name, calories: best.calories!, protein: best.proteinG!, carbs: best.carbsG ?? 0, fat: best.fatG ?? 0, ingredients: best.ingredients, recipeId: best.id, notes: covered(best.ingredients) >= 0.6 ? "Mostly from what you have." : "" });
    }
    if (!pick) {
      const s = SNACKS.filter(allowed).map((x) => repair(x)).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Math.abs(a.calories - budget) + (proLeft > 20 ? (30 - a.protein) : 0) - (Math.abs(b.calories - budget) + (proLeft > 20 ? (30 - b.protein) : 0)))[0];
      if (!s) continue;
      pick = { replacesId: slot.id, replacesSlot: slot.slot, mealType: slot.mealType, name: s.name, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat, ingredients: s.ingredients, recipeId: null, notes: "" };
    }
    meals.push(pick);
    calLeft -= pick.calories;
    proLeft -= pick.protein;
  }
  const over = calLeft < -250;
  return { meals, rationale: over ? "Today is already past target; these are the lightest sensible options. One high day is fine — tomorrow is a new chapter." : `Rebalanced so today lands near target with ${Math.max(0, Math.round(proLeft))} g protein still to find.` };
}
