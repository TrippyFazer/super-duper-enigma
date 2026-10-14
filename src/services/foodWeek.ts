import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groceryItems, groceryWeeks, mealPrepSessions, meals, nutritionEntries, plannedMeals, questOffers, type GroceryItem, type GroceryWeek, type MealPrepSession } from "@/db/schema";
import { completeOffer } from "./questOffers";
import { addDays, startOfWeek, weekday, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import { buildAiContext } from "@/ai/context";
import { generateWeek as generateWeekAi, suggestFromPantry as suggestAi } from "@/ai/generate";
import { CATEGORY_ORDER, findIngredient, type GroceryCategory } from "@/food/ingredients";
import { ingredientInfo, storageName } from "@/food/families";
import { reconcile as reconcileCoverage, requirementsFromMeals, type Coverage, type CoverageOverride } from "@/food/reconcile";
import { deriveRules, resolveIngredientForUser, validateMeal, type FoodRules } from "@/food/rules";
import type { GeneratedWeek, MealsNeeded, WeekPrefs } from "@/planner/weekTemplates";
import type { Suggestion } from "@/planner/pantrySuggest";
import { loadRecipes } from "./loaders";
import { consumeForRecipe, expiringSoon, listPantry, pantryForPlanning, pantryStocks, setPantryLevel, setPantryServings, upsertPantry, type PantryLevel } from "./pantry";
import { getProfile, type ProfileView } from "./profile";
import { getAssessment } from "./progression";
import { dayTotals, getMealPlan, logNutrition, resolveTargets, setPlannedMealStatus, saveMealPlan, updatePlannedMeal, type PlannedMealView } from "./nutrition";
import { awardXp, voidXpForSource } from "./xp";

// ------------------------------------------------------------- helpers ----
/**
 * Where the app *suggests* a regular weekly plan should start: the upcoming
 * Mon–Sun when planning on Sat/Sun or the preferred shopping day, otherwise
 * the current week. This is a default, never a gate — plans can start any day.
 */
export function planningWeekStart(today: ISODate, shoppingDay = 0): ISODate {
  const wd = weekday(today);
  const cur = startOfWeek(today);
  if (wd === 0 || wd === 6 || wd === shoppingDay) return addDays(cur, wd === 0 || wd === 6 ? 7 : 0);
  return cur;
}
export const suggestedPlanStart = planningWeekStart;

/** Last day a plan covers (inclusive). */
export function weekEnd(row: { weekStart: ISODate; spanDays: number }): ISODate {
  return addDays(row.weekStart, Math.max(1, row.spanDays) - 1);
}

/** The plan that covers `today`, newest first (a supply run started mid-week wins over the regular week). */
export function activeWeekRow(today: ISODate): GroceryWeek | null {
  const rows = getDb().select().from(groceryWeeks).where(lte(groceryWeeks.weekStart, today)).orderBy(desc(groceryWeeks.id)).all();
  return rows.find((r) => weekEnd(r) >= today) ?? null;
}
/** The soonest plan that starts after today. */
export function nextWeekRow(today: ISODate): GroceryWeek | null {
  return getDb().select().from(groceryWeeks).where(gte(groceryWeeks.weekStart, addDays(today, 1))).orderBy(groceryWeeks.weekStart).get() ?? null;
}
/** The plan the Planner / Home should talk about right now: active, else the next one. */
export function relevantWeek(today: ISODate): WeekView | null {
  const row = activeWeekRow(today) ?? nextWeekRow(today);
  return row ? viewWeek(row) : null;
}
export function activeWeek(today: ISODate): WeekView | null {
  const row = activeWeekRow(today);
  return row ? viewWeek(row) : null;
}

export interface WeekView extends GroceryWeek {
  mealsNeededParsed: MealsNeeded;
  prefsParsed: WeekPrefs;
  summaryParsed: WeekSummary;
  items: GroceryItem[];
  /** the same rows with the reconciliation detail parsed (usedInCounts) */
  listCounts: { buy: number; partial: number; have: number; confirm: number };
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
  replannedFrom?: string;
  /** set when the plan was built as if the pantry were empty ("don't use my pantry") */
  ignorePantry?: boolean;
  /** last reconciliation note ("rice moved to Already have") */
  reconciled?: { at: string; note: string } | null;
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
  const dates = Array.from({ length: Math.max(1, row.spanDays ?? 7) }, (_, i) => addDays(row.weekStart, i));
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
    listCounts: { buy: items.filter((i) => !i.coveredByPantry && !i.skipped && (i.coverage === "none" || i.coverage === "stock-up" || i.coverage == null)).length, partial: items.filter((i) => i.coverage === "partial" && !i.skipped).length, have: items.filter((i) => i.coveredByPantry).length, confirm: items.filter((i) => i.coverage === "confirm" && !i.skipped).length },
    totals: { estimated: round2(estimated), actual: round2(actual), purchased: items.filter((i) => i.purchased).length, itemCount: items.filter((i) => !i.coveredByPantry).length, remaining: round2(row.budget - (actual || estimated)) },
  };
}

