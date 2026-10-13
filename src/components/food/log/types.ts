import type { logNutritionAction } from "@/actions/planner";
import type { ActionFeedback } from "@/actions";
import type { MealType } from "@/food/mealType";

export type { MealType };

export interface Entry {
  id: number;
  name: string;
  mealType: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  isEstimate: boolean;
  venue: string | null;
}
export interface RecipeOpt {
  id: number;
  name: string;
  mealType: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  isFavorite: boolean;
}
export interface PlannedSlot {
  id: number;
  mealType: string;
  name: string;
  calories: number;
}
export interface RecentFood {
  id: number;
  name: string;
  brand: string | null;
  serving: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isEstimate: boolean;
}

/** A selected-but-unconfirmed food. One more tap logs it. */
export interface Draft {
  name: string;
  brand: string | null;
  serving: string | null;
  calories: number | null;
  protein: number;
  carbs: number;
  fat: number;
  isEstimate: boolean;
  source: string;
  savedFoodId?: number;
  recipeId?: number;
  /** Default for the "I cooked this" toggle. */
  cooked?: boolean;
}

export type FoodTab = "recent" | "search" | "restaurant" | "quick" | "estimate" | "recipe";

export type LogResult = Awaited<ReturnType<typeof logNutritionAction>> | (ActionFeedback & { adjustOffer?: null });

export const COMMON_FOODS = [
  { name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4 },
  { name: "Greek yogurt", calories: 150, protein: 17, carbs: 10, fat: 4 },
  { name: "2 eggs", calories: 156, protein: 12, carbs: 1, fat: 10 },
  { name: "Chicken breast (6 oz)", calories: 280, protein: 52, carbs: 0, fat: 6 },
  { name: "Rice (1 cup)", calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Coffee w/ milk", calories: 40, protein: 2, carbs: 4, fat: 2 },
];

export const macroLine = (f: { calories: number | null; protein: number }) => (f.calories == null ? `${f.protein} g protein` : `${f.calories} kcal · ${f.protein} g protein`);
