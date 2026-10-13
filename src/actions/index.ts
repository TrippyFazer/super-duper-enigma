"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isISODate } from "@/lib/dates";
import { DOMAIN_IDS } from "@/ranking/types";
import * as m from "@/services/mutations";
import { getProfile, updateProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { syncOura, saveOuraToken, disconnectOura } from "@/integrations/oura/sync";
import { recordEvent } from "@/services/progression";
import { awardXp } from "@/services/xp";
import { seedRecipes } from "@/db/seed";

/** What every logging action returns to the client for toasts/animations. */
export interface ActionFeedback {
  ok: boolean;
  error?: string;
  xpGained: number;
  xpLines: string[];
  levelUp: { from: number; to: number } | null;
  rankUps: { domain: string; from: string | null; to: string }[];
  achievements: { key: string; name: string; title?: string }[];
  questsCompleted: { title: string; rewardXp: number }[];
}

const dateSchema = z.string().refine(isISODate, "Invalid date");

function finish(xpLines: string[], directXp: number): ActionFeedback {
  const r = reconcile();
  revalidatePath("/", "layout");
  return {
    ok: true,
    xpGained: directXp + r.xpGained,
    xpLines: [...xpLines, ...r.completedQuests.map((q) => `Quest: ${q.title} +${q.rewardXp}`), ...r.newAchievements.filter((a) => a.xp > 0).map((a) => `${a.name} +${a.xp}`)],
    levelUp: r.levelUp,
    rankUps: r.rankUps.map((x) => ({ domain: x.domain, from: x.from, to: x.to })),
    achievements: r.newAchievements.map((a) => ({ key: a.key, name: a.name, title: a.title })),
    questsCompleted: r.completedQuests.map((q) => ({ title: q.title, rewardXp: q.rewardXp })),
  };
}

function fail(e: unknown): ActionFeedback {
  const msg = e instanceof z.ZodError ? e.issues.map((i) => i.message).join(", ") : (e as Error)?.message ?? "Something went wrong";
  return { ok: false, error: msg, xpGained: 0, xpLines: [], levelUp: null, rankUps: [], achievements: [], questsCompleted: [] };
}

function fromMutation(res: m.MutationResult): ActionFeedback {
  const direct = res.xp.reduce((a, b) => a + b.amount, 0);
  return finish(res.xp.map((x) => `${x.description} +${x.amount}`), direct);
}

/** Lightweight "just recompute" used by pages after non-XP edits. */
export async function touch(): Promise<void> {
  reconcile();
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ Fitness
const workoutSchema = z.object({
  date: dateSchema,
  type: z.enum(["strength", "cardio", "mobility", "sport", "walk", "other"]),
  durationMin: z.coerce.number().int().min(5).max(600),
  intensity: z.coerce.number().int().min(1).max(3),
  notes: z.string().max(500).optional().nullable(),
});
export async function logWorkoutAction(input: z.input<typeof workoutSchema>): Promise<ActionFeedback> {
  try {
    return fromMutation(m.logWorkout(workoutSchema.parse(input)));
  } catch (e) {
    return fail(e);
  }
}
export async function deleteWorkoutAction(id: number) {
  m.deleteWorkout(z.number().int().parse(id));
  await touch();
}
const stepsSchema = z.object({ date: dateSchema, steps: z.coerce.number().int().min(0).max(100000), activeMinutes: z.coerce.number().int().min(0).max(1440).optional().nullable() });
export async function logStepsAction(input: z.input<typeof stepsSchema>): Promise<ActionFeedback> {
  try {
    return fromMutation(m.logSteps(stepsSchema.parse(input)));
  } catch (e) {
    return fail(e);
  }
}

// -------------------------------------------------------------------- Sleep
const sleepSchema = z.object({
  date: dateSchema,
  totalSleepMin: z.coerce.number().int().min(0).max(1200),
  bedtime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  waketime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  quality: z.coerce.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export async function logSleepAction(input: z.input<typeof sleepSchema>): Promise<ActionFeedback> {
  try {
    return fromMutation(m.logSleep(sleepSchema.parse(input)));
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ Cooking
const mealSchema = z.object({
  date: dateSchema,
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().trim().min(1).max(120),
  recipeId: z.coerce.number().int().optional().nullable(),
  isNewRecipe: z.boolean().optional(),
  qualityTags: z.array(z.string()).optional(),
  notes: z.string().max(500).optional().nullable(),
});
export async function logMealAction(input: z.input<typeof mealSchema>): Promise<ActionFeedback> {
  try {
    return fromMutation(m.logMeal(mealSchema.parse(input)));
  } catch (e) {
    return fail(e);
  }
}
export async function deleteMealAction(id: number) {
  m.deleteMeal(z.number().int().parse(id));
  await touch();
}
export async function toggleRecipeFlagAction(id: number, field: "isFavorite" | "isSaved", value: boolean) {
  m.toggleRecipeFlag(z.number().int().parse(id), field, !!value);
  revalidatePath("/recipes", "layout");
}
const recipeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(400).optional(),
  ingredients: z.array(z.string()).min(1),
  steps: z.array(z.string()).min(1),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "any"]),
  prepTimeMin: z.coerce.number().int().min(0).max(600),
  cookTimeMin: z.coerce.number().int().min(0).max(600),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  servings: z.coerce.number().int().min(1).max(50).optional(),
});
export async function createRecipeAction(input: z.input<typeof recipeSchema>): Promise<{ ok: boolean; id?: number; error?: string }> {
  try {
    const id = m.createRecipe(recipeSchema.parse(input));
    revalidatePath("/recipes", "layout");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: fail(e).error };
  }
}

// ----------------------------------------------------------------- Skincare
export async function createRoutineAction(input: { name: string; timeOfDay: "morning" | "evening"; steps: string[] }) {
  const s = z.object({ name: z.string().trim().min(1).max(60), timeOfDay: z.enum(["morning", "evening"]), steps: z.array(z.string().trim().max(60)).min(1) }).parse(input);
  m.createRoutine(s);
  await touch();
}
export async function updateRoutineAction(id: number, input: { name?: string; steps?: string[]; active?: boolean }) {
  m.updateRoutine(z.number().int().parse(id), input);
  await touch();
}
export async function deleteRoutineAction(id: number) {
  m.deleteRoutine(z.number().int().parse(id));
  await touch();
}
export async function completeRoutineAction(input: { routineId: number; date: string; stepsCompleted?: string[] }): Promise<ActionFeedback> {
  try {
    const s = z.object({ routineId: z.number().int(), date: dateSchema, stepsCompleted: z.array(z.string()).optional() }).parse(input);
    return fromMutation(m.completeRoutine(s));
  } catch (e) {
    return fail(e);
  }
}
export async function uncompleteRoutineAction(routineId: number, date: string) {
  m.uncompleteRoutine(z.number().int().parse(routineId), dateSchema.parse(date));
  await touch();
}

// ------------------------------------------------------------------- Habits
const habitSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(8).optional().nullable(),
  scheduleType: z.enum(["daily", "weekdays", "times_per_week"]),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  timesPerWeek: z.coerce.number().int().min(1).max(7).optional(),
});
export async function createHabitAction(input: z.input<typeof habitSchema>) {
  m.createHabit(habitSchema.parse(input));
  await touch();
}
export async function updateHabitAction(id: number, input: Partial<z.input<typeof habitSchema>> & { active?: boolean }) {
  m.updateHabit(z.number().int().parse(id), habitSchema.partial().extend({ active: z.boolean().optional() }).parse(input));
  await touch();
}
export async function deleteHabitAction(id: number) {
  m.deleteHabit(z.number().int().parse(id));
  await touch();
}
export async function completeHabitAction(habitId: number, date: string): Promise<ActionFeedback> {
  try {
    return fromMutation(m.completeHabit({ habitId: z.number().int().parse(habitId), date: dateSchema.parse(date) }));
  } catch (e) {
    return fail(e);
  }
}
export async function uncompleteHabitAction(habitId: number, date: string) {
  m.uncompleteHabit(z.number().int().parse(habitId), dateSchema.parse(date));
  await touch();
}

