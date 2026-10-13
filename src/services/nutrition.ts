import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mealPlans, meals, nutritionEntries, plannedMeals, savedFoods, type MealPlan, type NutritionEntry, type PlannedMeal as PlannedMealRow, type SavedFood } from "@/db/schema";
import { addDays, lastNDays, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import type { GeneratedMealPlan, PlannedMeal } from "@/planner/mealTemplates";
import { estimateTargets, SAFE_MIN_CALORIES, type NutritionPrefs } from "./preferences";
import { awardXp, voidXpByKey, voidXpForSource, type XpAward } from "./xp";

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  estimated: boolean;
  unsafe: boolean;
}

export function resolveTargets(prefs: NutritionPrefs, body: { weightKg?: number | null; heightCm?: number | null; age?: number | null; sex?: string | null }): Targets {
  const est = estimateTargets({ ...body, goal: prefs.goal });
  const calories = prefs.calorieTarget ?? est.calories;
  const protein = prefs.proteinTarget ?? est.protein;
  const fat = prefs.fatTarget ?? Math.round((calories * 0.28) / 9);
  const carbs = prefs.carbTarget ?? Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat, estimated: prefs.calorieTarget == null, unsafe: calories < SAFE_MIN_CALORIES(body.sex) };
}

export function sumEntries(rows: NutritionEntry[]): Totals {
  return rows.reduce((a, r) => ({ calories: a.calories + r.calories, protein: a.protein + r.protein, carbs: a.carbs + r.carbs, fat: a.fat + r.fat, fiber: a.fiber + (r.fiber ?? 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

export function entriesForDate(date: ISODate): NutritionEntry[] {
  return getDb().select().from(nutritionEntries).where(eq(nutritionEntries.date, date)).orderBy(nutritionEntries.id).all();
}

export function dayTotals(date: ISODate): Totals {
  return sumEntries(entriesForDate(date));
}

export function entriesBetween(start: ISODate, end: ISODate): NutritionEntry[] {
  return getDb().select().from(nutritionEntries).where(and(gte(nutritionEntries.date, start), lte(nutritionEntries.date, end))).orderBy(nutritionEntries.date).all();
}

/** Days with any logging and days hitting the protein target in the last N days (protein consistency substat). */
export function nutritionConsistency(today: ISODate, days: number, proteinTarget: number, calorieFloor: number): { loggedDays: number; proteinDays: number; windowDays: number } {
  const rows = entriesBetween(lastNDays(today, days)[0], today);
  const byDay = new Map<string, NutritionEntry[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  let proteinDays = 0;
  for (const [, list] of byDay) {
    const t = sumEntries(list);
    // Hitting protein only counts when the day isn't a starvation day.
    if (t.protein >= proteinTarget && t.calories >= calorieFloor * 0.8) proteinDays++;
  }
  return { loggedDays: byDay.size, proteinDays, windowDays: days };
}

export interface LogInput {
  date: ISODate;
  mealType: string;
  name: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  fiber?: number | null;
  /** manual | quick | plan | recipe | ai | restaurant | estimate | saved */
  source?: NutritionEntry["source"] | string;
  recipeId?: number | null;
  /** @deprecated use plannedMealId */
  planMealIndex?: number | null;
  /** The planned meal this fulfils → marked eaten */
  plannedMealId?: number | null;
  /** A planned meal this *replaces* (ate something else instead) → marked replaced */
  replacesPlannedMealId?: number | null;
  savedFoodId?: number | null;
  isEstimate?: boolean;
  venue?: string | null;
  /** If true, also logs a cooked meal (counts toward the cooking rank). */
  cooked?: boolean;
}

export interface XpCtx {
  proteinTarget: number;
  calorieTarget: number;
  unsafeTargets: boolean;
}

/** Only eaten food counts: this is the single write path for consumed calories. */
export function logNutrition(input: LogInput, ctx: XpCtx): { entry: NutritionEntry; xp: XpAward[] } {
  const db = getDb();
  let mealId: number | null = null;
  const xp: XpAward[] = [];
  const entry0 = db
    .insert(nutritionEntries)
    .values({
      date: input.date,
      mealType: input.mealType,
      name: input.name,
      calories: Math.max(0, Math.round(input.calories)),
      protein: Math.max(0, Math.round(input.protein)),
      carbs: Math.max(0, Math.round(input.carbs ?? 0)),
      fat: Math.max(0, Math.round(input.fat ?? 0)),
      fiber: input.fiber ?? null,
      source: input.source ?? "manual",
      recipeId: input.recipeId ?? null,
      planMealIndex: input.planMealIndex ?? null,
      plannedMealId: input.plannedMealId ?? null,
      savedFoodId: input.savedFoodId ?? null,
      isEstimate: !!input.isEstimate,
      venue: input.venue ?? null,
    })
    .returning()
    .get();
  if (input.cooked) {
    const m = db.insert(meals).values({ date: input.date, mealType: input.mealType, name: input.name, recipeId: input.recipeId ?? null, isNewRecipe: false }).returning({ id: meals.id }).get();
    mealId = m.id;
    db.update(nutritionEntries).set({ mealId }).where(eq(nutritionEntries.id, entry0.id)).run();
    const a = awardXp("meal_cooked", input.date, { suffix: `n${m.id}`, source: { type: "meal", id: m.id } });
    if (a.awarded) xp.push(a);
  }
  const entry = { ...entry0, mealId };
  const src = { type: "nutrition" as const, id: entry.id };

  // Planned-meal lifecycle: eaten (fulfilled) or replaced (ate something else)
  if (input.plannedMealId) {
    db.update(plannedMeals).set({ status: "eaten", nutritionEntryId: entry.id, statusChangedAt: new Date().toISOString() }).where(eq(plannedMeals.id, input.plannedMealId)).run();
    const a2 = awardXp("planned_meal", input.date, { suffix: `pm${input.plannedMealId}`, source: src });
    if (a2.awarded) xp.push(a2);
  }
  if (input.replacesPlannedMealId) {
    db.update(plannedMeals).set({ status: "replaced", nutritionEntryId: entry.id, statusChangedAt: new Date().toISOString() }).where(and(eq(plannedMeals.id, input.replacesPlannedMealId), inArray(plannedMeals.status, ["planned", "prepared"]))).run();
  }
  if (input.savedFoodId) db.update(savedFoods).set({ useCount: sql`${savedFoods.useCount} + 1`, lastUsedAt: new Date().toISOString() }).where(eq(savedFoods.id, input.savedFoodId)).run();

  // XP: logging consistency once/day; protein target once/day.
  // No XP is tied to eating less. Unsafe targets never pay out.
  const a1 = awardXp("nutrition_logged", input.date, { source: { type: "nutrition", id: `day:${input.date}` } });
  if (a1.awarded) xp.push(a1);
  const a3 = reconcileProteinXp(input.date, ctx);
  if (a3?.awarded) xp.push(a3);
  return { entry, xp };
}

/** Award or void the day's protein XP based on what is actually logged now. */
export function reconcileProteinXp(date: ISODate, ctx: XpCtx): XpAward | null {
  const t = dayTotals(date);
  const hit = !ctx.unsafeTargets && t.protein >= ctx.proteinTarget && t.calories >= SAFE_MIN_CALORIES() * 0.8;
  if (hit) return awardXp("protein_target", date, { source: { type: "nutrition", id: `day:${date}` } });
  voidXpByKey(`protein_target:${date}`, "protein no longer at target after correction");
  return null;
}

export function updateEntry(id: number, patch: { calories?: number; protein?: number; carbs?: number; fat?: number; name?: string; portion?: number; mealType?: string }, ctx?: XpCtx): NutritionEntry | null {
  const db = getDb();
  const cur = db.select().from(nutritionEntries).where(eq(nutritionEntries.id, id)).get();
  if (!cur) return null;
  const values: Partial<typeof nutritionEntries.$inferInsert> = {};
  if (patch.portion != null && patch.portion > 0) {
    values.calories = Math.round(cur.calories * patch.portion);
    values.protein = Math.round(cur.protein * patch.portion);
    values.carbs = Math.round(cur.carbs * patch.portion);
    values.fat = Math.round(cur.fat * patch.portion);
  }
  if (patch.calories != null) values.calories = Math.max(0, Math.round(patch.calories));
  if (patch.protein != null) values.protein = Math.max(0, Math.round(patch.protein));
  if (patch.carbs != null) values.carbs = Math.max(0, Math.round(patch.carbs));
  if (patch.fat != null) values.fat = Math.max(0, Math.round(patch.fat));
  if (patch.name) values.name = patch.name;
  if (patch.mealType) values.mealType = patch.mealType;
  db.update(nutritionEntries).set(values).where(eq(nutritionEntries.id, id)).run();
  if (ctx) reconcileProteinXp(cur.date, ctx);
  return db.select().from(nutritionEntries).where(eq(nutritionEntries.id, id)).get() ?? null;
}

/**
 * Delete a logged food. Totals reverse, the linked planned meal goes back to
 * "planned", the cooked-meal row (if any) is removed and every XP this entry
 * or the day earned that no longer holds is voided.
 */
export function deleteEntry(id: number, ctx?: XpCtx): { voidedXp: number } {
  const db = getDb();
  const cur = db.select().from(nutritionEntries).where(eq(nutritionEntries.id, id)).get();
  if (!cur) return { voidedXp: 0 };
  let voided = voidXpForSource({ type: "nutrition", id }, "food entry deleted");
  if (cur.mealId) {
    voided += voidXpForSource({ type: "meal", id: cur.mealId }, "food entry deleted");
    db.delete(meals).where(eq(meals.id, cur.mealId)).run();
  }
  if (cur.plannedMealId) db.update(plannedMeals).set({ status: "planned", nutritionEntryId: null, statusChangedAt: new Date().toISOString() }).where(eq(plannedMeals.id, cur.plannedMealId)).run();
  db.update(plannedMeals).set({ status: "planned", nutritionEntryId: null }).where(and(eq(plannedMeals.nutritionEntryId, id), eq(plannedMeals.status, "replaced"))).run();
  db.delete(nutritionEntries).where(eq(nutritionEntries.id, id)).run();
  if (entriesForDate(cur.date).length === 0) voided += voidXpByKey(`nutrition_logged:${cur.date}`, "last food entry of the day deleted");
  if (ctx) {
    const before = voided;
    const t = dayTotals(cur.date);
    if (!(t.protein >= ctx.proteinTarget && t.calories >= SAFE_MIN_CALORIES() * 0.8)) voided += voidXpByKey(`protein_target:${cur.date}`, "protein no longer at target after deletion");
    void before;
  }
  return { voidedXp: voided };
}

// ------------------------------------------------------------ meal plans ----
export type PlannedMealStatus = "planned" | "prepared" | "eaten" | "skipped" | "replaced" | "discarded";

export interface PlannedMealView extends PlannedMealRow {
  index: number;
  ingredientsParsed: string[];
  eaten: boolean;
}

function viewRow(r: PlannedMealRow): PlannedMealView {
  const raw = parseJson<unknown[]>(r.ingredients, []);
  const ingredientsParsed = raw.map((x) => (typeof x === "string" ? x : ((x as { name?: string })?.name ?? ""))).filter(Boolean);
  return { ...r, index: r.slot, ingredientsParsed, eaten: r.status === "eaten" };
}

export interface MealPlanView extends Omit<MealPlan, "meals"> {
  meals: PlannedMealView[];
  /** @deprecated alias of meals */
  mealsParsed: PlannedMealView[];
}

/** Today's plan: header + the live planned-meal rows (discarded rows are hidden). */
export function getMealPlan(date: ISODate): MealPlanView | null {
  const db = getDb();
  const row = db.select().from(mealPlans).where(eq(mealPlans.date, date)).get();
  let rows = db.select().from(plannedMeals).where(and(eq(plannedMeals.date, date), ne(plannedMeals.status, "discarded"))).orderBy(plannedMeals.slot, plannedMeals.id).all();
  // Backfill: plans saved before planned_meals existed still carry JSON meals.
  if (row && rows.length === 0 && row.meals && row.meals !== "[]") {
    const legacy = parseJson<PlannedMeal[]>(row.meals, []);
    for (const m of legacy) {
      db.insert(plannedMeals).values({ date, slot: m.index, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: toJson(m.ingredients), recipeId: m.recipeId ?? null, notes: m.notes ?? null, source: row.source }).run();
    }
    db.update(mealPlans).set({ meals: "[]" }).where(eq(mealPlans.id, row.id)).run();
    rows = db.select().from(plannedMeals).where(and(eq(plannedMeals.date, date), ne(plannedMeals.status, "discarded"))).orderBy(plannedMeals.slot, plannedMeals.id).all();
  }
  if (!row && rows.length === 0) return null;
  const meals = rows.map(viewRow);
  const header: MealPlan = row ?? { id: 0, date, source: rows[0]?.source ?? "template", calorieTarget: 0, proteinTarget: 0, meals: "[]", createdAt: rows[0]?.createdAt ?? new Date().toISOString() };
  return { ...header, meals, mealsParsed: meals };
}

/**
 * Save a generated plan for a day. Existing *planned/prepared* rows are discarded
 * (never eaten/skipped/replaced ones — those are history), then the new rows are inserted.
 */
export function saveMealPlan(date: ISODate, plan: GeneratedMealPlan, source: "template" | "ai" | "adjust", opts: { weekId?: number | null; keepSlots?: number[] } = {}): MealPlan {
  const db = getDb();
  const values = { date, source: source === "adjust" ? "template" : source, calorieTarget: plan.calorieTarget, proteinTarget: plan.proteinTarget, meals: "[]" };
  db.insert(mealPlans).values(values).onConflictDoUpdate({ target: mealPlans.date, set: values }).run();
  const now = new Date().toISOString();
  db.update(plannedMeals).set({ status: "discarded", statusChangedAt: now }).where(and(eq(plannedMeals.date, date), inArray(plannedMeals.status, ["planned", "prepared"]))).run();
  for (const m of plan.meals) {
    db.insert(plannedMeals)
      .values({ date, slot: m.index, mealType: m.mealType, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, ingredients: toJson(m.ingredients), recipeId: m.recipeId ?? null, notes: m.notes ?? null, source, weekId: opts.weekId ?? null, prepMinutes: (m as { prepMinutes?: number }).prepMinutes ?? null })
      .run();
  }
  return db.select().from(mealPlans).where(eq(mealPlans.date, date)).get()!;
}

export function getPlannedMeal(id: number): PlannedMealView | null {
  const r = getDb().select().from(plannedMeals).where(eq(plannedMeals.id, id)).get();
  return r ? viewRow(r) : null;
}

/** Status changes that don't involve eating: prepared / skipped / discarded / back to planned. */
export function setPlannedMealStatus(id: number, status: Exclude<PlannedMealStatus, "eaten" | "replaced">): PlannedMealView | null {
  const db = getDb();
  const r = db.select().from(plannedMeals).where(eq(plannedMeals.id, id)).get();
  if (!r) return null;
  if (r.status === "eaten" && r.nutritionEntryId) {
    // Un-eating = deleting the consumed entry (which also voids XP and reverts the status).
    deleteEntry(r.nutritionEntryId);
  }
  db.update(plannedMeals).set({ status, statusChangedAt: new Date().toISOString(), nutritionEntryId: null }).where(eq(plannedMeals.id, id)).run();
  return getPlannedMeal(id);
}

export function updatePlannedMeal(id: number, patch: { name?: string; calories?: number; protein?: number; carbs?: number; fat?: number; mealType?: string; ingredients?: string[]; notes?: string | null }): PlannedMealView | null {
  const db = getDb();
  const values: Partial<typeof plannedMeals.$inferInsert> = {};
  if (patch.name) values.name = patch.name;
  if (patch.calories != null) values.calories = Math.max(0, Math.round(patch.calories));
  if (patch.protein != null) values.protein = Math.max(0, Math.round(patch.protein));
  if (patch.carbs != null) values.carbs = Math.max(0, Math.round(patch.carbs));
  if (patch.fat != null) values.fat = Math.max(0, Math.round(patch.fat));
  if (patch.mealType) values.mealType = patch.mealType;
  if (patch.ingredients) values.ingredients = toJson(patch.ingredients);
  if (patch.notes !== undefined) values.notes = patch.notes;
  db.update(plannedMeals).set(values).where(eq(plannedMeals.id, id)).run();
  return getPlannedMeal(id);
}

/** Replace a planned meal with a different planned meal (keeps the old one as history with status=replaced). */
export function replacePlannedMeal(id: number, next: { name: string; calories: number; protein: number; carbs?: number; fat?: number; ingredients?: string[]; recipeId?: number | null; notes?: string | null; source?: string }): PlannedMealView | null {
  const db = getDb();
  const r = db.select().from(plannedMeals).where(eq(plannedMeals.id, id)).get();
  if (!r) return null;
  const n = db
    .insert(plannedMeals)
    .values({ date: r.date, slot: r.slot, mealType: r.mealType, name: next.name, calories: Math.round(next.calories), protein: Math.round(next.protein), carbs: Math.round(next.carbs ?? 0), fat: Math.round(next.fat ?? 0), ingredients: toJson(next.ingredients ?? []), recipeId: next.recipeId ?? null, notes: next.notes ?? null, source: next.source ?? "manual", weekId: r.weekId })
    .returning()
    .get();
  db.update(plannedMeals).set({ status: "replaced", replacedById: n.id, statusChangedAt: new Date().toISOString() }).where(eq(plannedMeals.id, id)).run();
  return viewRow(n);
}

export function plannedMealsBetween(start: ISODate, end: ISODate): PlannedMealView[] {
  return getDb().select().from(plannedMeals).where(and(gte(plannedMeals.date, start), lte(plannedMeals.date, end), ne(plannedMeals.status, "discarded"))).orderBy(plannedMeals.date, plannedMeals.slot).all().map(viewRow);
}

export function recentRecipeIds(today: ISODate, days = 3): number[] {
  return getDb()
    .select({ recipeId: plannedMeals.recipeId })
    .from(plannedMeals)
    .where(and(gte(plannedMeals.date, addDays(today, -days)), ne(plannedMeals.status, "discarded")))
    .orderBy(desc(plannedMeals.date))
    .all()
    .map((r) => r.recipeId)
    .filter((x): x is number => x != null);
}

/** @deprecated status lives on the row now */
export function plannedMealEaten(date: ISODate, index: number): boolean {
  return !!getDb().select().from(plannedMeals).where(and(eq(plannedMeals.date, date), eq(plannedMeals.slot, index), eq(plannedMeals.status, "eaten"))).get();
}

// ------------------------------------------------------------ saved foods ----
export function listSavedFoods(opts: { q?: string; limit?: number } = {}): SavedFood[] {
  const rows = getDb().select().from(savedFoods).orderBy(desc(savedFoods.lastUsedAt), desc(savedFoods.useCount), desc(savedFoods.id)).limit(200).all();
  const q = opts.q?.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => `${r.name} ${r.brand ?? ""}`.toLowerCase().includes(q)) : rows;
  return filtered.slice(0, opts.limit ?? 30);
}

export function saveFood(input: { name: string; brand?: string | null; servingDesc?: string | null; calories: number; protein?: number; carbs?: number; fat?: number; source?: string; isEstimate?: boolean }): SavedFood {
  const db = getDb();
  const existing = db.select().from(savedFoods).where(and(eq(savedFoods.name, input.name), eq(savedFoods.calories, Math.round(input.calories)))).get();
  if (existing) return existing;
  return db
    .insert(savedFoods)
    .values({ name: input.name, brand: input.brand ?? null, servingDesc: input.servingDesc ?? null, calories: Math.round(input.calories), protein: Math.round(input.protein ?? 0), carbs: Math.round(input.carbs ?? 0), fat: Math.round(input.fat ?? 0), source: input.source ?? "manual", isEstimate: !!input.isEstimate })
    .returning()
    .get();
}

export function deleteSavedFood(id: number) {
  getDb().delete(savedFoods).where(eq(savedFoods.id, id)).run();
}
