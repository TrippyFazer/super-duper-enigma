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
import { awardXp, voidXpForSource, voidXpByKey, type XpAward } from "./xp";

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
  const src = { type: "workout" as const, id: r.id };
  const xp = awards(
    awardXp("workout", input.date, { suffix: r.id, source: src }),
    ...(input.durationMin >= 45 ? [awardXp("workout_long", input.date, { source: src })] : []),
  );
  return { ok: true, xp, id: r.id };
}

/** Deletes a logged workout and voids the XP it earned. Returns the voided amount. */
export function deleteWorkout(id: number): number {
  const db = getDb();
  const voided = voidXpForSource({ type: "workout", id }, "workout deleted");
  db.delete(workouts).where(eq(workouts.id, id)).run();
  return voided;
}

export function updateWorkout(id: number, patch: { date?: ISODate; type?: string; durationMin?: number; intensity?: number; notes?: string | null }) {
  const db = getDb();
  db.update(workouts).set(patch).where(eq(workouts.id, id)).run();
  const w = db.select().from(workouts).where(eq(workouts.id, id)).get();
  if (w && w.durationMin < 45) voidXpByKey(`workout_long:${w.date}`, "workout shortened below 45 min");
}

export function logSteps(input: { date: ISODate; steps: number; activeMinutes?: number | null }): MutationResult {
  const db = getDb();
  const profile = getProfile();
  db.insert(dailyActivity)
    .values({ date: input.date, steps: input.steps, activeMinutes: input.activeMinutes ?? null, source: "manual" })
    .onConflictDoUpdate({ target: dailyActivity.date, set: { steps: input.steps, activeMinutes: input.activeMinutes ?? null } })
    .run();
  const xp = input.steps >= profile.targets.stepsTarget ? awards(awardXp("steps_target", input.date, { source: { type: "steps", id: input.date } })) : [];
  if (input.steps < profile.targets.stepsTarget) voidXpByKey(`steps_target:${input.date}`, "steps corrected below target");
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

  const src = { type: "sleep" as const, id: input.date };
  const hitTarget = input.totalSleepMin >= profile.targets.sleepTargetMin;
  const hitBed = !!(bedtimeStart && profile.targets.bedtimeTarget && inBedByTarget(input.bedtime!, profile.targets.bedtimeTarget));
  if (!hitTarget) voidXpByKey(`sleep_target:${input.date}`, "sleep entry corrected");
  if (!hitBed) voidXpByKey(`bedtime_target:${input.date}`, "sleep entry corrected");
  const xp = awards(
    awardXp("sleep_logged", input.date, { source: src }),
    ...(hitTarget ? [awardXp("sleep_target", input.date, { source: src })] : []),
    ...(hitBed ? [awardXp("bedtime_target", input.date, { source: src })] : []),
  );
  return { ok: true, xp };
}

/** Deletes a sleep entry and voids its XP. */
export function deleteSleep(date: ISODate): number {
  const voided = voidXpForSource({ type: "sleep", id: date }, "sleep entry deleted");
  getDb().delete(sleepEntries).where(eq(sleepEntries.date, date)).run();
  return voided;
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
  const src = { type: "meal" as const, id: r.id };
  const xp = awards(awardXp("meal_cooked", input.date, { suffix: r.id, source: src }), ...(isNew ? [awardXp("new_recipe", input.date, { source: src })] : []));
  return { ok: true, xp, id: r.id };
}

/** Deletes a cooked-meal log and voids its XP. */
export function deleteMeal(id: number): number {
  const voided = voidXpForSource({ type: "meal", id }, "meal deleted");
  getDb().delete(meals).where(eq(meals.id, id)).run();
  return voided;
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
  const xp = complete ? awards(awardXp("routine_complete", input.date, { suffix: input.routineId, source: { type: "routine", id: `${input.routineId}:${input.date}` } })) : [];
  if (!complete) voidXpForSource({ type: "routine", id: `${input.routineId}:${input.date}` }, "routine un-completed");
  return { ok: true, xp };
}

/** Undo a routine completion (accidental tap). Voids its XP. */
export function uncompleteRoutine(routineId: number, date: ISODate): number {
  const voided = voidXpForSource({ type: "routine", id: `${routineId}:${date}` }, "routine un-completed");
  getDb().delete(routineCompletions).where(and(eq(routineCompletions.routineId, routineId), eq(routineCompletions.date, date))).run();
  return voided;
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
  const xp = awards(awardXp("habit_complete", input.date, { suffix: input.habitId, source: { type: "habit", id: `${input.habitId}:${input.date}` } }));
  return { ok: true, xp };
}

/** Undo an accidental habit check. Voids its XP. */
export function uncompleteHabit(habitId: number, date: ISODate): number {
  const voided = voidXpForSource({ type: "habit", id: `${habitId}:${date}` }, "habit un-checked");
  getDb().delete(habitCompletions).where(and(eq(habitCompletions.habitId, habitId), eq(habitCompletions.date, date))).run();
  return voided;
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
  const xp = awards(awardXp("finance_snapshot", input.date, { source: { type: "finance", id: r.id } }));
  return { ok: true, xp, id: r.id };
}

export function deleteFinancialSnapshot(id: number): number {
  const voided = voidXpForSource({ type: "finance", id }, "financial check-in deleted");
  getDb().delete(financialSnapshots).where(eq(financialSnapshots.id, id)).run();
  return voided;
}