// ----------------------------------------------------------------- Sobriety
export async function createSobrietyTrackerAction(input: { name: string; category: string; startedAt: string; icon?: string | null }) {
  const s = z.object({ name: z.string().trim().min(1).max(60), category: z.enum(["alcohol", "cannabis", "nicotine", "custom"]), startedAt: z.string().datetime({ offset: true }).or(z.string().min(10)), icon: z.string().max(8).optional().nullable() }).parse(input);
  m.createSobrietyTracker(s);
  await touch();
}
export async function resetSobrietyAction(trackerId: number, at: string, note?: string | null): Promise<ActionFeedback> {
  try {
    m.resetSobriety({ trackerId: z.number().int().parse(trackerId), at, note });
    recordEvent({ type: "system", key: `sobreset:${trackerId}:${at}`, title: "Fresh start", description: "A run ended and a new one began. The history stays; the rank bends but doesn't break.", domain: "sobriety" });
    return finish([], 0);
  } catch (e) {
    return fail(e);
  }
}
export async function updateSobrietyTrackerAction(id: number, input: { name?: string; active?: boolean; startedAt?: string }) {
  m.updateSobrietyTracker(z.number().int().parse(id), input);
  await touch();
}
export async function deleteSobrietyTrackerAction(id: number) {
  m.deleteSobrietyTracker(z.number().int().parse(id));
  await touch();
}

