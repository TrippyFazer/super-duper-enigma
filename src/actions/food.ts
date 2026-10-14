"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as fw from "@/services/foodWeek";
import * as pantry from "@/services/pantry";
import { getProfile, updateProfile } from "@/services/profile";
import { offerSupplyRun } from "@/services/questOffers";
import { reconcile } from "@/services/progression";
import type { ActionFeedback } from "./index";

const revalidate = () => {
  revalidatePath("/", "layout");
};
const mealsNeededSchema = z.object({ breakfast: z.coerce.number().int().min(0).max(7), lunch: z.coerce.number().int().min(0).max(7), dinner: z.coerce.number().int().min(0).max(7), snacks: z.coerce.number().int().min(0).max(3), eatingOut: z.coerce.number().int().min(0).max(14) });
const weekPrefsSchema = z.object({ quickWeekdays: z.boolean(), mealPrep: z.boolean(), highProtein: z.boolean(), reuseIngredients: z.boolean(), notes: z.string().max(300).optional() });

export async function upsertWeekAction(input: { weekStart: string; days?: number; budget: number; budgetMode: "budget" | "balanced" | "flexible"; calorieTarget: number; proteinTarget: number; mealsNeeded: z.input<typeof mealsNeededSchema>; prefs: z.input<typeof weekPrefsSchema> }) {
  const s = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.coerce.number().int().min(2).max(14).optional(), budget: z.coerce.number().min(0).max(2000), budgetMode: z.enum(["budget", "balanced", "flexible"]), calorieTarget: z.coerce.number().int().min(1000).max(6000), proteinTarget: z.coerce.number().int().min(30).max(400), mealsNeeded: mealsNeededSchema, prefs: weekPrefsSchema }).parse(input);
  const wk = fw.upsertWeek(s);
  // Remember the budget and preferences for next time.
  updateProfile({ preferences: { food: { weeklyBudget: s.budget, budgetMode: s.budgetMode, quickWeekdays: s.prefs.quickWeekdays, mealPrep: s.prefs.mealPrep, highProtein: s.prefs.highProtein, reuseIngredients: s.prefs.reuseIngredients, eatingOutPerWeek: s.mealsNeeded.eatingOut } } });
  revalidate();
  return { id: wk.id };
}

