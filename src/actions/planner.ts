"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile, updateProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { acceptOffer, completeOffer, declineOffer, uncompleteOffer, offerStepQuest } from "@/services/questOffers";
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
  const o = declineOffer(z.number().int().parse(id));
  // Declining an adventure teaches the ranker a little (never a penalty anywhere else).
  if (o?.category) {
    const { rateOffer } = await import("@/services/adventure");
    rateOffer(o.id, "declined");
  }
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
/** "1,158 steps left — want a short walk quest?" → accepted walk quest for tonight. */
export async function offerStepQuestAction(): Promise<ActionFeedback> {
  const p = getProfile();
  const { todayHealthSnapshot } = await import("@/health/apple");
  const snap = todayHealthSnapshot();
  const remaining = Math.max(0, p.targets.stepsTarget - (snap.steps ?? 0));
  if (remaining <= 0) return fail(new Error("Step target already reached"));
  const o = offerStepQuest({ today: p.today, now: new Date(), remaining });
  revalidatePath("/", "layout");
  return o ? { ...feedback([`Walk quest accepted · +${o.xpReward} XP when done`], 0), ok: true } : fail(new Error("Another special quest is already open"));
}
/** Undo an accidental special-quest completion: XP is voided, the quest goes back to accepted. */
export async function uncompleteOfferAction(id: number) {
  uncompleteOffer(z.number().int().parse(id));
  reconcile();
  revalidatePath("/", "layout");
}
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
    return { ...fb, prs: r.prs, abandoned: r.session.status === "cancelled" };
  } catch (e) {
    return fail(e);
  }
}
export async function abandonSessionAction(id: number) {
  w.cancelSession(z.number().int().parse(id));
  revalidatePath("/planner", "layout");
}
export async function cancelSessionAction(id: number) {
  w.cancelSession(z.number().int().parse(id));
  revalidatePath("/planner", "layout");
  revalidatePath("/");
}
export async function pauseSessionAction(id: number) {
  w.pauseSession(z.number().int().parse(id));
}
export async function resumeSessionAction(id: number) {
  w.resumeSession(z.number().int().parse(id));
}
/** Remove a session from history entirely (accidental start / wrong entry). XP it earned is voided. */
export async function discardSessionAction(id: number): Promise<{ ok: boolean; voidedXp: number }> {
  const r = w.discardSession(z.number().int().parse(id));
  reconcile();
  revalidatePath("/", "layout");
  return { ok: true, voidedXp: r.voidedXp };
}

