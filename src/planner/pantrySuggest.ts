import { canonicalName, findIngredient } from "@/food/ingredients";
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
  const pantry = new Set(input.pantry.map(canonicalName));
  const expiring = new Set(input.expiring.map(canonicalName));
  const out: Suggestion[] = [];
  for (const r of input.recipes) {
    if (r.calories == null || r.proteinG == null) continue;
    if (input.mealType && r.mealType !== input.mealType && r.mealType !== "any") continue;
    if (input.dislikes.some((d) => d && `${r.name} ${r.ingredients.join(" ")}`.toLowerCase().includes(d.toLowerCase()))) continue;
    const core = r.ingredients.filter((i) => !findIngredient(i)?.staple);
    const uses = core.filter((i) => pantry.has(canonicalName(i)));
    const additional = core.filter((i) => !pantry.has(canonicalName(i)));
    const coverage = core.length ? uses.length / core.length : 0;
    if (coverage < 0.5 || additional.length > 2) continue;
    const minutes = r.prepTimeMin + r.cookTimeMin;
    const usesExpiring = uses.filter((i) => expiring.has(canonicalName(i)));
    let s = coverage * 10 - additional.length * 2.5;
    s += usesExpiring.length * 3;
    s += minutes <= input.maxMinutes ? 2 : -4;
    const calFit = 1 - Math.min(1, Math.abs((r.calories ?? 0) - Math.max(300, input.remainingCalories)) / 600);
    s += calFit * 4;
    if (input.remainingProtein > 25) s += Math.min(4, ((r.proteinG ?? 0) / input.remainingProtein) * 4);
    const whyParts = [`Uses ${uses.length} of ${core.length} ingredients you have`];
    if (usesExpiring.length) whyParts.push(`uses ${usesExpiring.join(", ")} before it goes off`);
    if (minutes <= input.maxMinutes) whyParts.push(`${minutes} min`);
    out.push({ name: r.name, calories: r.calories, protein: r.proteinG, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0, prepMinutes: minutes, uses, additional, steps: [], why: whyParts.join(" · "), recipeId: r.id, coverage: Math.round(coverage * 100) / 100 + s / 1000 });
  }
  return out.sort((a, b) => b.coverage - a.coverage).slice(0, limit).map((s) => ({ ...s, coverage: Math.round(s.coverage * 100) / 100 }));
}
