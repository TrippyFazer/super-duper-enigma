"use client";

import { useState } from "react";
import { MealPlanView, type MealVM } from "./MealPlanView";
import { NutritionLog, type PlannedSlot } from "./NutritionLog";
import { AdjustDayCard } from "./AdjustDayCard";
import { SectionTitle } from "@/components/ui/primitives";

/** Client shell that lets the log, the plan and the adjust prompt talk to each other. */
export function MealsScreen(props: { today: string; entries: Parameters<typeof NutritionLog>[0]["entries"]; recipes: Parameters<typeof NutritionLog>[0]["recipes"]; plan: { source: string; calorieTarget: number; proteinTarget: number; meals: MealVM[] } | null; aiEnabled: boolean; openLog?: boolean }) {
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const plannedSlots: PlannedSlot[] = (props.plan?.meals ?? []).filter((m) => m.status === "planned" || m.status === "prepared").map((m) => ({ id: m.id, mealType: m.mealType, name: m.name, calories: m.calories }));
  return (
    <>
      {adjustFor && <AdjustDayCard unplanned={adjustFor} onDismiss={() => setAdjustFor(null)} />}
      <NutritionLog today={props.today} entries={props.entries} recipes={props.recipes} plannedSlots={plannedSlots} openInitially={props.openLog} onAdjustOffer={(u) => setAdjustFor(u)} />
      <section>
        <SectionTitle>Today&apos;s meal plan</SectionTitle>
        <MealPlanView plan={props.plan} aiEnabled={props.aiEnabled} onAdjustOffer={(u) => setAdjustFor(u)} />
      </section>
    </>
  );
}
