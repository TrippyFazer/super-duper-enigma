import { loadRecipes, type RecipeView } from "./loaders";

export interface RecipeFilters {
  q?: string;
  ingredients?: string[]; // what the user has on hand
  mealType?: string; // breakfast | lunch | dinner | snack | any
  maxTimeMin?: number | null;
  difficulty?: string | null;
  tags?: string[]; // high-protein | healthy | cheap | comfort | quick | vegetarian | one-pan | meal-prep
  savedOnly?: boolean;
  favoritesOnly?: boolean;
}

export interface RecipeMatch {
  recipe: RecipeView;
  /** Ingredients from the user's list that appear in the recipe. */
  matched: string[];
  /** Recipe ingredients the user didn't list. */
  missing: string[];
  score: number;
}

import { PANTRY_STAPLES } from "@/lib/recipe-constants";
export { RECIPE_TAGS, MEAL_TYPES } from "@/lib/recipe-constants";

export function searchRecipes(filters: RecipeFilters, all: RecipeView[] = loadRecipes()): RecipeMatch[] {
  const q = filters.q?.trim().toLowerCase();
  const have = (filters.ingredients ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: RecipeMatch[] = [];

  for (const r of all) {
    if (filters.savedOnly && !r.isSaved && !r.isFavorite) continue;
    if (filters.favoritesOnly && !r.isFavorite) continue;
    if (filters.mealType && filters.mealType !== "any" && r.mealType !== filters.mealType && r.mealType !== "any") continue;
    if (filters.maxTimeMin && r.prepTimeMin + r.cookTimeMin > filters.maxTimeMin) continue;
    if (filters.difficulty && r.difficulty !== filters.difficulty) continue;
    if (filters.tags?.length && !filters.tags.every((t) => r.tagsParsed.includes(t))) continue;
    if (q) {
      const hay = `${r.name} ${r.description} ${r.ingredientsParsed.join(" ")} ${r.tagsParsed.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const matched: string[] = [];
    const missing: string[] = [];
    for (const ing of r.ingredientsParsed) {
      const hit = have.some((h) => ing.includes(h) || h.includes(ing));
      if (hit) matched.push(ing);
      else if (!PANTRY_STAPLES.has(ing)) missing.push(ing);
    }
    // Score: coverage of what the user has, lightly favouring favorites/saved and quick meals.
    let score = 0;
    if (have.length) {
      const coverage = r.ingredientsParsed.length ? matched.length / r.ingredientsParsed.filter((i) => !PANTRY_STAPLES.has(i)).length : 0;
      score = coverage * 100 - missing.length * 5;
      if (matched.length === 0) continue; // must use at least one listed ingredient
    } else {
      score = 50;
    }
    if (r.isFavorite) score += 8;
    if (r.isSaved) score += 4;
    if (r.tagsParsed.includes("quick")) score += 2;
    out.push({ recipe: r, matched, missing, score });
  }

  return out.sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name));
}

