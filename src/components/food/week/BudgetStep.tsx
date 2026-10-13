"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateWeekAction, upsertWeekAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { Chip, StepTitle } from "./parts";
import type { BudgetMode, WeekDefaults, WeekVM } from "./types";

/** Step 3: budget, targets, meals needed → generate. */
export function BudgetStep({ weekStart, weekLabel, week: w, defaults, aiEnabled, onGenerated }: { weekStart: string; weekLabel: string; week: WeekVM | null; defaults: WeekDefaults; aiEnabled: boolean; onGenerated: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    budget: String(w?.budget ?? defaults.budget),
    budgetMode: (w?.budgetMode ?? defaults.budgetMode) as BudgetMode,
    calorieTarget: String(w?.calorieTarget ?? defaults.calorieTarget),
    proteinTarget: String(w?.proteinTarget ?? defaults.proteinTarget),
    breakfast: String(w?.mealsNeeded.breakfast ?? 7),
    lunch: String(w?.mealsNeeded.lunch ?? 5),
    dinner: String(w?.mealsNeeded.dinner ?? 7 - defaults.eatingOut),
    snacks: String(w?.mealsNeeded.snacks ?? 1),
    eatingOut: String(w?.mealsNeeded.eatingOut ?? defaults.eatingOut),
    quickWeekdays: w?.prefs.quickWeekdays ?? defaults.quickWeekdays,
    mealPrep: w?.prefs.mealPrep ?? defaults.mealPrep,
    highProtein: w?.prefs.highProtein ?? defaults.highProtein,
    reuseIngredients: w?.prefs.reuseIngredients ?? defaults.reuseIngredients,
    notes: w?.prefs.notes ?? "",
  });
  const [more, setMore] = useState(false);
  const save = (thenGenerate: boolean) =>
    start(async () => {
      const r = await upsertWeekAction({ weekStart, budget: Number(f.budget) || 0, budgetMode: f.budgetMode, calorieTarget: Number(f.calorieTarget), proteinTarget: Number(f.proteinTarget), mealsNeeded: { breakfast: Number(f.breakfast), lunch: Number(f.lunch), dinner: Number(f.dinner), snacks: Number(f.snacks), eatingOut: Number(f.eatingOut) }, prefs: { quickWeekdays: f.quickWeekdays, mealPrep: f.mealPrep, highProtein: f.highProtein, reuseIngredients: f.reuseIngredients, notes: f.notes || undefined } });
      if (thenGenerate) {
        const g = await generateWeekAction(r.id, !!w && w.status !== "planning");
        if (!g.ok) toast(g.error ?? "Could not generate", "error");
        else toast(g.source === "ai" ? "Week planned by AI" : "Week planned from your recipes", "quest");
      }
      router.refresh();
      onGenerated();
    });

  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 3" title="Budget & meals" body={`Planning ${weekLabel}. Eating out is a plan too.`} />
      <div className="plate space-y-4 px-4 py-4">
        <Field label="Weekly grocery budget $">
          <input type="number" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Mode" group hint="Budget trims hardest; flexible allows ~25% over">
          <Segmented
            value={f.budgetMode}
            onChange={(v) => setF({ ...f, budgetMode: v })}
            options={[
              { value: "budget", label: "Budget" },
              { value: "balanced", label: "Balanced" },
              { value: "flexible", label: "Flexible" },
            ]}
          />
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-medium text-text-2">Meals needed</div>
          <div className="grid grid-cols-5 gap-2">
            {(
              [
                ["breakfast", "Bfast"],
                ["lunch", "Lunch"],
                ["dinner", "Dinner"],
                ["snacks", "Snacks/d"],
                ["eatingOut", "Out"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="text-center text-[10px] text-muted">
                {l}
                <input type="number" inputMode="numeric" min={0} max={k === "snacks" ? 3 : 14} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "tabular mt-1 px-1 text-center")} aria-label={l} />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={f.quickWeekdays} onClick={() => setF({ ...f, quickWeekdays: !f.quickWeekdays })}>
            Quick weekdays
          </Chip>
          <Chip on={f.mealPrep} onClick={() => setF({ ...f, mealPrep: !f.mealPrep })}>
            Meal prep
          </Chip>
          <Chip on={f.highProtein} onClick={() => setF({ ...f, highProtein: !f.highProtein })}>
            High protein
          </Chip>
          <Chip on={f.reuseIngredients} onClick={() => setF({ ...f, reuseIngredients: !f.reuseIngredients })}>
            Reuse ingredients
          </Chip>
        </div>
        {more ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calories / day">
                <input type="number" inputMode="numeric" value={f.calorieTarget} onChange={(e) => setF({ ...f, calorieTarget: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Protein g / day">
                <input type="number" inputMode="numeric" value={f.proteinTarget} onChange={(e) => setF({ ...f, proteinTarget: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={aiEnabled ? "two fish dinners, no pasta" : "Used by AI planning only"} className={inputClass} maxLength={300} />
            </Field>
          </>
        ) : (
          <button onClick={() => setMore(true)} className="press h-9 text-left text-xs text-muted">
            Targets {f.calorieTarget} kcal · {f.proteinTarget} g · notes — edit
          </button>
        )}
      </div>
      <Button full size="lg" variant="gold" disabled={pending} onClick={() => save(true)}>
        {pending ? "Planning…" : w && w.status !== "planning" ? "Save & regenerate" : "Generate week"}
      </Button>
      {w && w.status !== "planning" && (
        <Button full variant="ghost" disabled={pending} onClick={() => save(false)}>
          Save settings only
        </Button>
      )}
    </section>
  );
}
