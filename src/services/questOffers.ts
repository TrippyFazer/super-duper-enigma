import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { questOffers, type QuestOffer } from "@/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import type { ProgressionContext } from "@/ranking/context";
import { DIFFICULTY_XP, QUEST_LIBRARY, violatesSafety, type LibraryQuest, type OfferSignals, type QuestDifficulty } from "@/ranking/questLibrary";
import type { QuestFrequency } from "./preferences";
import { awardXp, voidXpForSource, type XpAward } from "./xp";

/**
 * Optional quest offers.
 *
 * Rules (docs/ranking-methodology.md → Optional quests):
 *  - 0–2 offers per day, often none. Frequency: low ≈ 0.6/day, normal ≈ 1.1/day, high ≈ 1.8/day.
 *  - Never more than one open (offered or accepted) quest at a time.
 *  - A template is not re-offered within 7 days.
 *  - Declining does nothing except mark the offer declined. No XP, rank, streak or score effect — ever.
 *  - Offers expire quietly.
 */
/**
 * How often a special quest appears. "Special" means occasional: on normal,
 * at most one a day and roughly every other day (it was up to two a day).
 * minGapHours keeps them from landing on consecutive mornings.
 */
const FREQ: Record<QuestFrequency, { perDay: number; maxPerDay: number; minGapHours: number }> = {
  low: { perDay: 0.4, maxPerDay: 1, minGapHours: 44 },
  normal: { perDay: 0.75, maxPerDay: 1, minGapHours: 20 },
  high: { perDay: 1.8, maxPerDay: 2, minGapHours: 3 }, // asked for many: unchanged
};

