import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groceryItems, groceryWeeks, mealPrepSessions, meals, nutritionEntries, plannedMeals, type GroceryItem, type GroceryWeek, type MealPrepSession } from "@/db/schema";
import { addDays, startOfWeek, weekday, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import { buildAiContext } from "@/ai/context";
import { generateWeek as generateWeekAi, suggestFromPantry as suggestAi } from "@/ai/generate";
import { CATEGORY_ORDER, canonicalName, findIngredient, type GroceryCategory } from "@/food/ingredients";
import type { GeneratedWeek, MealsNeeded, WeekPrefs } from "@/planner/weekTemplates";
import type { Suggestion } from "@/planner/pantrySuggest";
import { loadRecipes } from "./loaders";
import { consumeIngredients, expiringSoon, listPantry, servingsOnHand, setPantryLevel, upsertPantry, type PantryLevel } from "./pantry";
import { getProfile, type ProfileView } from "./profile";
import { getAssessment } from "./progression";
import { dayTotals, getMealPlan, logNutrition, resolveTargets, setPlannedMealStatus, saveMealPlan, type PlannedMealView } from "./nutrition";
import { awardXp, voidXpForSource } from "./xp";

// ------------------------------------------------------------- helpers ----
/** The week a Sunday plan is for: the upcoming Mon–Sun when planning on Sat/Sun, otherwise the current week. */
export function planningWeekStart(today: ISODate, shoppingDay = 0): ISODate {
  const wd = weekday(today);
  const cur = startOfWeek(today);
  if (wd === 0 || wd === 6 || wd === shoppingDay) return addDays(cur, wd === 0 || wd === 6 ? 7 : 0);
  return cur;
}

export interface WeekView extends GroceryWeek {
  mealsNeededParsed: MealsNeeded;
  prefsParsed: WeekPrefs;
  summaryParsed: WeekSummary;
  items: GroceryItem[];
  prep: MealPrepSession | null;
  prepItems: { name: string; servings: number; minutes: number; supports: string[] }[];
  days: { date: ISODate; meals: PlannedMealView[] }[];
  totals: { estimated: number; actual: number; purchased: number; itemCount: number; remaining: number };
}

export interface WeekSummary {
  reusePct?: number;
  staplesAssumed?: string[];
  rationale?: string;
  distinctRecipes?: number;
  leftoversCarried?: number;
  coveredByPantry?: number;
  source?: string;
}

export function getWeek(weekStart: ISODate): WeekView | null {
  const row = getDb().select().from(groceryWeeks).where(eq(groceryWeeks.weekStart, weekStart)).get();
  return row ? viewWeek(row) : null;
}

export function getWeekById(id: number): WeekView | null {
  const row = getDb().select().from(groceryWeeks).where(eq(groceryWeeks.id, id)).get();
  return row ? viewWeek(row) : null;
}

export function listWeeks(limit = 8): WeekView[] {
  return getDb().select().from(groceryWeeks).orderBy(desc(groceryWeeks.weekStart)).limit(limit).all().map(viewWeek);
}

function viewWeek(row: GroceryWeek): WeekView {
  const db = getDb();
  const items = db.select().from(groceryItems).where(eq(groceryItems.weekId, row.id)).orderBy(groceryItems.id).all();
  const prep = db.select().from(mealPrepSessions).where(eq(mealPrepSessions.weekId, row.id)).orderBy(desc(mealPrepSessions.id)).get() ?? null;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(row.weekStart, i));
  const days = dates.map((date) => ({ date, meals: getMealPlan(date)?.meals.filter((m) => m.weekId === row.id || !m.weekId) ?? [] }));
  const estimated = items.filter((i) => !i.skipped && !i.coveredByPantry).reduce((a, i) => a + (i.estPrice ?? 0), 0);
  const actual = items.filter((i) => i.purchased).reduce((a, i) => a + (i.actualPrice ?? i.estPrice ?? 0), 0);
  return {
    ...row,
    mealsNeededParsed: { breakfast: 7, lunch: 5, dinner: 5, snacks: 1, eatingOut: 2, ...parseJson<Partial<MealsNeeded>>(row.mealsNeeded, {}) },
    prefsParsed: { quickWeekdays: true, mealPrep: true, highProtein: true, reuseIngredients: true, ...parseJson<Partial<WeekPrefs>>(row.prefs, {}) },
    summaryParsed: parseJson<WeekSummary>(row.summary, {}),
    items,
    prep,
    prepItems: prep ? parseJson(prep.items, []) : [],
    days,
    totals: { estimated: round2(estimated), actual: round2(actual), purchased: items.filter((i) => i.purchased).length, itemCount: items.filter((i) => !i.coveredByPantry).length, remaining: round2(row.budget - (actual || estimated)) },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --------------------------------------------------------------- setup ----
export function upsertWeek(input: { weekStart: ISODate; budget: number; budgetMode: "budget" | "balanced" | "flexible"; calorieTarget: number; proteinTarget: number; mealsNeeded: MealsNeeded; prefs: WeekPrefs }): WeekView {
  const db = getDb();
  const values = { weekStart: input.weekStart, budget: input.budget, budgetMode: input.budgetMode, calorieTarget: input.calorieTarget, proteinTarget: input.proteinTarget, mealsNeeded: toJson(input.mealsNeeded), prefs: toJson(input.prefs) };
  const cur = db.select().from(groceryWeeks).where(eq(groceryWeeks.weekStart, input.weekStart)).get();
  if (cur) db.update(groceryWeeks).set(values).where(eq(groceryWeeks.id, cur.id)).run();
  else db.insert(groceryWeeks).values({ ...values, status: "planning" }).run();
  return getWeek(input.weekStart)!;
}

// ------------------------------------------------------------ generate ----
/** Build (or rebuild) the week: planned meals for each day, the shopping list, the prep session. */
export async function generateWeekPlan(weekId: number, opts: { force?: boolean } = {}): Promise<{ week: WeekView; source: "ai" | "template"; error?: string }> {
  const db = getDb();
  const profile = getProfile();
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));
  const pantry = listPantry().map((p) => ({ name: p.name, servings: servingsOnHand(p) }));
  const ctx = buildAiContext(profile, profile.preferences, getAssessment(profile));
  const recent = db
    .select({ recipeId: plannedMeals.recipeId })
    .from(plannedMeals)
    .where(and(gte(plannedMeals.date, addDays(wk.weekStart, -14)), lte(plannedMeals.date, addDays(wk.weekStart, -1)), eq(plannedMeals.status, "eaten")))
    .all()
    .map((r) => r.recipeId)
    .filter((x): x is number => x != null);
  const r = await generateWeekAi(ctx, { weekStart: wk.weekStart, recipes, prefs: profile.preferences.nutrition, week: wk.prefsParsed, mealsNeeded: wk.mealsNeededParsed, calorieTarget: wk.calorieTarget, proteinTarget: wk.proteinTarget, budget: wk.budget, budgetMode: wk.budgetMode as "budget", pantry, seed: Number(wk.weekStart.replace(/-/g, "")) + (opts.force ? Date.now() % 997 : 0), recentRecipeIds: recent, force: opts.force });
  applyGeneratedWeek(wk, r.plan, r.source);
  return { week: getWeekById(weekId)!, source: r.source, error: r.error };
}

