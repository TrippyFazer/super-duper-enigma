import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { xpEvents } from "@/db/schema";
import type { ISODate } from "@/lib/dates";
import { DOMAIN_FOR_RULE, XP_RULES, xpKey, type XpRuleKey } from "@/ranking/xp";

export interface XpAward {
  awarded: boolean;
  amount: number;
  key: string;
  description: string;
}

/**
 * Award XP for a rule on a date. Idempotent by key; respects the rule's daily cap.
 * Returns the award (amount 0 if nothing was awarded).
 */
export function awardXp(
  rule: XpRuleKey,
  date: ISODate,
  opts: { suffix?: string | number; amount?: number; description?: string } = {},
): XpAward {
  const db = getDb();
  const def = XP_RULES[rule];
  const key = xpKey(rule, date, opts.suffix);
  const amount = opts.amount ?? def.amount;
  const description = opts.description ?? def.description;
  if (amount <= 0) return { awarded: false, amount: 0, key, description };

  const existing = db.select({ id: xpEvents.id }).from(xpEvents).where(eq(xpEvents.key, key)).get();
  if (existing) return { awarded: false, amount: 0, key, description };

  const todayCount = db
    .select({ n: sql<number>`count(*)` })
    .from(xpEvents)
    .where(and(eq(xpEvents.date, date), sql`${xpEvents.key} like ${rule + ":%"}`))
    .get();
  if ((todayCount?.n ?? 0) >= def.dailyCap) return { awarded: false, amount: 0, key, description };

  db.insert(xpEvents)
    .values({ date, amount, domain: DOMAIN_FOR_RULE[rule], key, description })
    .onConflictDoNothing()
    .run();
  return { awarded: true, amount, key, description };
}

export function totalXp(): number {
  const db = getDb();
  const r = db.select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` }).from(xpEvents).get();
  return r?.total ?? 0;
}

export function xpBetween(start: ISODate, end: ISODate): number {
  const db = getDb();
  const r = db
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(and(gte(xpEvents.date, start), lte(xpEvents.date, end)))
    .get();
  return r?.total ?? 0;
}

export function xpByDay(start: ISODate, end: ISODate): { date: ISODate; xp: number }[] {
  const db = getDb();
  return db
    .select({ date: xpEvents.date, xp: sql<number>`sum(${xpEvents.amount})` })
    .from(xpEvents)
    .where(and(gte(xpEvents.date, start), lte(xpEvents.date, end)))
    .groupBy(xpEvents.date)
    .orderBy(xpEvents.date)
    .all();
}

export function recentXpEvents(limit = 20) {
  const db = getDb();
  return db.select().from(xpEvents).orderBy(desc(xpEvents.id)).limit(limit).all();
}
