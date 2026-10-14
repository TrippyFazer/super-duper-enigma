import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pantryItems, type PantryItem } from "@/db/schema";
import { ingredientInfo, pantryCovers, storageName, toServings } from "@/food/families";
import { findIngredient } from "@/food/ingredients";
import { refServings, stockServings, type IngredientRef, type PantryStock } from "@/food/reconcile";
import { addDays, type ISODate } from "@/lib/dates";

/**
 * Lightweight food inventory. Quantities are approximate on purpose: the point
 * is to feed meal planning ("you still have rice"), not to run a warehouse.
 *
 * THE PANTRY IS AUTHORITATIVE. Names are stored as the exact variant when the
 * family model knows it ("lactose-free milk", "jasmine rice"), so a variant
 * that matters for a food rule never collapses into its family.
 */
export type PantryLevel = "none" | "some" | "lot";

export function listPantry(opts: { includeEmpty?: boolean } = {}): PantryItem[] {
  const rows = getDb().select().from(pantryItems).orderBy(desc(pantryItems.updatedAt)).all();
  return opts.includeEmpty ? rows : rows.filter((r) => r.level !== "none" && (r.qty == null || r.qty > 0));
}

export function pantryNames(): string[] {
  return listPantry().map((r) => r.name);
}

/** Rows as the reconciliation engine reads them. */
export function pantryStocks(): PantryStock[] {
  return listPantry().map((r) => ({ id: r.id, name: r.name, qty: r.qty, unit: r.unit, level: r.level, expiresAt: r.expiresAt }));
}

export function pantryName(text: string): string {
  return storageName(text) || text.trim().toLowerCase();
}

/**
 * Duplicate prevention. "Rice" when "jasmine rice" exists, "egg" when "eggs"
 * exists, "2% milk" when "milk" exists → the caller asks "update quantity or
 * add separately?" instead of creating a second row.
 */
export function findPantryMatch(text: string): { exact: PantryItem | null; similar: PantryItem[] } {
  const name = pantryName(text);
  const rows = listPantry({ includeEmpty: true });
  const exact = rows.find((r) => r.name === name) ?? null;
  const fam = ingredientInfo(name).family;
  const similar = rows.filter((r) => r.id !== exact?.id && ((fam && ingredientInfo(r.name).family === fam) || pantryCovers(name, r.name) || pantryCovers(r.name, name)));
  return { exact, similar };
}

/** Add or top up an item (same stored name merges). */
export function upsertPantry(input: { name: string; qty?: number | null; unit?: string; level?: PantryLevel | null; purchasedAt?: ISODate | null; expiresAt?: ISODate | null; source?: string; add?: boolean; product?: string | null; opened?: boolean }): PantryItem {
  const db = getDb();
  const name = pantryName(input.name);
  const def = findIngredient(name);
  const info = ingredientInfo(name);
  const cur = db.select().from(pantryItems).where(eq(pantryItems.name, name)).get();
  const now = new Date().toISOString();
  const unit = input.unit ?? cur?.unit ?? def?.unit ?? "each";
  const expiresAt = input.expiresAt ?? (input.purchasedAt && def ? addDays(input.purchasedAt, def.shelfDays) : (cur?.expiresAt ?? null));
  let qty = input.qty ?? null;
  if (input.add && cur?.qty != null && qty != null) {
    // different units: convert to servings-equivalent before adding when possible
    if (cur.unit !== unit) {
      const a = toServings(cur.qty, cur.unit, name);
      const b = toServings(qty, unit, name);
      qty = a != null && b != null && def ? Math.round(((a + b) / def.servingsPerUnit) * 100) / 100 : cur.qty + qty;
    } else qty = cur.qty + qty;
  }
  const level: PantryLevel | null = input.level ?? (qty != null ? (qty <= 0 ? "none" : qty < 1 ? "some" : "lot") : ((cur?.level as PantryLevel | null) ?? "some"));
  const values = { name, qty, unit: input.add && cur?.unit && cur.unit !== unit && def ? def.unit : unit, level, purchasedAt: input.purchasedAt ?? cur?.purchasedAt ?? null, expiresAt, source: input.source ?? cur?.source ?? "manual", family: info.family, variant: info.family ? info.variant : null, product: input.product ?? cur?.product ?? null, updatedAt: now };
  if (cur) {
    db.update(pantryItems).set(values).where(eq(pantryItems.id, cur.id)).run();
    return db.select().from(pantryItems).where(eq(pantryItems.id, cur.id)).get()!;
  }
  return db.insert(pantryItems).values(values).returning().get();
}