// ------------------------------------------------------------------- Wealth
const money = z.coerce.number().min(-1e9).max(1e10).optional().nullable();
const snapshotSchema = z.object({
  date: dateSchema,
  netWorth: money,
  liquidSavings: money,
  monthlyExpenses: money,
  monthlyIncome: money,
  savingsRatePct: z.coerce.number().min(-100).max(100).optional().nullable(),
  highInterestDebt: money,
  totalDebt: money,
  retirementBalance: money,
  investsMonthly: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});
export async function addFinancialSnapshotAction(input: z.input<typeof snapshotSchema>): Promise<ActionFeedback> {
  try {
    return fromMutation(m.addFinancialSnapshot(snapshotSchema.parse(input)));
  } catch (e) {
    return fail(e);
  }
}
export async function deleteFinancialSnapshotAction(id: number) {
  m.deleteFinancialSnapshot(z.number().int().parse(id));
  await touch();
}

// ------------------------------------------------------------------ Profile
const onboardingSchema = z.object({
  name: z.string().trim().min(1).max(40),
  age: z.coerce.number().int().min(13).max(110).optional().nullable(),
  sex: z.enum(["male", "female", "other"]).optional().nullable(),
  heightCm: z.coerce.number().min(100).max(250).optional().nullable(),
  weightKg: z.coerce.number().min(30).max(300).optional().nullable(),
  timezone: z.string().min(1),
  activeDomains: z.array(z.enum(DOMAIN_IDS)).min(1),
  baseline: z.object({
    workoutsPerWeek: z.coerce.number().min(0).max(14).optional().nullable(),
    exerciseTypes: z.array(z.string()).optional().nullable(),
    stepsPerDay: z.coerce.number().min(0).max(50000).optional().nullable(),
    avgSleepHours: z.coerce.number().min(3).max(14).optional().nullable(),
    consistentSchedule: z.boolean().optional().nullable(),
    mealsCookedPerWeek: z.coerce.number().min(0).max(21).optional().nullable(),
    skincareDaysPerWeek: z.coerce.number().min(0).max(7).optional().nullable(),
  }),
  targets: z.object({
    stepsTarget: z.coerce.number().int().min(1000).max(40000).optional(),
    bedtimeTarget: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    sleepTargetMin: z.coerce.number().int().min(300).max(720).optional(),
    workoutsPerWeekTarget: z.coerce.number().int().min(1).max(7).optional(),
    mealsPerWeekTarget: z.coerce.number().int().min(1).max(21).optional(),
  }),
  goals: z.string().max(500).optional().nullable(),
  routines: z.object({ morning: z.array(z.string()).optional(), evening: z.array(z.string()).optional() }).optional(),
  sobriety: z.array(z.object({ name: z.string().trim().min(1).max(60), category: z.enum(["alcohol", "cannabis", "nicotine", "custom"]), startedAt: z.string().min(10) })).optional(),
  habits: z.array(z.string().trim().min(1).max(60)).optional(),
  preferences: z
    .object({
      fitness: z.object({ goal: z.enum(["general", "strength", "muscle", "fat-loss", "conditioning", "athleticism", "hybrid"]), experience: z.enum(["beginner", "intermediate", "advanced"]), daysPerWeek: z.coerce.number().int().min(1).max(7), equipment: z.array(z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "cardio-machine"])), workoutLengthMin: z.coerce.number().int().min(15).max(120), injuries: z.string().max(300).optional(), preferences: z.string().max(300).optional() }).partial().optional(),
      nutrition: z.object({ goal: z.enum(["maintain", "lose", "gain", "recomp"]), calorieTarget: z.coerce.number().int().min(800).max(6000).nullable(), proteinTarget: z.coerce.number().int().min(20).max(400).nullable(), dietPrefs: z.array(z.string().max(30)), dislikes: z.array(z.string().max(40)), likes: z.array(z.string().max(40)).optional(), mealsPerDay: z.coerce.number().int().min(2).max(6).optional() }).partial().optional(),
      questFrequency: z.enum(["low", "normal", "high"]).optional(),
    })
    .optional(),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionFeedback> {
  try {
    const s = onboardingSchema.parse(input);
    const now = new Date().toISOString();
    updateProfile({
      name: s.name,
      age: s.age ?? null,
      sex: s.sex ?? null,
      heightCm: s.heightCm ?? null,
      weightKg: s.weightKg ?? null,
      timezone: s.timezone,
      activeDomains: s.activeDomains,
      baseline: s.baseline,
      targets: s.targets,
      goals: s.goals ?? null,
      onboardingCompletedAt: now,
      preferences: (s.preferences ?? {}) as never,
    });
    seedRecipes();
    if (s.routines?.morning?.length) m.createRoutine({ name: "Morning routine", timeOfDay: "morning", steps: s.routines.morning });
    if (s.routines?.evening?.length) m.createRoutine({ name: "Evening routine", timeOfDay: "evening", steps: s.routines.evening });
    for (const t of s.sobriety ?? []) m.createSobrietyTracker(t);
    for (const h of s.habits ?? []) m.createHabit({ name: h, scheduleType: "daily" });
    const profile = getProfile();
    const xp = awardXp("onboarding", profile.today);
    return finish(xp.awarded ? [`Character created +${xp.amount}`] : [], xp.amount);
  } catch (e) {
    return fail(e);
  }
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  equippedTitle: z.string().max(60).optional().nullable(),
  age: z.coerce.number().int().min(13).max(110).optional().nullable(),
  timezone: z.string().optional(),
  activeDomains: z.array(z.enum(DOMAIN_IDS)).min(1).optional(),
  targets: onboardingSchema.shape.targets.partial().optional(),
  goals: z.string().max(500).optional().nullable(),
});
export async function updateProfileAction(input: z.input<typeof profileSchema>) {
  updateProfile(profileSchema.parse(input));
  await touch();
}

