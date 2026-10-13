/** Client-safe recipe constants (no database imports). */
export const RECIPE_TAGS = [
  { id: "high-protein", label: "High protein" },
  { id: "healthy", label: "Healthy" },
  { id: "cheap", label: "Cheap" },
  { id: "comfort", label: "Comfort" },
  { id: "quick", label: "Quick" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "one-pan", label: "One pan" },
  { id: "meal-prep", label: "Meal prep" },
] as const;

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export const PANTRY_STAPLES = new Set(["salt", "pepper", "olive oil", "oil", "water", "butter", "garlic", "onion", "sugar", "flour", "vinegar", "soy sauce"]);