export function setPantryLevel(id: number, level: PantryLevel): PantryItem | null {
  const db = getDb();
  const cur = db.select().from(pantryItems).where(eq(pantryItems.id, id)).get();
  if (!cur) return null;
  const qty = level === "none" ? 0 : cur.qty != null && cur.qty > 0 ? (level === "some" ? Math.min(cur.qty, Math.max(0.25, cur.qty * 0.4)) : cur.qty) : null;
  db.update(pantryItems).set({ level, qty, updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, id)).run();
  return db.select().from(pantryItems).where(eq(pantryItems.id, id)).get() ?? null;
}

export function updatePantry(id: number, patch: { qty?: number | null; unit?: string; expiresAt?: string | null; name?: string; product?: string | null }) {
  const db = getDb();
  const values: Partial<typeof pantryItems.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.qty !== undefined) {
    values.qty = patch.qty;
    values.level = patch.qty == null ? "some" : patch.qty <= 0 ? "none" : patch.qty < 1 ? "some" : "lot";
  }
  if (patch.unit) values.unit = patch.unit;
  if (patch.expiresAt !== undefined) values.expiresAt = patch.expiresAt;
  if (patch.product !== undefined) values.product = patch.product;
  if (patch.name) {
    const name = pantryName(patch.name);
    const info = ingredientInfo(name);
    values.name = name;
    values.family = info.family;
    values.variant = info.family ? info.variant : null;
  }
  db.update(pantryItems).set(values).where(eq(pantryItems.id, id)).run();
}

export function deletePantry(id: number) {
  getDb().delete(pantryItems).where(eq(pantryItems.id, id)).run();
}

/** Set a row so it covers exactly N servings (used by the quick pantry check: "Yes, enough"). */
export function setPantryServings(id: number, servings: number) {
  const db = getDb();
  const cur = db.select().from(pantryItems).where(eq(pantryItems.id, id)).get();
  if (!cur) return;
  const def = findIngredient(cur.name);
  const unit = def?.unit ?? cur.unit;
  const qty = def ? Math.round((servings / def.servingsPerUnit) * 100) / 100 : servings;
  db.update(pantryItems).set({ qty, unit: def ? unit : "servings", level: qty <= 0 ? "none" : "lot", updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, id)).run();
}

/**
 * Cooking consumes the recipe's requirement × servings from compatible pantry
 * rows: a double batch takes double; a plain name is one serving; "2 cups
 * rice" is converted. Staples (salt, oil, spices) never tick down.
 */
