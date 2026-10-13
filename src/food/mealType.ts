export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

/**
 * Infer the meal type from the local hour so it is never the first decision
 * when logging food. Always editable afterwards.
 */
export function inferMealType(hour: number): MealType {
  if (hour >= 4 && hour < 10.5) return "breakfast";
  if (hour >= 10.5 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21.5) return "dinner";
  return "snack";
}

export function mealTypeLabel(t: string): string {
  return MEAL_TYPES.find((m) => m.value === t)?.label ?? t;
}
