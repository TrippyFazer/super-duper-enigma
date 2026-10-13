import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiCache } from "@/db/schema";
import type { ISODate } from "@/lib/dates";
import { findExercise } from "@/planner/exercises";
import { generateTemplateMealPlan, type GeneratedMealPlan, type RecipeLite } from "@/planner/mealTemplates";
import { generateTemplatePlan, type GeneratedPlan, type GenerateInput } from "@/planner/workoutTemplates";
import { violatesSafety } from "@/ranking/questLibrary";
import { libraryCandidate, validateCandidate, type ValidatedCandidate } from "@/services/questOffers";
import { QUEST_LIBRARY } from "@/ranking/questLibrary";
import { getProvider } from "./config";
import type { AiContext } from "./context";
import type { AiProvider } from "./provider";
import { CoachReplySchema, DayAdjustSchema, FoodEstimateSchema, MealPlanSchema, QuestCandidateSchema, RecipeSuggestionSchema, WeeklyPlanSchema, WorkoutPlanSchema, type AiCoachReply, type AiFoodEstimate } from "./schemas";
import { generateTemplateWeek, shoppingListFromMeals, buildPrepPlan, type GeneratedWeek, type GenerateWeekInput, type WeekMeal } from "@/planner/weekTemplates";
import { suggestFromPantryTemplate, type SuggestInput, type Suggestion } from "@/planner/pantrySuggest";
import { canonicalName, findIngredient } from "@/food/ingredients";
import { proposeDayAdjustment, type AdjustProposal, type RemainingSlot } from "@/planner/dayAdjust";

/**
 * Generation entry points. Each one:
 *   1. returns a cached result for (kind, date, key) when present,
 *   2. tries the AI provider when configured,
 *   3. falls back to deterministic templates,
 * and never throws for a missing key — the app works without AI.
 */
const SYSTEM_BASE =
  "You are the planning engine inside Ascend, a self-improvement RPG. Be practical and safe. Never recommend extreme calorie restriction, maximal lifts, sleep deprivation, or anything dangerous. Prefer sustainable, evidence-based training and nutrition. Do not give medical advice. Output strictly valid JSON matching the requested shape.";