/** The week's planned meals that still need ingredients (planned / prepared; eaten ones already consumed the pantry). */
function pendingMeals(wk: WeekView): { name: string; ingredients: string[]; leftover: boolean }[] {
  return wk.days.flatMap((d) => d.meals).filter((m) => m.status === "planned" || m.status === "prepared").map((m) => ({ name: m.name, ingredients: m.ingredientsParsed, leftover: /^leftover /i.test(m.name) || /leftover/i.test(m.notes ?? "") }));
}

export function currentRules(): FoodRules {
  return deriveRules(getProfile().preferences.nutrition);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --------------------------------------------------------------- setup ----
export function upsertWeek(input: { weekStart: ISODate; days?: number; kind?: "week" | "supply"; budget: number; budgetMode: "budget" | "balanced" | "flexible"; calorieTarget: number; proteinTarget: number; mealsNeeded: MealsNeeded; prefs: WeekPrefs }): WeekView {
  const db = getDb();
  const values = { weekStart: input.weekStart, spanDays: Math.max(1, Math.min(14, input.days ?? 7)), kind: input.kind ?? "week", budget: input.budget, budgetMode: input.budgetMode, calorieTarget: input.calorieTarget, proteinTarget: input.proteinTarget, mealsNeeded: toJson(input.mealsNeeded), prefs: toJson(input.prefs) };
  const cur = db.select().from(groceryWeeks).where(eq(groceryWeeks.weekStart, input.weekStart)).orderBy(desc(groceryWeeks.id)).get();
  if (cur) db.update(groceryWeeks).set(values).where(eq(groceryWeeks.id, cur.id)).run();
  else db.insert(groceryWeeks).values({ ...values, status: "planning" }).run();
  return getWeek(input.weekStart)!;
}

/** Meals needed for an N-day plan, scaled from the usual weekly preferences. */
export function mealsNeededForDays(days: number, eatingOutPerWeek: number): MealsNeeded {
  const eatingOut = Math.min(days, Math.round((eatingOutPerWeek * days) / 7));
  return { breakfast: days, lunch: Math.max(1, Math.round(days * 0.75)), dinner: Math.max(1, days - eatingOut), snacks: 1, eatingOut };
}

/**
 * "I'm shopping today": a plan that starts today and covers the next N days.
 * No preferred-day gate — the schedule exists to help, not to be obeyed.
 */
export async function startSupplyRun(input: { today: ISODate; days: number; budget: number; usePantry: boolean; profile?: ProfileView }): Promise<{ week: WeekView; source: "ai" | "template"; error?: string }> {
  const profile = input.profile ?? getProfile();
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const f = profile.preferences.food;
  const days = Math.max(2, Math.min(14, input.days));
  const wk = upsertWeek({ weekStart: input.today, days, kind: "supply", budget: input.budget, budgetMode: f.budgetMode, calorieTarget: targets.calories, proteinTarget: targets.protein, mealsNeeded: mealsNeededForDays(days, f.eatingOutPerWeek), prefs: { quickWeekdays: f.quickWeekdays, mealPrep: f.mealPrep, highProtein: f.highProtein, reuseIngredients: f.reuseIngredients } });
  const r = await generateWeekPlan(wk.id, { force: true, ignorePantry: !input.usePantry });
  return { week: r.week, source: r.source, error: r.error };
}

/**
 * Mid-plan replan: regenerate only the days from `today` onward using what is
 * in the pantry and the budget that is actually left. Earlier days are untouched.
 */
export async function replanRemainder(weekId: number, today: ISODate): Promise<{ week: WeekView; source: "ai" | "template"; error?: string; daysReplanned: number; budgetLeft: number }> {
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  const end = weekEnd(wk);
  const from = today > wk.weekStart ? today : wk.weekStart;
  if (from > end) throw new Error("This plan is over — start a new one.");
  const daysLeft = Math.round((new Date(end + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86_400_000) + 1;
  const spent = wk.actualCost ?? 0;
  const budgetLeft = Math.max(0, round2(wk.budget - spent));
  const r = await generateWeekPlan(weekId, { force: true, fromDate: from, days: daysLeft, budget: budgetLeft, replan: true });
  return { week: r.week, source: r.source, error: r.error, daysReplanned: daysLeft, budgetLeft };
}

// ------------------------------------------------------------ generate ----
/** Build (or rebuild) the week: planned meals for each day, the shopping list, the prep session. */
export async function generateWeekPlan(weekId: number, opts: { force?: boolean; ignorePantry?: boolean; /** replan only from this date onward */ fromDate?: ISODate; /** days to plan from fromDate (defaults to the rest of the plan) */ days?: number; /** budget for the replanned stretch */ budget?: number; /** this is a mid-plan replan (keeps shopped status, records replannedFrom) */ replan?: boolean } = {}): Promise<{ week: WeekView; source: "ai" | "template"; error?: string }> {
  const db = getDb();
  const profile = getProfile();
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  const from = opts.fromDate ?? wk.weekStart;
  const days = opts.days ?? Math.max(1, wk.spanDays - Math.round((new Date(from + "T00:00:00Z").getTime() - new Date(wk.weekStart + "T00:00:00Z").getTime()) / 86_400_000));
  const scale = days / Math.max(1, wk.spanDays);
  const needed: MealsNeeded = scale === 1 ? wk.mealsNeededParsed : { breakfast: Math.max(1, Math.round(wk.mealsNeededParsed.breakfast * scale)), lunch: Math.max(1, Math.round(wk.mealsNeededParsed.lunch * scale)), dinner: Math.max(1, Math.round(wk.mealsNeededParsed.dinner * scale)), snacks: wk.mealsNeededParsed.snacks, eatingOut: Math.round(wk.mealsNeededParsed.eatingOut * scale) };
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, mealType: r.mealType, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, tags: r.tagsParsed, ingredients: r.ingredientsParsed, prepTimeMin: r.prepTimeMin, cookTimeMin: r.cookTimeMin, isFavorite: r.isFavorite }));
  const pantry = opts.ignorePantry ? [] : pantryForPlanning(profile.today);
  const ctx = buildAiContext(profile, profile.preferences, getAssessment(profile));
  const rules = deriveRules(profile.preferences.nutrition);
  const recent = db
    .select({ recipeId: plannedMeals.recipeId })
    .from(plannedMeals)
    .where(and(gte(plannedMeals.date, addDays(wk.weekStart, -14)), lte(plannedMeals.date, addDays(wk.weekStart, -1)), eq(plannedMeals.status, "eaten")))
    .all()
    .map((r) => r.recipeId)
    .filter((x): x is number => x != null);
  const r = await generateWeekAi(ctx, { weekStart: from, days, recipes, prefs: profile.preferences.nutrition, week: wk.prefsParsed, mealsNeeded: needed, calorieTarget: wk.calorieTarget, proteinTarget: wk.proteinTarget, budget: opts.budget ?? wk.budget, budgetMode: wk.budgetMode as "budget", pantry, rules, seed: Number(from.replace(/-/g, "")) + (opts.force ? Date.now() % 997 : 0), recentRecipeIds: recent, force: opts.force });
  applyGeneratedWeek(wk, r.plan, r.source, { fromDate: from, days, today: profile.today, replan: opts.replan, ignorePantry: opts.ignorePantry });
  return { week: getWeekById(weekId)!, source: r.source, error: r.error };
}

