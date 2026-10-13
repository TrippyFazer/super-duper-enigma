import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pantryItems, type PantryItem } from "@/db/schema";
import { canonicalName, findIngredient } from "@/food/ingredients";
import { addDays, type ISODate } from "@/lib/dates";

/**
 * Lightweight food inventory. Quantities are approximate on purpose: the point
 * is to feed meal planning ("you still have rice"), not to run a warehouse.
 */
export type PantryLevel = "none" | "some" | "lot";

export function listPantry(opts: { includeEmpty?: boolean } = {}): PantryItem[] {
  const rows = getDb().select().from(pantryItems).orderBy(desc(pantryItems.updatedAt)).all();
  return opts.includeEmpty ? rows : rows.filter((r) => r.level !== "none" && (r.qty == null || r.qty > 0));
}

export function pantryNames(): string[] {
  return listPantry().map((r) => r.name);
}

/** Add or top up an item (same canonical name merges). */
export function upsertPantry(input: { name: string; qty?: number | null; unit?: string; level?: PantryLevel | null; purchasedAt?: ISODate | null; expiresAt?: ISODate | null; source?: string; add?: boolean }): PantryItem {
  const db = getDb();
  const name = canonicalName(input.name) || input.name.trim().toLowerCase();
  const def = findIngredient(name);
  const cur = db.select().from(pantryItems).where(eq(pantryItems.name, name)).get();
  const now = new Date().toISOString();
  const unit = input.unit ?? cur?.unit ?? def?.unit ?? "each";
  const expiresAt = input.expiresAt ?? (input.purchasedAt && def ? addDays(input.purchasedAt, def.shelfDays) : (cur?.expiresAt ?? null));
  let qty = input.qty ?? null;
  if (input.add && cur?.qty != null && qty != null) qty = cur.qty + qty;
  const level: PantryLevel | null = input.level ?? (qty != null ? (qty <= 0 ? "none" : qty < 1 ? "some" : "lot") : ((cur?.level as PantryLevel | null) ?? "some"));
  const values = { name, qty, unit, level, purchasedAt: input.purchasedAt ?? cur?.purchasedAt ?? null, expiresAt, source: input.source ?? cur?.source ?? "manual", updatedAt: now };
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

export function updatePantry(id: number, patch: { qty?: number | null; unit?: string; expiresAt?: string | null; name?: string }) {
  const db = getDb();
  const values: Partial<typeof pantryItems.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.qty !== undefined) {
    values.qty = patch.qty;
    values.level = patch.qty == null ? "some" : patch.qty <= 0 ? "none" : patch.qty < 1 ? "some" : "lot";
  }
  if (patch.unit) values.unit = patch.unit;
  if (patch.expiresAt !== undefined) values.expiresAt = patch.expiresAt;
  if (patch.name) values.name = canonicalName(patch.name) || patch.name;
  db.update(pantryItems).set(values).where(eq(pantryItems.id, id)).run();
}

export function deletePantry(id: number) {
  getDb().delete(pantryItems).where(eq(pantryItems.id, id)).run();
}

/** Consume roughly one serving of each named ingredient (used by "cook this"). */
export function consumeIngredients(names: string[], servings = 1) {
  const db = getDb();
  for (const raw of names) {
    const name = canonicalName(raw);
    const cur = db.select().from(pantryItems).where(eq(pantryItems.name, name)).get();
    if (!cur) continue;
    const def = findIngredient(name);
    if (def?.staple) continue; // salt, oil, spices: don't tick down
    if (cur.qty != null) {
      const perServing = def ? 1 / def.servingsPerUnit : 0.25;
      const qty = Math.max(0, Math.round((cur.qty - perServing * servings) * 100) / 100);
      db.update(pantryItems).set({ qty, level: qty <= 0 ? "none" : qty < 1 ? "some" : "lot", updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, cur.id)).run();
    } else if (cur.level === "lot") {
      // coarse: a lot stays a lot for a couple of uses; "some" → "none" after use
      db.update(pantryItems).set({ updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, cur.id)).run();
    } else if (cur.level === "some") {
      db.update(pantryItems).set({ level: "none", updatedAt: new Date().toISOString() }).where(eq(pantryItems.id, cur.id)).run();
    }
  }
}

/** Items expiring within N days (for "use these first"). */
export function expiringSoon(today: ISODate, days = 3): PantryItem[] {
  const cutoff = addDays(today, days);
  return listPantry().filter((r) => r.expiresAt && r.expiresAt <= cutoff);
}

/** Approximate servings of an ingredient still on hand (null = unknown). */
export function servingsOnHand(item: PantryItem): number | null {
  const def = findIngredient(item.name);
  if (item.qty != null && def) return Math.round(item.qty * def.servingsPerUnit * 10) / 10;
  if (item.level === "lot") return def ? Math.round(def.servingsPerUnit * 0.75) : 4;
  if (item.level === "some") return def ? Math.max(1, Math.round(def.servingsPerUnit * 0.3)) : 2;
  if (item.level === "none") return 0;
  return null;
}

export function pantryCount(): number {
  const r = getDb().select({ n: sql<number>`count(*)` }).from(pantryItems).where(or(isNull(pantryItems.level), sql`${pantryItems.level} != 'none'`)).get();
  return r?.n ?? 0;
}
