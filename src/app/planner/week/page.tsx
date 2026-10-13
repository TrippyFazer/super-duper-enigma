import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { getWeek, planningWeekStart, weekFeedback } from "@/services/foodWeek";
import { listPantry } from "@/services/pantry";
import { getQuests, reconcile } from "@/services/progression";
import { resolveTargets } from "@/services/nutrition";
import { isAiEnabled } from "@/ai/config";
import { addDays, formatShort, formatWeekdayShort, startOfWeek } from "@/lib/dates";
import { parseJson } from "@/lib/json";
import { PageHeader } from "@/components/ui/primitives";
import { WeekPlanner } from "@/components/food/WeekPlanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly preparation" };

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string; step?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  reconcile();
  const today = profile.today;
  const weekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? startOfWeek(sp.week) : planningWeekStart(today, profile.preferences.food.shoppingDay);
  const wk = getWeek(weekStart);
  const prevStart = addDays(weekStart, -7);
  const prev = getWeek(prevStart) ?? (weekStart !== startOfWeek(today) ? getWeek(startOfWeek(today)) : null);
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const quests = getQuests(weekStart >= today ? weekStart : today).weekly;
  const pantry = listPantry().map((p) => ({ id: p.id, name: p.name, level: p.level, qty: p.qty, unit: p.unit }));
  const weekLabel = `${formatShort(weekStart)} – ${formatShort(addDays(weekStart, 6))}`;

  return (
    <div className="page space-y-4">
      <PageHeader title="Weekly preparation" subtitle={`Sunday reset · planning ${weekLabel}`} back="/planner" />
      <WeekPlanner
        today={today}
        initialStep={sp.step ?? null}
        weekStart={weekStart}
        weekLabel={weekLabel}
        aiEnabled={isAiEnabled()}
        trainingDays={profile.preferences.fitness.trainingDays}
        pantry={pantry}
        lastWeek={prev ? weekFeedback(prev, today) : null}
        lastWeekReviewed={!!prev?.reviewedAt}
        weeklyQuests={quests.map((q) => ({ id: q.id, title: q.title, rewardXp: q.rewardXp, done: q.done, progress: q.progress, target: q.target }))}
        defaults={{ budget: profile.preferences.food.weeklyBudget, budgetMode: profile.preferences.food.budgetMode, calorieTarget: targets.calories, proteinTarget: targets.protein, eatingOut: profile.preferences.food.eatingOutPerWeek, quickWeekdays: profile.preferences.food.quickWeekdays, mealPrep: profile.preferences.food.mealPrep, highProtein: profile.preferences.food.highProtein, reuseIngredients: profile.preferences.food.reuseIngredients }}
        week={
          wk
            ? {
                id: wk.id,
                status: wk.status,
                source: wk.source,
                budget: wk.budget,
                budgetMode: wk.budgetMode as "balanced",
                calorieTarget: wk.calorieTarget,
                proteinTarget: wk.proteinTarget,
                mealsNeeded: wk.mealsNeededParsed,
                prefs: wk.prefsParsed,
                estimatedCost: wk.estimatedCost,
                actualCost: wk.actualCost,
                summary: wk.summaryParsed,
                items: wk.items.map((i) => ({ id: i.id, name: i.name, category: i.category, qty: i.qty, unit: i.unit, estPrice: i.estPrice, actualQty: i.actualQty, actualPrice: i.actualPrice, purchased: i.purchased, skipped: i.skipped, usedIn: parseJson<string[]>(i.usedIn, []), coveredByPantry: i.coveredByPantry, note: i.note })),
                prep: wk.prep ? { id: wk.prep.id, status: wk.prep.status, estimatedMinutes: wk.prep.estimatedMinutes, items: wk.prepItems, supports: parseJson<string[]>(wk.prep.supports, []) } : null,
                days: wk.days.map((d) => ({ date: d.date, label: `${formatWeekdayShort(d.date)} ${formatShort(d.date)}`, meals: d.meals.filter((m) => m.status !== "discarded").map((m) => ({ id: m.id, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, status: m.status, prepMinutes: m.prepMinutes })) })),
              }
            : null
        }
      />
    </div>
  );
}
