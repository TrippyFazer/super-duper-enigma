"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, ChevronLeft, CalendarCheck, Leaf, Coins, Sparkles, ShoppingBasket, ChefHat, Dumbbell, Swords, Flag } from "lucide-react";
import { Button, cx } from "@/components/ui/primitives";
import { ReviewStep, LeftoversStep } from "./week/LeftoversStep";
import { BudgetStep } from "./week/BudgetStep";
import { MealPlanStep } from "./week/MealPlanStep";
import { GroceryStep } from "./week/GroceryStep";
import { PrepStep } from "./week/PrepStep";
import { TrainingStep, QuestsStep, ReadyStep } from "./week/FinalSteps";
import { STEP_KEYS, type StepKey, type WeekPlannerProps } from "./week/types";

export type { WeekPlannerProps } from "./week/types";

const STEPS: { key: StepKey; label: string; icon: typeof Dumbbell }[] = [
  { key: "review", label: "Review", icon: CalendarCheck },
  { key: "leftovers", label: "Leftovers", icon: Leaf },
  { key: "budget", label: "Budget", icon: Coins },
  { key: "meals", label: "Meals", icon: Sparkles },
  { key: "shop", label: "Shopping", icon: ShoppingBasket },
  { key: "prep", label: "Prep", icon: ChefHat },
  { key: "training", label: "Training", icon: Dumbbell },
  { key: "quests", label: "Quests", icon: Swords },
  { key: "ready", label: "Ready", icon: Flag },
];

/** The Sunday reset stepper. Orchestrates the step components; every step is skippable and revisitable. */
export function WeekPlanner(p: WeekPlannerProps) {
  const storageKey = `ascend:week:${p.weekStart}`;
  const initialStep = (): StepKey => {
    if (p.initialStep && (STEP_KEYS as readonly string[]).includes(p.initialStep)) return p.initialStep as StepKey;
    if (!p.week) return p.lastWeek && !p.lastWeekReviewed ? "review" : "budget";
    if (p.week.status === "planning") return "budget";
    if (p.week.status === "planned") return p.week.items.some((i) => i.purchased) ? "shop" : "meals";
    return "prep";
  };
  const [step, setStep] = useState<StepKey>(initialStep);
  useEffect(() => {
    if (p.initialStep) return;
    try {
      const saved = localStorage.getItem(storageKey) as StepKey | null;
      if (saved && STEP_KEYS.includes(saved)) setStep(saved);
    } catch {}
  }, [storageKey, p.initialStep]);
  const go = (k: StepKey) => {
    setStep(k);
    try {
      localStorage.setItem(storageKey, k);
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idx = STEPS.findIndex((s) => s.key === step);
  const next = () => go(STEPS[Math.min(STEPS.length - 1, idx + 1)].key);
  const back = () => go(STEPS[Math.max(0, idx - 1)].key);

  return (
    <div className="space-y-4">
      <div className="scroll-x -mx-4 flex gap-1.5 px-4" role="tablist" aria-label="Steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < idx;
          return (
            <button key={s.key} role="tab" aria-selected={s.key === step} onClick={() => go(s.key)} className={cx("press flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-[11px]", s.key === step ? "border-gold/60 bg-gold/12 text-gold" : done ? "border-success/40 text-success" : "border-border bg-card text-muted")}>
              {done ? <Check size={11} /> : <Icon size={11} />} {s.label}
            </button>
          );
        })}
      </div>

      {step === "review" && <ReviewStep lastWeek={p.lastWeek} />}
      {step === "leftovers" && <LeftoversStep pantry={p.pantry} onDone={next} />}
      {step === "budget" && <BudgetStep weekStart={p.weekStart} weekLabel={p.weekLabel} week={p.week} defaults={p.defaults} aiEnabled={p.aiEnabled} onGenerated={() => go("meals")} />}
      {step === "meals" && <MealPlanStep week={p.week} onSetup={() => go("budget")} onNext={next} />}
      {step === "shop" && <GroceryStep week={p.week} onSetup={() => go("budget")} onNext={next} />}
      {step === "prep" && <PrepStep week={p.week} onNext={next} />}
      {step === "training" && <TrainingStep initial={p.trainingDays} onSaved={next} />}
      {step === "quests" && <QuestsStep quests={p.weeklyQuests} onNext={next} />}
      {step === "ready" && <ReadyStep week={p.week} />}

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" disabled={idx === 0} onClick={back}>
          <ChevronLeft size={14} /> Back
        </Button>
        {idx < STEPS.length - 1 && (
          <Button variant="ghost" size="sm" onClick={next}>
            Skip <ChevronRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
