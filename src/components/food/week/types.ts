import type { ItemVM } from "@/components/food/ShoppingList";
import type { WeekFeedback } from "@/services/foodWeek";

export type BudgetMode = "budget" | "balanced" | "flexible";

export interface WeekVM {
  id: number;
  /** number of days the plan covers */
  spanDays: number;
  kind: string;
  status: string;
  source: string;
  budget: number;
  budgetMode: BudgetMode;
  calorieTarget: number;
  proteinTarget: number;
  mealsNeeded: { breakfast: number; lunch: number; dinner: number; snacks: number; eatingOut: number };
  prefs: { quickWeekdays: boolean; mealPrep: boolean; highProtein: boolean; reuseIngredients: boolean; notes?: string };
  estimatedCost: number | null;
  actualCost: number | null;
  summary: { reusePct?: number; rationale?: string; distinctRecipes?: number; coveredByPantry?: number; staplesAssumed?: string[]; reconciled?: { at: string; note: string } | null; ignorePantry?: boolean };
  items: ItemVM[];
  prep: { id: number; status: string; estimatedMinutes: number; items: { name: string; servings: number; minutes: number; supports: string[] }[]; supports: string[] } | null;
  days: { date: string; label: string; meals: { id: number; mealType: string; name: string; calories: number; protein: number; status: string; prepMinutes: number | null }[] }[];
}

export interface WeekDefaults {
  budget: number;
  budgetMode: BudgetMode;
  calorieTarget: number;
  proteinTarget: number;
  eatingOut: number;
  quickWeekdays: boolean;
  mealPrep: boolean;
  highProtein: boolean;
  reuseIngredients: boolean;
}

export interface WeekPlannerProps {
  today: string;
  weekStart: string;
  weekLabel: string;
  week: WeekVM | null;
  defaults: WeekDefaults;
  pantry: { id: number; name: string; level: string | null; qty: number | null; unit: string }[];
  lastWeek: WeekFeedback | null;
  lastWeekReviewed: boolean;
  weeklyQuests: { id: number; title: string; rewardXp: number; done: boolean; progress: number; target: number }[];
  trainingDays: number[];
  aiEnabled: boolean;
  /** Deep link (?step=shop) */
  initialStep?: string | null;
  /** Days to plan when no plan exists yet (?days=5) */
  plannedDays?: number;
}

export const STEP_KEYS = ["review", "leftovers", "budget", "meals", "shop", "prep", "training", "quests", "ready"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