export function applyGeneratedWeek(wk: WeekView, plan: GeneratedWeek, source: "ai" | "template") {
  const db = getDb();
  // Planned meals per day (discarding only planned rows; eaten history is kept by saveMealPlan).
  const byDate = new Map<ISODate, GeneratedWeek["meals"]>();
  for (const m of plan.meals) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]);
  for (let i = 0; i < 7; i++) {
    const date = addDays(wk.weekStart, i);
    const list = byDate.get(date) ?? [];
    const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    const sorted = [...list].sort((a, b) => order[a.mealType] - order[b.mealType]);
    saveMealPlan(
      date,
      {
        calorieTarget: wk.calorieTarget,
        proteinTarget: wk.proteinTarget,
        rationale: plan.rationale,
        totals: sorted.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 }),
        meals: sorted.map((m, idx) => ({ index: idx, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: m.ingredients, recipeId: m.recipeId, notes: m.leftover ? "Leftover — no cooking needed" : m.notes, prepMinutes: m.prepMinutes })),
      },
      source,
      { weekId: wk.id },
    );
  }
  // Shopping list: replace un-purchased rows, keep purchased ones (shopping may be in progress).
  db.delete(groceryItems).where(and(eq(groceryItems.weekId, wk.id), eq(groceryItems.purchased, false))).run();
  for (const it of plan.shoppingList) {
    db.insert(groceryItems).values({ weekId: wk.id, name: it.name, category: it.category, qty: it.qty, unit: it.unit, estPrice: it.estPrice, usedIn: toJson(it.usedIn), coveredByPantry: it.coveredByPantry, note: it.note ?? null }).run();
  }
  // Prep session (Sunday before the week, or the shopping day).
  const prepDate = addDays(wk.weekStart, -1);
  db.delete(mealPrepSessions).where(and(eq(mealPrepSessions.weekId, wk.id), eq(mealPrepSessions.status, "planned"))).run();
  if (plan.prepPlan.length) db.insert(mealPrepSessions).values({ weekId: wk.id, date: prepDate, items: toJson(plan.prepPlan), estimatedMinutes: plan.prepMinutes, supports: toJson([...new Set(plan.prepPlan.flatMap((p) => p.supports))]) }).run();
  const summary: WeekSummary = { reusePct: plan.reusePct, staplesAssumed: plan.staplesAssumed, rationale: plan.rationale, distinctRecipes: plan.distinctRecipes, coveredByPantry: plan.shoppingList.filter((i) => i.coveredByPantry).length, source };
  db.update(groceryWeeks).set({ status: "planned", source, estimatedCost: plan.estimatedCost, summary: toJson(summary) }).where(eq(groceryWeeks.id, wk.id)).run();
}

