"use server";

import { getProfile } from "@/services/profile";
import { loadRecipes } from "@/services/loaders";
import { getMealPlan, listSavedFoods } from "@/services/nutrition";
import { getActiveSession } from "@/services/workouts";
import { healthSources } from "@/health/sources";
import { todayChecklist, type ChecklistItem } from "@/services/today";
import type { DomainId } from "@/ranking/types";

export interface LogContext {
  today: string;
  activeDomains: DomainId[];
  stepsTarget: number;
  bedtimeTarget: string | null;
  showManualSleep: boolean;
  showManualSteps: boolean;
  activeSessionId: number | null;
  recipes: { id: number; name: string; mealType: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null; isFavorite: boolean }[];
  plannedSlots: { id: number; mealType: string; name: string; calories: number }[];
  recents: { id: number; name: string; brand: string | null; serving: string | null; calories: number; protein: number; carbs: number; fat: number; isEstimate: boolean }[];
  checklist: ChecklistItem[];
}

/** Everything the global + LOG sheet needs, fetched when it opens so it is never stale. */
export async function logContextAction(): Promise<LogContext> {
  const p = getProfile();
  const s = healthSources();
  const plan = getMealPlan(p.today);
  return {
    today: p.today,
    activeDomains: p.activeDomains,
    stepsTarget: p.targets.stepsTarget,
    bedtimeTarget: p.targets.bedtimeTarget,
    showManualSleep: s.showManualSleep,
    showManualSteps: s.showManualSteps,
    activeSessionId: getActiveSession()?.id ?? null,
    recipes: loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, protein: r.proteinG, carbs: r.carbsG, fat: r.fatG, isFavorite: r.isFavorite })),
    plannedSlots: (plan?.meals ?? []).filter((m) => m.status === "planned" || m.status === "prepared").map((m) => ({ id: m.id, mealType: m.mealType, name: m.name, calories: m.calories })),
    recents: listSavedFoods({ limit: 12 }).map((f) => ({ id: f.id, name: f.name, brand: f.brand, serving: f.servingDesc, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, isEstimate: f.isEstimate })),
    checklist: todayChecklist(p),
  };
}