// --------------------------------------------------------------------- Oura
export async function syncOuraAction(days = 30): Promise<{ ok: boolean; message: string }> {
  const r = await syncOura(Math.min(365, Math.max(1, days)));
  if (r.ok) reconcile();
  revalidatePath("/", "layout");
  return { ok: r.ok, message: r.ok ? `Synced ${r.nights} nights and ${r.activityDays} activity days.` : r.error ?? "Sync failed." };
}
export async function saveOuraTokenAction(token: string): Promise<{ ok: boolean; message: string }> {
  const t = z.string().trim().min(10).max(500).parse(token);
  saveOuraToken({ accessToken: t, authType: "personal_token" });
  const r = await syncOura(30);
  if (r.ok) reconcile();
  revalidatePath("/", "layout");
  return { ok: r.ok, message: r.ok ? `Connected. Synced ${r.nights} nights.` : `Token saved but sync failed: ${r.error}` };
}
export async function disconnectOuraAction() {
  disconnectOura();
  revalidatePath("/", "layout");
}

// --------------------------------------------------------------- Dev / data
export async function markAchievementsSeenAction() {
  const { getDb } = await import("@/db/client");
  const { userAchievements } = await import("@/db/schema");
  getDb().update(userAchievements).set({ seen: true }).run();
}
