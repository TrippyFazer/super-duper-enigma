"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile, updateProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { acceptOffer, completeOffer, declineOffer } from "@/services/questOffers";
import * as w from "@/services/workouts";
import * as n from "@/services/nutrition";
import { askCoach, getOrGenerateMeals, getOrGenerateWorkout } from "@/services/planner";
import { markAllRead } from "@/services/notifications";
import { clearAiSettings, saveAiSettings, aiStatus } from "@/ai/config";
import { createProvider } from "@/ai/provider";
import { z as zod } from "zod";
import type { ActionFeedback } from "./index";
import { loadRecipe } from "@/services/loaders";

function feedback(xpLines: string[], directXp: number): ActionFeedback {
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
const fail = (e: unknown): ActionFeedback => ({ ok: false, error: (e as Error)?.message ?? "Something went wrong", xpGained: 0, xpLines: [], levelUp: null, rankUps: [], achievements: [], questsCompleted: [] });

// ------------------------------------------------------------ offers ----
export async function acceptOfferAction(id: number) {
  acceptOffer(z.number().int().parse(id));
  revalidatePath("/", "layout");
}
/** Declining never touches XP, ranks, streaks or scores. It only marks the offer. */
export async function declineOfferAction(id: number) {
  declineOffer(z.number().int().parse(id));
  revalidatePath("/", "layout");
}
export async function completeOfferAction(id: number): Promise<ActionFeedback> {
  try {
    const p = getProfile();
    const r = completeOffer(z.number().int().parse(id), p.today);
    if (!r.offer) return fail(new Error("Quest not found"));
    if (r.offer.status === "expired") return fail(new Error("That quest expired — another will come along."));
    return feedback(r.xp?.awarded ? [`Special quest +${r.xp.amount}`] : [], r.xp?.amount ?? 0);
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------- workouts ----
export async function generateWorkoutAction(opts: { force?: boolean; adjust?: string } = {}) {
  const r = await getOrGenerateWorkout({ force: opts.force, adjust: opts.adjust ? z.string().max(300).parse(opts.adjust) : undefined });
  revalidatePath("/planner", "layout");
  revalidatePath("/");
  return { ok: true, source: r.source, error: r.error ?? null, planId: r.plan.id };
}
export async function skipPlanAction(id: number) {
  w.skipPlan(z.number().int().parse(id));
  revalidatePath("/planner", "layout");
}
export async function startSessionAction(input: { planId?: number | null; name?: string; focus?: string }) {
  const p = getProfile();
  const s = w.startSession({ date: p.today, planId: input.planId ?? null, name: input.name, focus: input.focus });
  revalidatePath("/planner", "layout");
  return { id: s.id };
}
export async function logSetAction(input: { sessionExerciseId: number; setIndex: number; weight?: number | null; reps?: number | null; durationSec?: number | null; completed: boolean }) {
  const s = z.object({ sessionExerciseId: z.number().int(), setIndex: z.number().int().min(0).max(20), weight: z.number().min(0).max(2000).nullable().optional(), reps: z.number().int().min(0).max(500).nullable().optional(), durationSec: z.number().int().min(0).max(36000).nullable().optional(), completed: z.boolean() }).parse(input);
  w.logSet(s);
  revalidatePath("/planner/workout", "layout");
  return { ok: true };
}
export async function addSetAction(sessionExerciseId: number) {
  w.addSet(z.number().int().parse(sessionExerciseId));
  revalidatePath("/planner/workout", "layout");
}
export async function skipExerciseAction(id: number, skipped: boolean) {
  w.skipExercise(z.number().int().parse(id), skipped);
  revalidatePath("/planner/workout", "layout");
}
export async function replaceExerciseAction(id: number, name: string) {
  w.replaceExercise(z.number().int().parse(id), z.string().min(2).max(60).parse(name));
  revalidatePath("/planner/workout", "layout");
}
export async function addExerciseAction(sessionId: number, name: string) {
  w.addExerciseToSession(z.number().int().parse(sessionId), { name: z.string().min(2).max(60).parse(name) });
  revalidatePath("/planner/workout", "layout");
}
export async function removeExerciseAction(id: number) {
  w.removeExercise(z.number().int().parse(id));
  revalidatePath("/planner/workout", "layout");
}
export async function finishSessionAction(id: number, opts: { notes?: string | null; intensity?: number } = {}): Promise<ActionFeedback & { prs?: { exerciseName: string; kind: string; value: number; weight: number | null; reps: number | null; xp: number }[]; abandoned?: boolean }> {
  try {
    const r = w.finishSession(z.number().int().parse(id), opts);
    if (!r) return fail(new Error("Session not active"));
    const direct = r.xp.reduce((a, b) => a + b.amount, 0);
    const fb = feedback(r.xp.map((x) => `${x.description} +${x.amount}`), direct);
    return { ...fb, prs: r.prs, abandoned: r.session.status === "abandoned" };
  } catch (e) {
    return fail(e);
  }
}
export async function abandonSessionAction(id: number) {
  w.abandonSession(z.number().int().parse(id));
  revalidatePath("/planner", "layout");
}

// ---------------------------------------------------------- nutrition ----
export async function generateMealsAction(opts: { force?: boolean; onHand?: string[]; request?: string } = {}) {
  const r = await getOrGenerateMeals({ force: opts.force, onHand: opts.onHand?.map((s) => z.string().max(40).parse(s)).slice(0, 12), request: opts.request ? z.string().max(300).parse(opts.request) : undefined });
  revalidatePath("/planner", "layout");
  revalidatePath("/");
  return { ok: true, source: r.source, error: r.error ?? null };
}
const logSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().trim().min(1).max(120),
  calories: z.coerce.number().min(0).max(5000),
  protein: z.coerce.number().min(0).max(400),
  carbs: z.coerce.number().min(0).max(800).optional(),
  fat: z.coerce.number().min(0).max(400).optional(),
  source: z.enum(["manual", "quick", "plan", "recipe", "ai"]).optional(),
  recipeId: z.number().int().optional().nullable(),
  planMealIndex: z.number().int().optional().nullable(),
  cooked: z.boolean().optional(),
  portion: z.number().min(0.1).max(5).optional(),
});
export async function logNutritionAction(input: z.input<typeof logSchema>): Promise<ActionFeedback> {
  try {
    const p = getProfile();
    const s = logSchema.parse(input);
    const t = n.resolveTargets(p.preferences.nutrition, p);
    const portion = s.portion ?? 1;
    const r = n.logNutrition({ date: p.today, mealType: s.mealType, name: s.name, calories: s.calories * portion, protein: s.protein * portion, carbs: (s.carbs ?? 0) * portion, fat: (s.fat ?? 0) * portion, source: s.source, recipeId: s.recipeId, planMealIndex: s.planMealIndex, cooked: s.cooked }, { proteinTarget: t.protein, calorieTarget: t.calories, unsafeTargets: t.unsafe });
    return feedback(r.xp.map((x) => `${x.description} +${x.amount}`), r.xp.reduce((a, b) => a + b.amount, 0));
  } catch (e) {
    return fail(e);
  }
}
export async function logRecipeNutritionAction(recipeId: number, mealType: "breakfast" | "lunch" | "dinner" | "snack", cooked = true): Promise<ActionFeedback> {
  const r = loadRecipe(z.number().int().parse(recipeId));
  if (!r) return fail(new Error("Recipe not found"));
  return logNutritionAction({ mealType, name: r.name, calories: r.calories ?? 0, protein: r.proteinG ?? 0, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0, source: "recipe", recipeId: r.id, cooked });
}
export async function updateNutritionEntryAction(id: number, patch: { calories?: number; protein?: number; carbs?: number; fat?: number; name?: string; portion?: number }) {
  n.updateEntry(z.number().int().parse(id), patch);
  reconcile();
  revalidatePath("/", "layout");
}
export async function deleteNutritionEntryAction(id: number) {
  n.deleteEntry(z.number().int().parse(id));
  reconcile();
  revalidatePath("/", "layout");
}

// --------------------------------------------------------------- coach ----
export async function askCoachAction(question: string) {
  const q = z.string().trim().min(2).max(500).parse(question);
  return askCoach(q);
}

// ----------------------------------------------------------- settings ----
export async function savePreferencesAction(input: unknown) {
  const schema = zod.object({
    fitness: zod.object({ goal: zod.enum(["general", "strength", "muscle", "fat-loss", "conditioning", "athleticism", "hybrid"]), experience: zod.enum(["beginner", "intermediate", "advanced"]), daysPerWeek: zod.coerce.number().int().min(1).max(7), equipment: zod.array(zod.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "cardio-machine"])), workoutLengthMin: zod.coerce.number().int().min(15).max(120), injuries: zod.string().max(300), preferences: zod.string().max(300) }).partial().optional(),
    nutrition: zod.object({ goal: zod.enum(["maintain", "lose", "gain", "recomp"]), calorieTarget: zod.coerce.number().int().min(800).max(6000).nullable(), proteinTarget: zod.coerce.number().int().min(20).max(400).nullable(), carbTarget: zod.coerce.number().int().min(0).max(800).nullable(), fatTarget: zod.coerce.number().int().min(0).max(300).nullable(), dietPrefs: zod.array(zod.string().max(30)), dislikes: zod.array(zod.string().max(40)), likes: zod.array(zod.string().max(40)), mealsPerDay: zod.coerce.number().int().min(2).max(6), maxPrepMin: zod.coerce.number().int().min(5).max(120), budget: zod.enum(["low", "medium", "high"]) }).partial().optional(),
    questFrequency: zod.enum(["low", "normal", "high"]).optional(),
    notifications: zod.object({ quest: zod.boolean(), workout: zod.boolean(), meals: zod.boolean(), level: zod.boolean(), rank: zod.boolean(), achievement: zod.boolean(), sobriety: zod.boolean(), review: zod.boolean(), browser: zod.boolean() }).partial().optional(),
  });
  const s = schema.parse(input);
  updateProfile({ preferences: s as never });
  revalidatePath("/", "layout");
}
export async function saveAiSettingsAction(input: { provider: "openai" | "anthropic"; apiKey: string; model?: string | null; baseUrl?: string | null }): Promise<{ ok: boolean; message: string }> {
  const s = zod.object({ provider: zod.enum(["openai", "anthropic"]), apiKey: zod.string().trim().min(8).max(300), model: zod.string().trim().max(80).nullable().optional(), baseUrl: zod.string().trim().url().max(200).nullable().optional().or(zod.literal("")) }).parse(input);
  const baseUrl = s.baseUrl ? s.baseUrl : null;
  // Validate the key with a tiny request before saving.
  try {
    const provider = createProvider({ provider: s.provider, apiKey: s.apiKey, model: s.model || (s.provider === "anthropic" ? "claude-haiku-5-5" : "gpt-4o-mini"), baseUrl });
    await provider.generateJSON({ system: "Reply with JSON.", user: 'Return {"ok": true}', maxTokens: 20 }, zod.object({ ok: zod.boolean() }));
  } catch (e) {
    return { ok: false, message: `Could not reach the provider: ${(e as Error).message}` };
  }
  saveAiSettings({ provider: s.provider, apiKey: s.apiKey, model: s.model || null, baseUrl });
  revalidatePath("/", "layout");
  return { ok: true, message: "AI connected. Plans and the coach will now use it." };
}
export async function clearAiSettingsAction() {
  clearAiSettings();
  revalidatePath("/", "layout");
}
export async function getAiStatusAction() {
  return aiStatus();
}
export async function markNotificationsReadAction() {
  markAllRead();
  revalidatePath("/", "layout");
}
