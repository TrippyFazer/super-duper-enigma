"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RefreshCw } from "lucide-react";
import { generateWeekAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, cx } from "@/components/ui/primitives";
import { MiniStat, StepTitle } from "./parts";
import type { WeekVM } from "./types";

/** Step 4: the generated week, day by day. */
export function MealPlanStep({ week: w, onSetup, onNext }: { week: WeekVM | null; onSetup: () => void; onNext: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  if (!w || w.status === "planning") {
    return (
      <section className="space-y-3">
        <StepTitle eyebrow="Step 4" title="The week's meals" body="Generate the week from the Budget step first." />
        <Button full size="lg" variant="gold" onClick={onSetup}>
          Set up the week
        </Button>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 4" title="The week's meals" body={w.summary.rationale ?? "Skip, replace or eat something else on the day — nothing counts until logged."} />
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Est. cost" value={w.estimatedCost != null ? `~$${w.estimatedCost.toFixed(0)}` : "—"} sub={`budget $${w.budget}`} tone={w.estimatedCost != null && w.estimatedCost > w.budget * 1.05 ? "warn" : "ok"} />
        <MiniStat label="Recipes" value={String(w.summary.distinctRecipes ?? "—")} sub="distinct" />
        <MiniStat label="Reuse" value={w.summary.reusePct != null ? `${w.summary.reusePct}%` : "—"} sub="shared" />
      </div>
      <div className="space-y-2">
        {w.days.map((d) => {
          const live = d.meals.filter((m) => m.status !== "replaced");
          return (
            <div key={d.date} className="plate px-3.5 py-2.5">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-gold">
                <span>{d.label}</span>
                <span className="tabular text-faint">
                  {live.reduce((a, m) => a + m.calories, 0)} kcal · {live.reduce((a, m) => a + m.protein, 0)} g
                </span>
              </div>
              {d.meals.length === 0 && <div className="serif text-[13px] text-muted">Eating out / free day</div>}
              <ul className="space-y-0.5">
                {live.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-[13px]">
                    <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-faint">{m.mealType}</span>
                    <span className={cx("min-w-0 flex-1 truncate", m.status === "eaten" && "text-success", m.status === "skipped" && "line-through text-muted")}>{m.name}</span>
                    <span className="tabular text-[11px] text-muted">{m.calories}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const g = await generateWeekAction(w.id, true); toast(g.ok ? "Regenerated" : (g.error ?? "Failed"), g.ok ? "quest" : "error"); router.refresh(); })}>
          <RefreshCw size={13} /> Regenerate
        </Button>
        <Button full variant="gold" onClick={onNext}>
          Shopping list <ChevronRight size={14} />
        </Button>
      </div>
    </section>
  );
}
