import Link from "next/link";
import { redirect } from "next/navigation";
import { Dumbbell, UtensilsCrossed, ChefHat, MessageCircle, ChevronRight, CalendarRange, Package, History, Check } from "lucide-react";
import { relevantWeek, suggestedPlanStart, weekEnd, weekFeedback } from "@/services/foodWeek";
import { GroceryActions, type GroceryState } from "@/components/food/GroceryActions";
import { pantryCount } from "@/services/pantry";
import { addDays, formatShort, startOfWeek, weekday } from "@/lib/dates";
import { WeekFeedbackCard } from "@/components/food/WeekFeedbackCard";
import { getProfile } from "@/services/profile";
import { todayPlanSummary } from "@/services/planner";
import { isAiEnabled } from "@/ai/config";
import { loadWorkoutsBetween } from "@/services/loaders";
import { PageHeader, SectionTitle, cx } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

const DAY = ["S", "M", "T", "W", "T", "F", "S"];

/** PLANNER = FUTURE. This week · Weekly preparation · Food · Tools. Today's numbers live on Home. */
export default function PlannerPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const today = profile.today;
  const plan = todayPlanSummary(profile);
  const ai = isAiEnabled();
  const ws = startOfWeek(today);
  const planningWeek = relevantWeek(today);
  const thisWeek = planningWeek && planningWeek.weekStart <= today ? planningWeek : null;
  const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const preferredDay = profile.preferences.food.shoppingDay;
  const resetLabel = weekday(today) === preferredDay ? `${DAY_NAME[preferredDay]} reset` : "Weekly reset";
  const daysLeft = planningWeek && planningWeek.weekStart <= today ? Math.max(0, Math.round((new Date(weekEnd(planningWeek) + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86_400_000) + 1) : 0;
  const grocery: GroceryState = {
    state: !planningWeek || planningWeek.status === "planning" ? "none" : planningWeek.status === "planned" ? "planned" : "shopped",
    weekId: planningWeek?.id ?? null,
    weekStart: planningWeek?.weekStart ?? null,
    endDate: planningWeek ? weekEnd(planningWeek) : null,
    itemCount: planningWeek?.totals.itemCount ?? 0,
    purchased: planningWeek?.totals.purchased ?? 0,
    estimated: planningWeek?.totals.estimated ?? 0,
    actual: planningWeek?.actualCost ?? null,
    budget: planningWeek?.budget ?? profile.preferences.food.weeklyBudget,
    daysLeft,
    replannedFrom: planningWeek?.summaryParsed.replannedFrom ?? null,
  };
  const pantryN = pantryCount();
  const trained = new Set(loadWorkoutsBetween(ws, addDays(ws, 6)).map((w) => w.date));
  const trainingDays = profile.preferences.fitness.trainingDays;
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const plannedDays = weekDates.filter((d) => trainingDays.includes(weekday(d))).length;
  const doneDays = weekDates.filter((d) => trained.has(d)).length;
  // PLANNER = FUTURE: the week's shape, not today's numbers (those are on Home).
  const workoutSub = plan.activeSession
    ? "Session in progress · tap to resume"
    : plannedDays
      ? `${plannedDays} planned · ${doneDays} done this week`
      : doneDays
        ? `${doneDays} done this week`
        : "Nothing planned this week";
  const mealsThisWeek = thisWeek ? thisWeek.days.reduce((a, d) => a + d.meals.filter((m) => m.status === "planned" || m.status === "prepared").length, 0) : 0;

  const weekStatus = planningWeek && planningWeek.status !== "planning" ? planningWeek.status : null;
  const prepSub = !planningWeek?.prep ? "After planning" : planningWeek.prep.status === "completed" ? "Done ✓" : `${planningWeek.prep.estimatedMinutes} min planned`;

  const Tile = ({ href, icon: Icon, title, sub, done }: { href: string; icon: typeof Dumbbell; title: string; sub: string; done?: boolean }) => (
    <Link href={href} className="plate press flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className="plate-tile flex h-10 w-10 shrink-0 items-center justify-center">{done ? <Check size={18} className="text-success" /> : <Icon size={18} className="text-gold" />}</span>
      <span className="min-w-0 flex-1">
        <span className="display block text-[15px] font-semibold">{title}</span>
        <span className="serif block truncate text-[13px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  );

  return (
    <div className="page space-y-5">
      <PageHeader title="Planner" subtitle="The week ahead" />

      <section>
        <SectionTitle>This week</SectionTitle>
        <div className="space-y-2.5">
          {profile.activeDomains.includes("fitness") && (
            <div className="plate px-4 py-3">
              <Link href="/planner/workout" className="press flex items-center gap-3">
                <span className="plate-tile flex h-10 w-10 shrink-0 items-center justify-center">
                  <Dumbbell size={18} className="text-gold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="display block text-[15px] font-semibold">Workouts</span>
                  <span className="serif block truncate text-[13px] text-muted">{workoutSub}</span>
                </span>
                <ChevronRight size={16} className="text-faint" />
              </Link>
              <div className="mt-3 flex gap-1.5" aria-label="Training days this week">
                {weekDates.map((d, i) => {
                  const isTrain = trainingDays.includes(weekday(d));
                  const did = trained.has(d);
                  const isToday = d === today;
                  return (
                    <span key={d} className={cx("flex h-9 flex-1 flex-col items-center justify-center rounded-lg border text-[11px]", did ? "border-success/50 bg-success/10 text-success" : isTrain ? "border-gold/40 bg-gold/8 text-gold" : "border-border/60 text-faint", isToday && "ring-1 ring-text/30")} title={did ? "Trained" : isTrain ? "Training day" : "Rest"}>
                      {DAY[weekday(d)]}
                      <span className="text-[8px] leading-none">{did ? "✓" : isTrain ? "•" : ""}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {profile.activeDomains.includes("cooking") && <Tile href="/planner/meals" icon={UtensilsCrossed} title="Meals" sub={mealsThisWeek ? `${mealsThisWeek} meals planned this week` : "No meals planned this week"} />}
        </div>
      </section>

      {profile.activeDomains.includes("cooking") && (
        <section>
          <SectionTitle>Weekly preparation</SectionTitle>
          <div className="space-y-2.5">
            <Tile href={weekStatus ? `/planner/week?week=${planningWeek!.weekStart}` : `/planner/week?start=${suggestedPlanStart(today, preferredDay) <= today ? "today" : suggestedPlanStart(today, preferredDay)}`} icon={CalendarRange} title={resetLabel} sub={weekStatus ? `${planningWeek!.kind === "supply" ? "Supply run" : "Plan"} ${formatShort(planningWeek!.weekStart)} – ${formatShort(weekEnd(planningWeek!))} · ${weekStatus}${grocery.replannedFrom ? " · replanned" : ""}` : "Start any time: pantry, budget, meals, list, prep"} done={!!weekStatus} />
            <GroceryActions g={grocery} defaultBudget={profile.preferences.food.weeklyBudget} />
            <Tile href={`/planner/week${planningWeek ? `?week=${planningWeek.weekStart}&step=prep` : "?step=prep"}`} icon={ChefHat} title="Meal prep" sub={prepSub} done={planningWeek?.prep?.status === "completed"} />
          </div>
          {thisWeek && thisWeek.status !== "planning" && (
            <div className="mt-2.5">
              <WeekFeedbackCard fb={weekFeedback(thisWeek, today)} />
            </div>
          )}
        </section>
      )}

      <section>
        <SectionTitle>Food</SectionTitle>
        <div className="space-y-2.5">
          <Tile href="/planner/pantry" icon={Package} title="Pantry" sub={pantryN ? `${pantryN} items · what can I make?` : "Add what you have"} />
          <Tile href="/recipes" icon={ChefHat} title="Recipes" sub="Search by what's in your kitchen" />
        </div>
      </section>

      <section>
        <SectionTitle>Tools</SectionTitle>
        <div className="space-y-2.5">
          <Tile href="/coach" icon={MessageCircle} title="Coach" sub="Ask anything" />
          <Tile href="/planner/workout/history" icon={History} title="Workout history" sub="Edit, link or discard sessions" />
        </div>
      </section>
    </div>
  );
}
