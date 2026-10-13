import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { motivationReasons, type MotivationReason } from "@/db/schema";
import { levelFromXp } from "@/ranking/levels";
import type { ProgressionContext } from "@/ranking/context";
import { getProfile, updateProfile, type ProfileView } from "./profile";
import { totalXp } from "./xp";

// ------------------------------------------------------------- reasons ----
export function listReasons(includeInactive = false): MotivationReason[] {
  const rows = getDb().select().from(motivationReasons).orderBy(desc(motivationReasons.active), motivationReasons.id).all();
  return includeInactive ? rows : rows.filter((r) => r.active);
}

export function addReason(text: string): MotivationReason {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 160);
  const existing = getDb().select().from(motivationReasons).where(eq(motivationReasons.text, t)).get();
  if (existing) {
    if (!existing.active) getDb().update(motivationReasons).set({ active: true }).where(eq(motivationReasons.id, existing.id)).run();
    return { ...existing, active: true };
  }
  return getDb().insert(motivationReasons).values({ text: t }).returning().get();
}

export function updateReason(id: number, patch: { text?: string; active?: boolean }) {
  const values: Partial<typeof motivationReasons.$inferInsert> = {};
  if (patch.text !== undefined) values.text = patch.text.trim().slice(0, 160);
  if (patch.active !== undefined) values.active = patch.active;
  getDb().update(motivationReasons).set(values).where(eq(motivationReasons.id, id)).run();
}

export function deleteReason(id: number) {
  getDb().delete(motivationReasons).where(eq(motivationReasons.id, id)).run();
}

export const REASON_SUGGESTIONS = ["I want to feel confident.", "I want more discipline.", "I want to look better.", "I want to have more energy.", "I want to become someone I am proud of.", "I want to be a calmer, steadier person for the people around me.", "I want to stop wasting my potential.", "I want to prove I can finish what I start."];

// ------------------------------------------------------------- messages ----
export interface MotivationInput {
  name: string;
  reasons: string[];
  xpToNext: number;
  level: number;
  nearLevel: boolean;
  bestStreak: number;
  activeWeekStreak: number;
  firstQuest: string | null;
  overallRank: string;
  nextRank: string | null;
  scoreDelta30: { domain: string; delta: number } | null;
  sobrietyDays: { name: string; days: number } | null;
  weekday: number;
}

type Template = { key: string; category: "why" | "progress" | "level" | "streak" | "quest" | "short"; when: (i: MotivationInput) => boolean; text: (i: MotivationInput) => string };

const pick = <T>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

export const MORNING_TEMPLATES: Template[] = [
  { key: "why.1", category: "why", when: (i) => i.reasons.length > 0, text: (i) => `Time to get up. You said you're doing this because ${lower(pick(i.reasons, i.weekday))} Start with one win.` },
  { key: "why.2", category: "why", when: (i) => i.reasons.length > 0, text: (i) => `Morning, ${i.name}. ${pick(i.reasons, i.weekday + 1)} That's still true today. One quest at a time.` },
  { key: "why.3", category: "why", when: (i) => i.reasons.length > 0, text: (i) => `Your reason, in your words: “${pick(i.reasons, i.weekday + 2)}” Today is where that gets built.` },
  { key: "why.4", category: "why", when: (i) => i.reasons.length > 0 && !!i.firstQuest, text: (i) => `You said you wanted ${wantPhrase(pick(i.reasons, i.weekday + 3))}. Today's first quest is waiting: ${i.firstQuest}.` },
  { key: "level.1", category: "level", when: (i) => i.nearLevel, text: (i) => `${i.xpToNext} XP until Level ${i.level + 1}. That's a normal day, not a heroic one.` },
  { key: "level.2", category: "level", when: (i) => i.xpToNext > 0, text: (i) => `Level ${i.level}. ${i.xpToNext} XP to the next. Morning, ${i.name} — the ledger is open.` },
  { key: "progress.1", category: "progress", when: (i) => !!i.scoreDelta30 && i.scoreDelta30.delta >= 3, text: (i) => `Your ${i.scoreDelta30!.domain} score is up ${Math.round(i.scoreDelta30!.delta)} points this month. Keep the pattern going today.` },
  { key: "progress.2", category: "progress", when: (i) => !!i.nextRank, text: (i) => `${i.nextRank}-Rank isn't built in one day. Get one thing done this morning.` },
  { key: "progress.3", category: "progress", when: (i) => !!i.sobrietyDays && i.sobrietyDays.days >= 3, text: (i) => `Day ${i.sobrietyDays!.days + 1} on ${i.sobrietyDays!.name}. You've already done the hard part — just repeat yesterday.` },
  { key: "streak.1", category: "streak", when: (i) => i.bestStreak >= 3, text: (i) => `${i.bestStreak}-day streak on your best habit. Streaks don't need motivation, only a start.` },
  { key: "streak.2", category: "streak", when: (i) => i.activeWeekStreak >= 2, text: (i) => `${i.activeWeekStreak} active weeks in a row. This week makes it ${i.activeWeekStreak + 1} — the first session is the whole battle.` },
  { key: "quest.1", category: "quest", when: (i) => !!i.firstQuest, text: (i) => `You don't need a perfect day. Get the first quest done: ${i.firstQuest}.` },
  { key: "quest.2", category: "quest", when: (i) => !!i.firstQuest, text: (i) => `Morning, ${i.name}. Smallest useful thing right now: ${i.firstQuest}.` },
  { key: "short.1", category: "short", when: () => true, text: (i) => `Morning, ${i.name}. Today's another chance to build the person you're working toward.` },
  { key: "short.2", category: "short", when: () => true, text: () => `Up. Water. One small win before the phone. The rest follows.` },
  { key: "short.3", category: "short", when: () => true, text: (i) => `The ${i.overallRank}-Rank version of you gets up now. Not perfectly — just now.` },
  { key: "short.4", category: "short", when: (i) => i.weekday === 1, text: () => `New week, same climb. Pick one thing you'll be glad you did by tonight.` },
  { key: "short.5", category: "short", when: (i) => i.weekday === 0, text: () => `Sunday. Rest counts as training. So does preparing the week.` },
];