// --------------------------------------------------------- shopping list ----
export function updateGroceryItem(id: number, patch: { qty?: number; unit?: string; estPrice?: number | null; actualQty?: number | null; actualPrice?: number | null; purchased?: boolean; skipped?: boolean; name?: string; category?: GroceryCategory; note?: string | null }): GroceryItem | null {
  const db = getDb();
  const values: Partial<typeof groceryItems.$inferInsert> = {};
  for (const k of ["qty", "unit", "estPrice", "actualQty", "actualPrice", "purchased", "skipped", "name", "category", "note"] as const) if (patch[k] !== undefined) (values as Record<string, unknown>)[k] = patch[k];
  if (patch.purchased === true && patch.actualQty === undefined) {
    const cur = db.select().from(groceryItems).where(eq(groceryItems.id, id)).get();
    if (cur && cur.actualQty == null) values.actualQty = cur.qty;
  }
  if (patch.purchased === true) values.skipped = false;
  if (patch.skipped === true) values.purchased = false;
  db.update(groceryItems).set(values).where(eq(groceryItems.id, id)).run();
  const row = db.select().from(groceryItems).where(eq(groceryItems.id, id)).get() ?? null;
  if (row) recomputeActual(row.weekId);
  return row;
}

export function addGroceryItem(weekId: number, input: { name: string; qty?: number; unit?: string; estPrice?: number | null; category?: GroceryCategory }): GroceryItem {
  const def = findIngredient(input.name);
  const row = getDb()
    .insert(groceryItems)
    .values({ weekId, name: canonicalName(input.name) || input.name.toLowerCase(), category: input.category ?? def?.category ?? "other", qty: input.qty ?? 1, unit: input.unit ?? def?.unit ?? "each", estPrice: input.estPrice ?? (def ? round2(def.price * (input.qty ?? 1)) : null), usedIn: "[]" })
    .returning()
    .get();
  recomputeActual(weekId);
  return row;
}

export function deleteGroceryItem(id: number) {
  const db = getDb();
  const cur = db.select().from(groceryItems).where(eq(groceryItems.id, id)).get();
  db.delete(groceryItems).where(eq(groceryItems.id, id)).run();
  if (cur) recomputeActual(cur.weekId);
}

function recomputeActual(weekId: number) {
  const db = getDb();
  const items = db.select().from(groceryItems).where(eq(groceryItems.weekId, weekId)).all();
  const actual = items.filter((i) => i.purchased).reduce((a, i) => a + (i.actualPrice ?? i.estPrice ?? 0), 0);
  const estimated = items.filter((i) => !i.skipped && !i.coveredByPantry).reduce((a, i) => a + (i.estPrice ?? 0), 0);
  db.update(groceryWeeks).set({ actualCost: items.some((i) => i.purchased) ? round2(actual) : null, estimatedCost: round2(estimated) }).where(eq(groceryWeeks.id, weekId)).run();
}

