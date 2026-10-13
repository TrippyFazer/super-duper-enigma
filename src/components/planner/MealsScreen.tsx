"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { MealPlanView, type MealVM } from "./MealPlanView";
import { AdjustDayCard } from "./AdjustDayCard";
import { MacroRing } from "./MacroRing";
import { FoodLogSheet } from "@/components/food/log/FoodLogSheet";
import { ConsumedFoodList } from "@/components/food/log/ConsumedFoodList";
import type { Entry, PlannedSlot, RecentFood, RecipeOpt } from "@/components/food/log/types";
import { cx } from "@/components/ui/primitives";

/**
 * Food screen IA: TODAY → + FOOD → EATEN → REMAINING PLAN. Planned and eaten
 * are never mixed; only EATEN counts.
 */
export function MealsScreen(props: {
  today: string;
  entries: Entry[];
  recipes: RecipeOpt[];
  recents: RecentFood[];
  plan: { source: string; calorieTarget: number; proteinTarget: number; meals: MealVM[] } | null;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  targets: { calories: number; protein: number; carbs: number; fat: number; estimated: boolean };
  aiEnabled: boolean;
  openLog?: boolean;
  adjustFor?: string | null;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [open, setOpen] = useState(!!props.openLog);
  const [adjustFor, setAdjustFor] = useState<string | null>(props.adjustFor ?? null);
  const [details, setDetails] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const plannedSlots: PlannedSlot[] = (props.plan?.meals ?? []).filter((m) => m.status === "planned" || m.status === "prepared").map((m) => ({ id: m.id, mealType: m.mealType, name: m.name, calories: m.calories }));
  const { totals, targets } = props;
  const proteinLeft = Math.max(0, targets.protein - totals.protein);
  const doneMeals = (props.plan?.meals ?? []).filter((m) => m.status === "eaten" || m.status === "skipped").length;

  return (
    <>
      {/* TODAY */}
      <section className="plate px-4 py-3.5">
        <div className="flex items-center gap-4">
          <MacroRing value={totals.calories} target={targets.calories} label="kcal" size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-text-2">Protein</span>
              <span className="tabular">
                {totals.protein}
                <span className="text-faint"> / {targets.protein} g</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (totals.protein / Math.max(1, targets.protein)) * 100)}%` }} />
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted">{totals.protein >= targets.protein && targets.protein > 0 ? "Protein target hit ✓" : `${proteinLeft} g protein to go`}</div>
            <button onClick={() => setDetails((v) => !v)} aria-expanded={details} className="press -ml-1 mt-0.5 h-8 px-1 text-[11px] text-faint">
              {details ? "Hide details" : "Carbs · fat · targets"}
            </button>
          </div>
        </div>
        {details && (
          <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border/60 pt-2 text-[12px] text-muted">
            <div className="flex justify-between">
              <span>Carbs</span>
              <span className="tabular text-text-2">
                {totals.carbs}
                <span className="text-faint"> / {targets.carbs} g</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span>Fat</span>
              <span className="tabular text-text-2">
                {totals.fat}
                <span className="text-faint"> / {targets.fat} g</span>
              </span>
            </div>
            <div className="col-span-2 text-[11px] text-faint">{targets.estimated ? "Targets estimated from your profile. Set your own in Settings." : "Targets from Settings."}</div>
          </div>
        )}
      </section>

      {/* + FOOD */}
      <button onClick={() => setOpen(true)} data-testid="add-food" className="press flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-2 to-gold text-[15px] font-semibold text-[#1a1406]">
        <Plus size={20} strokeWidth={2.6} /> FOOD
      </button>

      {adjustFor && <AdjustDayCard unplanned={adjustFor} onDismiss={() => setAdjustFor(null)} />}

      {/* EATEN */}
      <section>
        <h2 className="eyebrow mb-2 px-1">Eaten</h2>
        <ConsumedFoodList entries={props.entries} today={props.today} />
      </section>

      {/* REMAINING PLAN */}
      <section>
        <div className="mb-2 flex items-end justify-between px-1">
          <h2 className="eyebrow">Remaining plan</h2>
          {doneMeals > 0 && (
            <button onClick={() => setShowDone((v) => !v)} className={cx("press h-8 text-[11px]", showDone ? "text-gold" : "text-muted")}>
              {showDone ? "Hide done" : `Show done (${doneMeals})`}
            </button>
          )}
        </div>
        <MealPlanView plan={props.plan} aiEnabled={props.aiEnabled} hideDone={!showDone} onAdjustOffer={(u) => setAdjustFor(u)} />
      </section>

      <FoodLogSheet
        open={open}
        onClose={() => setOpen(false)}
        recipes={props.recipes}
        plannedSlots={plannedSlots}
        recents={props.recents}
        onLogged={(fb) => {
          notify(fb);
          if (!fb.ok) return;
          setOpen(false);
          router.refresh();
          if (fb.adjustOffer) setAdjustFor(fb.adjustOffer.unplanned);
        }}
      />
    </>
  );
}
