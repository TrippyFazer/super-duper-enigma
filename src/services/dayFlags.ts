import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dayFlags } from "@/db/schema";
import type { ISODate } from "@/lib/dates";

/**
 * Explicit per-day states the user sets, e.g. "done eating for today" or
 * "rest day". They never award XP; they only tell the UI what is resolved.
 */
export type DayFlagKey = "food_finished" | "rest_day";

export function getDayFlag(date: ISODate, key: DayFlagKey): string | null {
  return getDb().select().from(dayFlags).where(and(eq(dayFlags.date, date), eq(dayFlags.key, key))).get()?.value ?? null;
}

export function setDayFlag(date: ISODate, key: DayFlagKey, value: string | null): void {
  const db = getDb();
  if (value == null) {
    db.delete(dayFlags).where(and(eq(dayFlags.date, date), eq(dayFlags.key, key))).run();
    return;
  }
  db.insert(dayFlags).values({ date, key, value, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: [dayFlags.date, dayFlags.key], set: { value, updatedAt: new Date().toISOString() } }).run();
}