function hash(obj: unknown): string {
  return createHash("sha1").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

export function readCache<T>(kind: string, key: string): T | null {
  const row = getDb().select().from(aiCache).where(and(eq(aiCache.kind, kind), eq(aiCache.cacheKey, key))).get();
  if (!row) return null;
  try {
    return JSON.parse(row.response) as T;
  } catch {
    return null;
  }
}

export function writeCache(kind: string, key: string, date: ISODate, value: unknown, provider?: AiProvider | null) {
  const db = getDb();
  const values = { kind, cacheKey: key, date, response: JSON.stringify(value), provider: provider?.name ?? "template", model: provider?.model ?? null };
  db.insert(aiCache).values(values).onConflictDoUpdate({ target: aiCache.cacheKey, set: values }).run();
}

export interface GenResult<T> {
  plan: T;
  source: "ai" | "template";
  cached: boolean;
  error?: string;
}

// ------------------------------------------------------------- workout ----
export async function generateWorkout(ctx: AiContext, input: GenerateInput, opts: { force?: boolean; adjust?: string } = {}): Promise<GenResult<GeneratedPlan>> {
  const key = `workout:${input.today}:${hash({ p: input.prefs, adjust: opts.adjust ?? "", r: input.recent.map((r) => r.date + r.focus), readiness: input.readiness })}`;
  if (!opts.force) {
    const cached = readCache<{ plan: GeneratedPlan; source: "ai" | "template" }>("workout", key);
    if (cached) return { ...cached, cached: true };
  }
  const provider = getProvider();
  if (provider) {
    try {
      const out = await provider.generateJSON(
        {
          system: SYSTEM_BASE + " You are generating one workout for today.",
          user: [
            "Design today's workout as JSON with keys: name, focus (upper|lower|full|push|pull|legs|conditioning|recovery), goal, estimatedMinutes, rationale, exercises[{name, sets, repRange, restSeconds, notes}], bonusQuest{title, description, minutes, xp (15-40)} or null.",
            "Rules: use only exercises from the catalog list; respect equipment; avoid muscle groups trained hard in the last 40 hours; if readiness < 60 or sleep last night < 6h, make it a recovery or reduced-volume session; 3-7 exercises; fit the preferred length; no maximal singles.",
            opts.adjust ? `User adjustment request: ${opts.adjust}` : "",
            `Context: ${JSON.stringify({ profile: ctx.profile, fitness: ctx.fitness, rank: ctx.rank })}`,
          ].join("\n"),
          maxTokens: 1200,
        },
        WorkoutPlanSchema,
      );
      // Normalise against the catalog so recovery/PR logic works; drop unknown movements.
      const exercises = out.exercises
        .map((e) => {
          const def = findExercise(e.name);
          if (!def) return null;
          const unsafe = violatesSafety(`${e.name} ${e.notes ?? ""}`);
          if (unsafe) return null;
          return { slug: def.slug, name: def.name, sets: e.sets, reps: e.repRange, restSeconds: e.restSeconds, notes: e.notes || undefined, muscles: def.muscles };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      if (exercises.length >= 2) {
        const plan: GeneratedPlan = { name: out.name, focus: out.focus, goal: out.goal, estimatedMinutes: out.estimatedMinutes, exercises, bonus: out.bonusQuest ? { title: out.bonusQuest.title, description: out.bonusQuest.description, xp: Math.min(40, out.bonusQuest.xp), minutes: out.bonusQuest.minutes } : null, rationale: out.rationale };
        writeCache("workout", key, input.today, { plan, source: "ai" }, provider);
        return { plan, source: "ai", cached: false };
      }
    } catch (e) {
      const plan = generateTemplatePlan(input);
      writeCache("workout", key, input.today, { plan, source: "template" });
      return { plan, source: "template", cached: false, error: (e as Error).message };
    }
  }
  const plan = generateTemplatePlan(input);
  writeCache("workout", key, input.today, { plan, source: "template" });
  return { plan, source: "template", cached: false };
}

// --------------------------------------------------------------- meals ----
export async function generateMeals(ctx: AiContext, input: { date: ISODate; recipes: RecipeLite[]; prefs: Parameters<typeof generateTemplateMealPlan>[0]["prefs"]; calorieTarget: number; proteinTarget: number; onHand?: string[]; recentRecipeIds?: number[]; force?: boolean; request?: string }): Promise<GenResult<GeneratedMealPlan>> {
  const key = `meals:${input.date}:${hash({ p: input.prefs, c: input.calorieTarget, pr: input.proteinTarget, onHand: input.onHand ?? [], req: input.request ?? "" })}`;
  if (!input.force) {
    const cached = readCache<{ plan: GeneratedMealPlan; source: "ai" | "template" }>("meals", key);
    if (cached) return { ...cached, cached: true };
  }
  const provider = getProvider();
  if (provider) {
    try {
      const out = await provider.generateJSON(
        {
          system: SYSTEM_BASE + " You are generating one day of meals.",
          user: [
            "Create today's meal plan as JSON: {calorieTarget, proteinTarget, rationale, meals[{mealType (breakfast|lunch|dinner|snack), name, calories, protein, carbs, fat, ingredients[], notes}]}.",
            `Land within ±10% of ${input.calorieTarget} kcal and at or above ${input.proteinTarget} g protein. Respect diet preferences and dislikes. Prefer saved recipes when they fit. Keep prep under ${input.prefs.maxPrepMin} minutes per meal. ${input.prefs.mealsPerDay} meals plus snacks as needed.`,
            input.onHand?.length ? `Ingredients on hand: ${input.onHand.join(", ")}.` : "",
            input.request ? `User request: ${input.request}` : "",
            `Context: ${JSON.stringify({ profile: ctx.profile, nutrition: ctx.nutrition })}`,
          ].join("\n"),
          maxTokens: 1400,
        },
        MealPlanSchema,
      );
      const unsafe = out.calorieTarget < 1200 || out.meals.some((m) => violatesSafety(`${m.name} ${m.notes}`));
      if (!unsafe) {
        const meals = out.meals.map((m, i) => {
          const match = input.recipes.find((r) => r.name.toLowerCase() === m.name.toLowerCase());
          return { index: i, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredients, recipeId: match?.id ?? null, notes: m.notes || undefined };
        });
        const totals = meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        const plan: GeneratedMealPlan = { calorieTarget: input.calorieTarget, proteinTarget: input.proteinTarget, meals, totals, rationale: out.rationale };
        writeCache("meals", key, input.date, { plan, source: "ai" }, provider);
        return { plan, source: "ai", cached: false };
      }
    } catch (e) {
      const plan = generateTemplateMealPlan({ recipes: input.recipes, prefs: input.prefs, calorieTarget: input.calorieTarget, proteinTarget: input.proteinTarget, onHand: input.onHand, recentRecipeIds: input.recentRecipeIds, seed: Number(input.date.replace(/-/g, "")) });
      writeCache("meals", key, input.date, { plan, source: "template" });
      return { plan, source: "template", cached: false, error: (e as Error).message };
    }
  }
  const plan = generateTemplateMealPlan({ recipes: input.recipes, prefs: input.prefs, calorieTarget: input.calorieTarget, proteinTarget: input.proteinTarget, onHand: input.onHand, recentRecipeIds: input.recentRecipeIds, seed: Number(input.date.replace(/-/g, "")) + (input.force ? Date.now() % 1000 : 0) });
  writeCache("meals", key, input.date, { plan, source: "template" });
  return { plan, source: "template", cached: false };
}

// --------------------------------------------------------------- quest ----
/** AI candidate for the offer engine. Returns null when AI is off or the candidate fails validation. */
export async function aiQuestCandidate(ctx: AiContext, hints: { localHour: number; signals: Record<string, unknown> }): Promise<ValidatedCandidate | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const out = await provider.generateJSON(
      {
        system: SYSTEM_BASE + " You propose one small, optional, positive 'special quest' for today — like an NPC giving a side mission. It must be safe, realistic, and doable within the day.",
        user: [
          "Return JSON {title, description, domain, difficulty (common|uncommon|rare), estimatedMinutes, xpReward, kind}. XP bands: common 15-30, uncommon 30-60, rare 60-100.",
          `Local hour: ${hints.localHour}. Signals: ${JSON.stringify(hints.signals)}. Rank context: ${JSON.stringify(ctx.rank)}.`,
          `Examples of good quests: ${QUEST_LIBRARY.slice(0, 6).map((q) => q.title).join("; ")}.`,
        ].join("\n"),
        maxTokens: 300,
        temperature: 0.9,
      },
      QuestCandidateSchema,
    );
    const candidate: ValidatedCandidate = { templateKey: null, source: "ai", title: out.title, description: out.description, domain: out.domain, difficulty: out.difficulty, kind: out.kind, estimatedMinutes: out.estimatedMinutes, xpReward: out.xpReward, expiresInHours: 10 };
    return validateCandidate(candidate, []) ? null : candidate;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- coach ----
export async function coachReply(ctx: AiContext, question: string, extras: { openQuests: string[]; todayPlan: string | null; easiestXp: string[] }): Promise<AiCoachReply & { source: "ai" | "rules" }> {
  const provider = getProvider();
  if (provider) {
    try {
      const out = await provider.generateJSON(
        {
          system: SYSTEM_BASE + " You are a concise, encouraging coach inside the app. Answer in 2-6 sentences using only the structured context provided. Never invent user data. Suggest at most 4 short follow-up actions.",
          user: `Question: ${question}\nContext: ${JSON.stringify({ ...ctx, openQuests: extras.openQuests, todayPlan: extras.todayPlan, easiestXp: extras.easiestXp })}\nReturn JSON {reply, suggestions[]}.`,
          maxTokens: 700,
        },
        CoachReplySchema,
      );
      return { ...out, source: "ai" };
    } catch {
      /* fall through to rules */
    }
  }
  return { ...rulesCoach(ctx, question, extras), source: "rules" };
}

/** Deterministic coach for the no-AI case. Handles the common questions well; the rest get a useful default. */
export function rulesCoach(ctx: AiContext, question: string, extras: { openQuests: string[]; todayPlan: string | null; easiestXp: string[] }): AiCoachReply {
  const q = question.toLowerCase();
  const weakest = ctx.rank.domains.find((d) => d.weakest);
  if (/what should i do|today|plan my day/.test(q)) {
    const parts = [extras.todayPlan ? `Today's workout is ready: ${extras.todayPlan}.` : "No workout generated yet — open Planner and build one.", extras.easiestXp[0] ? `Easiest useful action: ${extras.easiestXp[0]}.` : "", weakest ? `${weakest.domain} is your weakest domain (${weakest.rank}); ${weakest.topRequirement ?? "log something there"}.` : ""].filter(Boolean);
    return { reply: parts.join(" "), suggestions: extras.easiestXp.slice(0, 3) };
  }
  if (/why.*rank|not increasing|stuck|plateau/.test(q)) {
    const d = ctx.rank.domains.find((x) => q.includes(x.domain.toLowerCase())) ?? weakest;
    return { reply: d ? `${d.domain} is ${d.rank} rank at ${d.score}/100. The engine says the next step is: ${d.topRequirement ?? "keep logging"}. Ranks move on 30 and 90-day averages and are capped by how long you've been tracking, so steady weeks matter more than big days.` : "Ranks move on rolling 30/90-day averages, so consistency beats intensity.", suggestions: d?.topRequirement ? [d.topRequirement] : [] };
  }
  if (/xp|level up|easiest/.test(q)) {
    return { reply: extras.easiestXp.length ? `Quickest XP right now: ${extras.easiestXp.slice(0, 3).join("; ")}.` : "Log anything you've already done today — workouts, meals, routines and habits all pay XP.", suggestions: extras.easiestXp.slice(0, 4) };
  }
  if (/workout|train|lift|tired|adjust/.test(q)) {
    const tired = /tired|exhaust|sore|low energy/.test(q);
    return { reply: tired ? "Swap today for a recovery session: a 20–30 minute walk and 10 minutes of mobility. Keep the streak, lose the strain. You can regenerate today's plan with the 'I'm tired' adjustment in Planner." : `Open Planner → Workout and generate a session. Your profile is set to ${ctx.fitness.goal}, ${ctx.fitness.daysPerWeek} days/week, ${ctx.fitness.workoutLengthMin} minutes.`, suggestions: ["Generate today's workout", tired ? "Make it a recovery day" : "Start the session"] };
  }
  if (/cook|dinner|recipe|protein|eat|meal/.test(q)) {
    const gap = Math.max(0, ctx.nutrition.targets.protein - ctx.nutrition.todayTotals.protein);
    return { reply: `You're at ${ctx.nutrition.todayTotals.protein} g protein of a ${ctx.nutrition.targets.protein} g target${gap ? ` — ${gap} g to go` : ""}. Open Planner → Meals to generate a plan, or Recipes and search by what you have on hand.`, suggestions: ["Generate today's meals", "Find a high-protein dinner", "Quick-add a protein snack"] };
  }
  return { reply: "I can help with today's plan, your workout, meals and protein, why a rank is stuck, and the fastest XP. Ask one of those, or open Planner.", suggestions: ["What should I do today?", "Build me a 45-minute workout", "Why isn't my fitness rank increasing?", "Easiest XP tonight?"] };
}

export const PLACEHOLDER_LIBRARY_CANDIDATE = libraryCandidate;

// ------------------------------------------------------- food estimate ----
/**
 * Estimate nutrition for a described meal. Only used when no verified data
 * matched; the result is always shown as an ESTIMATE and is editable.
 * Returns null when AI is not configured (the UI then offers quick-add).
 */
export async function estimateFood(description: string): Promise<(AiFoodEstimate & { source: "ai" }) | null> {
  const provider = getProvider();
  if (!provider) return null;
  const key = `food:${hash(description.trim().toLowerCase())}`;
  const cached = readCache<AiFoodEstimate>("food", key);
  if (cached) return { ...cached, source: "ai" };
  const out = await provider.generateJSON(
    {
      system: SYSTEM_BASE + " You estimate restaurant/home meal nutrition from a short description. Use typical restaurant portion sizes. Be honest about uncertainty.",
      user: `Describe: ${description}\nReturn JSON {name, calories, protein, carbs, fat, confidence (low|medium|high), assumptions}. Integers. Name ≤ 60 chars.`,
      maxTokens: 250,
      temperature: 0.2,
    },
    FoodEstimateSchema,
  );
  writeCache("food", key, new Date().toISOString().slice(0, 10), out, provider);
  return { ...out, source: "ai" };
}

// ---------------------------------------------------------- day adjust ----
/** Propose replacements for the rest of today. AI when available, otherwise a recipe/pantry template. Never applied without approval. */
export async function adjustDay(ctx: AiContext, input: { remaining: RemainingSlot[]; remainingCalories: number; remainingProtein: number; recipes: RecipeLite[]; pantry: string[]; maxPrepMin: number; dislikes: string[]; unplanned: string }): Promise<(AdjustProposal & { source: "ai" | "template" }) | null> {
  const fallback = () => {
    const p = proposeDayAdjustment(input);
    return p ? { ...p, source: "template" as const } : null;
  };
  const provider = getProvider();
  if (!provider || !input.remaining.length) return fallback();
  try {
    const out = await provider.generateJSON(
      {
        system: SYSTEM_BASE + " You rebalance the rest of today's meals after an unplanned meal. Never recommend skipping meals or eating under 300 kcal for a main meal. Prefer ingredients on hand.",
        user: [
          `Unplanned meal eaten: ${input.unplanned}. Remaining calories for today: ${input.remainingCalories} kcal, protein still needed: ${input.remainingProtein} g.`,
          `Remaining planned slots: ${JSON.stringify(input.remaining.map((r) => ({ slot: r.slot, mealType: r.mealType, planned: r.name, calories: r.calories })))}.`,
          `On hand: ${input.pantry.join(", ") || "unknown"}. Max prep ${input.maxPrepMin} min. Dislikes: ${input.dislikes.join(", ") || "none"}.`,
          `Saved recipes: ${input.recipes.slice(0, 25).map((r) => `${r.name} (${r.calories} kcal, ${r.proteinG} g)`).join("; ")}.`,
          "Return JSON {meals[{replacesSlot, name, calories, protein, carbs, fat, ingredients[], notes}], rationale}. One replacement per remaining slot, in slot order.",
        ].join("\n"),
        maxTokens: 700,
      },
      DayAdjustSchema,
    );
    const meals = out.meals
      .map((m) => {
        const slot = input.remaining.find((r) => r.slot === m.replacesSlot);
        if (!slot || violatesSafety(`${m.name} ${m.notes}`)) return null;
        const match = input.recipes.find((r) => r.name.toLowerCase() === m.name.toLowerCase());
        return { replacesId: slot.id, replacesSlot: slot.slot, mealType: slot.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredients, recipeId: match?.id ?? null, notes: m.notes };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (!meals.length) return fallback();
    return { meals, rationale: out.rationale, source: "ai" };
  } catch {
    return fallback();
  }
}

// ---------------------------------------------------------------- week ----
/**
 * A full week: meals, consolidated shopping list, prep plan. AI gets the
 * structured context (inventory, targets, budget, preferences) and must return
 * the WeeklyPlanSchema; prices come from the catalog whenever it knows the
 * ingredient (AI prices only fill gaps). Falls back to the template planner.
 */
export async function generateWeek(ctx: AiContext, input: GenerateWeekInput & { force?: boolean }): Promise<GenResult<GeneratedWeek>> {
  const key = `week:${input.weekStart}:${hash({ b: input.budget, m: input.budgetMode, n: input.mealsNeeded, w: input.week, p: input.prefs, c: input.calorieTarget, pr: input.proteinTarget, pantry: input.pantry.map((p) => p.name).sort() })}`;
  if (!input.force) {
    const cached = readCache<{ plan: GeneratedWeek; source: "ai" | "template" }>("week", key);
    if (cached) return { ...cached, cached: true };
  }
  const provider = getProvider();
  if (provider) {
    try {
      const out = await provider.generateJSON(
        {
          system: SYSTEM_BASE + " You plan one week of meals for a home cook on a grocery budget. Optimise for ingredient reuse (few core ingredients used across many meals), low waste, convenience (quick weekday meals, batch prep), hitting calorie/protein targets, and staying within budget. Use the pantry first. Prices are rough US supermarket estimates.",
          user: [
            `Week starting ${input.weekStart}. Budget $${input.budget} (${input.budgetMode}). Targets ${input.calorieTarget} kcal and ${input.proteinTarget} g protein per day.`,
            `Meals needed: ${JSON.stringify(input.mealsNeeded)} (eatingOut = dinners NOT to plan, put them on Friday/Saturday). Preferences: ${JSON.stringify(input.week)}. Diet: ${input.prefs.dietPrefs.join(", ") || "none"}. Dislikes: ${input.prefs.dislikes.join(", ") || "none"}. Likes: ${input.prefs.likes.join(", ") || "none"}. Max prep ${input.prefs.maxPrepMin} min on weekdays.`,
            `Pantry on hand (do not buy these unless more is needed): ${input.pantry.map((p) => `${p.name}${p.servings != null ? ` (~${p.servings} servings)` : ""}`).join(", ") || "nothing recorded"}.`,
            `Saved recipes you may reuse by exact name: ${input.recipes.slice(0, 40).map((r) => `${r.name} [${r.mealType}, ${r.calories} kcal, ${r.proteinG} g, ${r.ingredients.join("/")}]`).join("; ")}.`,
            "Return JSON {rationale, days[{date, meals[{mealType, name, calories, protein, carbs, fat, ingredients[{name, qty, unit}], prepMinutes, prepAhead}]}], shoppingList[{name, category, qty, unit, estPrice, usedIn[]}], prepPlan[{name, servings, minutes, supports[]}]}. Keep to ~10-14 distinct ingredients beyond staples. Leftover lunches should be named 'Leftover <dinner>'.",
            `Context: ${JSON.stringify({ nutrition: ctx.nutrition, profile: ctx.profile })}`,
          ].join("\n"),
          maxTokens: 3500,
        },
        WeeklyPlanSchema,
      );
      const meals: WeekMeal[] = [];
      for (const day of out.days) {
        if (day.date < input.weekStart || day.date > addDaysIso(input.weekStart, 6)) continue;
        for (const m of day.meals) {
          if (violatesSafety(`${m.name}`)) continue;
          const match = input.recipes.find((r) => r.name.toLowerCase() === m.name.toLowerCase().replace(/^leftover /, ""));
          meals.push({ date: day.date, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredients.map((i) => i.name), recipeId: match?.id ?? null, prepMinutes: m.prepMinutes, leftover: /^leftover /i.test(m.name) });
        }
      }
      const dinners = meals.filter((m) => m.mealType === "dinner").length;
      if (meals.length < 7 || dinners < Math.min(3, input.mealsNeeded.dinner)) throw new Error("AI week too thin");
      const pantry = new Map(input.pantry.map((p) => [canonicalName(p.name), p.servings ?? 2]));
      const list = shoppingListFromMeals(meals, pantry, input);
      // Fill prices the catalog doesn't know from the AI's estimate.
      for (const item of list.items) {
        if (item.estPrice == null) {
          const ai = out.shoppingList.find((x) => canonicalName(x.name) === item.name);
          if (ai?.estPrice != null) item.estPrice = ai.estPrice;
        }
      }
      const total = Math.round(list.items.reduce((a, i) => a + (i.estPrice ?? 0), 0) * 100) / 100;
      const prep = out.prepPlan.length ? { items: out.prepPlan.map((p) => ({ name: p.name, servings: p.servings, minutes: p.minutes, supports: p.supports })), minutes: Math.round(Math.max(...out.prepPlan.map((p) => p.minutes)) + out.prepPlan.reduce((a, p) => a + p.minutes, 0) * 0.3) } : buildPrepPlan(meals.filter((m) => !m.leftover && m.mealType !== "snack"));
      const plan: GeneratedWeek = { weekStart: input.weekStart, meals, shoppingList: list.items, prepPlan: prep.items, prepMinutes: prep.minutes, estimatedCost: total, reusePct: list.reusePct, staplesAssumed: list.staples, rationale: out.rationale || "Planned for reuse and budget.", distinctRecipes: new Set(meals.filter((m) => !m.leftover && m.mealType !== "snack").map((m) => m.name)).size };
      writeCache("week", key, input.weekStart, { plan, source: "ai" }, provider);
      return { plan, source: "ai", cached: false };
    } catch (e) {
      const plan = generateTemplateWeek(input);
      writeCache("week", key, input.weekStart, { plan, source: "template" });
      return { plan, source: "template", cached: false, error: (e as Error).message };
    }
  }
  const plan = generateTemplateWeek(input);
  writeCache("week", key, input.weekStart, { plan, source: "template" });
  return { plan, source: "template", cached: false };
}

function addDaysIso(d: string, n: number): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// -------------------------------------------------------------- pantry ----
/** "What can I eat tonight?" — structured recipes from what is on hand. */
export async function suggestFromPantry(ctx: AiContext, input: SuggestInput & { budgetRemaining?: number | null; recentMeals?: string[] }): Promise<{ suggestions: Suggestion[]; source: "ai" | "template"; error?: string }> {
  const provider = getProvider();
  const fallback = () => ({ suggestions: suggestFromPantryTemplate(input), source: "template" as const });
  if (!provider) return fallback();
  try {
    const out = await provider.generateJSON(
      {
        system: SYSTEM_BASE + " You suggest 2-4 realistic meals from what the user already has. Prefer using ingredients that are expiring. At most 2 additional ingredients per suggestion. Include short steps.",
        user: [
          `Request context: ${JSON.stringify({ availableIngredients: input.pantry, expiringIngredients: input.expiring, remainingCalories: input.remainingCalories, remainingProtein: input.remainingProtein, maxPrepMinutes: input.maxMinutes, mealType: input.mealType ?? "dinner", dislikes: input.dislikes, budgetRemaining: input.budgetRemaining ?? null, recentMeals: input.recentMeals ?? [], foodPreferences: ctx.nutrition.dietPrefs })}`,
          "Return JSON {suggestions[{name, calories, protein, carbs, fat, prepMinutes, uses[], additional[], steps[], why}]}.",
        ].join("\n"),
        maxTokens: 1200,
      },
      RecipeSuggestionSchema,
    );
    const pantry = new Set(input.pantry.map(canonicalName));
    const suggestions: Suggestion[] = out.suggestions
      .filter((s) => !violatesSafety(`${s.name} ${s.why}`))
      .map((s) => {
        const uses = s.uses.filter((u) => pantry.has(canonicalName(u)));
        const core = [...s.uses, ...s.additional].filter((i) => !findIngredient(i)?.staple);
        return { ...s, uses, recipeId: input.recipes.find((r) => r.name.toLowerCase() === s.name.toLowerCase())?.id ?? null, coverage: core.length ? Math.round((uses.length / core.length) * 100) / 100 : 0 };
      });
    if (!suggestions.length) return fallback();
    return { suggestions, source: "ai" };
  } catch (e) {
    return { ...fallback(), error: (e as Error).message };
  }
}