function lower(s: string) {
  const t = s.trim();
  return t.charAt(0).toLowerCase() + t.slice(1);
}
function wantPhrase(s: string) {
  return s
    .replace(/^i want to /i, "to ")
    .replace(/^i want /i, "")
    .replace(/\.$/, "");
}

/** Choose a morning message with variety: never one of the last 6 keys, rotate categories. */
export function buildMorningMessage(input: MotivationInput, recent: string[], seed: number): { key: string; text: string } {
  const eligible = MORNING_TEMPLATES.filter((t) => t.when(input));
  const notRecent = eligible.filter((t) => !recent.slice(-6).includes(t.key));
  const pool = notRecent.length ? notRecent : eligible;
  // Prefer categories not used in the last 3 messages; personal reasons get a small boost.
  const recentCats = new Set(recent.slice(-3).map((k) => k.split(".")[0]));
  const weighted = pool.flatMap((t) => Array(recentCats.has(t.category) ? 1 : t.category === "why" ? 3 : 2).fill(t));
  const t = weighted[Math.abs(seed) % weighted.length];
  return { key: t.key, text: t.text(input) };
}

export function motivationInput(profile: ProfileView, ctx: ProgressionContext): MotivationInput {
  const xp = totalXp();
  const lv = levelFromXp(xp);
  const best = ctx.sobriety.filter((t) => t.currentDays > 0).sort((a, b) => b.currentDays - a.currentDays)[0];
  const deltas = ctx.assessment.domains.map((d) => ({ domain: d.domain, delta: d.trend.delta30 ?? 0 })).sort((a, b) => b.delta - a.delta)[0];
  return {
    name: profile.name,
    reasons: listReasons().map((r) => r.text),
    xpToNext: lv.xpToNext,
    level: lv.level,
    nearLevel: lv.xpToNext <= 120,
    bestStreak: ctx.habits.bestStreak,
    activeWeekStreak: ctx.fitness.activeWeekStreak,
    firstQuest: null,
    overallRank: ctx.assessment.overall.rank,
    nextRank: ctx.assessment.overall.next.rank ?? null,
    scoreDelta30: deltas && deltas.delta > 0 ? deltas : null,
    sobrietyDays: best ? { name: best.name, days: best.currentDays } : null,
    weekday: new Date(profile.today + "T00:00:00Z").getUTCDay(),
  };
}

export function rememberMessage(key: string) {
  const p = getProfile();
  updateProfile({ preferences: { motivation: { recent: [...p.preferences.motivation.recent, key].slice(-12) } } });
}
