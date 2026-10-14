import { pantryCovers } from "@/food/families";
import { findIngredient } from "@/food/ingredients";
import { recipeExcluded, validateMeal, type FoodRules } from "@/food/rules";
import type { RecipeLite } from "./mealTemplates";

/**
 * "What can I eat tonight?" without AI: rank recipes by how much of them is
 * already in the pantry, how well they fit what's left of today's targets,
 * how fast they are, and whether they use something expiring soon.
 */
export interface SuggestInput {
  recipes: RecipeLite[];
  pantry: string[];
  expiring: string[];
  remainingCalories: number;
  remainingProtein: number;
  maxMinutes: number;
  dislikes: string[];
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  /** the one rules engine; when absent only dislikes apply */
  rules?: FoodRules | null;
}

export interface Suggestion {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  prepMinutes: number;
  uses: string[];
  additional: string[];
  steps: string[];
  why: string;
  recipeId: number | null;
  coverage: number;
}

export function suggestFromPantryTemplate(input: SuggestInput, limit = 4): Suggestion[] {
  const have = (i: string) => input.pantry.some((p) => pantryCovers(i, p));
  const out: Suggestion[] = [];
  for (const raw of input.recipes) {
    if (raw.calories == null || raw.proteinG == null) continue;
    if (input.mealType && raw.mealType !== input.mealType && raw.mealType !== "any") continue;
    if (input.dislikes.some((d) => d && `${raw.name} ${raw.ingredients.join(" ")}`.toLowerCase().includes(d.toLowerCase()))) continue;
    let r = raw;
    if (input.rules) {
      if (recipeExcluded(raw, input.rules)) continue;
      const v = validateMeal({ name: raw.name, ingredients: raw.ingredients, calories: raw.calories, protein: raw.proteinG, carbs: raw.carbsG ?? 0, fat: raw.fatG ?? 0 }, input.rules);
      if (v.status === "rejected") continue;
      if (v.status === "repaired") r = { ...raw, ingredients: v.meal.ingredients, calories: v.meal.calories, proteinG: v.meal.protein, carbsG: v.meal.carbs, fatG: v.meal.fat };
    }
    const core = r.ingredients.filter((i) => !findIngredient(i)?.staple);
    const uses = core.filter(have);
    const additional = core.filter((i) => !have(i));
    const coverage = core.length ? uses.length / core.length : 0;
    if (coverage < 0.5 || additional.length > 2) continue;
    const minutes = r.prepTimeMin + r.cookTimeMin;
    const usesExpiring = uses.filter((i) => input.expiring.some((e) => pantryCovers(i, e)));
    let s = coverage * 10 - additional.length * 2.5;
    s += usesExpiring.length * 3;
    s += minutes <= input.maxMinutes ? 2 : -4;
    const calFit = 1 - Math.min(1, Math.abs((r.calories ?? 0) - Math.max(300, input.remainingCalories)) / 600);
    s += calFit * 4;
    if (input.remainingProtein > 25) s += Math.min(4, ((r.proteinG ?? 0) / input.remainingProtein) * 4);
    const whyParts = [`Uses ${uses.length} of ${core.length} ingredients you have`];
    if (usesExpiring.length) whyParts.push(`uses ${usesExpiring.join(", ")} before it goes off`);
    if (minutes <= input.maxMinutes) whyParts.push(`${minutes} min`);
    out.push({ name: r.name, calories: r.calories!, protein: r.proteinG!, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0, prepMinutes: minutes, uses, additional, steps: [], why: whyParts.join(" · "), recipeId: r.id, coverage: Math.round(coverage * 100) / 100 + s / 1000 });
  }
  return out.sort((a, b) => b.coverage - a.coverage).slice(0, limit).map((s) => ({ ...s, coverage: Math.round(s.coverage * 100) / 100 }));
}
