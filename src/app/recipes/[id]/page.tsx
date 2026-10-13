import { notFound, redirect } from "next/navigation";
import { Clock, Flame, Users } from "lucide-react";
import { getProfile } from "@/services/profile";
import { loadRecipe } from "@/services/loaders";
import { getDb } from "@/db/client";
import { meals } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { RecipeActions } from "@/components/recipes/RecipeActions";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const { id } = await params;
  const recipe = loadRecipe(Number(id));
  if (!recipe) notFound();
  const cooked = getDb().select().from(meals).where(eq(meals.recipeId, recipe.id)).orderBy(desc(meals.date)).all();

  return (
    <div className="page space-y-4">
      <PageHeader title={recipe.name} subtitle={recipe.description} back="/recipes" />
      <div className="flex flex-wrap gap-2 text-xs text-text-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1">
          <Clock size={12} /> {recipe.prepTimeMin + recipe.cookTimeMin} min
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 capitalize">
          <Flame size={12} /> {recipe.difficulty}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1">
          <Users size={12} /> {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
        </span>
        {recipe.proteinG != null && <span className="rounded-full border border-border bg-card px-2.5 py-1">{recipe.proteinG}g protein</span>}
        {recipe.calories != null && <span className="rounded-full border border-border bg-card px-2.5 py-1">{recipe.calories} kcal</span>}
        {recipe.tagsParsed.map((t) => (
          <span key={t} className="rounded-full bg-white/5 px-2.5 py-1">
            {t}
          </span>
        ))}
      </div>

      <RecipeActions id={recipe.id} name={recipe.name} isFavorite={recipe.isFavorite} isSaved={recipe.isSaved} today={profile.today} timesCooked={cooked.length} />

      <Card>
        <div className="eyebrow mb-2">Ingredients</div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {recipe.ingredientsParsed.map((i) => (
            <li key={i} className="flex items-center gap-2 capitalize">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {i}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="eyebrow mb-2">Method</div>
        <ol className="space-y-3">
          {recipe.stepsParsed.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="display mt-0.5 w-5 shrink-0 text-gold">{i + 1}</span>
              <span className="text-text-2">{s}</span>
            </li>
          ))}
        </ol>
      </Card>

      {cooked.length > 0 && (
        <Card>
          <div className="eyebrow mb-2">Cooked {cooked.length} time{cooked.length === 1 ? "" : "s"}</div>
          <div className="text-xs text-muted">{cooked.slice(0, 8).map((m) => formatShort(m.date)).join(" · ")}</div>
        </Card>
      )}
    </div>
  );
}
