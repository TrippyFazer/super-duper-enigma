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
import { CoachReplySchema, DayAdjustSchema, EventQuestFramingSchema, FoodEstimateSchema, MealPlanSchema, QuestCandidateSchema, RecipeSuggestionSchema, UserQuestEnhanceSchema, WeeklyPlanSchema, WorkoutPlanSchema, type AiCoachReply, type AiFoodEstimate, type AiUserQuestEnhance } from "./schemas";
import { generateTemplateWeek, shoppingListFromMeals, buildPrepPlan, type GeneratedWeek, type GenerateWeekInput, type WeekMeal } from "@/planner/weekTemplates";
import { suggestFromPantryTemplate, type SuggestInput, type Suggestion } from "@/planner/pantrySuggest";
import { canonicalName, findIngredient } from "@/food/ingredients";
import { pantryCovers } from "@/food/families";
import { deriveRules, recipeExcluded, validateMeal, type FoodRules } from "@/food/rules";
import { snacksFor } from "@/planner/weekTemplates";
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

// ----------------------------------------------------------- food rules ----
/** The prompt gets the rules as MUST / SHOULD lines; the validator below enforces them regardless. */
function rulesPrompt(ctx: AiContext): string {
  const r = ctx.nutrition.foodRules;
  const lines: string[] = [];
  if (r.hardRestrictions.length) lines.push(`MUST NEVER include: ${r.hardRestrictions.join(", ")}.`);
  if (r.ingredientSubstitutions.length) lines.push(`Ingredient rules: ${r.ingredientSubstitutions.map((x) => `${x.never ? "never use" : "avoid"} ${x.from}, use ${x.to} instead`).join("; ")}.`);
  if (r.dislikes.length) lines.push(`Dislikes (avoid): ${r.dislikes.join(", ")}.`);
  if (r.likes.length) lines.push(`Likes: ${r.likes.join(", ")}.`);
  if (r.preferences.length) lines.push(`Prefers: ${r.preferences.join(", ")}.`);
  if (r.diets.length) lines.push(`Diet: ${r.diets.join(", ")}.`);
  return lines.join(" ");
}

/**
 * NEVER TRUST RAW MODEL OUTPUT. Every generated meal is normalised, substituted
 * and validated against the user's rules: repaired when a substitute exists,
 * rejected when a hard rule is violated with no way out.
 */
