import { buildAiContext } from "@/ai/context";
import { aiQuestCandidate, coachReply, generateMeals, generateWorkout } from "@/ai/generate";
import { isAiEnabled } from "@/ai/config";
import { addDays, lastNDays } from "@/lib/dates";
import type { GenerateInput } from "@/planner/workoutTemplates";
import { loadRecipes, loadSleep, loadWorkouts } from "./loaders";
import { seedRecipes } from "@/db/seed";
import { getMealPlan, recentRecipeIds, resolveTargets, saveMealPlan, dayTotals, plannedMealEaten } from "./nutrition";
import { getProfile, type ProfileView } from "./profile";
import { buildContext, buildEngineInput, getAssessment, getQuests } from "./progression";
import { maybeOffer, openOffer, signalsFromContext, listOffers } from "./questOffers";
import { getPlanForDate, recentSessions, savePlan, getActiveSession } from "./workouts";
import { pushNotification } from "./notifications";
import { assessCharacter } from "@/ranking/engine";

/**
 * Orchestrates planning features on top of the AI layer. AI calls only happen
 * on explicit requests (generate / regenerate / coach) or when the offer
 * engine decides a quest slot is due; page loads reuse stored results.
 */
export async function getOrGenerateWorkout(opts: { force?: boolean; adjust?: string } = {}) {
  const profile = getProfile();
  const today = profile.today;
  const existing = getPlanForDate(today);
  if (existing && !opts.force && !opts.adjust) return { plan: existing, generated: false, source: existing.source as "ai" | "template" };
  if (existing && (existing.status === "started" || existing.status === "completed") && !opts.force) return { plan: existing, generated: false, source: existing.source as "ai" | "template" };

  const assessment = getAssessment(profile);
  const ctx = buildAiContext(profile, profile.preferences, assessment);
  const sleep = loadSleep(today);
  const lastNight = sleep.find((e) => e.date === today) ?? sleep.find((e) => e.date === addDays(today, -1));
  const recent = recentSessions(7, today);
  // Also treat manually logged hard workouts as fatigue signals.
  for (const w of loadWorkouts(today).filter((w) => w.date >= addDays(today, -2) && w.intensity >= 3 && w.source !== "session")) {
    recent.push({ date: w.date, focus: w.type === "strength" ? "full" : "conditioning", muscles: w.type === "strength" ? ["chest", "back", "quads"] : ["cardio"], hard: true });
  }
  const input: GenerateInput = {
    prefs: profile.preferences.fitness,
    recent,
    readiness: lastNight?.readinessScore ?? null,
    hoursSinceLast: ctx.fitness.hoursSinceLastSession,
    today,
    seed: opts.force ? Date.now() % 100000 : undefined,
  };
  const r = await generateWorkout(ctx, input, { force: opts.force || !!opts.adjust, adjust: opts.adjust });
  const saved = savePlan(today, r.plan, r.source);
  pushNotification(profile.preferences.notifications, { kind: "workout", title: "Your workout for today is ready", body: `${r.plan.name} · ${r.plan.estimatedMinutes} min`, href: "/planner/workout", key: `n:workout:${today}:${saved.id}` });
  return { plan: getPlanForDate(today)!, generated: true, source: r.source, error: r.error };
}

export async function getOrGenerateMeals(opts: { force?: boolean; onHand?: string[]; request?: string } = {}) {
  const profile = getProfile();
  const today = profile.today;
  const existing = getMealPlan(today);
  if (existing && !opts.force && !opts.request && !opts.onHand?.length) return { plan: existing, generated: false, source: existing.source as "ai" | "template", targets: resolveTargets(profile.preferences.nutrition, profile) };
  const assessment = getAssessment(profile);
  const ctx = buildAiContext(profile, profile.preferences, assessment, { onHand: opts.onHand });
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  seedRecipes(); // idempotent: makes sure built-in recipes + macros exist before planning
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));
  const r = await generateMeals(ctx, { date: today, recipes, prefs: profile.preferences.nutrition, calorieTarget: targets.calories, proteinTarget: targets.protein, onHand: opts.onHand, recentRecipeIds: recentRecipeIds(today), force: opts.force, request: opts.request });
  saveMealPlan(today, r.plan, r.source);
  pushNotification(profile.preferences.notifications, { kind: "meals", title: "Today's meal plan is ready", body: `${r.plan.totals.calories} kcal · ${r.plan.totals.protein} g protein`, href: "/planner/meals", key: `n:meals:${today}` });
  return { plan: getMealPlan(today)!, generated: true, source: r.source, targets, error: r.error };
}

