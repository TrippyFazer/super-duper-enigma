"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dumbbell, UtensilsCrossed, Moon, Footprints, Coins } from "lucide-react";
import type { DomainId } from "@/ranking/types";
import { WorkoutSheet } from "./WorkoutSheet";
import { MealSheet, type RecipeOption } from "./MealSheet";
import { SleepSheet } from "./SleepSheet";
import { StepsSheet } from "./StepsSheet";
import { FinanceSheet } from "./FinanceSheet";

export type LogKind = "workout" | "meal" | "sleep" | "steps" | "finance";

export function QuickLog({
  today,
  activeDomains,
  recipes,
  stepsTarget,
  bedtimeTarget,
  hasOura,
  variant = "row",
  only,
}: {
  today: string;
  activeDomains: DomainId[];
  recipes: RecipeOption[];
  stepsTarget: number;
  bedtimeTarget: string | null;
  hasOura: boolean;
  variant?: "row" | "buttons";
  only?: LogKind[];
}) {
  const [open, setOpen] = useState<LogKind | null>(null);
  const params = useSearchParams();
  const router = useRouter();

  // Deep link: /?log=workout
  useEffect(() => {
    const l = params.get("log") as LogKind | "1" | null;
    if (l) {
      setOpen(l === "1" ? "workout" : l);
      router.replace(window.location.pathname, { scroll: false });
    }
  }, [params, router]);

  const items: { kind: LogKind; label: string; icon: typeof Dumbbell; show: boolean }[] = [
    { kind: "workout", label: "Workout", icon: Dumbbell, show: activeDomains.includes("fitness") },
    { kind: "meal", label: "Meal", icon: UtensilsCrossed, show: activeDomains.includes("cooking") },
    { kind: "sleep", label: "Sleep", icon: Moon, show: activeDomains.includes("sleep") && !hasOura },
    { kind: "steps", label: "Steps", icon: Footprints, show: activeDomains.includes("fitness") && !hasOura },
    { kind: "finance", label: "Finances", icon: Coins, show: activeDomains.includes("wealth") },
  ];
  const visible = items.filter((i) => i.show && (!only || only.includes(i.kind)));

  return (
    <>
      {variant === "row" ? (
        <div className="scroll-x -mx-4 flex gap-2 px-4">
          {visible.map((i) => {
            const Icon = i.icon;
            return (
              <button key={i.kind} type="button" onClick={() => setOpen(i.kind)} className="press flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-card px-4 py-2.5 text-sm font-medium text-text-2 hover:border-gold/50 hover:text-text">
                <Icon size={16} className="text-gold" />
                {i.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visible.map((i) => {
            const Icon = i.icon;
            return (
              <button key={i.kind} type="button" onClick={() => setOpen(i.kind)} className="press flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold">
                <Icon size={16} />
                Log {i.label.toLowerCase()}
              </button>
            );
          })}
        </div>
      )}
      <WorkoutSheet open={open === "workout"} onClose={() => setOpen(null)} date={today} />
      <MealSheet open={open === "meal"} onClose={() => setOpen(null)} date={today} recipes={recipes} />
      <SleepSheet open={open === "sleep"} onClose={() => setOpen(null)} date={today} defaultBedtime={bedtimeTarget} />
      <StepsSheet open={open === "steps"} onClose={() => setOpen(null)} date={today} target={stepsTarget} />
      <FinanceSheet open={open === "finance"} onClose={() => setOpen(null)} date={today} />
    </>
  );
}