function validateMeals<T extends { name: string; ingredients: string[]; calories: number; protein: number; carbs: number; fat: number; notes?: string }>(meals: T[], rules: FoodRules): { meals: T[]; rejected: string[]; repaired: string[] } {
  const out: T[] = [];
  const rejected: string[] = [];
  const repaired: string[] = [];
  for (const m of meals) {
    if (recipeExcluded(m, rules)) {
      rejected.push(m.name);
      continue;
    }
    const v = validateMeal(m, rules);
    if (v.status === "rejected") rejected.push(m.name);
    else {
      if (v.status === "repaired") repaired.push(`${m.name}: ${v.changes.map((c) => `${c.from} → ${c.to}`).join(", ")}`);
      out.push(v.meal);
    }
  }
  return { meals: out, rejected, repaired };
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
            `Land within ±10% of ${input.calorieTarget} kcal and at or above ${input.proteinTarget} g protein. ${rulesPrompt(ctx)} Prefer saved recipes when they fit. Keep prep under ${input.prefs.maxPrepMin} minutes per meal. ${input.prefs.mealsPerDay} meals plus snacks as needed.`,
            input.onHand?.length ? `Ingredients on hand: ${input.onHand.join(", ")}.` : "",
            input.request ? `User request: ${input.request}` : "",
            `Context: ${JSON.stringify({ profile: ctx.profile, nutrition: ctx.nutrition })}`,
          ].join("\n"),
          maxTokens: 1400,
        },
        MealPlanSchema,
      );
      const unsafe = out.calorieTarget < 1200 || out.meals.some((m) => violatesSafety(`${m.name} ${m.notes}`));
      const rules = deriveRules(input.prefs);
      const checked = validateMeals(out.meals.map((m) => ({ ...m, notes: m.notes || undefined })), rules);
      // A day that lost a main meal to the rules is not a day plan: fall back to the template (which obeys them by construction).
      const lostMain = out.meals.some((m) => m.mealType !== "snack" && checked.rejected.includes(m.name));
      if (!unsafe && !lostMain && checked.meals.length) {
        const meals = checked.meals.map((m, i) => {
          const match = input.recipes.find((r) => r.name.toLowerCase() === m.name.toLowerCase());
          return { index: i, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredients, recipeId: match?.id ?? null, notes: m.notes || undefined };
        });
        const totals = meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        const plan: GeneratedMealPlan = { calorieTarget: input.calorieTarget, proteinTarget: input.proteinTarget, meals, totals, rationale: checked.repaired.length ? `${out.rationale} Adjusted to your food rules (${checked.repaired.join("; ")}).` : out.rationale };
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
export async function adjustDay(ctx: AiContext, input: { remaining: RemainingSlot[]; remainingCalories: number; remainingProtein: number; recipes: RecipeLite[]; pantry: string[]; maxPrepMin: number; dislikes: string[]; unplanned: string; rules?: FoodRules | null }): Promise<(AdjustProposal & { source: "ai" | "template" }) | null> {
  const fallback = () => {
    const p = proposeDayAdjustment(input);
    return p ? { ...p, source: "template" as const } : null;
  };
  const rules = input.rules ?? null;
  const provider = getProvider();
  if (!provider || !input.remaining.length) return fallback();
  try {
    const out = await provider.generateJSON(
      {
        system: SYSTEM_BASE + " You rebalance the rest of today's meals after an unplanned meal. Never recommend skipping meals or eating under 300 kcal for a main meal. Prefer ingredients on hand.",
        user: [
          `Unplanned meal eaten: ${input.unplanned}. Remaining calories for today: ${input.remainingCalories} kcal, protein still needed: ${input.remainingProtein} g.`,
          `Remaining planned slots: ${JSON.stringify(input.remaining.map((r) => ({ slot: r.slot, mealType: r.mealType, planned: r.name, calories: r.calories })))}.`,
          `On hand: ${input.pantry.join(", ") || "unknown"}. Max prep ${input.maxPrepMin} min. ${rulesPrompt(ctx)}`,
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
        let meal: { name: string; ingredients: string[]; calories: number; protein: number; carbs: number; fat: number; notes?: string } = { name: m.name, ingredients: m.ingredients, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, notes: m.notes };
        if (rules) {
          const v = validateMeals([meal], rules);
          if (!v.meals.length) return null;
          meal = v.meals[0];
        }
        const match = input.recipes.find((r) => r.name.toLowerCase() === meal.name.toLowerCase());
        return { replacesId: slot.id, replacesSlot: slot.slot, mealType: slot.mealType, name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, ingredients: meal.ingredients, recipeId: match?.id ?? null, notes: meal.notes ?? "" };
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
  const key = `week:${input.weekStart}:${hash({ d: input.days ?? 7, b: input.budget, m: input.budgetMode, n: input.mealsNeeded, w: input.week, p: input.prefs, c: input.calorieTarget, pr: input.proteinTarget, pantry: input.pantry.map((p) => p.name).sort() })}`;
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
            `Plan ${input.days ?? 7} days starting ${input.weekStart} (dates ${input.weekStart} to ${addDaysIso(input.weekStart, (input.days ?? 7) - 1)}). Budget $${input.budget} (${input.budgetMode}). Targets ${input.calorieTarget} kcal and ${input.proteinTarget} g protein per day.`,
            `Meals needed: ${JSON.stringify(input.mealsNeeded)} (eatingOut = dinners NOT to plan; prefer Friday/Saturday when those dates are in range). Preferences: ${JSON.stringify(input.week)}. ${rulesPrompt(ctx)} Max prep ${input.prefs.maxPrepMin} min on weekdays.`,
            `Pantry on hand — PLAN AROUND IT FIRST, use expiring and opened items early, and do not buy these unless more is needed: ${input.pantry.map((p) => `${p.name}${p.servings != null ? ` (~${p.servings} servings)` : p.level ? ` (${p.level === "lot" ? "a lot" : p.level})` : ""}${p.expiring ? " [expiring]" : ""}${p.opened ? " [opened]" : ""}`).join(", ") || "nothing recorded"}.`,
            `Saved recipes you may reuse by exact name: ${input.recipes.slice(0, 40).map((r) => `${r.name} [${r.mealType}, ${r.calories} kcal, ${r.proteinG} g, ${r.ingredients.join("/")}]`).join("; ")}.`,
            "Return JSON {rationale, days[{date, meals[{mealType, name, calories, protein, carbs, fat, ingredients[{name, qty, unit}], prepMinutes, prepAhead}]}], shoppingList[{name, category, qty, unit, estPrice, usedIn[]}], prepPlan[{name, servings, minutes, supports[]}]}. Keep to ~10-14 distinct ingredients beyond staples. Leftover lunches should be named 'Leftover <dinner>'.",
            `Context: ${JSON.stringify({ nutrition: ctx.nutrition, profile: ctx.profile })}`,
          ].join("\n"),
          maxTokens: 3500,
        },
        WeeklyPlanSchema,
      );
      const rules = input.rules ?? deriveRules(input.prefs);
      const meals: WeekMeal[] = [];
      const rejected: string[] = [];
      const repaired: string[] = [];
      for (const day of out.days) {
        if (day.date < input.weekStart || day.date > addDaysIso(input.weekStart, (input.days ?? 7) - 1)) continue;
        for (const m of day.meals) {
          if (violatesSafety(`${m.name}`)) continue;
          const match = input.recipes.find((r) => r.name.toLowerCase() === m.name.toLowerCase().replace(/^leftover /, ""));
          // keep the model's quantities ("2 cups rice") so requirements are quantity-aware
          const ingredients = m.ingredients.map((i) => (i.qty && i.unit && !(i.qty === 1 && i.unit === "each") ? `${i.qty} ${i.unit} ${i.name}` : i.name));
          const v = validateMeals([{ name: m.name, ingredients, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, notes: undefined as string | undefined }], rules);
          if (!v.meals.length) {
            rejected.push(m.name);
            continue;
          }
          repaired.push(...v.repaired);
          const vm = v.meals[0];
          meals.push({ date: day.date, mealType: m.mealType, name: vm.name, calories: vm.calories, protein: vm.protein, carbs: vm.carbs, fat: vm.fat, ingredients: vm.ingredients, recipeId: match?.id ?? null, prepMinutes: m.prepMinutes, leftover: /^leftover /i.test(m.name), notes: vm.notes });
        }
      }
      // Fill slots the rules rejected from the template library (never leave a day without a main meal).
      if (rejected.length) {
        const snacks = snacksFor(rules);
        for (const day of out.days) {
          for (const m of day.meals) {
            if (!rejected.includes(m.name) || meals.some((x) => x.date === day.date && x.mealType === m.mealType)) continue;
            const pool = input.recipes.filter((r) => r.calories != null && r.proteinG != null && (r.mealType === m.mealType || r.mealType === "any") && !recipeExcluded(r, rules));
            const pick = pool[0];
            if (pick) {
              const pv = validateMeal({ name: pick.name, ingredients: pick.ingredients, calories: pick.calories!, protein: pick.proteinG!, carbs: pick.carbsG ?? 0, fat: pick.fatG ?? 0 }, rules);
              if (pv.status !== "rejected") meals.push({ date: day.date, mealType: m.mealType, name: pv.meal.name, calories: pv.meal.calories, protein: pv.meal.protein, carbs: pv.meal.carbs, fat: pv.meal.fat, ingredients: pv.meal.ingredients, recipeId: pick.id, prepMinutes: pick.prepTimeMin + pick.cookTimeMin, notes: `Replaced ${m.name} (your food rules)` });
            } else if (m.mealType === "snack" && snacks[0]) meals.push({ date: day.date, mealType: "snack", name: snacks[0].name, calories: snacks[0].calories, protein: snacks[0].protein, carbs: snacks[0].carbs, fat: snacks[0].fat, ingredients: snacks[0].ingredients, recipeId: null, prepMinutes: 2 });
          }
        }
      }
      const dinners = meals.filter((m) => m.mealType === "dinner").length;
      if (meals.length < Math.min(7, (input.days ?? 7)) || dinners < Math.min(3, input.mealsNeeded.dinner)) throw new Error("AI week too thin");
      const list = shoppingListFromMeals(meals, input.pantry, input, rules);
      // Fill prices the catalog doesn't know from the AI's estimate.
      for (const item of list.items) {
        if (item.estPrice == null) {
          const ai = out.shoppingList.find((x) => canonicalName(x.name) === item.name);
          if (ai?.estPrice != null) item.estPrice = ai.estPrice;
        }
      }
      const total = Math.round(list.items.reduce((a, i) => a + (i.estPrice ?? 0), 0) * 100) / 100;
      const prep = out.prepPlan.length ? { items: out.prepPlan.map((p) => ({ name: p.name, servings: p.servings, minutes: p.minutes, supports: p.supports })), minutes: Math.round(Math.max(...out.prepPlan.map((p) => p.minutes)) + out.prepPlan.reduce((a, p) => a + p.minutes, 0) * 0.3) } : buildPrepPlan(meals.filter((m) => !m.leftover && m.mealType !== "snack"));
      const ruleNotes = [...(repaired.length ? [`Adjusted to your food rules: ${[...new Set(repaired)].slice(0, 4).join("; ")}.`] : []), ...(rejected.length ? [`${rejected.length} suggested meal${rejected.length === 1 ? "" : "s"} broke a food rule and ${rejected.length === 1 ? "was" : "were"} replaced.`] : [])];
      const plan: GeneratedWeek = { weekStart: input.weekStart, meals, shoppingList: list.items, prepPlan: prep.items, prepMinutes: prep.minutes, estimatedCost: total, reusePct: list.reusePct, staplesAssumed: list.staples, rationale: [out.rationale || "Planned for reuse and budget.", ...ruleNotes].join(" "), distinctRecipes: new Set(meals.filter((m) => !m.leftover && m.mealType !== "snack").map((m) => m.name)).size };
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
          `Request context: ${JSON.stringify({ availableIngredients: input.pantry, expiringIngredients: input.expiring, remainingCalories: input.remainingCalories, remainingProtein: input.remainingProtein, maxPrepMinutes: input.maxMinutes, mealType: input.mealType ?? "dinner", budgetRemaining: input.budgetRemaining ?? null, recentMeals: input.recentMeals ?? [], foodRules: ctx.nutrition.foodRules })}`,
          rulesPrompt(ctx),
          "Return JSON {suggestions[{name, calories, protein, carbs, fat, prepMinutes, uses[], additional[], steps[], why}]}.",
        ].join("\n"),
        maxTokens: 1200,
      },
      RecipeSuggestionSchema,
    );
    const have = (i: string) => input.pantry.some((p) => pantryCovers(i, p));
    const rules = input.rules ?? null;
    const suggestions: Suggestion[] = out.suggestions
      .filter((s) => !violatesSafety(`${s.name} ${s.why}`))
      .map((s) => {
        if (!rules) return s;
        // same validator as every plan: repair substitutions, drop hard violations
        const v = validateMeals([{ name: s.name, ingredients: [...s.uses, ...s.additional], calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat }], rules);
        if (!v.meals.length) return null;
        const m = v.meals[0];
        return { ...s, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, uses: m.ingredients.slice(0, s.uses.length), additional: m.ingredients.slice(s.uses.length) };
      })
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => {
        const all = [...s.uses, ...s.additional];
        const uses = all.filter(have);
        const additional = all.filter((i) => !have(i));
        const core = all.filter((i) => !findIngredient(i)?.staple);
        return { ...s, uses, additional, recipeId: input.recipes.find((r) => r.name.toLowerCase() === s.name.toLowerCase())?.id ?? null, coverage: core.length ? Math.round((uses.length / core.length) * 100) / 100 : 0 };
      });
    if (!suggestions.length) return fallback();
    return { suggestions, source: "ai" };
  } catch (e) {
    return { ...fallback(), error: (e as Error).message };
  }
}

