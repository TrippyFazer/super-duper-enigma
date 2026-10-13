import { and, desc, eq, gte, isNull, like, lte, sql } from "drizzle-orm";
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
 * XP source: every award knows what earned it, so deleting or invalidating the
 * source can void exactly that XP (never a blind decrement of a total).
 */
export interface XpSource {
  type: "workout" | "session" | "nutrition" | "meal" | "quest" | "achievement" | "habit" | "routine" | "offer" | "sleep" | "steps" | "finance" | "sobriety" | "pr" | "prep" | "grocery" | "system";
  id: string | number;
}

const live = () => isNull(xpEvents.voidedAt);

/**
 * Award XP for a rule on a date. Idempotent by key; respects the rule's daily cap.
 * Voided events do not block re-earning the same key (their key is suffixed on void).
 */
export function awardXp(
  rule: XpRuleKey,
  date: ISODate,
  opts: { suffix?: string | number; amount?: number; description?: string; source?: XpSource } = {},
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
    .where(and(eq(xpEvents.date, date), like(xpEvents.key, rule + ":%"), live()))
    .get();
  if ((todayCount?.n ?? 0) >= def.dailyCap) return { awarded: false, amount: 0, key, description };

  db.insert(xpEvents)
    .values({ date, amount, domain: DOMAIN_FOR_RULE[rule], key, description, sourceType: opts.source?.type ?? null, sourceId: opts.source ? String(opts.source.id) : null })
    .onConflictDoNothing()
    .run();
  return { awarded: true, amount, key, description };
}

/**
 * Void every live XP event for a source. The key is suffixed so the same action
 * can legitimately earn again later (e.g. re-logging a deleted workout).
 * Returns the total amount voided.
 */
export function voidXpForSource(source: XpSource, reason: string): number {
  const db = getDb();
  const rows = db.select().from(xpEvents).where(and(eq(xpEvents.sourceType, source.type), eq(xpEvents.sourceId, String(source.id)), live())).all();
  return voidRows(rows, reason);
}

/** Void by exact key (for day-level rules like nutrition_logged:<date>). */
export function voidXpByKey(key: string, reason: string): number {
  const db = getDb();
  const rows = db.select().from(xpEvents).where(and(eq(xpEvents.key, key), live())).all();
  return voidRows(rows, reason);
}

export function voidXpByKeyPrefix(prefix: string, reason: string): number {
  const db = getDb();
  const rows = db.select().from(xpEvents).where(and(like(xpEvents.key, prefix + "%"), live())).all();
  return voidRows(rows, reason);
}

function voidRows(rows: (typeof xpEvents.$inferSelect)[], reason: string): number {
  const db = getDb();
  const now = new Date().toISOString();
  let total = 0;
  for (const r of rows) {
    db.update(xpEvents)
      .set({ voidedAt: now, voidReason: reason, key: `${r.key}#void${r.id}` })
      .where(eq(xpEvents.id, r.id))
      .run();
    total += r.amount;
  }
  return total;
}

export function totalXp(): number {
  const db = getDb();
  const r = db.select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` }).from(xpEvents).where(live()).get();
  return r?.total ?? 0;
}

export function xpBetween(start: ISODate, end: ISODate): number {
  const db = getDb();
  const r = db
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(and(gte(xpEvents.date, start), lte(xpEvents.date, end), live()))
    .get();
  return r?.total ?? 0;
}

export function xpByDay(start: ISODate, end: ISODate): { date: ISODate; xp: number }[] {
  const db = getDb();
  return db
    .select({ date: xpEvents.date, xp: sql<number>`sum(${xpEvents.amount})` })
    .from(xpEvents)
    .where(and(gte(xpEvents.date, start), lte(xpEvents.date, end), live()))
    .groupBy(xpEvents.date)
    .orderBy(xpEvents.date)
    .all();
}

export function recentXpEvents(limit = 20) {
  const db = getDb();
  return db.select().from(xpEvents).orderBy(desc(xpEvents.id)).limit(limit).all();
}

/** Live XP events whose key starts with a rule (used by achievements, e.g. counting real PRs). */
export function liveEventsWithPrefix(prefix: string) {
  return getDb().select().from(xpEvents).where(and(like(xpEvents.key, prefix + "%"), live())).all();
}

/** Audit view: live + voided events with their sources, newest first. */
export function xpLedger(limit = 100) {
  return getDb().select().from(xpEvents).orderBy(desc(xpEvents.id)).limit(limit).all();
}
