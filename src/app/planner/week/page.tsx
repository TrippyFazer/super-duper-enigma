import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { getWeek, listWeeks, suggestedPlanStart, weekEnd, weekFeedback } from "@/services/foodWeek";
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

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string; step?: string; start?: string; days?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  reconcile();
  const today = profile.today;
  // Plans can start any day: ?week=<date> opens that plan, ?start=today (or a date) starts a fresh one from there,
  // otherwise the app's suggested start (a default, not a rule).
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const weekStart = isDate(sp.week) ? sp.week! : sp.start === "today" ? today : isDate(sp.start) ? sp.start! : suggestedPlanStart(today, profile.preferences.food.shoppingDay);
  const wk = getWeek(weekStart);
  const plannedDays = wk?.spanDays ?? (sp.days && /^\d+$/.test(sp.days) ? Math.max(2, Math.min(14, Number(sp.days))) : 7);
  const prev = listWeeks(6).find((w) => w.weekStart < weekStart && w.status !== "planning") ?? null;
  const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const resetLabel = new Date(today + "T00:00:00Z").getUTCDay() === profile.preferences.food.shoppingDay ? `${DAY_NAME[profile.preferences.food.shoppingDay]} reset` : "Weekly reset";
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const quests = getQuests(weekStart >= today ? weekStart : today).weekly;
  const pantry = listPantry().map((p) => ({ id: p.id, name: p.name, level: p.level, qty: p.qty, unit: p.unit }));
  const weekLabel = `${formatShort(weekStart)} – ${formatShort(wk ? weekEnd(wk) : addDays(weekStart, plannedDays - 1))}`;

  return (
    <div className="page space-y-4">
      <PageHeader title={resetLabel} subtitle={`${wk?.kind === "supply" ? "Supply run" : "Planning"} ${weekLabel}${weekStart === today ? " · starting today" : ""}`} back="/planner" />
      <WeekPlanner
        today={today}
        initialStep={sp.step ?? null}
        weekStart={weekStart}
        plannedDays={plannedDays}
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
                spanDays: wk.spanDays,
                kind: wk.kind,
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