// ---------------------------------------------------------- nutrition ----
export async function generateMealsAction(opts: { force?: boolean; onHand?: string[]; request?: string } = {}) {
  const r = await getOrGenerateMeals({ force: opts.force, onHand: opts.onHand?.map((s) => z.string().max(40).parse(s)).slice(0, 12), request: opts.request ? z.string().max(300).parse(opts.request) : undefined });
  revalidatePath("/planner", "layout");
  revalidatePath("/");
  return { ok: true, source: r.source, error: r.error ?? null };
}
const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
const logSchema = z.object({
  mealType: mealTypeSchema,
  name: z.string().trim().min(1).max(120),
  calories: z.coerce.number().min(0).max(5000),
  protein: z.coerce.number().min(0).max(400).optional().default(0),
  carbs: z.coerce.number().min(0).max(800).optional(),
  fat: z.coerce.number().min(0).max(400).optional(),
  source: z.enum(["manual", "quick", "plan", "recipe", "ai", "restaurant", "estimate", "saved", "openfoodfacts"]).optional(),
  recipeId: z.number().int().optional().nullable(),
  planMealIndex: z.number().int().optional().nullable(),
  plannedMealId: z.number().int().optional().nullable(),
  replacesPlannedMealId: z.number().int().optional().nullable(),
  savedFoodId: z.number().int().optional().nullable(),
  isEstimate: z.boolean().optional(),
  venue: z.string().max(80).optional().nullable(),
  cooked: z.boolean().optional(),
  portion: z.number().min(0.1).max(5).optional(),
  /** also store as a saved food for one-tap reuse */
  save: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type LogFoodInput = z.input<typeof logSchema>;
export async function logNutritionAction(input: LogFoodInput): Promise<ActionFeedback & { entryId?: number; adjustOffer?: { unplanned: string; remaining: number } | null }> {
  try {
    const p = getProfile();
    const s = logSchema.parse(input);
    const t = n.resolveTargets(p.preferences.nutrition, p);
    const portion = s.portion ?? 1;
    const date = s.date ?? p.today;
    let savedFoodId = s.savedFoodId ?? null;
    if (s.save && !savedFoodId) savedFoodId = n.saveFood({ name: s.name, brand: s.venue ?? null, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat, source: s.source ?? "manual", isEstimate: s.isEstimate }).id;
    const r = n.logNutrition(
      { date, mealType: s.mealType, name: s.name, calories: s.calories * portion, protein: (s.protein ?? 0) * portion, carbs: (s.carbs ?? 0) * portion, fat: (s.fat ?? 0) * portion, source: s.source, recipeId: s.recipeId, planMealIndex: s.planMealIndex, plannedMealId: s.plannedMealId, replacesPlannedMealId: s.replacesPlannedMealId, savedFoodId, isEstimate: s.isEstimate, venue: s.venue, cooked: s.cooked, servings: s.cooked ? portion : undefined },
      { proteinTarget: t.protein, calorieTarget: t.calories, unsafeTargets: t.unsafe },
    );
    if (s.cooked) {
      // cooking took ingredients out of the pantry → the shopping list reflects it (meals untouched)
      const { onPantryChanged } = await import("@/services/foodWeek");
      onPantryChanged(p.today);
    }
    reconcile();
    revalidatePath("/", "layout");
    const fb = feedback(r.xp.map((x) => `${x.description} +${x.amount}`), r.xp.reduce((a, b) => a + b.amount, 0));
    // Offer to rebalance the rest of the day when an unplanned meal lands far from the plan.
    let adjustOffer: { unplanned: string; remaining: number } | null = null;
    if (date === p.today && !s.plannedMealId) {
      const plan = n.getMealPlan(date);
      const remaining = plan?.meals.filter((m) => m.status === "planned" || m.status === "prepared") ?? [];
      const replaced = s.replacesPlannedMealId ? plan?.meals.find((m) => m.id === s.replacesPlannedMealId) : null;
      const delta = replaced ? s.calories * portion - replaced.calories : s.calories * portion;
      if (remaining.length && Math.abs(delta) >= 150) adjustOffer = { unplanned: s.name, remaining: remaining.length };
    }
    return { ...fb, entryId: r.entry.id, adjustOffer };
  } catch (e) {
    return fail(e);
  }
}
export async function logRecipeNutritionAction(recipeId: number, mealType: "breakfast" | "lunch" | "dinner" | "snack", cooked = true): Promise<ActionFeedback> {
  const r = loadRecipe(z.number().int().parse(recipeId));
  if (!r) return fail(new Error("Recipe not found"));
  return logNutritionAction({ mealType, name: r.name, calories: r.calories ?? 0, protein: r.proteinG ?? 0, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0, source: "recipe", recipeId: r.id, cooked });
}
function xpCtx() {
  const p = getProfile();
  const t = n.resolveTargets(p.preferences.nutrition, p);
  return { proteinTarget: t.protein, calorieTarget: t.calories, unsafeTargets: t.unsafe };
}
export async function updateNutritionEntryAction(id: number, patch: { calories?: number; protein?: number; carbs?: number; fat?: number; name?: string; portion?: number; mealType?: string }) {
  n.updateEntry(z.number().int().parse(id), patch, xpCtx());
  reconcile();
  revalidatePath("/", "layout");
}
export async function deleteNutritionEntryAction(id: number): Promise<{ ok: true; voidedXp: number }> {
  const r = n.deleteEntry(z.number().int().parse(id), xpCtx());
  reconcile();
  revalidatePath("/", "layout");
  return { ok: true, voidedXp: r.voidedXp };
}
export async function searchFoodsAction(q: string): Promise<{ hits: import("@/food/search").FoodHit[]; liveError: string | null }> {
  const { searchFoods } = await import("@/food/search");
  return searchFoods(z.string().max(80).parse(q));
}
export async function estimateFoodAction(description: string): Promise<{ ok: boolean; estimate?: { name: string; calories: number; protein: number; carbs: number; fat: number; confidence: string; assumptions: string }; error?: string }> {
  try {
    const { estimateFood } = await import("@/ai/generate");
    const e = await estimateFood(z.string().trim().min(3).max(300).parse(description));
    if (!e) return { ok: false, error: "AI is not configured. Use Quick add with your best guess — it can be edited later." };
    return { ok: true, estimate: e };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
export async function recentFoodsAction(q?: string) {
  return n.listSavedFoods({ q, limit: 12 }).map((f) => ({ id: f.id, name: f.name, brand: f.brand, serving: f.servingDesc, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, isEstimate: f.isEstimate }));
}
export async function saveFoodAction(input: { name: string; brand?: string | null; serving?: string | null; calories: number; protein?: number; carbs?: number; fat?: number; isEstimate?: boolean; source?: string }) {
  const f = n.saveFood({ name: z.string().trim().min(1).max(120).parse(input.name), brand: input.brand ?? null, servingDesc: input.serving ?? null, calories: z.number().min(0).max(5000).parse(input.calories), protein: input.protein, carbs: input.carbs, fat: input.fat, isEstimate: input.isEstimate, source: input.source });
  return { id: f.id };
}
export async function deleteSavedFoodAction(id: number) {
  n.deleteSavedFood(z.number().int().parse(id));
}
// ---------------------------------------------------- planned meals ----
export async function setPlannedMealStatusAction(id: number, status: "planned" | "prepared" | "skipped" | "discarded") {
  n.setPlannedMealStatus(z.number().int().parse(id), status);
  reconcile();
  revalidatePath("/", "layout");
}
export async function updatePlannedMealAction(id: number, patch: { name?: string; calories?: number; protein?: number; carbs?: number; fat?: number; mealType?: string; ingredients?: string[]; notes?: string | null }) {
  n.updatePlannedMeal(z.number().int().parse(id), patch);
  revalidatePath("/", "layout");
}
export async function replacePlannedMealAction(id: number, next: { name: string; calories: number; protein: number; carbs?: number; fat?: number; ingredients?: string[]; recipeId?: number | null; notes?: string | null }) {
  const r = n.replacePlannedMeal(z.number().int().parse(id), next);
  revalidatePath("/", "layout");
  return r ? { ok: true, id: r.id } : { ok: false };
}
export async function discardMealPlanAction(date?: string) {
  const p = getProfile();
  const d = date ?? p.today;
  for (const m of n.getMealPlan(d)?.meals ?? []) if (m.status === "planned" || m.status === "prepared") n.setPlannedMealStatus(m.id, "discarded");
  revalidatePath("/", "layout");
}
export async function proposeDayAdjustmentAction(unplanned: string) {
  const { proposeAdjustment } = await import("@/services/planner");
  return proposeAdjustment(z.string().max(120).parse(unplanned));
}
export async function applyDayAdjustmentAction(meals: { replacesId: number; name: string; calories: number; protein: number; carbs: number; fat: number; ingredients: string[]; recipeId: number | null; notes: string }[]) {
  for (const m of meals.slice(0, 6)) n.replacePlannedMeal(z.number().int().parse(m.replacesId), { ...m, source: "adjust" });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function askCoachAction(question: string) {
  const q = z.string().trim().min(2).max(500).parse(question);
  return askCoach(q);
}

// ----------------------------------------------------------- settings ----
export async function savePreferencesAction(input: unknown) {
  const schema = zod.object({
    fitness: zod.object({ goal: zod.enum(["general", "strength", "muscle", "fat-loss", "conditioning", "athleticism", "hybrid"]), experience: zod.enum(["beginner", "intermediate", "advanced"]), daysPerWeek: zod.coerce.number().int().min(1).max(7), equipment: zod.array(zod.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "cardio-machine"])), workoutLengthMin: zod.coerce.number().int().min(15).max(120), injuries: zod.string().max(300), preferences: zod.string().max(300), trainingDays: zod.array(zod.number().int().min(0).max(6)).max(7) }).partial().optional(),
    nutrition: zod.object({ goal: zod.enum(["maintain", "lose", "gain", "recomp"]), calorieTarget: zod.coerce.number().int().min(800).max(6000).nullable(), proteinTarget: zod.coerce.number().int().min(20).max(400).nullable(), carbTarget: zod.coerce.number().int().min(0).max(800).nullable(), fatTarget: zod.coerce.number().int().min(0).max(300).nullable(), dietPrefs: zod.array(zod.string().max(30)), dislikes: zod.array(zod.string().max(40)), likes: zod.array(zod.string().max(40)), foodRules: zod.array(zod.object({ id: zod.string().max(40), kind: zod.enum(["allergy", "intolerance", "religious", "avoid", "prefer-substitute", "prefer", "dislike"]), target: zod.string().trim().min(1).max(40), substitute: zod.string().trim().max(40).nullable().optional(), note: zod.string().max(120).optional() })).max(60), mealsPerDay: zod.coerce.number().int().min(2).max(6), maxPrepMin: zod.coerce.number().int().min(5).max(120), budget: zod.enum(["low", "medium", "high"]) }).partial().optional(),
    questFrequency: zod.enum(["low", "normal", "high"]).optional(),
    notifications: zod.object({ quest: zod.boolean(), workout: zod.boolean(), meals: zod.boolean(), level: zod.boolean(), rank: zod.boolean(), achievement: zod.boolean(), sobriety: zod.boolean(), review: zod.boolean(), browser: zod.boolean(), morningMotivation: zod.boolean(), windDown: zod.boolean(), windDownLeadMin: zod.coerce.number().int().min(0).max(240), workoutReminder: zod.boolean(), workoutReminderTime: zod.string().regex(/^\d{2}:\d{2}$/), mealPrepReminder: zod.boolean(), weeklyPlanning: zod.boolean(), weeklyPlanningTime: zod.string().regex(/^\d{2}:\d{2}$/) }).partial().optional(),
    sleep: zod.object({ wakeTarget: zod.string().regex(/^\d{2}:\d{2}$/).nullable(), windDownMin: zod.coerce.number().int().min(0).max(120), fallAsleepMin: zod.coerce.number().int().min(0).max(60) }).partial().optional(),
    food: zod.object({ weeklyBudget: zod.coerce.number().min(0).max(2000), budgetMode: zod.enum(["budget", "balanced", "flexible"]), shoppingDay: zod.coerce.number().int().min(0).max(6), quickWeekdays: zod.boolean(), mealPrep: zod.boolean(), highProtein: zod.boolean(), reuseIngredients: zod.boolean(), eatingOutPerWeek: zod.coerce.number().int().min(0).max(21) }).partial().optional(),
    adventure: zod.object({ enabled: zod.boolean(), costPref: zod.enum(["free", "under20", "under50", "any"]), interests: zod.record(zod.string().max(30), zod.enum(["love", "interested", "neutral", "no"])) }).partial().optional(),
    location: zod.object({ radiusMi: zod.coerce.number().int().min(2).max(60) }).partial().optional(),
  });
  const s = schema.parse(input);
  updateProfile({ preferences: s as never });
  // Food rules changed → the plan being shopped for follows them now (meals repaired in place, list reconciled).
  if (s.nutrition && ("foodRules" in s.nutrition || "dietPrefs" in s.nutrition || "dislikes" in s.nutrition)) {
    const { activeWeekRow, nextWeekRow, applyRulesToWeek } = await import("@/services/foodWeek");
    const p = getProfile();
    const row = activeWeekRow(p.today) ?? nextWeekRow(p.today);
    if (row && row.status !== "reviewed") applyRulesToWeek(row.id);
  }
  revalidatePath("/", "layout");
}
/** Sleep schedule: wake target + duration → derived bedtime targets (kept in sync with the legacy bedtimeTarget). */
export async function saveSleepPlanAction(input: { wakeTarget: string | null; sleepTargetMin: number; windDownMin: number; fallAsleepMin: number }) {
  const s = zod.object({ wakeTarget: zod.string().regex(/^\d{2}:\d{2}$/).nullable(), sleepTargetMin: zod.coerce.number().int().min(300).max(720), windDownMin: zod.coerce.number().int().min(0).max(120), fallAsleepMin: zod.coerce.number().int().min(0).max(60) }).parse(input);
  const { computeSleepSchedule } = await import("@/services/sleepPlan");
  const p = getProfile();
  const targets = { ...p.targets, sleepTargetMin: s.sleepTargetMin };
  const sched = computeSleepSchedule(targets, { wakeTarget: s.wakeTarget, windDownMin: s.windDownMin, fallAsleepMin: s.fallAsleepMin });
  updateProfile({ targets: { sleepTargetMin: s.sleepTargetMin, bedtimeTarget: sched?.inBed ?? p.targets.bedtimeTarget }, preferences: { sleep: { wakeTarget: s.wakeTarget, windDownMin: s.windDownMin, fallAsleepMin: s.fallAsleepMin } } });
  // A changed schedule means tonight's reminder should be recomputed, not suppressed by today's key.
  const { getDb } = await import("@/db/client");
  const { notifications } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  getDb().delete(notifications).where(eq(notifications.key, `n:winddown:${p.today}`)).run();
  revalidatePath("/", "layout");
  return sched;
}
// ---------------------------------------------------------- motivation ----
export async function addReasonAction(text: string) {
  const { addReason } = await import("@/services/motivation");
  const r = addReason(zod.string().trim().min(3).max(160).parse(text));
  revalidatePath("/", "layout");
  return { id: r.id, text: r.text };
}
export async function updateReasonAction(id: number, patch: { text?: string; active?: boolean }) {
  const { updateReason } = await import("@/services/motivation");
  updateReason(zod.number().int().parse(id), patch);
  revalidatePath("/", "layout");
}
export async function deleteReasonAction(id: number) {
  const { deleteReason } = await import("@/services/motivation");
  deleteReason(zod.number().int().parse(id));
  revalidatePath("/", "layout");
}
/** Preview what tomorrow morning's message could say (for the settings screen). */
export async function previewMorningMessageAction(): Promise<string> {
  const { buildMorningMessage, motivationInput } = await import("@/services/motivation");
  const { buildContext, buildEngineInput, getQuests } = await import("@/services/progression");
  const { assessCharacter } = await import("@/ranking/engine");
  const p = getProfile();
  const input = buildEngineInput(p);
  const ctx = buildContext(p, input, assessCharacter(input));
  const mi = motivationInput(p, ctx);
  mi.firstQuest = getQuests(p.today).daily.find((q) => !q.done)?.title ?? null;
  return buildMorningMessage(mi, p.preferences.motivation.recent, Date.now() % 1000).text;
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

/** Explicit per-day states ("done eating for today", "rest day"). Never award XP; they only settle a row. */
export async function setDayFlagAction(key: "food_finished" | "rest_day", on: boolean) {
  const { setDayFlag } = await import("@/services/dayFlags");
  const p = getProfile();
  setDayFlag(p.today, zod.enum(["food_finished", "rest_day"]).parse(key), on ? "1" : null);
  revalidatePath("/", "layout");
}