export function applyGeneratedWeek(wk: WeekView, plan: GeneratedWeek, source: "ai" | "template", opts: { fromDate?: ISODate; days?: number; today?: ISODate; replan?: boolean; ignorePantry?: boolean } = {}) {
  const db = getDb();
  const from = opts.fromDate ?? wk.weekStart;
  const nDays = opts.days ?? wk.spanDays;
  // A replan (explicit, or any regeneration that starts after the plan's first day) keeps history and status.
  const partial = !!opts.replan || from !== wk.weekStart;
  // Planned meals per day (discarding only planned rows; eaten history is kept by saveMealPlan).
  const byDate = new Map<ISODate, GeneratedWeek["meals"]>();
  for (const m of plan.meals) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]);
  for (let i = 0; i < nDays; i++) {
    const date = addDays(from, i);
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
  // Prep session: the day before the plan starts when planning ahead, otherwise today (a plan that starts today preps today).
  const today = opts.today ?? wk.weekStart;
  const prepDate = from > today ? addDays(from, -1) : today;
  db.delete(mealPrepSessions).where(and(eq(mealPrepSessions.weekId, wk.id), eq(mealPrepSessions.status, "planned"))).run();
  if (plan.prepPlan.length) db.insert(mealPrepSessions).values({ weekId: wk.id, date: prepDate, items: toJson(plan.prepPlan), estimatedMinutes: plan.prepMinutes, supports: toJson([...new Set(plan.prepPlan.flatMap((p) => p.supports))]) }).run();
  const prev = wk.summaryParsed;
  const summary: WeekSummary = { reusePct: plan.reusePct, staplesAssumed: plan.staplesAssumed, rationale: partial ? `Replanned from ${from}: ${plan.rationale}` : plan.rationale, distinctRecipes: plan.distinctRecipes, coveredByPantry: plan.shoppingList.filter((i) => i.coveredByPantry).length, source, leftoversCarried: prev.leftoversCarried, replannedFrom: partial ? from : undefined, ignorePantry: opts.ignorePantry ?? (partial ? prev.ignorePantry : undefined) };
  // A replan after shopping keeps the week "shopped"; otherwise it is (re)planned.
  const status = partial && (wk.status === "shopped" || wk.status === "reviewed") ? wk.status : "planned";
  const estimated = partial ? round2((wk.actualCost ?? 0) + plan.estimatedCost) : plan.estimatedCost;
  db.update(groceryWeeks).set({ status, source, estimatedCost: estimated, summary: toJson(summary) }).where(eq(groceryWeeks.id, wk.id)).run();
  // The shopping list is derived: planned meals vs pantry, never copied from the plan.
  reconcileShoppingList(wk.id, { keepOverrides: partial });
}