export async function generateWeekAction(weekId: number, force = false): Promise<{ ok: boolean; source?: "ai" | "template"; error?: string | null; estimatedCost?: number }> {
  try {
    const r = await fw.generateWeekPlan(z.number().int().parse(weekId), { force });
    reconcile();
    revalidate();
    return { ok: true, source: r.source, error: r.error ?? null, estimatedCost: r.week.estimatedCost ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateGroceryItemAction(id: number, patch: { qty?: number; unit?: string; estPrice?: number | null; actualQty?: number | null; actualPrice?: number | null; purchased?: boolean; skipped?: boolean; name?: string; note?: string | null }) {
  fw.updateGroceryItem(z.number().int().parse(id), patch);
  revalidate();
}
export async function addGroceryItemAction(weekId: number, input: { name: string; qty?: number; unit?: string; estPrice?: number | null }) {
  const r = fw.addGroceryItem(z.number().int().parse(weekId), { name: z.string().trim().min(1).max(60).parse(input.name), qty: input.qty, unit: input.unit, estPrice: input.estPrice });
  revalidate();
  return { id: r.id };
}
export async function deleteGroceryItemAction(id: number) {
  fw.deleteGroceryItem(z.number().int().parse(id));
  revalidate();
}
export async function finishShoppingAction(weekId: number): Promise<ActionFeedback> {
  const p = getProfile();
  const wk = fw.finishShopping(z.number().int().parse(weekId), p.today);
  const r = reconcile();
  revalidate();
  const lines = r.completedQuests.map((q) => `${q.title} +${q.rewardXp}`);
  return { ok: true, xpGained: r.xpGained, xpLines: lines.length ? lines : [`${wk.totals.purchased} items moved to your pantry`], questsCompleted: r.completedQuests.map((q) => ({ title: q.title, rewardXp: q.rewardXp })), achievements: r.newAchievements.map((a) => ({ key: a.key, name: a.name, title: a.title })), levelUp: r.levelUp, rankUps: r.rankUps.map((x) => ({ domain: x.domain, from: x.from, to: x.to })) };
}
export async function reopenShoppingAction(weekId: number) {
  fw.reopenShopping(z.number().int().parse(weekId));
  reconcile();
  revalidate();
}
export async function leftoverReviewAction(weekId: number | null, levels: { pantryId: number; level: "none" | "some" | "lot" }[]) {
  const r = fw.leftoverReview(weekId == null ? null : z.number().int().parse(weekId), levels.slice(0, 200).map((l) => ({ pantryId: z.number().int().parse(l.pantryId), level: z.enum(["none", "some", "lot"]).parse(l.level) })));
  reconcile();
  revalidate();
  return r;
}
export async function completePrepAction(id: number): Promise<ActionFeedback> {
  const p = getProfile();
  const r0 = fw.completePrep(z.number().int().parse(id), p.today);
  const r = reconcile();
  revalidate();
  return { ok: true, xpGained: r.xpGained, xpLines: [`Meal prep done +${r0.xp}`, ...r.completedQuests.map((q) => `${q.title} +${q.rewardXp}`)], questsCompleted: r.completedQuests.map((q) => ({ title: q.title, rewardXp: q.rewardXp })), achievements: r.newAchievements.map((a) => ({ key: a.key, name: a.name, title: a.title })), levelUp: r.levelUp, rankUps: r.rankUps.map((x) => ({ domain: x.domain, from: x.from, to: x.to })) };
}
export async function uncompletePrepAction(id: number) {
  fw.uncompletePrep(z.number().int().parse(id));
  reconcile();
  revalidate();
}
export async function skipPrepAction(id: number) {
  fw.skipPrep(z.number().int().parse(id));
  revalidate();
}

// ------------------------------------------------------- shopping list ----
/** "I already have this" (manual), "Buy anyway" (stock-up) or clear the override. */
export async function setCoverageOverrideAction(itemId: number, override: "manual" | "stock-up" | null) {
  fw.setCoverageOverride(z.number().int().parse(itemId), override);
  revalidate();
}
/** Quick pantry check answer for a vague item: yes = enough, low = buy the difference, out = buy all. */
export async function pantryCheckAction(itemId: number, answer: "yes" | "low" | "out") {
  fw.pantryCheck(z.number().int().parse(itemId), z.enum(["yes", "low", "out"]).parse(answer));
  revalidate();
}
/** Replace a list item with a substitute (respects food rules, updates the recipes that use it). */
export async function replaceGroceryItemAction(itemId: number, replacement: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  const r = fw.replaceGroceryItem(z.number().int().parse(itemId), z.string().trim().min(1).max(60).parse(replacement));
  revalidate();
  return r.ok ? { ok: true, name: r.name } : { ok: false, error: r.error };
}
/** "Don't recommend this": a food rule (avoid entirely, or prefer a substitute), applied to the current plan right away. */
export async function dontRecommendAction(input: { target: string; mode: "avoid" | "substitute"; substitute?: string | null }): Promise<{ ok: boolean; repaired: number; blocked: string[] }> {
  const s = z.object({ target: z.string().trim().min(1).max(40), mode: z.enum(["avoid", "substitute"]), substitute: z.string().trim().max(40).nullable().optional() }).parse(input);
  const p = getProfile();
  const rules = p.preferences.nutrition.foodRules.filter((r) => r.target !== s.target.toLowerCase());
  rules.push({ id: `r${Date.now().toString(36)}`, kind: s.mode === "avoid" ? "avoid" : "prefer-substitute", target: s.target.toLowerCase(), substitute: s.substitute?.toLowerCase() || null });
  updateProfile({ preferences: { nutrition: { foodRules: rules } } });
  const row = fw.activeWeekRow(p.today) ?? fw.nextWeekRow(p.today);
  const r = row && row.status !== "reviewed" ? fw.applyRulesToWeek(row.id) : { repaired: 0, blocked: [] };
  revalidate();
  return { ok: true, ...r };
}
/** Re-run requirements vs pantry for the current plan (no meal regeneration). */
export async function reconcileListAction(weekId: number): Promise<{ changes: string[] }> {
  const r = fw.reconcileShoppingList(z.number().int().parse(weekId));
  revalidate();
  return { changes: r.changes };
}

// ------------------------------------------------------------- pantry ----
const pantryInput = z.object({ name: z.string().trim().min(1).max(60), qty: z.number().nullable().optional(), unit: z.string().max(20).optional(), level: z.enum(["none", "some", "lot"]).nullable().optional(), expiresAt: z.string().nullable().optional(), product: z.string().max(80).nullable().optional() });
/**
 * Add to the pantry. Without `mode`, a row for the same thing (or a variant of
 * it) returns `needsChoice` so the UI can ask UPDATE QUANTITY / ADD SEPARATELY
 * instead of creating a duplicate. The current shopping list is reconciled.
 */
export async function upsertPantryAction(input: z.input<typeof pantryInput>, mode?: "merge" | "separate"): Promise<{ id?: number; needsChoice?: { existing: { id: number; name: string; qty: number | null; unit: string; level: string | null }; name: string; sameName: boolean }; reconciled?: string[] }> {
  const s = pantryInput.parse(input);
  const name = pantry.pantryName(s.name);
  if (!mode) {
    const m = pantry.findPantryMatch(name);
    const existing = m.exact ?? m.similar[0];
    if (existing) return { needsChoice: { existing: { id: existing.id, name: existing.name, qty: existing.qty, unit: existing.unit, level: existing.level }, name, sameName: !!m.exact } };
  }
  let row;
  if (mode === "merge") {
    const m = pantry.findPantryMatch(name);
    const target = m.exact ?? m.similar[0];
    row = target ? pantry.upsertPantry({ name: target.name, qty: s.qty, unit: s.unit, level: s.level ?? (s.qty == null ? "lot" : undefined), expiresAt: s.expiresAt, source: "manual", add: s.qty != null, product: s.product }) : pantry.upsertPantry({ ...s, source: "manual" });
  } else row = pantry.upsertPantry({ ...s, source: "manual" });
  const p = getProfile();
  const r = fw.onPantryChanged(p.today);
  revalidate();
  return { id: row.id, reconciled: r?.changes ?? [] };
}
export async function setPantryLevelAction(id: number, level: "none" | "some" | "lot"): Promise<{ reconciled: string[] }> {
  pantry.setPantryLevel(z.number().int().parse(id), level);
  const r = fw.onPantryChanged(getProfile().today);
  revalidate();
  return { reconciled: r?.changes ?? [] };
}
export async function updatePantryAction(id: number, patch: { qty?: number | null; unit?: string; expiresAt?: string | null; name?: string; product?: string | null }): Promise<{ reconciled: string[] }> {
  pantry.updatePantry(z.number().int().parse(id), patch);
  const r = fw.onPantryChanged(getProfile().today);
  revalidate();
  return { reconciled: r?.changes ?? [] };
}
export async function deletePantryAction(id: number): Promise<{ reconciled: string[] }> {
  pantry.deletePantry(z.number().int().parse(id));
  const r = fw.onPantryChanged(getProfile().today);
  revalidate();
  return { reconciled: r?.changes ?? [] };
}
export async function whatCanIEatAction(opts: { mealType?: "breakfast" | "lunch" | "dinner" | "snack"; minutes?: number } = {}) {
  return fw.whatCanIEat(opts);
}
export async function cookSuggestionAction(s: { name: string; calories: number; protein: number; carbs: number; fat: number; uses: string[]; recipeId: number | null; mealType?: string; servings?: number }): Promise<ActionFeedback> {
  const r0 = fw.cookSuggestion({ ...s, name: z.string().trim().min(1).max(120).parse(s.name), servings: s.servings ? z.number().min(0.5).max(12).parse(s.servings) : 1 });
  const r = reconcile();
  revalidate();
  return { ok: true, xpGained: r0.xp.reduce((a, b) => a + b.amount, 0) + r.xpGained, xpLines: r0.xp.map((x) => `${x.description} +${x.amount}`), questsCompleted: r.completedQuests.map((q) => ({ title: q.title, rewardXp: q.rewardXp })), achievements: r.newAchievements.map((a) => ({ key: a.key, name: a.name, title: a.title })), levelUp: r.levelUp, rankUps: r.rankUps.map((x) => ({ domain: x.domain, from: x.from, to: x.to })) };
}
export async function saveTrainingDaysAction(days: number[]) {
  const d = z.array(z.number().int().min(0).max(6)).max(7).parse(days);
  updateProfile({ preferences: { fitness: { trainingDays: d, daysPerWeek: Math.max(1, d.length || getProfile().preferences.fitness.daysPerWeek) } } });
  revalidate();
}

/** "I'm shopping today": plan N days from today, build the list, and accept a Supply run quest. No preferred-day gate. */
export async function startSupplyRunAction(input: { days: number; budget: number; usePantry: boolean }): Promise<{ ok: boolean; weekStart?: string; weekId?: number; source?: "ai" | "template"; estimatedCost?: number | null; error?: string }> {
  try {
    const s = z.object({ days: z.coerce.number().int().min(2).max(14), budget: z.coerce.number().min(0).max(2000), usePantry: z.boolean() }).parse(input);
    const p = getProfile();
    const r = await fw.startSupplyRun({ today: p.today, days: s.days, budget: s.budget, usePantry: s.usePantry, profile: p });
    offerSupplyRun({ today: p.today, now: new Date(), weekId: r.week.id, days: s.days, budget: s.budget });
    updateProfile({ preferences: { food: { weeklyBudget: s.days >= 6 ? s.budget : p.preferences.food.weeklyBudget } } });
    reconcile();
    revalidate();
    return { ok: true, weekStart: r.week.weekStart, weekId: r.week.id, source: r.source, estimatedCost: r.week.estimatedCost, error: r.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Replan only the rest of the current plan from today, with the pantry and the budget actually left. */
export async function replanRemainderAction(weekId: number): Promise<{ ok: boolean; daysReplanned?: number; budgetLeft?: number; source?: "ai" | "template"; error?: string }> {
  try {
    const p = getProfile();
    const r = await fw.replanRemainder(z.number().int().parse(weekId), p.today);
    reconcile();
    revalidate();
    return { ok: true, daysReplanned: r.daysReplanned, budgetLeft: r.budgetLeft, source: r.source, error: r.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
