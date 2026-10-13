import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  dailyActivity,
  financialSnapshots,
  habitCompletions,
  habits,
  integrations,
  meals,
  recipes,
  routineCompletions,
  routines,
  sleepEntries,
  sobrietyRuns,
  sobrietyTrackers,
  workouts,
} from "@/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { parseJson } from "@/lib/json";

/** We keep ~400 days in memory: enough for 90-day windows plus year-long trends. */
export const HISTORY_DAYS = 400;

export function loadWorkouts(today: ISODate) {
  return getDb().select().from(workouts).where(gte(workouts.date, addDays(today, -HISTORY_DAYS))).orderBy(asc(workouts.date)).all();
}

export function loadActivity(today: ISODate) {
  return getDb().select().from(dailyActivity).where(gte(dailyActivity.date, addDays(today, -HISTORY_DAYS))).orderBy(asc(dailyActivity.date)).all();
}

export function loadSleep(today: ISODate) {
  return getDb().select().from(sleepEntries).where(gte(sleepEntries.date, addDays(today, -HISTORY_DAYS))).orderBy(asc(sleepEntries.date)).all();
}

export function loadMeals(today: ISODate) {
  return getDb().select().from(meals).where(gte(meals.date, addDays(today, -HISTORY_DAYS))).orderBy(asc(meals.date)).all();
}

export function loadAllMealsCount(): number {
  return getDb().select().from(meals).all().length;
}

export function loadRoutines() {
  return getDb()
    .select()
    .from(routines)
    .orderBy(asc(routines.id))
    .all()
    .map((r) => ({ ...r, stepsParsed: parseJson<{ id: string; name: string }[]>(r.steps, []) }));
}

export function loadRoutineCompletions(today: ISODate) {
  return getDb()
    .select()
    .from(routineCompletions)
    .where(gte(routineCompletions.date, addDays(today, -HISTORY_DAYS)))
    .orderBy(asc(routineCompletions.date))
    .all()
    .map((c) => ({ ...c, stepsCompletedParsed: parseJson<string[]>(c.stepsCompleted, []) }));
}

export function loadHabits(includeArchived = false) {
  const rows = getDb().select().from(habits).orderBy(asc(habits.id)).all();
  return rows
    .filter((h) => includeArchived || h.active)
    .map((h) => ({ ...h, weekdaysParsed: parseJson<number[]>(h.weekdays, [1, 2, 3, 4, 5]) }));
}

export function loadHabitCompletions(today: ISODate) {
  return getDb()
    .select()
    .from(habitCompletions)
    .where(gte(habitCompletions.date, addDays(today, -HISTORY_DAYS)))
    .orderBy(asc(habitCompletions.date))
    .all();
}

export function loadSobriety() {
  const db = getDb();
  const trackers = db.select().from(sobrietyTrackers).orderBy(asc(sobrietyTrackers.id)).all();
  const runs = db.select().from(sobrietyRuns).orderBy(asc(sobrietyRuns.startedAt)).all();
  return trackers.map((t) => ({ ...t, runs: runs.filter((r) => r.trackerId === t.id) }));
}

export function loadFinancialSnapshots() {
  return getDb().select().from(financialSnapshots).orderBy(asc(financialSnapshots.date), asc(financialSnapshots.id)).all();
}

export function loadRecipes() {
  return getDb()
    .select()
    .from(recipes)
    .orderBy(asc(recipes.name))
    .all()
    .map((r) => ({
      ...r,
      ingredientsParsed: parseJson<string[]>(r.ingredients, []),
      stepsParsed: parseJson<string[]>(r.steps, []),
      tagsParsed: parseJson<string[]>(r.tags, []),
    }));
}

export type RecipeView = ReturnType<typeof loadRecipes>[number];

export function loadRecipe(id: number): RecipeView | null {
  const r = getDb().select().from(recipes).where(eq(recipes.id, id)).get();
  if (!r) return null;
  return {
    ...r,
    ingredientsParsed: parseJson<string[]>(r.ingredients, []),
    stepsParsed: parseJson<string[]>(r.steps, []),
    tagsParsed: parseJson<string[]>(r.tags, []),
  };
}

export function loadIntegration(provider: string) {
  return getDb().select().from(integrations).where(eq(integrations.provider, provider)).get() ?? null;
}

export function loadWorkoutsBetween(start: ISODate, end: ISODate) {
  return getDb()
    .select()
    .from(workouts)
    .where(and(gte(workouts.date, start), eq(workouts.date, workouts.date)))
    .orderBy(desc(workouts.date))
    .all()
    .filter((w) => w.date <= end);
}
