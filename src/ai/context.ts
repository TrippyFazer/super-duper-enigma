import { addDays, lastNDays, type ISODate } from "@/lib/dates";
import { EXERCISES } from "@/planner/exercises";
import type { CharacterAssessment } from "@/ranking/types";
import { DOMAINS } from "@/ranking/domains";
import { loadRecipes, loadSleep, loadWorkouts } from "@/services/loaders";
import { dayTotals, entriesForDate, resolveTargets } from "@/services/nutrition";
import type { ProfileView } from "@/services/profile";
import { listPersonalRecords, recentSessions } from "@/services/workouts";
import type { Preferences } from "@/services/preferences";

/**
 * Structured context handed to the AI. Everything here is derived from real
 * logs — the model never has to guess user data, and we never send more than
 * it needs for the task.
 */
export interface AiContext {
  profile: { name: string; age: number | null; sex: string | null; timezone: string; today: ISODate; localTime: string };
  rank: { overall: string; level: number; domains: { domain: string; rank: string; score: number; weakest: boolean; topRequirement: string | null }[] };
  fitness: {
    goal: string;
    experience: string;
    daysPerWeek: number;
    equipment: string[];
    workoutLengthMin: number;
    injuries: string;
    preferences: string;
    sessionsLast7: { date: string; focus: string; muscles: string[]; hard: boolean }[];
    workoutsLast14: { date: string; type: string; durationMin: number; intensity: number }[];
    personalRecords: { exercise: string; kind: string; value: number; weight: number | null; reps: number | null; date: string }[];
    readiness: number | null;
    sleepLastNightMin: number | null;
    avgSleep7Min: number | null;
    hoursSinceLastSession: number | null;
    catalog: string[];
  };
  nutrition: {
    goal: string;
    targets: { calories: number; protein: number; carbs: number; fat: number };
    todayTotals: { calories: number; protein: number; carbs: number; fat: number };
    todayEntries: { name: string; calories: number; protein: number }[];
    dietPrefs: string[];
    dislikes: string[];
    likes: string[];
    mealsPerDay: number;
    maxPrepMin: number;
    budget: string;
    savedRecipes: { id: number; name: string; mealType: string; calories: number | null; protein: number | null; tags: string[] }[];
  };
}

export function buildAiContext(profile: ProfileView, prefs: Preferences, assessment: CharacterAssessment, opts: { onHand?: string[] } = {}): AiContext {
  const today = profile.today;
  const sleep = loadSleep(today);
  const last7 = lastNDays(today, 7)[0];
  const s7 = sleep.filter((e) => e.date >= last7);
  const lastNight = sleep.find((e) => e.date === today) ?? sleep.find((e) => e.date === addDays(today, -1)) ?? null;
  const sessions = recentSessions(7, today);
  const workouts = loadWorkouts(today).filter((w) => w.date >= addDays(today, -14));
  const prs = listPersonalRecords().filter((p) => p.kind === "e1rm").slice(0, 12);
  const targets = resolveTargets(prefs.nutrition, profile);
  const totals = dayTotals(today);
  const recipes = loadRecipes();
  const weakest = [...assessment.domains].sort((a, b) => a.score - b.score)[0]?.domain;

  return {
    profile: { name: profile.name, age: profile.age, sex: profile.sex, timezone: profile.timezone, today, localTime: profile.localTime },
    rank: {
      overall: assessment.overall.rank,
      level: assessment.level.level,
      domains: assessment.domains.map((d) => ({ domain: DOMAINS[d.domain].name, rank: d.rank, score: Math.round(d.score), weakest: d.domain === weakest, topRequirement: d.next.requirements[0] ?? null })),
    },
    fitness: {
      goal: prefs.fitness.goal,
      experience: prefs.fitness.experience,
      daysPerWeek: prefs.fitness.daysPerWeek,
      equipment: prefs.fitness.equipment,
      workoutLengthMin: prefs.fitness.workoutLengthMin,
      injuries: prefs.fitness.injuries,
      preferences: prefs.fitness.preferences,
      sessionsLast7: sessions,
      workoutsLast14: workouts.map((w) => ({ date: w.date, type: w.type, durationMin: w.durationMin, intensity: w.intensity })),
      personalRecords: prs.map((p) => ({ exercise: p.exerciseName, kind: p.kind, value: p.value, weight: p.weight, reps: p.reps, date: p.date })),
      readiness: lastNight?.readinessScore ?? null,
      sleepLastNightMin: lastNight?.totalSleepMin ?? null,
      avgSleep7Min: s7.length ? Math.round(s7.reduce((a, e) => a + e.totalSleepMin, 0) / s7.length) : null,
      hoursSinceLastSession: sessions[0] ? Math.round((new Date(today + "T12:00:00Z").getTime() - new Date(sessions[0].date + "T12:00:00Z").getTime()) / 36e5) : null,
      catalog: EXERCISES.filter((e) => e.equipment.some((eq) => prefs.fitness.equipment.includes(eq)) || e.equipment.includes("bodyweight")).map((e) => e.name),
    },
    nutrition: {
      goal: prefs.nutrition.goal,
      targets: { calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat },
      todayTotals: { calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fat: totals.fat },
      todayEntries: entriesForDate(today).map((e) => ({ name: e.name, calories: e.calories, protein: e.protein })),
      dietPrefs: prefs.nutrition.dietPrefs,
      dislikes: prefs.nutrition.dislikes,
      likes: [...prefs.nutrition.likes, ...(opts.onHand ?? []).map((x) => `on hand: ${x}`)],
      mealsPerDay: prefs.nutrition.mealsPerDay,
      maxPrepMin: prefs.nutrition.maxPrepMin,
      budget: prefs.nutrition.budget,
      savedRecipes: recipes.filter((r) => r.isSaved || r.isFavorite || r.source === "custom").slice(0, 30).map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, protein: r.proteinG, tags: r.tagsParsed })),
    },
  };
}
