import type { Equipment } from "@/planner/exercises";

/**
 * User preferences stored as JSON in profiles.preferences. Everything has a
 * sensible default so the app works before any of it is filled in.
 */
export type FitnessGoal = "general" | "strength" | "muscle" | "fat-loss" | "conditioning" | "athleticism" | "hybrid";
export type Experience = "beginner" | "intermediate" | "advanced";
export type NutritionGoal = "maintain" | "lose" | "gain" | "recomp";
export type QuestFrequency = "low" | "normal" | "high";

export interface FitnessPrefs {
  goal: FitnessGoal;
  experience: Experience;
  daysPerWeek: number;
  equipment: Equipment[];
  workoutLengthMin: number;
  injuries: string;
  preferences: string;
}

export interface NutritionPrefs {
  goal: NutritionGoal;
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbTarget: number | null;
  fatTarget: number | null;
  dietPrefs: string[]; // vegetarian, pescatarian, dairy-free, gluten-free, halal, kosher, low-carb
  dislikes: string[];
  likes: string[];
  mealsPerDay: number;
  maxPrepMin: number;
  budget: "low" | "medium" | "high";
}

export interface NotificationPrefs {
  quest: boolean;
  workout: boolean;
  meals: boolean;
  level: boolean;
  rank: boolean;
  achievement: boolean;
  sobriety: boolean;
  review: boolean;
  browser: boolean; // show OS notifications when the app is open
}

export interface AiPrefs {
  provider: "openai" | "anthropic" | "none";
  model: string | null;
  baseUrl: string | null;
}

export interface Preferences {
  fitness: FitnessPrefs;
  nutrition: NutritionPrefs;
  questFrequency: QuestFrequency;
  notifications: NotificationPrefs;
  ai: AiPrefs;
}

export const DEFAULT_PREFERENCES: Preferences = {
  fitness: { goal: "general", experience: "beginner", daysPerWeek: 3, equipment: ["dumbbell", "bodyweight"], workoutLengthMin: 45, injuries: "", preferences: "" },
  nutrition: { goal: "maintain", calorieTarget: null, proteinTarget: null, carbTarget: null, fatTarget: null, dietPrefs: [], dislikes: [], likes: [], mealsPerDay: 3, maxPrepMin: 30, budget: "medium" },
  questFrequency: "normal",
  notifications: { quest: true, workout: true, meals: true, level: true, rank: true, achievement: true, sobriety: true, review: true, browser: false },
  ai: { provider: "none", model: null, baseUrl: null },
};

export function mergePreferences(raw: Partial<Preferences> | null | undefined): Preferences {
  return {
    fitness: { ...DEFAULT_PREFERENCES.fitness, ...(raw?.fitness ?? {}) },
    nutrition: { ...DEFAULT_PREFERENCES.nutrition, ...(raw?.nutrition ?? {}) },
    questFrequency: raw?.questFrequency ?? DEFAULT_PREFERENCES.questFrequency,
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(raw?.notifications ?? {}) },
    ai: { ...DEFAULT_PREFERENCES.ai, ...(raw?.ai ?? {}) },
  };
}

/**
 * Reasonable nutrition targets from body data when the user hasn't set them.
 * Mifflin-St Jeor with a light activity factor; protein 1.6 g/kg; never below floors.
 */
export function estimateTargets(p: { weightKg?: number | null; heightCm?: number | null; age?: number | null; sex?: string | null; goal: NutritionGoal }): { calories: number; protein: number; carbs: number; fat: number } {
  const w = p.weightKg ?? 75;
  const h = p.heightCm ?? 175;
  const a = p.age ?? 30;
  const bmr = p.sex === "female" ? 10 * w + 6.25 * h - 5 * a - 161 : 10 * w + 6.25 * h - 5 * a + 5;
  let tdee = bmr * 1.45;
  if (p.goal === "lose") tdee -= 400;
  if (p.goal === "gain") tdee += 300;
  const calories = Math.max(SAFE_MIN_CALORIES(p.sex), Math.round(tdee / 10) * 10);
  const protein = Math.round(w * 1.6);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

export function SAFE_MIN_CALORIES(sex?: string | null): number {
  return sex === "female" ? 1200 : 1500;
}

/** Returns a warning string when nutrition targets look unsafe; such targets never earn XP. */
export function targetWarning(n: NutritionPrefs, sex?: string | null): string | null {
  if (n.calorieTarget != null && n.calorieTarget < SAFE_MIN_CALORIES(sex)) {
    return `A ${n.calorieTarget} kcal target is below the ${SAFE_MIN_CALORIES(sex)} kcal floor this app will reinforce. Targets this low won't earn XP, and you should talk to a professional before following one.`;
  }
  if (n.proteinTarget != null && n.proteinTarget > 300) return "A protein target above 300 g/day is unusual. Double-check the number.";
  return null;
}