// ------------------------------------------------------- reconciliation ----
/**
 * RECONCILIATION ENGINE — separate from meal planning. Re-runs
 * requirements (from the week's pending planned meals, rules applied) against
 * the pantry and rewrites the un-purchased rows of the list. Meals are never
 * regenerated here. Purchased rows and rows the user added by hand are kept;
 * manual overrides ("I already have this", "buy anyway") survive.
 */
export function reconcileShoppingList(weekId: number, opts: { keepOverrides?: boolean; note?: string } = {}): { week: WeekView; changes: string[] } {
  const db = getDb();
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  const rules = currentRules();
  const reqs = requirementsFromMeals(pendingMeals(wk), rules);
  const existing = wk.items;
  const overrides: Record<string, CoverageOverride> = {};
  if (opts.keepOverrides ?? true) for (const it of existing) if ((it.coverage === "manual" || it.coverage === "stock-up") && it.canonical) overrides[it.canonical] = it.coverage;
  const stock = wk.summaryParsed.ignorePantry ? [] : pantryStocks();
  const r = reconcileCoverage(reqs, stock, { overrides });
  const byKey = new Map(existing.filter((i) => i.canonical).map((i) => [i.canonical!, i]));
  const seen = new Set<number>();
  const changes: string[] = [];
  for (const c of r.items) {
    const cur = byKey.get(c.name);
    const values = rowFor(wk.id, c);
    if (cur) {
      seen.add(cur.id);
      if (cur.purchased) continue; // bought is bought
      const before = cur.coveredByPantry ? "have" : cur.coverage === "partial" ? "partial" : cur.coverage === "confirm" ? "confirm" : "buy";
      const after = values.coveredByPantry ? "have" : values.coverage === "partial" ? "partial" : values.coverage === "confirm" ? "confirm" : "buy";
      if (before !== after) changes.push(`${c.name}: ${before} → ${after}`);
      else if (Math.abs(cur.qty - values.qty) >= 0.5) changes.push(`${c.name}: ${cur.qty} → ${values.qty} ${values.unit}`);
      db.update(groceryItems).set(values).where(eq(groceryItems.id, cur.id)).run();
    } else {
      db.insert(groceryItems).values(values).run();
      changes.push(`${c.name}: added`);
    }
  }
  // Rows the plan no longer needs: drop un-purchased derived rows (keep hand-added ones: no canonical).
  for (const it of existing) if (it.canonical && !seen.has(it.id) && !it.purchased) {
    db.delete(groceryItems).where(eq(groceryItems.id, it.id)).run();
    changes.push(`${it.name}: removed`);
  }
  recomputeActual(wk.id);
  const summary: WeekSummary = { ...wk.summaryParsed, staplesAssumed: r.staples, coveredByPantry: r.counts.have, reconciled: changes.length ? { at: new Date().toISOString(), note: opts.note ?? changes.slice(0, 3).join(" · ") } : (wk.summaryParsed.reconciled ?? null) };
  db.update(groceryWeeks).set({ summary: toJson(summary) }).where(eq(groceryWeeks.id, wk.id)).run();
  return { week: getWeekById(wk.id)!, changes };
}

