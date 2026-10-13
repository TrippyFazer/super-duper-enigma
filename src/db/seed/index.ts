import { getDb, type DB } from "../client";
import { recipes } from "../schema";
import { SEED_RECIPES } from "./recipes";

/** Idempotent: inserts built-in recipes that are not present yet. */
export function seedRecipes(db: DB = getDb()): number {
  const existing = new Set(db.select({ slug: recipes.slug }).from(recipes).all().map((r) => r.slug));
  let inserted = 0;
  for (const r of SEED_RECIPES) {
    if (existing.has(r.slug)) continue;
    db.insert(recipes)
      .values({
        slug: r.slug,
        name: r.name,
        description: r.description,
        ingredients: JSON.stringify(r.ingredients),
        steps: JSON.stringify(r.steps),
        mealType: r.mealType,
        prepTimeMin: r.prepTimeMin,
        cookTimeMin: r.cookTimeMin,
        difficulty: r.difficulty,
        tags: JSON.stringify(r.tags),
        servings: r.servings,
        proteinG: r.proteinG ?? null,
        calories: r.calories ?? null,
        source: "builtin",
      })
      .onConflictDoNothing()
      .run();
    inserted++;
  }
  return inserted;
}