// ----------------------------------------------------------- adventures ----
/**
 * Frame verified events as quests. The model gets only ids + facts and returns
 * titles/descriptions per id; anything referencing an unknown id, or tripping
 * the safety filter, is dropped. Facts never come from the model.
 */
export async function frameAdventures(ctx: AiContext, events: { id: number; name: string; category: string; venue: string | null; startAt: string; price: string; distanceMi: number | null; description: string }[], hints: { interests: string[]; window: string }): Promise<Map<number, { title: string; description: string; why: string }>> {
  const out = new Map<number, { title: string; description: string; why: string }>();
  const provider = getProvider();
  if (!provider || events.length === 0) return out;
  const key = `adv:${hash({ ids: events.map((e) => e.id).sort(), w: hints.window })}`;
  const cached = readCache<{ picks: { eventId: number; title: string; description: string; why: string }[] }>("adventure", key);
  const picks = cached?.picks ?? (await (async () => {
    try {
      const res = await provider.generateJSON(
        {
          system: SYSTEM_BASE + " You are the game master framing REAL local events as optional 'adventure quests' in a life RPG. You must not change or invent any fact (names, dates, times, prices, venues). Titles are short and evocative (e.g. 'Market run', 'Night at the conservatory'), descriptions give one concrete, fun objective at the event, 'why' says in one sentence why it may fit this person. Keep it warm, never cheesy.",
          user: [
            `Window: ${hints.window}. Interests: ${hints.interests.join(", ") || "unknown"}. Rank context: ${JSON.stringify(ctx.rank.overall)}.`,
            `Events (use eventId exactly): ${JSON.stringify(events)}`,
            "Return JSON {picks:[{eventId, title, description, why}]} for the 2-4 best fits.",
          ].join("\n"),
          maxTokens: 600,
          temperature: 0.8,
        },
        EventQuestFramingSchema,
      );
      writeCache("adventure", key, ctx.profile.today, res, provider);
      return res.picks;
    } catch {
      return [];
    }
  })());
  const known = new Set(events.map((e) => e.id));
  for (const p of picks) {
    if (!known.has(p.eventId)) continue;
    if (violatesSafety(`${p.title} ${p.description}`)) continue;
    out.set(p.eventId, { title: p.title, description: p.description, why: p.why });
  }
  return out;
}

/** "AI enhance" a user-written quest. Returns null without a provider or on any failure. */
export async function enhanceUserQuest(ctx: AiContext, title: string): Promise<AiUserQuestEnhance | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const out = await provider.generateJSON(
      {
        system: SYSTEM_BASE + " Rewrite a user's own to-do as a small, optional quest in a life RPG. Keep the real task intact and specific; add light RPG flavour only when it fits ('Supply run' for grocery shopping is good, forced fantasy for brushing teeth is not). XP 15-60 by effort.",
        user: `User quest: "${title}". Today: ${ctx.profile.today}. Return JSON {title, description, domain, xpReward, estimatedMinutes}.`,
        maxTokens: 200,
        temperature: 0.7,
      },
      UserQuestEnhanceSchema,
    );
    if (violatesSafety(`${out.title} ${out.description}`)) return null;
    return out;
  } catch {
    return null;
  }
}