function rowFor(weekId: number, c: Coverage) {
  const override = c.override;
  return {
    weekId,
    name: c.name,
    category: c.category,
    qty: c.qty,
    unit: c.unit,
    estPrice: c.estPrice,
    usedIn: toJson(c.usedIn.map((u) => u.name)),
    usedInCounts: toJson(c.usedIn),
    coveredByPantry: c.status === "full",
    note: c.why,
    requiredServings: c.required,
    onHandServings: c.onHand,
    coverage: override ?? c.status,
    canonical: c.name,
    substitutedFrom: c.substitutedFrom,
  };
}

/** The pantry changed: reconcile the plan that is being shopped for, without touching its meals. */
export function onPantryChanged(today: ISODate): { weekId: number; changes: string[] } | null {
  const row = activeWeekRow(today) ?? nextWeekRow(today);
  if (!row || row.status === "reviewed") return null;
  if (row.status === "planning") return null;
  const r = reconcileShoppingList(row.id);
  return { weekId: row.id, changes: r.changes };
}

/** "I already have this" (manual) / "Buy anyway" (stock-up) / clear. Manual also records the pantry so later runs agree. */
export function setCoverageOverride(itemId: number, override: CoverageOverride): WeekView | null {
  const db = getDb();
  const it = db.select().from(groceryItems).where(eq(groceryItems.id, itemId)).get();
  if (!it) return null;
  if (override === "manual" && it.requiredServings) {
    const cur = listPantry({ includeEmpty: true }).find((p) => p.name === (it.canonical ?? it.name));
    if (cur) setPantryServings(cur.id, Math.max(it.requiredServings, cur.qty != null ? 0 : it.requiredServings));
    else {
      const row = upsertPantry({ name: it.canonical ?? it.name, level: "some", source: "manual" });
      setPantryServings(row.id, it.requiredServings);
    }
  }
  db.update(groceryItems).set({ coverage: override ?? (it.coveredByPantry ? "full" : "none") }).where(eq(groceryItems.id, itemId)).run();
  return reconcileShoppingList(it.weekId).week;
}

/**
 * Quick pantry check for a vague row ("Some"): yes = enough for the plan,
 * low = keep what's there and buy the difference, out = buy it all.
 */
export function pantryCheck(itemId: number, answer: "yes" | "low" | "out"): WeekView | null {
  const db = getDb();
  const it = db.select().from(groceryItems).where(eq(groceryItems.id, itemId)).get();
  if (!it) return null;
  const name = it.canonical ?? it.name;
  const stock = pantryStocks().filter((p) => p.level !== "none" && ingredientInfo(p.name).family === ingredientInfo(name).family && (ingredientInfo(p.name).family != null || p.name === name));
  const target = stock.find((p) => p.name === name) ?? stock[0];
  const required = it.requiredServings ?? 1;
  if (answer === "yes") {
    if (target?.id) setPantryServings(target.id, required);
    else setPantryServings(upsertPantry({ name, level: "lot", source: "manual" }).id, required);
  } else if (answer === "low") {
    if (target?.id) setPantryServings(target.id, Math.max(0.5, Math.round(required * 0.3 * 10) / 10));
    db.update(groceryItems).set({ coverage: null }).where(eq(groceryItems.id, itemId)).run();
  } else if (target?.id) setPantryLevel(target.id, "none");
  return reconcileShoppingList(it.weekId).week;
}

