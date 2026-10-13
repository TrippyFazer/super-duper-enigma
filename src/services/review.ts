import { and, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { scoreSnapshots, userAchievements } from "@/db/schema";
import { addDays, endOfWeek, isoWeek, startOfWeek, type ISODate } from "@/lib/dates";
import { ACHIEVEMENT_MAP } from "@/ranking/achievements";
import { DOMAINS } from "@/ranking/domains";
import type { CharacterAssessment, DomainId } from "@/ranking/types";
import { getProfile } from "./profile";
import { getAssessment } from "./progression";
import { xpBetween } from "./xp";
import { loadMeals, loadWorkouts, loadHabitCompletions, loadRoutineCompletions, loadSleep } from "./loaders";

export interface WeeklyReview {
  weekNumber: number;
  year: number;
  start: ISODate;
  end: ISODate;
  complete: boolean;
  xp: number;
  xpPrevWeek: number;
  domains: { id: DomainId; name: string; score: number; delta: number | null; rank: string }[];
  achievements: { key: string; name: string; title?: string }[];
  strongest: DomainId | null;
  needsAttention: DomainId | null;
  suggestedQuest: string | null;
  counts: { workouts: number; meals: number; habits: number; routines: number; nights: number };
  prevCounts: { workouts: number; meals: number; habits: number; routines: number; nights: number };
}

function scoreAt(domain: string, date: ISODate): number | null {
  const db = getDb();
  // Closest snapshot on or before `date` (within 10 days).
  const rows = db
    .select()
    .from(scoreSnapshots)
    .where(and(gte(scoreSnapshots.date, addDays(date, -10)), lte(scoreSnapshots.date, date)))
    .all()
    .filter((r) => r.domain === domain)
    .sort((a, b) => b.date.localeCompare(a.date));
  return rows[0]?.score ?? null;
}

export function getWeeklyReview(offsetWeeks = 1, assessment: CharacterAssessment = getAssessment()): WeeklyReview {
  const profile = getProfile();
  const today = profile.today;
  const start = addDays(startOfWeek(today), -7 * offsetWeeks);
  const end = endOfWeek(start);
  const complete = end < today;
  const { week, year } = isoWeek(start);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(end, -7);

  const count = (dates: string[], s: ISODate, e: ISODate) => dates.filter((d) => d >= s && d <= e).length;
  const w = loadWorkouts(today).map((x) => x.date);
  const m = loadMeals(today).map((x) => x.date);
  const h = loadHabitCompletions(today).map((x) => x.date);
  const r = loadRoutineCompletions(today).filter((x) => x.complete).map((x) => x.date);
  const s = loadSleep(today).map((x) => x.date);
  const counts = { workouts: count(w, start, end), meals: count(m, start, end), habits: count(h, start, end), routines: count(r, start, end), nights: count(s, start, end) };
  const prevCounts = { workouts: count(w, prevStart, prevEnd), meals: count(m, prevStart, prevEnd), habits: count(h, prevStart, prevEnd), routines: count(r, prevStart, prevEnd), nights: count(s, prevStart, prevEnd) };

  const domains = assessment.domains.map((d) => {
    const endScore = complete ? scoreAt(d.domain, end) ?? d.score : d.score;
    const startScore = scoreAt(d.domain, addDays(start, -1));
    return { id: d.domain, name: DOMAINS[d.domain].name, score: endScore, delta: startScore == null ? null : Math.round((endScore - startScore) * 10) / 10, rank: d.rank };
  });

  const ach = getDb()
    .select()
    .from(userAchievements)
    .where(and(gte(userAchievements.unlockedAt, start), lte(userAchievements.unlockedAt, end + "T23:59:59Z")))
    .all()
    .map((a) => ACHIEVEMENT_MAP.get(a.key))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({ key: a.key, name: a.name, title: a.title }));

  const sorted = [...domains].sort((a, b) => b.score - a.score);
  const strongest = sorted[0]?.id ?? null;
  const attention = [...domains].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0) || a.score - b.score)[0]?.id ?? null;
  const attentionAssessment = assessment.domains.find((d) => d.domain === attention);
  const suggestedQuest = attentionAssessment?.next.requirements.find((x) => !x.startsWith("Keep this up")) ?? attentionAssessment?.suggestedAction ?? null;

  return {
    weekNumber: week,
    year,
    start,
    end,
    complete,
    xp: xpBetween(start, end),
    xpPrevWeek: xpBetween(prevStart, prevEnd),
    domains,
    achievements: ach,
    strongest,
    needsAttention: attention,
    suggestedQuest,
    counts,
    prevCounts,
  };
}
