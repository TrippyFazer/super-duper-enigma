import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { loadRecipes } from "@/services/loaders";
import { seedRecipes } from "@/db/seed";
import { RecipeFinder } from "@/components/recipes/RecipeFinder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipes" };

export default function RecipesPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  seedRecipes();
  const recipes = loadRecipes().map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ingredients: r.ingredientsParsed,
    mealType: r.mealType,
    prepTimeMin: r.prepTimeMin,
    cookTimeMin: r.cookTimeMin,
    difficulty: r.difficulty,
    tags: r.tagsParsed,
    isFavorite: r.isFavorite,
    isSaved: r.isSaved,
    proteinG: r.proteinG,
    source: r.source,
  }));
  return <RecipeFinder recipes={recipes} today={profile.today} />;
}
