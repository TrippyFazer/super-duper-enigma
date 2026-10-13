import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  dailyActivity,
  financialSnapshots,
  habitCompletions,
  habits,
  meals,
  recipes,
  routineCompletions,
  routines,
  sleepEntries,
  sobrietyRuns,
  sobrietyTrackers,
  workouts,
} from "@/db/schema";
import { hhmmToMinutes, type ISODate } from "@/lib/dates";
import { toJson } from "@/lib/json";
import { getProfile } from "./profile";
import { awardXp, type XpAward } from "./xp";

export interface MutationResult {
  ok: true;
  xp: XpAward[];
  id?: number;
}

const awards = (...xs: XpAward[]) => xs.filter((x) => x.awarded);

// ---------------------------------------------------------------------------
// Fitness
// ---------------------------------------------------------------------------
export function logWorkout(input: { date: ISODate; type: string; durationMin: number; intensity: number; notes?: string | null }): MutationResult {
  const db = getDb();
  const r = db.insert(workouts).values({ ...input, source: "manual" }).returning({ id: workouts.id }).get();
  const xp = awards(
    awardXp("workout", input.date, { suffix: r.id }),
    ...(input.durationMin >= 45 ? [awardXp("workout_long", input.date)] : []),
  );
  return { ok: true, xp, id: r.id };
}

export function deleteWorkout(id: number) {
  getDb().delete(workouts).where(eq(workouts.id, id)).run();
}

export function logSteps(input: { date: ISODate; steps: number; activeMinutes?: number | null }): MutationResult {
  const db = getDb();
  const profile = getProfile();
  db.insert(dailyActivity)
    .values({ date: input.date, steps: input.steps, activeMinutes: input.activeMinutes ?? null, source: "manual" })
    .onConflictDoUpdate({ target: dailyActivity.date, set: { steps: input.steps, activeMinutes: input.activeMinutes ?? null } })
    .run();
  const xp = input.steps >= profile.targets.stepsTarget ? awards(awardXp("steps_target", input.date)) : [];
  return { ok: true, xp };
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------
export function logSleep(input: {
  date: ISODate;
  totalSleepMin: number;
  bedtime?: string | null; // "HH:MM" local
  waketime?: string | null; // "HH:MM" local
  quality?: number | null;
  notes?: string | null;
}): MutationResult {
  const db = getDb();
  const profile = getProfile();
  // Store bedtime as an ISO-like string with the local clock time so regularity
  // scoring can read HH:MM directly. Bedtimes after noon belong to the previous day.
  let bedtimeStart: string | null = null;
  let bedtimeEnd: string | null = null;
  if (input.bedtime) {
    const prev = hhmmToMinutes(input.bedtime) >= 12 * 60;
    const d = prev ? shiftDate(input.date, -1) : input.date;
    bedtimeStart = `${d}T${input.bedtime}:00`;
  }
  if (input.waketime) bedtimeEnd = `${input.date}T${input.waketime}:00`;

  db.insert(sleepEntries)
    .values({
      date: input.date,
      source: "manual",
      totalSleepMin: input.totalSleepMin,
      bedtimeStart,
      bedtimeEnd,
      quality: input.quality ?? null,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: sleepEntries.date,
      set: { totalSleepMin: input.totalSleepMin, bedtimeStart, bedtimeEnd, quality: input.quality ?? null, notes: input.notes ?? null, source: "manual" },
    })
    .run();

  const xp = awards(
    awardXp("sleep_logged", input.date),
    ...(input.totalSleepMin >= profile.targets.sleepTargetMin ? [awardXp("sleep_target", input.date)] : []),
    ...(bedtimeStart && profile.targets.bedtimeTarget && inBedByTarget(input.bedtime!, profile.targets.bedtimeTarget) ? [awardXp("bedtime_target", input.date)] : []),
  );
  return { ok: true, xp };
}

function shiftDate(d: ISODate, n: number): ISODate {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function inBedByTarget(bed: string, target: string): boolean {
  let b = hhmmToMinutes(bed);
  let t = hhmmToMinutes(target);
  if (b < 240) b += 1440;
  if (t < 240) t += 1440;
  return b <= t + 15;
}

// ---------------------------------------------------------------------------
// Cooking
// ---------------------------------------------------------------------------
export function logMeal(input: { date: ISODate; mealType: string; name: string; recipeId?: number | null; isNewRecipe?: boolean; qualityTags?: string[]; notes?: string | null }): MutationResult {
  const db = getDb();
  let isNew = input.isNewRecipe ?? false;
  if (input.recipeId) {
    const prior = db.select({ id: meals.id }).from(meals).where(eq(meals.recipeId, input.recipeId)).get();
    if (!prior) isNew = true;
  }
  const r = db
    .insert(meals)
    .values({
      date: input.date,
      mealType: input.mealType,
      name: input.name,
      recipeId: input.recipeId ?? null,
      isNewRecipe: isNew,
      qualityTags: toJson(input.qualityTags ?? []),
      notes: input.notes ?? null,
    })
    .returning({ id: meals.id })
    .get();
  const xp = awards(awardXp("meal_cooked", input.date, { suffix: r.id }), ...(isNew ? [awardXp("new_recipe", input.date)] : []));
  return { ok: true, xp, id: r.id };
}

export function deleteMeal(id: number) {
  getDb().delete(meals).where(eq(meals.id, id)).run();
}

export function toggleRecipeFlag(id: number, field: "isFavorite" | "isSaved", value: boolean) {
  getDb().update(recipes).set({ [field]: value }).where(eq(recipes.id, id)).run();
}

export function createRecipe(input: {
  name: string;
  description?: string;
  ingredients: string[];
  steps: string[];
  mealType: string;
  prepTimeMin: number;
  cookTimeMin: number;
  difficulty: string;
  tags: string[];
  servings?: number;
}): number {
  const db = getDb();
  const slugBase = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe";
  let slug = slugBase;
  let i = 2;
  while (db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, slug)).get()) slug = `${slugBase}-${i++}`;
  const r = db
    .insert(recipes)
    .values({
      slug,
      name: input.name,
      description: input.description ?? "",
      ingredients: toJson(input.ingredients.map((s) => s.toLowerCase().trim()).filter(Boolean)),
      steps: toJson(input.steps.filter(Boolean)),
      mealType: input.mealType,
      prepTimeMin: input.prepTimeMin,
      cookTimeMin: input.cookTimeMin,
      difficulty: input.difficulty,
      tags: toJson(input.tags),
      servings: input.servings ?? 2,
      source: "custom",
      isSaved: true,
    })
    .returning({ id: recipes.id })
    .get();
  return r.id;
}