/** Deterministic pseudo-random in [0,1) for a date + slot so reloads don't re-roll. */
function roll(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface OfferEngineInput {
  today: ISODate;
  now: Date;
  localHour: number;
  signals: OfferSignals;
  frequency: QuestFrequency;
  /** Optional AI candidate supplier (already validated by caller). */
  aiCandidate?: () => Promise<ValidatedCandidate | null>;
}

export interface ValidatedCandidate {
  templateKey: string | null;
  source: "library" | "ai";
  title: string;
  description: string;
  domain: string;
  difficulty: QuestDifficulty;
  kind: string;
  estimatedMinutes: number;
  xpReward: number;
  expiresInHours: number;
}

/** Validate any candidate (library or AI) against guardrails. Returns a reason when rejected. */
export function validateCandidate(c: ValidatedCandidate, recentTitles: string[]): string | null {
  const text = `${c.title} ${c.description}`;
  const unsafe = violatesSafety(text);
  if (unsafe) return `unsafe: ${unsafe}`;
  if (c.title.length < 4 || c.title.length > 80) return "title length";
  if (!["fitness", "sleep", "cooking", "wealth", "skincare", "sobriety", "habits"].includes(c.domain)) return "domain";
  if (!(c.difficulty in DIFFICULTY_XP)) return "difficulty";
  if (c.difficulty === "legendary" || c.difficulty === "epic") return "difficulty reserved for boss quests";
  const [lo, hi] = DIFFICULTY_XP[c.difficulty];
  if (c.xpReward < lo || c.xpReward > hi) return `xp ${c.xpReward} outside ${lo}-${hi} for ${c.difficulty}`;
  if (c.estimatedMinutes < 0 || c.estimatedMinutes > 90) return "unrealistic duration";
  if (c.expiresInHours < 1 || c.expiresInHours > 72) return "expiry";
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (recentTitles.some((t) => norm(t) === norm(c.title))) return "duplicate of a recent quest";
  return null;
}

export function libraryCandidate(q: LibraryQuest): ValidatedCandidate {
  return { templateKey: q.key, source: "library", title: q.title, description: q.description, domain: q.domain, difficulty: q.difficulty, kind: q.kind, estimatedMinutes: q.estimatedMinutes, xpReward: q.xp, expiresInHours: q.expiresInHours };
}

/** Expire stale offers and accepted quests past their expiry. */
export function expireOffers(now: Date) {
  const db = getDb();
  const open = db.select().from(questOffers).where(inArray(questOffers.status, ["offered", "accepted"])).all();
  for (const o of open) {
    if (o.expiresAt && new Date(o.expiresAt) < now) db.update(questOffers).set({ status: "expired" }).where(eq(questOffers.id, o.id)).run();
  }
}

export function openOffer(): QuestOffer | null {
  return getDb().select().from(questOffers).where(inArray(questOffers.status, ["offered", "accepted"])).orderBy(desc(questOffers.id)).get() ?? null;
}

/**
 * Decide whether to create a new offer right now. Pure-ish: the dice are
 * seeded by date + slot so the same slot never re-rolls on reload.
 */
export async function maybeOffer(input: OfferEngineInput): Promise<QuestOffer | null> {
  const db = getDb();
  expireOffers(input.now);
  if (openOffer()) return null;

  const todays = db.select().from(questOffers).where(eq(questOffers.date, input.today)).all();
  const cfg = FREQ[input.frequency];
  if (todays.length >= cfg.maxPerDay) return null;
  // Too soon after a decline/expiry: wait at least 3 hours.
  const last = todays.sort((a, b) => b.id - a.id)[0];
  if (last) {
    const ts = last.declinedAt ?? last.completedAt ?? last.expiresAt ?? last.offeredAt;
    if (input.now.getTime() - new Date(ts).getTime() < 3 * 3600_000) return null;
  }
  // Quiet hours.
  if (input.localHour < 7 || input.localHour >= 23) return null;
  // Spacing across days: not one every single morning.
  const lastAny = db.select().from(questOffers).orderBy(desc(questOffers.id)).limit(1).get();
  const sinceLast = lastAny ? input.now.getTime() - new Date(lastAny.offeredAt).getTime() : Infinity;
  if (sinceLast >= 0 && sinceLast < cfg.minGapHours * 3600_000) return null;

  // Three slots per day (morning / afternoon / evening); each slot rolls once.
  const slot = input.localHour < 12 ? "am" : input.localHour < 17 ? "pm" : "eve";
  const p = Math.min(0.85, cfg.perDay / 3 + (todays.length === 0 && slot === "eve" ? 0.15 : 0));
  if (roll(`${input.today}:${slot}:offer`) > p) return null;

  // Not the same quest twice in two weeks.
  const recent = db.select().from(questOffers).where(gte(questOffers.date, addDays(input.today, -14))).all();
  const recentKeys = new Set(recent.map((r) => r.templateKey).filter(Boolean));
  const recentTitles = recent.map((r) => r.title);

  // Candidate pool from the library, weighted by signals.
  const pool = QUEST_LIBRARY.filter((q) => !recentKeys.has(q.key))
    .filter((q) => !q.window || (input.localHour >= q.window[0] && input.localHour <= q.window[1]))
    .map((q) => ({ q, w: q.weight(input.signals) }))
    // A trivial quest ("add a protein snack", +20 XP) is only worth a special
    // slot when today's signals call for it; never as a random pick.
    .filter((x) => x.w > 0 && (x.q.difficulty !== "common" || x.w >= 2));

  let candidate: ValidatedCandidate | null = null;
  // Occasionally (30%) let the AI propose one, if available and valid.
  if (input.aiCandidate && roll(`${input.today}:${slot}:ai`) < 0.3) {
    try {
      const c = await input.aiCandidate();
      if (c && !validateCandidate(c, recentTitles)) candidate = c;
    } catch {
      candidate = null;
    }
  }
  if (!candidate && pool.length) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = roll(`${input.today}:${slot}:pick`) * total;
    for (const x of pool) {
      r -= x.w;
      if (r <= 0) {
        candidate = libraryCandidate(x.q);
        break;
      }
    }
    if (!candidate) candidate = libraryCandidate(pool[pool.length - 1].q);
  }
  if (!candidate) return null;
  const reason = validateCandidate(candidate, recentTitles);
  if (reason) return null;

  const expiresAt = new Date(input.now.getTime() + candidate.expiresInHours * 3600_000).toISOString();
  const row = db
    .insert(questOffers)
    .values({
      templateKey: candidate.templateKey,
      source: candidate.source,
      title: candidate.title,
      description: candidate.description,
      domain: candidate.domain,
      difficulty: candidate.difficulty,
      kind: candidate.kind,
      estimatedMinutes: candidate.estimatedMinutes,
      xpReward: candidate.xpReward,
      status: "offered",
      date: input.today,
      offeredAt: input.now.toISOString(),
      expiresAt,
      params: toJson({}),
    })
    .returning()
    .get();
  return row;
}

export function acceptOffer(id: number, now = new Date()): QuestOffer | null {
  const db = getDb();
  const o = db.select().from(questOffers).where(eq(questOffers.id, id)).get();
  if (!o || o.status !== "offered") return o ?? null;
  db.update(questOffers).set({ status: "accepted", acceptedAt: now.toISOString() }).where(eq(questOffers.id, id)).run();
  return db.select().from(questOffers).where(eq(questOffers.id, id)).get() ?? null;
}

/** Declining is free. Nothing else in the system reads declined offers. */
export function declineOffer(id: number, now = new Date()): QuestOffer | null {
  const db = getDb();
  const o = db.select().from(questOffers).where(eq(questOffers.id, id)).get();
  if (!o || (o.status !== "offered" && o.status !== "accepted")) return o ?? null;
  db.update(questOffers).set({ status: "declined", declinedAt: now.toISOString() }).where(eq(questOffers.id, id)).run();
  return db.select().from(questOffers).where(eq(questOffers.id, id)).get() ?? null;
}

