import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mealPlans, meals, nutritionEntries, type MealPlan, type NutritionEntry } from "@/db/schema";
import { addDays, lastNDays, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import type { GeneratedMealPlan, PlannedMeal } from "@/planner/mealTemplates";
import { estimateTargets, SAFE_MIN_CALORIES, type NutritionPrefs } from "./preferences";
import { awardXp, type XpAward } from "./xp";

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
  source?: NutritionEntry["source"] | string;
  recipeId?: number | null;
  planMealIndex?: number | null;
  /** If true, also logs a cooked meal (counts toward the cooking rank). */
  cooked?: boolean;
}

export function logNutrition(input: LogInput, ctx: { proteinTarget: number; calorieTarget: number; unsafeTargets: boolean }): { entry: NutritionEntry; xp: XpAward[] } {
  const db = getDb();
  let mealId: number | null = null;
  const xp: XpAward[] = [];
  if (input.cooked) {
    const m = db.insert(meals).values({ date: input.date, mealType: input.mealType, name: input.name, recipeId: input.recipeId ?? null, isNewRecipe: false }).returning({ id: meals.id }).get();
    mealId = m.id;
    const a = awardXp("meal_cooked", input.date, { suffix: `n${m.id}` });
    if (a.awarded) xp.push(a);
  }
  const entry = db
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
      mealId,
    })
    .returning()
    .get();

  // XP: logging consistency once/day; planned meal bonus; protein target once/day.
  // No XP is tied to eating less. Unsafe targets never pay out.
  const a1 = awardXp("nutrition_logged", input.date);
  if (a1.awarded) xp.push(a1);
  if (input.source === "plan" || input.source === "ai") {
    const a2 = awardXp("planned_meal", input.date, { suffix: input.planMealIndex ?? entry.id });
    if (a2.awarded) xp.push(a2);
  }
  if (!ctx.unsafeTargets) {
    const t = dayTotals(input.date);
    if (t.protein >= ctx.proteinTarget && t.calories >= SAFE_MIN_CALORIES() * 0.8) {
      const a3 = awardXp("protein_target", input.date);
      if (a3.awarded) xp.push(a3);
    }
  }
  return { entry, xp };
}

export function updateEntry(id: number, patch: { calories?: number; protein?: number; carbs?: number; fat?: number; name?: string; portion?: number }): NutritionEntry | null {
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
  db.update(nutritionEntries).set(values).where(eq(nutritionEntries.id, id)).run();
  return db.select().from(nutritionEntries).where(eq(nutritionEntries.id, id)).get() ?? null;
}

export function deleteEntry(id: number) {
  const db = getDb();
  const cur = db.select().from(nutritionEntries).where(eq(nutritionEntries.id, id)).get();
  if (cur?.mealId) db.delete(meals).where(eq(meals.id, cur.mealId)).run();
  db.delete(nutritionEntries).where(eq(nutritionEntries.id, id)).run();
}

// ------------------------------------------------------------ meal plans ----
export function getMealPlan(date: ISODate): (MealPlan & { mealsParsed: PlannedMeal[] }) | null {
  const row = getDb().select().from(mealPlans).where(eq(mealPlans.date, date)).get();
  return row ? { ...row, mealsParsed: parseJson<PlannedMeal[]>(row.meals, []) } : null;
}

export function saveMealPlan(date: ISODate, plan: GeneratedMealPlan, source: "template" | "ai"): MealPlan {
  const db = getDb();
  const values = { date, source, calorieTarget: plan.calorieTarget, proteinTarget: plan.proteinTarget, meals: toJson(plan.meals) };
  db.insert(mealPlans).values(values).onConflictDoUpdate({ target: mealPlans.date, set: values }).run();
  return db.select().from(mealPlans).where(eq(mealPlans.date, date)).get()!;
}

export function recentRecipeIds(today: ISODate, days = 3): number[] {
  const rows = getDb().select().from(mealPlans).where(gte(mealPlans.date, addDays(today, -days))).orderBy(desc(mealPlans.date)).all();
  return rows.flatMap((r) => parseJson<PlannedMeal[]>(r.meals, []).map((m) => m.recipeId).filter((x): x is number => x != null));
}

export function plannedMealEaten(date: ISODate, index: number): boolean {
  return !!getDb().select().from(nutritionEntries).where(and(eq(nutritionEntries.date, date), eq(nutritionEntries.planMealIndex, index))).get();
}
