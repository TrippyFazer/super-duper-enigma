import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { entriesForDate, getMealPlan, resolveTargets, sumEntries, listSavedFoods } from "@/services/nutrition";
import { targetWarning } from "@/services/preferences";
import { isAiEnabled } from "@/ai/config";
import { loadRecipes } from "@/services/loaders";
import { PageHeader } from "@/components/ui/primitives";
import { MealsScreen } from "@/components/planner/MealsScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Food" };

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ log?: string; adjust?: string }> }) {
  const sp = await searchParams;
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const today = profile.today;
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const entries = entriesForDate(today);
  const totals = sumEntries(entries);
  const plan = getMealPlan(today);
  const warn = targetWarning(profile.preferences.nutrition, profile.sex);
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, protein: r.proteinG, carbs: r.carbsG, fat: r.fatG, isFavorite: r.isFavorite }));
  const recents = listSavedFoods({ limit: 12 }).map((f) => ({ id: f.id, name: f.name, brand: f.brand, serving: f.servingDesc, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, isEstimate: f.isEstimate }));

  return (
    <div className="page space-y-4">
      <PageHeader title="Food" subtitle="Today" back="/planner" />
      {warn && <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{warn}</div>}
      <MealsScreen
        today={today}
        openLog={sp.log === "1"}
        adjustFor={sp.adjust ?? null}
        entries={entries.map((e) => ({ id: e.id, name: e.name, mealType: e.mealType, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat, source: e.source, isEstimate: e.isEstimate, venue: e.venue }))}
        recipes={recipes}
        recents={recents}
        totals={totals}
        targets={{ calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat, estimated: targets.estimated }}
        plan={plan ? { source: plan.source, calorieTarget: plan.calorieTarget, proteinTarget: plan.proteinTarget, meals: plan.meals.map((m) => ({ id: m.id, index: m.index, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredientsParsed, recipeId: m.recipeId, notes: m.notes, status: m.status, source: m.source })) } : null}
        aiEnabled={isAiEnabled()}
      />
    </div>
  );
}
