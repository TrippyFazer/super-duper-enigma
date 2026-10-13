import { getDb, type DB } from "../client";
import { recipes } from "../schema";
import { SEED_RECIPES } from "./recipes";
import { RECIPE_NUTRITION } from "./nutrition";
import { eq, isNull } from "drizzle-orm";

/** Idempotent: inserts built-in recipes that are not present yet and backfills nutrition. */
export function seedRecipes(db: DB = getDb()): number {
  const existing = new Set(db.select({ slug: recipes.slug }).from(recipes).all().map((r) => r.slug));
  let inserted = 0;
  // Backfill carbs/fat on recipes seeded before nutrition data existed.
  for (const r of db.select({ id: recipes.id, slug: recipes.slug }).from(recipes).where(isNull(recipes.carbsG)).all()) {
    const n = RECIPE_NUTRITION[r.slug];
    if (n) db.update(recipes).set({ carbsG: n.carbs, fatG: n.fat }).where(eq(recipes.id, r.id)).run();
  }
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
        carbsG: RECIPE_NUTRITION[r.slug]?.carbs ?? null,
        fatG: RECIPE_NUTRITION[r.slug]?.fat ?? null,
        source: "builtin",
      })
      .onConflictDoNothing()
      .run();
    inserted++;
  }
  return inserted;
}