/** Done shopping: purchased items become pantry inventory; the week is "shopped". */
export function finishShopping(weekId: number, today: ISODate): WeekView {
  const db = getDb();
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  for (const it of wk.items) {
    if (!it.purchased) continue;
    upsertPantry({ name: it.name, qty: it.actualQty ?? it.qty, unit: it.unit, purchasedAt: today, source: "grocery", add: true });
  }
  recomputeActual(weekId);
  db.update(groceryWeeks).set({ status: "shopped", shoppedAt: new Date().toISOString() }).where(eq(groceryWeeks.id, weekId)).run();
  return getWeekById(weekId)!;
}

/** Undo "done shopping" (e.g. tapped by accident): week goes back to planned; pantry rows added by it are reduced. */
export function reopenShopping(weekId: number): WeekView {
  const db = getDb();
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  for (const it of wk.items) {
    if (!it.purchased) continue;
    const p = listPantry({ includeEmpty: true }).find((x) => x.name === it.name);
    if (p && p.qty != null) upsertPantry({ name: it.name, qty: Math.max(0, p.qty - (it.actualQty ?? it.qty)), unit: p.unit });
  }
  db.update(groceryWeeks).set({ status: "planned", shoppedAt: null }).where(eq(groceryWeeks.id, weekId)).run();
  return getWeekById(weekId)!;
}

// --------------------------------------------------------------- pantry ----
/** End-of-week leftover review: coarse levels per item; feeds next week's list. */
export function leftoverReview(weekId: number | null, levels: { pantryId: number; level: PantryLevel }[]) {
  const db = getDb();
  for (const l of levels) setPantryLevel(l.pantryId, l.level);
  const carried = levels.filter((l) => l.level !== "none").length;
  if (weekId) {
    const wk = getWeekById(weekId);
    if (wk) db.update(groceryWeeks).set({ status: "reviewed", reviewedAt: new Date().toISOString(), summary: toJson({ ...wk.summaryParsed, leftoversCarried: carried }) }).where(eq(groceryWeeks.id, weekId)).run();
  }
  return { carried };
}

// --------------------------------------------------------------- prep ----
export function completePrep(id: number, today: ISODate): { xp: number } {
  const db = getDb();
  const prep = db.select().from(mealPrepSessions).where(eq(mealPrepSessions.id, id)).get();
  if (!prep || prep.status === "completed") return { xp: 0 };
  db.update(mealPrepSessions).set({ status: "completed", completedAt: new Date().toISOString() }).where(eq(mealPrepSessions.id, id)).run();
  const items = parseJson<{ name: string; servings: number }[]>(prep.items, []);
  // Meal prep is real cooking: one cooked-meal row (counts toward the cooking rank) + XP.
  const m = db.insert(meals).values({ date: today, mealType: "any", name: `Meal prep: ${items.map((i) => i.name.replace(/^(Cook|Roast|Brown|Bake|Prep) /, "")).slice(0, 3).join(", ")}`, isNewRecipe: false, qualityTags: toJson(["meal-prep"]) }).returning({ id: meals.id }).get();
  const a = awardXp("meal_cooked", today, { suffix: `prep${m.id}`, source: { type: "prep", id } });
  // Mark the week's planned meals that this prep supports as "prepared".
  const supports = new Set(parseJson<string[]>(prep.supports, []));
  if (prep.weekId) {
    const wk = getWeekById(prep.weekId);
    for (const d of wk?.days ?? []) for (const pm of d.meals) if (pm.status === "planned" && (supports.has(pm.name) || supports.has(pm.name.replace(/^Leftover /, "")))) setPlannedMealStatus(pm.id, "prepared");
  }
  return { xp: a.awarded ? a.amount : 0 };
}

export function uncompletePrep(id: number) {
  const db = getDb();
  const prep = db.select().from(mealPrepSessions).where(eq(mealPrepSessions.id, id)).get();
  if (!prep || prep.status !== "completed") return;
  voidXpForSource({ type: "prep", id }, "meal prep un-completed");
  db.update(mealPrepSessions).set({ status: "planned", completedAt: null }).where(eq(mealPrepSessions.id, id)).run();
  const row = db.select().from(meals).where(and(eq(meals.qualityTags, toJson(["meal-prep"])), gte(meals.date, prep.date))).orderBy(desc(meals.id)).get();
  if (row) {
    voidXpForSource({ type: "meal", id: row.id }, "meal prep un-completed");
    db.delete(meals).where(eq(meals.id, row.id)).run();
  }
}

export function skipPrep(id: number) {
  getDb().update(mealPrepSessions).set({ status: "skipped" }).where(eq(mealPrepSessions.id, id)).run();
}