export function completeOffer(id: number, today: ISODate, now = new Date()): { offer: QuestOffer | null; xp: XpAward | null } {
  const db = getDb();
  const o = db.select().from(questOffers).where(eq(questOffers.id, id)).get();
  if (!o) return { offer: null, xp: null };
  if (o.status !== "accepted" && o.status !== "offered") return { offer: o, xp: null };
  if (o.expiresAt && new Date(o.expiresAt) < now) {
    db.update(questOffers).set({ status: "expired" }).where(eq(questOffers.id, id)).run();
    return { offer: { ...o, status: "expired" }, xp: null };
  }
  db.update(questOffers).set({ status: "completed", completedAt: now.toISOString(), acceptedAt: o.acceptedAt ?? now.toISOString() }).where(eq(questOffers.id, id)).run();
  const xp = awardXp("quest_special", today, { suffix: id, amount: o.xpReward, description: `Special quest: ${o.title}`, source: { type: "offer", id } });
  return { offer: db.select().from(questOffers).where(eq(questOffers.id, id)).get() ?? null, xp };
}

/**
 * Cross-system offer: steps are close to target in the evening → a short walk
 * quest, created already-accepted because the user tapped it. One per day.
 */
export function offerStepQuest(input: { today: ISODate; now: Date; remaining: number }): QuestOffer | null {
  const db = getDb();
  const existing = db.select().from(questOffers).where(and(eq(questOffers.date, input.today), eq(questOffers.templateKey, "steps-finish"))).get();
  if (existing) return existing;
  const open = openOffer();
  if (open) return null;
  const minutes = Math.max(10, Math.min(30, Math.round(input.remaining / 110)));
  const xp = input.remaining >= 2500 ? 40 : 25;
  return db
    .insert(questOffers)
    .values({
      templateKey: "steps-finish",
      source: "library",
      title: `Walk the last ${input.remaining.toLocaleString()} steps`,
      description: `About ${minutes} minutes at an easy pace closes today's step target.`,
      domain: "fitness",
      difficulty: input.remaining >= 2500 ? "uncommon" : "common",
      kind: "side",
      estimatedMinutes: minutes,
      xpReward: xp,
      status: "accepted",
      date: input.today,
      offeredAt: input.now.toISOString(),
      acceptedAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + 5 * 3600_000).toISOString(),
      params: toJson({ remaining: input.remaining }),
    })
    .returning()
    .get();
}

/** Undo an accidental "complete" on a special quest: back to accepted, XP voided. */
export function uncompleteOffer(id: number): QuestOffer | null {
  const db = getDb();
  const o = db.select().from(questOffers).where(eq(questOffers.id, id)).get();
  if (!o || o.status !== "completed") return o ?? null;
  voidXpForSource({ type: "offer", id }, "special quest completion undone");
  db.update(questOffers).set({ status: "accepted", completedAt: null }).where(eq(questOffers.id, id)).run();
  return db.select().from(questOffers).where(eq(questOffers.id, id)).get() ?? null;
}

export function listOffers(opts: { limit?: number; statuses?: string[] } = {}) {
  const db = getDb();
  const q = db.select().from(questOffers);
  const rows = opts.statuses ? q.where(inArray(questOffers.status, opts.statuses)).orderBy(desc(questOffers.id)).limit(opts.limit ?? 50).all() : q.orderBy(desc(questOffers.id)).limit(opts.limit ?? 50).all();
  return rows.map((r) => ({ ...r, paramsParsed: parseJson<Record<string, unknown>>(r.params, {}) }));
}

export function offersCompletedCount(): number {
  return getDb().select().from(questOffers).where(and(eq(questOffers.status, "completed"))).all().length;
}

/** Build engine signals from the progression context + a few extra facts. */
export function signalsFromContext(ctx: ProgressionContext, extra: { localHour: number; trainedHardYesterday: boolean; proteinLow: boolean; nutritionTracked: boolean; sleepPoorRecently: boolean; hasWorkoutPlanToday: boolean; planCompletedToday: boolean; readinessLow: boolean }): OfferSignals {
  const d = new Date(ctx.today + "T00:00:00Z");
  return {
    hour: extra.localHour,
    weekday: d.getUTCDay(),
    workedOutToday: ctx.fitness.workoutsToday > 0,
    trainedHardYesterday: extra.trainedHardYesterday,
    stepsToday: ctx.fitness.stepsToday,
    stepsTarget: ctx.fitness.stepsTarget,
    mealsCookedToday: ctx.cooking.mealsToday,
    cookingBehindThisWeek: ctx.cooking.mealsThisWeek < Math.round((ctx.cooking.target * (d.getUTCDay() === 0 ? 7 : d.getUTCDay())) / 7),
    proteinLow: extra.proteinLow,
    nutritionTracked: extra.nutritionTracked,
    sleepPoorRecently: extra.sleepPoorRecently,
    bedtimeTarget: ctx.sleep.bedtimeTarget,
    routinesDueTonight: ctx.skincare.routinesCount > ctx.skincare.completedToday,
    habitsDueToday: ctx.habits.dueToday - ctx.habits.doneToday,
    dailyQuestsDone: 0,
    dailyQuestsTotal: 0,
    sobrietyActive: ctx.sobriety.length > 0,
    financeDueForCheckin: ctx.wealth.daysSinceLast == null ? false : ctx.wealth.daysSinceLast >= 30,
    activeDomains: ctx.activeDomains,
    hasWorkoutPlanToday: extra.hasWorkoutPlanToday,
    planCompletedToday: extra.planCompletedToday,
    readinessLow: extra.readinessLow,
  };
}