/**
 * Shopping substitution: swap a list row for another ingredient. The food
 * rules are checked, the planned meals that use the old ingredient are updated
 * so the pantry and the recipes agree, and the substitute is what gets bought.
 */
export function replaceGroceryItem(itemId: number, replacement: string): { ok: true; week: WeekView; name: string } | { ok: false; error: string } {
  const db = getDb();
  const it = db.select().from(groceryItems).where(eq(groceryItems.id, itemId)).get();
  if (!it) return { ok: false, error: "Item not found" };
  const rules = currentRules();
  const r = resolveIngredientForUser(replacement, rules);
  if (r.status === "forbidden") return { ok: false, error: `${replacement} breaks a food rule (${r.reason})` };
  const name = storageName(r.name) || r.name.toLowerCase();
  const old = it.canonical ?? it.name;
  const wk = getWeekById(it.weekId)!;
  for (const d of wk.days) for (const m of d.meals) {
    if (m.status !== "planned" && m.status !== "prepared") continue;
    const next = m.ingredientsParsed.map((ing) => (storageName(ing) === old ? ing.replace(new RegExp(ing.replace(/^[\d.,/ ]*(lb|lbs|oz|g|kg|cups?|tbsp|tsp|ml|l|each|dozen)?\s*/i, "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")), name) : ing));
    if (next.some((x, i) => x !== m.ingredientsParsed[i])) updatePlannedMeal(m.id, { ingredients: next, notes: [m.notes, `${old} → ${name}`].filter(Boolean).join(" · ") });
  }
  db.update(groceryItems).set({ name, canonical: name, substitutedFrom: old, category: findIngredient(name)?.category ?? it.category, unit: findIngredient(name)?.unit ?? it.unit, coverage: it.coverage === "manual" ? null : it.coverage }).where(eq(groceryItems.id, itemId)).run();
  return { ok: true, week: reconcileShoppingList(it.weekId, { note: `${old} replaced with ${name}` }).week, name };
}

/**
 * The rules changed ("don't recommend regular milk"): repair the week's
 * pending planned meals in place with the same validator every planner uses,
 * then reconcile the list. Meals that cannot be repaired are left (the user
 * can replace them); nothing is regenerated.
 */
export function applyRulesToWeek(weekId: number): { repaired: number; blocked: string[] } {
  const wk = getWeekById(weekId);
  if (!wk) return { repaired: 0, blocked: [] };
  const rules = currentRules();
  let repaired = 0;
  const blocked: string[] = [];
  for (const d of wk.days) for (const m of d.meals) {
    if (m.status !== "planned" && m.status !== "prepared") continue;
    const v = validateMeal({ name: m.name, ingredients: m.ingredientsParsed, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, notes: m.notes ?? undefined }, rules);
    if (v.status === "repaired") {
      updatePlannedMeal(m.id, { name: v.meal.name, ingredients: v.meal.ingredients, calories: v.meal.calories, protein: v.meal.protein, carbs: v.meal.carbs, fat: v.meal.fat, notes: v.meal.notes ?? null });
      repaired++;
    } else if (v.status === "rejected") blocked.push(m.name);
  }
  reconcileShoppingList(weekId, { note: repaired ? `${repaired} meal${repaired === 1 ? "" : "s"} adjusted to your food rules` : undefined });
  return { repaired, blocked: [...new Set(blocked)] };
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
    .values({ weekId, name: storageName(input.name) || input.name.toLowerCase(), category: input.category ?? def?.category ?? "other", qty: input.qty ?? 1, unit: input.unit ?? def?.unit ?? "each", estPrice: input.estPrice ?? (def ? round2(def.price * (input.qty ?? 1)) : null), usedIn: "[]", coverage: "stock-up", note: "Added by you" })
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
  // Purchased rows → pantry with the ACTUAL quantity (skipped and un-bought rows never do), stored under the
  // canonical variant ("lactose-free milk"), merged into an existing row rather than duplicated.
  for (const it of wk.items) {
    if (!it.purchased || it.skipped) continue;
    const qty = it.actualQty ?? it.qty;
    if (qty <= 0) continue;
    upsertPantry({ name: it.canonical ?? it.name, qty, unit: it.unit, purchasedAt: today, source: "grocery", add: true, product: it.substitutedFrom ? `bought instead of ${it.substitutedFrom}` : undefined });
  }
  recomputeActual(weekId);
  db.update(groceryWeeks).set({ status: "shopped", shoppedAt: new Date().toISOString() }).where(eq(groceryWeeks.id, weekId)).run();
  // An accepted "Supply run" quest for this plan completes with the trip itself.
  const run = db.select().from(questOffers).where(and(eq(questOffers.templateKey, "supply-run"), inArray(questOffers.status, ["accepted", "offered"]))).all().find((o) => parseJson<{ weekId?: number }>(o.params, {}).weekId === weekId);
  if (run) completeOffer(run.id, today);
  return getWeekById(weekId)!;
}