// ------------------------------------------------------------- feedback ----
export interface WeekFeedback {
  weekStart: ISODate;
  budget: number;
  estimated: number;
  actual: number | null;
  remaining: number | null;
  reusePct: number | null;
  leftoversCarried: number | null;
  mealsCooked: number;
  eatingOut: number;
  plannedEaten: number;
  plannedTotal: number;
  prepDone: boolean | null;
}

export function weekFeedback(wk: WeekView, today: ISODate): WeekFeedback {
  const db = getDb();
  const end = addDays(wk.weekStart, 6);
  const cooked = db.select().from(meals).where(and(gte(meals.date, addDays(wk.weekStart, -1)), lte(meals.date, end))).all().length;
  const out = db.select().from(nutritionEntries).where(and(gte(nutritionEntries.date, wk.weekStart), lte(nutritionEntries.date, end), inArray(nutritionEntries.source, ["restaurant", "estimate"]))).all().length;
  const planned = wk.days.flatMap((d) => d.meals).filter((m) => m.status !== "replaced" && m.status !== "discarded" && m.date <= today);
  return {
    weekStart: wk.weekStart,
    budget: wk.budget,
    estimated: wk.totals.estimated,
    actual: wk.actualCost,
    remaining: wk.actualCost != null ? round2(wk.budget - wk.actualCost) : null,
    reusePct: wk.summaryParsed.reusePct ?? null,
    leftoversCarried: wk.summaryParsed.leftoversCarried ?? null,
    mealsCooked: cooked,
    eatingOut: out,
    plannedEaten: planned.filter((m) => m.status === "eaten").length,
    plannedTotal: planned.length,
    prepDone: wk.prep ? wk.prep.status === "completed" : null,
  };
}

// --------------------------------------------- what can I eat tonight? ----
export async function whatCanIEat(opts: { mealType?: "breakfast" | "lunch" | "dinner" | "snack"; minutes?: number } = {}): Promise<{ suggestions: Suggestion[]; source: "ai" | "template"; error?: string; pantry: string[]; expiring: string[]; remainingCalories: number; remainingProtein: number }> {
  const profile = getProfile();
  const today = profile.today;
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const totals = dayTotals(today);
  const pantry = listPantry().map((p) => p.name);
  const expiring = expiringSoon(today, 3).map((p) => p.name);
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));
  const wk = getWeek(startOfWeek(today));
  const recent = getDb().select({ name: nutritionEntries.name }).from(nutritionEntries).where(gte(nutritionEntries.date, addDays(today, -3))).all().map((r) => r.name);
  const ctx = buildAiContext(profile, profile.preferences, getAssessment(profile));
  const r = await suggestAi(ctx, { recipes, pantry, expiring, remainingCalories: targets.calories - totals.calories, remainingProtein: targets.protein - totals.protein, maxMinutes: opts.minutes ?? profile.preferences.nutrition.maxPrepMin, dislikes: profile.preferences.nutrition.dislikes, mealType: opts.mealType ?? "dinner", budgetRemaining: wk?.totals.remaining ?? null, recentMeals: recent });
  return { ...r, pantry, expiring, remainingCalories: targets.calories - totals.calories, remainingProtein: targets.protein - totals.protein };
}

/** "COOK THIS": logs the cooked meal (nutrition + cooking rank) and ticks the used ingredients down in the pantry. */
export function cookSuggestion(s: { name: string; calories: number; protein: number; carbs: number; fat: number; uses: string[]; recipeId: number | null; mealType?: string }, profile: ProfileView = getProfile()) {
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const today = profile.today;
  const plan = getMealPlan(today);
  const slot = plan?.meals.find((m) => m.mealType === (s.mealType ?? "dinner") && (m.status === "planned" || m.status === "prepared"));
  const r = logNutrition({ date: today, mealType: s.mealType ?? "dinner", name: s.name, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat, source: "recipe", recipeId: s.recipeId, cooked: true, replacesPlannedMealId: slot && slot.name !== s.name ? slot.id : null, plannedMealId: slot && slot.name === s.name ? slot.id : null }, { proteinTarget: targets.protein, calorieTarget: targets.calories, unsafeTargets: targets.unsafe });
  consumeIngredients(s.uses, 1);
  return r;
}

export const GROCERY_CATEGORIES = CATEGORY_ORDER;
