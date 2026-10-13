import Link from "next/link";
import { redirect } from "next/navigation";
import { ChefHat, ChevronRight } from "lucide-react";
import { getProfile } from "@/services/profile";
import { entriesForDate, getMealPlan, resolveTargets, sumEntries, nutritionConsistency } from "@/services/nutrition";
import { targetWarning, SAFE_MIN_CALORIES } from "@/services/preferences";
import { isAiEnabled } from "@/ai/config";
import { loadRecipes } from "@/services/loaders";
import { PageHeader } from "@/components/ui/primitives";
import { MacroRing } from "@/components/planner/MacroRing";
import { MealsScreen } from "@/components/planner/MealsScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meals" };

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const sp = await searchParams;
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const today = profile.today;
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const entries = entriesForDate(today);
  const totals = sumEntries(entries);
  const plan = getMealPlan(today);
  const warn = targetWarning(profile.preferences.nutrition, profile.sex);
  const cons = nutritionConsistency(today, 30, targets.protein, SAFE_MIN_CALORIES(profile.sex));
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, protein: r.proteinG, carbs: r.carbsG, fat: r.fatG, isFavorite: r.isFavorite }));

  return (
    <div className="page space-y-5">
      <PageHeader title="Meals & nutrition" subtitle={targets.estimated ? "Targets estimated from your profile — set your own in Settings." : `${targets.calories} kcal · ${targets.protein} g protein target`} back="/planner" />
      {warn && <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{warn}</div>}

      <section className="plate px-4 py-4">
        <div className="flex items-center gap-4">
          <MacroRing value={totals.calories} target={targets.calories} label="kcal" />
          <div className="grid flex-1 grid-cols-1 gap-2">
            {[
              ["Protein", totals.protein, targets.protein, "bg-success"],
              ["Carbs", totals.carbs, targets.carbs, "bg-accent"],
              ["Fat", totals.fat, targets.fat, "bg-warn"],
            ].map(([l, v, t, c]) => (
              <div key={l as string}>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted">{l}</span>
                  <span className="tabular text-text-2">
                    {v as number}
                    <span className="text-faint">/{t as number}g</span>
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(100, ((v as number) / Math.max(1, t as number)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="serif mt-3 text-[12.5px] text-muted">
          {totals.protein >= targets.protein ? "Protein target hit. " : `${Math.max(0, targets.protein - totals.protein)} g protein to go. `}
          Logged {cons.loggedDays} of the last 30 days · protein target on {cons.proteinDays}. Estimates are fine — this is not a calorie-counting contest.
        </p>
      </section>

      <MealsScreen
        today={today}
        openLog={sp.log === "1"}
        entries={entries.map((e) => ({ id: e.id, name: e.name, mealType: e.mealType, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat, source: e.source, isEstimate: e.isEstimate, venue: e.venue }))}
        recipes={recipes}
        plan={plan ? { source: plan.source, calorieTarget: plan.calorieTarget, proteinTarget: plan.proteinTarget, meals: plan.meals.map((m) => ({ id: m.id, index: m.index, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredientsParsed, recipeId: m.recipeId, notes: m.notes, status: m.status, source: m.source })) } : null}
        aiEnabled={isAiEnabled()}
      />

      <Link href="/recipes" className="plate press flex items-center gap-3 px-4 py-3">
        <ChefHat size={18} className="text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Find a recipe</div>
          <div className="serif text-[13px] text-muted">Search by ingredients, time, protein. Log it in one tap.</div>
        </div>
        <ChevronRight size={16} className="text-faint" />
      </Link>
    </div>
  );
}
