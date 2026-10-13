import Link from "next/link";
import { Dumbbell, UtensilsCrossed, ChevronRight, Sparkles } from "lucide-react";
import { cx } from "@/components/ui/primitives";

export interface PlanSummary {
  workout: { id: number; name: string; exercises: number; minutes: number; status: string; source: string } | null;
  meals: { count: number; eaten: number; calories: number; protein: number } | null;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  targets: { calories: number; protein: number; carbs: number; fat: number; unsafe: boolean };
  activeSessionId: number | null;
  aiEnabled: boolean;
  showFitness: boolean;
  showNutrition: boolean;
}

function Macro({ label, value, target, tone }: { label: string; value: number; target: number; tone: string }) {
  const pct = Math.min(100, target ? (value / target) * 100 : 0);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="tabular text-text-2">
          {Math.round(value)}
          <span className="text-faint">/{target}g</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Training & meal plan" card: today's workout + macro progress. Real links, no AI call on render. */
export function PlanCard({ p }: { p: PlanSummary }) {
  if (!p.showFitness && !p.showNutrition) return null;
  const w = p.workout;
  const calPct = Math.min(100, p.targets.calories ? (p.totals.calories / p.targets.calories) * 100 : 0);
  return (
    <section className="plate overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-gold" />
          <span className="eyebrow text-gold">{p.aiEnabled ? "AI training & meal plan" : "Training & meal plan"}</span>
        </div>
        <Link href="/planner" className="flex items-center text-[11px] text-muted">
          Planner <ChevronRight size={13} />
        </Link>
      </div>
      <div className="gold-rule mx-4" />
      <div className={cx("grid gap-3 px-4 py-3", p.showFitness && p.showNutrition ? "grid-cols-2" : "grid-cols-1")}>
        {p.showFitness && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-2">
              <Dumbbell size={13} className="text-gold" /> Workout
            </div>
            {w ? (
              <>
                <div className="display mt-1.5 truncate text-[15px] font-semibold">{w.name}</div>
                <div className="text-[11.5px] text-muted">
                  {w.exercises} exercises · ~{w.minutes} min
                </div>
                <Link
                  href={p.activeSessionId ? "/planner/workout/session" : w.status === "completed" ? "/planner/workout" : "/planner/workout"}
                  className={cx("press mt-2.5 inline-flex h-9 items-center justify-center rounded-sm px-4 text-xs font-semibold", w.status === "completed" ? "border border-success/40 bg-success/10 text-success" : "bg-gradient-to-b from-gold-2 to-gold text-[#1a1406]")}
                  style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}
                >
                  {p.activeSessionId ? "Resume" : w.status === "completed" ? "Done ✓" : "Start"}
                </Link>
              </>
            ) : (
              <>
                <div className="serif mt-1.5 text-[14px] text-muted">No workout generated yet.</div>
                <Link href="/planner/workout" className="press mt-2.5 inline-flex h-9 items-center justify-center rounded-sm border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold" style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}>
                  Build today&apos;s
                </Link>
              </>
            )}
          </div>
        )}
        {p.showNutrition && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-2">
              <UtensilsCrossed size={13} className="text-gold" /> Meals
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="tabular display text-[17px] font-semibold">{p.totals.calories.toLocaleString()}</span>
              <span className="text-[11px] text-muted">/ {p.targets.calories.toLocaleString()} kcal</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold" style={{ width: `${calPct}%` }} />
            </div>
            <div className="mt-2 space-y-1.5">
              <Macro label="Protein" value={p.totals.protein} target={p.targets.protein} tone="bg-success" />
            </div>
            <Link href="/planner/meals" className="press mt-2.5 inline-flex h-9 items-center justify-center rounded-sm border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold" style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}>
              {p.meals ? `View plan · ${p.meals.eaten}/${p.meals.count} eaten` : "Plan meals"}
            </Link>
          </div>
        )}
      </div>
      {p.showNutrition && (p.totals.carbs > 0 || p.totals.fat > 0) && (
        <div className="grid grid-cols-2 gap-3 border-t border-border/60 px-4 py-2.5">
          <Macro label="Carbs" value={p.totals.carbs} target={p.targets.carbs} tone="bg-accent" />
          <Macro label="Fat" value={p.totals.fat} target={p.targets.fat} tone="bg-warn" />
        </div>
      )}
    </section>
  );
}