// ---------------------------------------------------------------------------
// Skincare / routines
// ---------------------------------------------------------------------------
export function createRoutine(input: { name: string; timeOfDay: "morning" | "evening"; steps: string[] }): number {
  const steps = input.steps.filter(Boolean).map((name, i) => ({ id: `s${i + 1}-${Math.random().toString(36).slice(2, 6)}`, name }));
  const r = getDb().insert(routines).values({ name: input.name, timeOfDay: input.timeOfDay, steps: toJson(steps) }).returning({ id: routines.id }).get();
  return r.id;
}

export function updateRoutine(id: number, input: { name?: string; steps?: string[]; active?: boolean }) {
  const db = getDb();
  const values: Partial<typeof routines.$inferInsert> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.active !== undefined) values.active = input.active;
  if (input.steps !== undefined) {
    values.steps = toJson(input.steps.filter(Boolean).map((name, i) => ({ id: `s${i + 1}-${Math.random().toString(36).slice(2, 6)}`, name })));
  }
  db.update(routines).set(values).where(eq(routines.id, id)).run();
}

export function deleteRoutine(id: number) {
  getDb().delete(routines).where(eq(routines.id, id)).run();
}

export function completeRoutine(input: { routineId: number; date: ISODate; stepsCompleted?: string[]; complete?: boolean }): MutationResult {
  const db = getDb();
  const complete = input.complete ?? true;
  db.insert(routineCompletions)
    .values({ routineId: input.routineId, date: input.date, stepsCompleted: toJson(input.stepsCompleted ?? []), complete })
    .onConflictDoUpdate({
      target: [routineCompletions.routineId, routineCompletions.date],
      set: { stepsCompleted: toJson(input.stepsCompleted ?? []), complete },
    })
    .run();
  const xp = complete ? awards(awardXp("routine_complete", input.date, { suffix: input.routineId })) : [];
  return { ok: true, xp };
}