/** Builds offer-engine signals from real data and lets the engine decide. Safe to call on every home load (cheap when nothing is due). */
export async function refreshOffers(profile: ProfileView = getProfile()) {
  const today = profile.today;
  const now = new Date();
  const localHour = Number(profile.localTime.slice(0, 2));
  const input = buildEngineInput(profile);
  const assessment = assessCharacter(input);
  const ctx = buildContext(profile, input, assessment);
  const sleep = loadSleep(today);
  const s7 = sleep.filter((e) => e.date >= lastNDays(today, 7)[0]);
  const avg7 = s7.length ? s7.reduce((a, e) => a + e.totalSleepMin, 0) / s7.length : null;
  const lastNight = sleep.find((e) => e.date === today) ?? sleep.find((e) => e.date === addDays(today, -1));
  const recent = recentSessions(2, today);
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const todayT = dayTotals(today);
  const quests = getQuests(today);
  const plan = getPlanForDate(today);
  const signals = signalsFromContext(ctx, {
    localHour,
    trainedHardYesterday: recent.some((r) => r.date === addDays(today, -1) && r.hard),
    proteinLow: localHour >= 13 && todayT.calories > 0 && todayT.protein < targets.protein * 0.6,
    nutritionTracked: ctx.nutrition.loggedDays30 > 0,
    sleepPoorRecently: avg7 != null && avg7 < profile.targets.sleepTargetMin - 45,
    hasWorkoutPlanToday: !!plan && plan.status !== "completed",
    planCompletedToday: plan?.status === "completed",
    readinessLow: (lastNight?.readinessScore ?? 100) < 60,
  });
  signals.dailyQuestsDone = quests.daily.filter((q) => q.done).length;
  signals.dailyQuestsTotal = quests.daily.length;

  const aiCandidate = isAiEnabled() ? () => aiQuestCandidate(buildAiContext(profile, profile.preferences, assessment), { localHour, signals: signals as unknown as Record<string, unknown> }) : undefined;
  const created = await maybeOffer({ today, now, localHour, signals, frequency: profile.preferences.questFrequency, aiCandidate });
  if (created) pushNotification(profile.preferences.notifications, { kind: "quest", title: "⚔ A special quest has appeared", body: `${created.title} · +${created.xpReward} XP`, href: "/quests", key: `n:offer:${created.id}` });
  // Expiring soon (accepted, < 2h left)
  const open = openOffer();
  if (open && open.status === "accepted" && open.expiresAt) {
    const left = new Date(open.expiresAt).getTime() - now.getTime();
    if (left > 0 && left < 2 * 3600_000) pushNotification(profile.preferences.notifications, { kind: "quest", title: "Quest expiring soon", body: `${open.title} — ${Math.round(left / 60000)} min left · +${open.xpReward} XP`, href: "/quests", key: `n:expiring:${open.id}` });
  }
  return open;
}

export async function askCoach(question: string) {
  const profile = getProfile();
  const assessment = getAssessment(profile);
  const ctx = buildAiContext(profile, profile.preferences, assessment);
  const quests = getQuests(profile.today);
  const offers = listOffers({ statuses: ["accepted", "offered"], limit: 3 });
  const plan = getPlanForDate(profile.today);
  const easiest = [
    ...quests.daily.filter((q) => !q.done).map((q) => `${q.title} (+${q.rewardXp} XP)`),
    ...offers.map((o) => `${o.title} (+${o.xpReward} XP)`),
    ...assessment.domains.map((d) => d.suggestedAction).filter((x): x is string => !!x),
  ].slice(0, 5);
  const active = getActiveSession();
  return coachReply(ctx, question, { openQuests: [...quests.daily.filter((q) => !q.done).map((q) => q.title), ...offers.map((o) => o.title)], todayPlan: active ? `${active.name} (in progress)` : plan ? `${plan.name}, ${plan.estimatedMinutes} min, ${plan.exercisesParsed.length} exercises` : null, easiestXp: easiest });
}

export function todayPlanSummary(profile: ProfileView) {
  const today = profile.today;
  const plan = getPlanForDate(today);
  const meals = getMealPlan(today);
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const totals = dayTotals(today);
  return {
    workout: plan ? { id: plan.id, name: plan.name, exercises: plan.exercisesParsed.length, minutes: plan.estimatedMinutes, status: plan.status, source: plan.source } : null,
    meals: meals ? { count: meals.mealsParsed.length, eaten: meals.mealsParsed.filter((m) => plannedMealEaten(today, m.index)).length, calories: meals.mealsParsed.reduce((a, m) => a + m.calories, 0), protein: meals.mealsParsed.reduce((a, m) => a + m.protein, 0) } : null,
    totals,
    targets,
    activeSession: getActiveSession(),
  };
}
