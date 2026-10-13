import { addDays, dateInTz, diffDays, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { interpolate, mean, round } from "../scale";
import type { DomainAssessment } from "../types";
import { SOBRIETY_MILESTONES } from "../xp";

export interface SobrietyRunInput {
  startedAt: string; // ISO timestamp
  endedAt: string | null;
}

export interface SobrietyTrackerInput {
  id: number;
  name: string;
  category: string;
  active: boolean;
  runs: SobrietyRunInput[];
}

export interface SobrietyInput {
  asOf: ISODate;
  now: Date;
  timezone: string;
  trackers: SobrietyTrackerInput[];
  startedOn?: ISODate | null;
}

/**
 * Streak days → score (docs/ranking-research.md → Sobriety).
 * Most quit attempts end within 8 days; a 30-day streak is completed by
 * ~50–70% of committed attempters; only ~3–9% of smoking quit attempts reach
 * 6–12 months; after a year annual relapse risk falls to ~2–15%.
 */
export const STREAK_DAYS: [number, number][] = [
  [0, 4],
  [1, 10],
  [3, 16],
  [7, 28],
  [14, 38],
  [30, 50],
  [60, 60],
  [90, 70],
  [180, 85],
  [365, 95],
  [730, 98],
];
/** Fraction of the last 90 days clean → score. */
const CLEAN_RATIO_90: [number, number][] = [
  [0, 0],
  [0.3, 15],
  [0.5, 30],
  [0.7, 48],
  [0.85, 65],
  [0.95, 82],
  [0.99, 92],
  [1, 100],
];

export interface TrackerStats {
  trackerId: number;
  name: string;
  category: string;
  currentRunStart: string | null;
  currentDays: number;
  currentMs: number;
  longestDays: number;
  totalCleanDays: number;
  cleanDays90: number;
  resets90: number;
  resetsTotal: number;
  nextMilestone: { days: number; label: string; xp: number } | null;
  lastMilestone: { days: number; label: string; xp: number } | null;
  score: number;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

export function trackerStats(t: SobrietyTrackerInput, now: Date, asOf: ISODate, timezone: string): TrackerStats {
  const runs = [...t.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const current = runs.find((r) => r.endedAt == null) ?? null;
  const currentStart = current ? new Date(current.startedAt) : null;
  const currentMs = currentStart ? Math.max(0, now.getTime() - currentStart.getTime()) : 0;
  const currentDays = Math.floor(currentMs / 86_400_000);

  let longest = 0;
  let total = 0;
  for (const r of runs) {
    const end = r.endedAt ? new Date(r.endedAt) : now;
    const d = daysBetween(new Date(r.startedAt), end);
    longest = Math.max(longest, d);
    total += d;
  }

  // Clean days in the last 90 calendar days: a day counts if fully inside a run.
  const windowStart = addDays(asOf, -89);
  let clean90 = 0;
  for (let i = 0; i < 90; i++) {
    const day = addDays(windowStart, i);
    if (day > asOf) break;
    const inRun = runs.some((r) => {
      const startDay = dateInTz(new Date(r.startedAt), timezone);
      const endDay = r.endedAt ? dateInTz(new Date(r.endedAt), timezone) : null;
      return startDay < day && (endDay == null || endDay > day);
    });
    if (inRun) clean90++;
  }
  const resets90 = runs.filter((r) => r.endedAt && dateInTz(new Date(r.endedAt), timezone) >= windowStart).length;
  const resetsTotal = runs.filter((r) => r.endedAt).length;

  const nextMilestone = SOBRIETY_MILESTONES.find((m) => m.days > currentDays) ?? null;
  const lastMilestone = [...SOBRIETY_MILESTONES].reverse().find((m) => m.days <= currentDays) ?? null;

  const streakScore = interpolate(STREAK_DAYS, currentDays);
  const ratioScore = interpolate(CLEAN_RATIO_90, clean90 / 90);
  const resilience = Math.max(0, 100 - resets90 * 25);
  const score = streakScore * 0.5 + ratioScore * 0.35 + resilience * 0.15;

  return {
    trackerId: t.id,
    name: t.name,
    category: t.category,
    currentRunStart: current?.startedAt ?? null,
    currentDays,
    currentMs,
    longestDays: Math.floor(longest),
    totalCleanDays: Math.floor(total),
    cleanDays90: clean90,
    resets90,
    resetsTotal,
    nextMilestone,
    lastMilestone,
    score: round(score, 1),
  };
}

export function assessSobriety(input: SobrietyInput): DomainAssessment {
  const active = input.trackers.filter((t) => t.active);
  const stats = active.map((t) => trackerStats(t, input.now, input.asOf, input.timezone));
  const allRuns = active.flatMap((t) => t.runs);
  const firstStart = allRuns.map((r) => dateInTz(new Date(r.startedAt), input.timezone)).sort()[0];
  const startedOn = [input.startedOn, firstStart].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, input.asOf) + 1) : 0;

  const previous = {
    score7: tenureDays > 7 ? computeAt(input, -7) : null,
    score30: tenureDays > 30 ? computeAt(input, -30) : null,
  };

  const substats = stats.map((s) =>
    sub(`tracker-${s.trackerId}`, s.name, s.score, `${s.currentDays} day${s.currentDays === 1 ? "" : "s"} · best ${s.longestDays}`, 1, {
      note: `${s.cleanDays90}/90 clean days`,
      improve:
        s.nextMilestone
          ? `${s.name}: reach ${s.nextMilestone.label} (${s.nextMilestone.days - s.currentDays} days to go)`
          : `${s.name}: keep going`,
    }),
  );

  const explanation = [
    "Rank is built from your current run (50%), clean days in the last 90 (35%) and resilience (15%). A reset lowers the score; it never erases it.",
    "Most quit attempts end within the first week. 30 days puts you ahead of most casual attempts; a year is rare.",
  ];
  const longest = stats.length ? Math.max(...stats.map((s) => s.longestDays)) : 0;
  if (stats.length) explanation.push(`Average clean days (90d): ${Math.round(mean(stats.map((s) => s.cleanDays90)))}. Longest run: ${longest} days.`);

  const next = stats.filter((s) => s.nextMilestone).sort((a, b) => a.nextMilestone!.days - a.currentDays - (b.nextMilestone!.days - b.currentDays))[0];
  const suggestedAction = next ? `${next.name}: ${next.nextMilestone!.days - next.currentDays} days to ${next.nextMilestone!.label}` : undefined;

  return buildAssessment({
    domain: "sobriety",
    substats,
    tenureDays,
    dataPoints: allRuns.length,
    explanation,
    previous,
    suggestedAction,
  });
}

function computeAt(input: SobrietyInput, offsetDays: number): number {
  const asOf = addDays(input.asOf, offsetDays);
  const now = new Date(input.now.getTime() + offsetDays * 86_400_000);
  const trackers = input.trackers
    .filter((t) => t.active)
    .map((t) => ({
      ...t,
      runs: t.runs
        .filter((r) => new Date(r.startedAt) <= now)
        .map((r) => ({ ...r, endedAt: r.endedAt && new Date(r.endedAt) > now ? null : r.endedAt })),
    }));
  const stats = trackers.map((t) => trackerStats(t, now, asOf, input.timezone));
  const substats = stats.map((s) => sub(`t${s.trackerId}`, s.name, s.score, "", 1));
  const tenure = Math.max(0, input.startedOn ? diffDays(input.startedOn, asOf) + 1 : 0);
  return buildAssessment({ domain: "sobriety", substats, tenureDays: tenure, dataPoints: stats.length }).score;
}
