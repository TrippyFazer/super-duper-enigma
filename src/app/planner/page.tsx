import Link from "next/link";
import { redirect } from "next/navigation";
import { Dumbbell, UtensilsCrossed, ChefHat, MessageCircle, ChevronRight, Sparkles, Trophy, CalendarRange, Package } from "lucide-react";
import { getWeek, planningWeekStart, weekFeedback } from "@/services/foodWeek";
import { pantryCount } from "@/services/pantry";
import { startOfWeek } from "@/lib/dates";
import { WeekFeedbackCard } from "@/components/food/WeekFeedbackCard";
import { getProfile } from "@/services/profile";
import { todayPlanSummary } from "@/services/planner";
import { isAiEnabled } from "@/ai/config";
import { listPersonalRecords, listSessions } from "@/services/workouts";
import { PageHeader, SectionTitle } from "@/components/ui/primitives";
import { PlanCard } from "@/components/home/PlanCard";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

export default function PlannerPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const plan = todayPlanSummary(profile);
  const ai = isAiEnabled();
  const sessions = listSessions(3);
  const prs = listPersonalRecords().filter((p) => p.kind === "weight").slice(0, 3);
  const thisWeek = getWeek(startOfWeek(profile.today));
  const planningWeek = getWeek(planningWeekStart(profile.today, profile.preferences.food.shoppingDay));
  const pantryN = pantryCount();
  const weekSub = planningWeek && planningWeek.status !== "planning" ? `${planningWeek.status === "planned" ? "Planned" : planningWeek.status === "shopped" ? "Shopped" : "Reviewed"} · ~$${(planningWeek.estimatedCost ?? 0).toFixed(0)} of $${planningWeek.budget}` : "Sunday reset: review, leftovers, budget, meals, list, prep";

  const Tile = ({ href, icon: Icon, title, sub }: { href: string; icon: typeof Dumbbell; title: string; sub: string }) => (
    <Link href={href} className="plate press flex items-center gap-3 px-4 py-3.5">
      <span className="plate-tile flex h-11 w-11 shrink-0 items-center justify-center">
        <Icon size={19} className="text-gold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="display block text-[15px] font-semibold">{title}</span>
        <span className="serif block truncate text-[13px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  );

  return (
    <div className="page space-y-5">
      <PageHeader title="Planner" subtitle={ai ? "AI-personalised training, meals and recipes." : "Template-based training and meals. Add an AI key in Settings for personalisation."} />
      <PlanCard p={{ workout: plan.workout, meals: plan.meals, totals: plan.totals, targets: plan.targets, activeSessionId: plan.activeSession?.id ?? null, aiEnabled: ai, showFitness: true, showNutrition: true }} />
      <div className="space-y-2.5">
        <Tile href="/planner/workout" icon={Dumbbell} title="Workout" sub={plan.activeSession ? "Session in progress" : plan.workout ? `${plan.workout.name} · ${plan.workout.status}` : "Build today's session"} />
        <Tile href="/planner/meals" icon={UtensilsCrossed} title="Meals & nutrition" sub={`${plan.totals.calories} / ${plan.targets.calories} kcal · ${plan.totals.protein} / ${plan.targets.protein} g protein`} />
        <Tile href="/planner/week" icon={CalendarRange} title="Weekly preparation" sub={weekSub} />
        <Tile href="/planner/pantry" icon={Package} title="Pantry · what can I eat?" sub={pantryN ? `${pantryN} items on hand · suggestions from what you have` : "Add what you have, or finish a shopping list"} />
        <Tile href="/recipes" icon={ChefHat} title="Recipes" sub="Search by what's in your kitchen" />
        <Tile href="/coach" icon={MessageCircle} title="Coach" sub={ai ? "Ask anything about today" : "Rule-based answers (AI off)"} />
      </div>
      {thisWeek && thisWeek.status !== "planning" && <WeekFeedbackCard fb={weekFeedback(thisWeek, profile.today)} />}
      {(sessions.length > 0 || prs.length > 0) && (
        <section>
          <SectionTitle
            action={
              <Link href="/planner/workout/history" className="flex items-center text-xs text-muted">
                History <ChevronRight size={14} />
              </Link>
            }
          >
            Recent training
          </SectionTitle>
          <div className="plate divide-y divide-border/60 p-0">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Dumbbell size={14} className="text-muted" />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted">
                  {s.setCount} sets · {s.durationMin ?? 0} min · {formatShort(s.date)}
                </span>
              </div>
            ))}
            {prs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Trophy size={14} className="text-gold" />
                <span className="flex-1 truncate">PR · {p.exerciseName}</span>
                <span className="tabular text-xs text-gold">
                  {p.weight} × {p.reps}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {!ai && (
        <Link href="/profile/settings#ai" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs text-muted">
          <Sparkles size={14} className="text-gold" /> Connect an AI provider to personalise workouts, meals and quests. Everything works without it.
        </Link>
      )}
    </div>
  );
}