export function uncompleteRoutine(routineId: number, date: ISODate) {
  getDb().delete(routineCompletions).where(and(eq(routineCompletions.routineId, routineId), eq(routineCompletions.date, date))).run();
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------
export function createHabit(input: { name: string; icon?: string | null; scheduleType: string; weekdays?: number[]; timesPerWeek?: number }): number {
  const r = getDb()
    .insert(habits)
    .values({
      name: input.name,
      icon: input.icon ?? null,
      scheduleType: input.scheduleType,
      weekdays: toJson(input.weekdays ?? [1, 2, 3, 4, 5]),
      timesPerWeek: input.timesPerWeek ?? 3,
    })
    .returning({ id: habits.id })
    .get();
  return r.id;
}

export function updateHabit(id: number, input: { name?: string; icon?: string | null; scheduleType?: string; weekdays?: number[]; timesPerWeek?: number; active?: boolean }) {
  const values: Partial<typeof habits.$inferInsert> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.icon !== undefined) values.icon = input.icon;
  if (input.scheduleType !== undefined) values.scheduleType = input.scheduleType;
  if (input.weekdays !== undefined) values.weekdays = toJson(input.weekdays);
  if (input.timesPerWeek !== undefined) values.timesPerWeek = input.timesPerWeek;
  if (input.active !== undefined) {
    values.active = input.active;
    values.archivedAt = input.active ? null : new Date().toISOString();
  }
  getDb().update(habits).set(values).where(eq(habits.id, id)).run();
}

export function deleteHabit(id: number) {
  getDb().delete(habits).where(eq(habits.id, id)).run();
}

export function completeHabit(input: { habitId: number; date: ISODate }): MutationResult {
  getDb().insert(habitCompletions).values(input).onConflictDoNothing().run();
  const xp = awards(awardXp("habit_complete", input.date, { suffix: input.habitId }));
  return { ok: true, xp };
}

export function uncompleteHabit(habitId: number, date: ISODate) {
  getDb().delete(habitCompletions).where(and(eq(habitCompletions.habitId, habitId), eq(habitCompletions.date, date))).run();
}

// ---------------------------------------------------------------------------
// Sobriety
// ---------------------------------------------------------------------------
export function createSobrietyTracker(input: { name: string; category: string; startedAt: string; icon?: string | null }): number {
  const db = getDb();
  const t = db.insert(sobrietyTrackers).values({ name: input.name, category: input.category, icon: input.icon ?? null }).returning({ id: sobrietyTrackers.id }).get();
  db.insert(sobrietyRuns).values({ trackerId: t.id, startedAt: input.startedAt }).run();
  return t.id;
}

/** Ends the current run (if any) and starts a new one. Never deletes history. */
export function resetSobriety(input: { trackerId: number; at: string; note?: string | null }): void {
  const db = getDb();
  db.update(sobrietyRuns)
    .set({ endedAt: input.at, note: input.note ?? null })
    .where(and(eq(sobrietyRuns.trackerId, input.trackerId), isNull(sobrietyRuns.endedAt)))
    .run();
  db.insert(sobrietyRuns).values({ trackerId: input.trackerId, startedAt: input.at }).run();
}

export function updateSobrietyTracker(id: number, input: { name?: string; active?: boolean; startedAt?: string }) {
  const db = getDb();
  if (input.name !== undefined || input.active !== undefined) {
    db.update(sobrietyTrackers)
      .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}) })
      .where(eq(sobrietyTrackers.id, id))
      .run();
  }
  if (input.startedAt) {
    db.update(sobrietyRuns).set({ startedAt: input.startedAt }).where(and(eq(sobrietyRuns.trackerId, id), isNull(sobrietyRuns.endedAt))).run();
  }
}

export function deleteSobrietyTracker(id: number) {
  getDb().delete(sobrietyTrackers).where(eq(sobrietyTrackers.id, id)).run();
}

// ---------------------------------------------------------------------------
// Wealth
// ---------------------------------------------------------------------------
export function addFinancialSnapshot(input: {
  date: ISODate;
  netWorth?: number | null;
  liquidSavings?: number | null;
  monthlyExpenses?: number | null;
  monthlyIncome?: number | null;
  savingsRatePct?: number | null;
  highInterestDebt?: number | null;
  totalDebt?: number | null;
  retirementBalance?: number | null;
  investsMonthly?: boolean;
  notes?: string | null;
}): MutationResult {
  const r = getDb()
    .insert(financialSnapshots)
    .values({ ...input, investsMonthly: input.investsMonthly ?? false })
    .returning({ id: financialSnapshots.id })
    .get();
  const xp = awards(awardXp("finance_snapshot", input.date));
  return { ok: true, xp, id: r.id };
}

export function deleteFinancialSnapshot(id: number) {
  getDb().delete(financialSnapshots).where(eq(financialSnapshots.id, id)).run();
}
