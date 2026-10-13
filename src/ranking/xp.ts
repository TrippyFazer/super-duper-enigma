import type { DomainId } from "./types";

/**
 * XP rules — the short-term feedback loop.
 *
 * Every award has an idempotency key so repeating an action never double-pays,
 * and per-day caps stop farming (e.g. logging 10 "workouts" in a day).
 */
export interface XpRule {
  amount: number;
  /** Max times per calendar day this rule can pay out. */
  dailyCap: number;
  description: string;
}

export const XP_RULES = {
  workout: { amount: 25, dailyCap: 2, description: "Workout logged" },
  workout_long: { amount: 10, dailyCap: 1, description: "Bonus: 45+ minute session" },
  steps_target: { amount: 10, dailyCap: 1, description: "Hit daily step target" },
  sleep_logged: { amount: 5, dailyCap: 1, description: "Sleep logged" },
  sleep_target: { amount: 15, dailyCap: 1, description: "Hit sleep duration target" },
  bedtime_target: { amount: 10, dailyCap: 1, description: "In bed by target time" },
  meal_cooked: { amount: 15, dailyCap: 3, description: "Cooked a meal" },
  new_recipe: { amount: 20, dailyCap: 1, description: "Tried a new recipe" },
  routine_complete: { amount: 10, dailyCap: 2, description: "Routine complete" },
  habit_complete: { amount: 8, dailyCap: 8, description: "Habit completed" },
  sobriety_day: { amount: 5, dailyCap: 3, description: "Clean day" },
  sobriety_milestone: { amount: 0, dailyCap: 5, description: "Sobriety milestone" }, // amount comes from milestone table
  finance_snapshot: { amount: 20, dailyCap: 1, description: "Financial check-in" },
  quest_daily: { amount: 0, dailyCap: 10, description: "Daily quest" },
  quest_weekly: { amount: 0, dailyCap: 10, description: "Weekly quest" },
  quest_long: { amount: 0, dailyCap: 10, description: "Boss quest" },
  achievement: { amount: 0, dailyCap: 50, description: "Achievement" },
  onboarding: { amount: 50, dailyCap: 1, description: "Character created" },
} as const satisfies Record<string, XpRule>;

export type XpRuleKey = keyof typeof XP_RULES;

export const SOBRIETY_MILESTONES: { days: number; label: string; xp: number }[] = [
  { days: 1, label: "24 hours", xp: 20 },
  { days: 3, label: "3 days", xp: 30 },
  { days: 7, label: "1 week", xp: 50 },
  { days: 14, label: "2 weeks", xp: 75 },
  { days: 30, label: "30 days", xp: 150 },
  { days: 60, label: "60 days", xp: 200 },
  { days: 90, label: "90 days", xp: 300 },
  { days: 180, label: "6 months", xp: 400 },
  { days: 365, label: "1 year", xp: 750 },
  { days: 730, label: "2 years", xp: 1000 },
];

export function xpKey(rule: XpRuleKey, date: string, suffix?: string | number): string {
  return suffix === undefined ? `${rule}:${date}` : `${rule}:${date}:${suffix}`;
}

export const DOMAIN_FOR_RULE: Record<XpRuleKey, DomainId | "quest" | "achievement" | "system"> = {
  workout: "fitness",
  workout_long: "fitness",
  steps_target: "fitness",
  sleep_logged: "sleep",
  sleep_target: "sleep",
  bedtime_target: "sleep",
  meal_cooked: "cooking",
  new_recipe: "cooking",
  routine_complete: "skincare",
  habit_complete: "habits",
  sobriety_day: "sobriety",
  sobriety_milestone: "sobriety",
  finance_snapshot: "wealth",
  quest_daily: "quest",
  quest_weekly: "quest",
  quest_long: "quest",
  achievement: "achievement",
  onboarding: "system",
};