export function consumeForRecipe(ingredients: IngredientRef[], servings = 1): { name: string; servings: number; from: string }[] {
  const db = getDb();
  const consumed: { name: string; servings: number; from: string }[] = [];
  const rows = listPantry({ includeEmpty: true });
  for (const ref of ingredients) {
    const { name, servings: per } = refServings(ref);
    const def = findIngredient(name);
    if (def?.staple) continue;
    let need = per * servings;
    // exact variant first, then compatible variants; soonest-expiring first
    const matches = rows.filter((r) => r.level !== "none" && (r.qty == null || r.qty > 0) && pantryCovers(name, r.name)).sort((a, b) => Number(storageName(name) !== a.name) - Number(storageName(name) !== b.name) || (a.expiresAt ?? "9").localeCompare(b.expiresAt ?? "9"));
    for (const cur of matches) {
      if (need <= 0) break;
      const stock = stockServings({ name: cur.name, qty: cur.qty, unit: cur.unit, level: cur.level }, name);
      if (cur.qty != null && stock.servings != null && stock.servings > 0) {
        const take = Math.min(need, stock.servings);
        const left = stock.servings - take;
        const qty = Math.max(0, Math.round(((cur.qty * left) / stock.servings) * 100) / 100);
        db.update(pantryItems).set({ qty, level: qty <= 0 ? "none" : qty < 1 ? "some" : "lot", updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, cur.id)).run();
        consumed.push({ name, servings: take, from: cur.name });
        need -= take;
      } else if (cur.level === "lot") {
        // coarse: a lot stays a lot unless a big batch takes a real bite out of it
        const assumed = stock.servings ?? 8;
        db.update(pantryItems).set({ level: need >= assumed / 2 ? "some" : "lot", updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, cur.id)).run();
        consumed.push({ name, servings: need, from: cur.name });
        need = 0;
      } else if (cur.level === "some") {
        db.update(pantryItems).set({ level: "none", updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, cur.id)).run();
        consumed.push({ name, servings: Math.min(need, stock.servings ?? need), from: cur.name });
        need -= stock.servings ?? need;
      }
    }
  }
  return consumed;
}

/** Back-compat: one serving of each named ingredient. */
export function consumeIngredients(names: string[], servings = 1) {
  consumeForRecipe(names, servings);
}

/** Items expiring within N days (for "use these first"). */
export function expiringSoon(today: ISODate, days = 3): PantryItem[] {
  const cutoff = addDays(today, days);
  return listPantry().filter((r) => r.expiresAt && r.expiresAt <= cutoff);
}

/** Approximate servings of an ingredient still on hand (null = unknown). */
export function servingsOnHand(item: PantryItem): number | null {
  const s = stockServings({ name: item.name, qty: item.qty, unit: item.unit, level: item.level });
  return s.servings == null ? null : Math.round(s.servings * 10) / 10;
}

/**
 * Pantry as the planners see it: servings, coarse level, and use-first flags
 * (expiring within 4 days, or an opened perishable).
 */
export function pantryForPlanning(today: ISODate): { name: string; servings: number | null; level: PantryLevel | null; expiring: boolean; opened: boolean }[] {
  const soon = addDays(today, 4);
  return listPantry().map((p) => {
    const def = findIngredient(p.name);
    const perishable = !!def && def.shelfDays <= 14 && !def.staple;
    const opened = perishable && p.purchasedAt != null && p.source === "grocery" && p.qty != null && def != null && p.qty < 1 && p.qty > 0;
    return { name: p.name, servings: p.qty != null ? servingsOnHand(p) : null, level: (p.level as PantryLevel | null) ?? null, expiring: !!p.expiresAt && p.expiresAt <= soon, opened };
  });
}

/**
 * Optional, lightweight waste signal: how much of what was bought for a plan
 * is still around after its end, and what expired unused. 0–100, higher = less waste.
 */
export function wasteScore(today: ISODate): { score: number; expiredUnused: string[]; note: string } {
  const rows = listPantry({ includeEmpty: true });
  const expiredUnused = rows.filter((r) => r.expiresAt && r.expiresAt < today && r.level !== "none" && (r.qty == null || r.qty > 0)).map((r) => r.name);
  const bought = rows.filter((r) => r.source === "grocery");
  const used = bought.filter((r) => r.level === "none" || (r.qty != null && r.qty <= 0.25)).length;
  const score = bought.length ? Math.round(100 - (expiredUnused.length / Math.max(1, bought.length)) * 100 * 0.7 - (1 - used / bought.length) * 30) : 100;
  return { score: Math.max(0, Math.min(100, score)), expiredUnused, note: expiredUnused.length ? `${expiredUnused.slice(0, 3).join(", ")} expired unused` : "Nothing expired unused" };
}

export function pantryCount(): number {
  const r = getDb().select({ n: sql<number>`count(*)` }).from(pantryItems).where(or(isNull(pantryItems.level), sql`${pantryItems.level} != 'none'`)).get();
  return r?.n ?? 0;
}