/** Undo "done shopping" (e.g. tapped by accident): week goes back to planned; pantry rows added by it are reduced. */
export function reopenShopping(weekId: number): WeekView {
  const db = getDb();
  const wk = getWeekById(weekId);
  if (!wk) throw new Error("Week not found");
  for (const it of wk.items) {
    if (!it.purchased) continue;
    const p = listPantry({ includeEmpty: true }).find((x) => x.name === (it.canonical ?? it.name));
    if (p && p.qty != null) upsertPantry({ name: p.name, qty: Math.max(0, p.qty - (it.actualQty ?? it.qty)), unit: p.unit });
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
  const end = weekEnd(wk);
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
  const wk = activeWeek(today);
  const recent = getDb().select({ name: nutritionEntries.name }).from(nutritionEntries).where(gte(nutritionEntries.date, addDays(today, -3))).all().map((r) => r.name);
  const ctx = buildAiContext(profile, profile.preferences, getAssessment(profile));
  const r = await suggestAi(ctx, { recipes, pantry, expiring, remainingCalories: targets.calories - totals.calories, remainingProtein: targets.protein - totals.protein, maxMinutes: opts.minutes ?? profile.preferences.nutrition.maxPrepMin, dislikes: profile.preferences.nutrition.dislikes, mealType: opts.mealType ?? "dinner", budgetRemaining: wk?.totals.remaining ?? null, recentMeals: recent, rules: deriveRules(profile.preferences.nutrition) });
  return { ...r, pantry, expiring, remainingCalories: targets.calories - totals.calories, remainingProtein: targets.protein - totals.protein };
}

/** "COOK THIS": logs the cooked meal (nutrition + cooking rank) and ticks the used ingredients down in the pantry. */
export function cookSuggestion(s: { name: string; calories: number; protein: number; carbs: number; fat: number; uses: string[]; recipeId: number | null; mealType?: string; servings?: number }, profile: ProfileView = getProfile()) {
  const targets = resolveTargets(profile.preferences.nutrition, profile);
  const today = profile.today;
  const plan = getMealPlan(today);
  const slot = plan?.meals.find((m) => m.mealType === (s.mealType ?? "dinner") && (m.status === "planned" || m.status === "prepared"));
  const r = logNutrition({ date: today, mealType: s.mealType ?? "dinner", name: s.name, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat, source: "recipe", recipeId: s.recipeId, cooked: true, skipPantry: true, replacesPlannedMealId: slot && slot.name !== s.name ? slot.id : null, plannedMealId: slot && slot.name === s.name ? slot.id : null }, { proteinTarget: targets.protein, calorieTarget: targets.calories, unsafeTargets: targets.unsafe });
  // Pantry consumption = the recipe's requirement × servings cooked (a double batch takes double).
  const recipe = s.recipeId ? loadRecipes().find((x) => x.id === s.recipeId) : null;
  consumeForRecipe(recipe?.ingredientsParsed?.length ? recipe.ingredientsParsed : s.uses, s.servings ?? 1);
  onPantryChanged(today);
  return r;
}

/** Cooking a planned meal (or any recipe) consumes the pantry by requirement × servings. */
export function consumeForCooking(ingredients: string[], servings = 1, today: ISODate = getProfile().today) {
  const consumed = consumeForRecipe(ingredients, servings);
  const r = onPantryChanged(today);
  return { consumed, reconciled: r };
}

export const GROCERY_CATEGORIES = CATEGORY_ORDER;
