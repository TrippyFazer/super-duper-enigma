import { addDays, diffDays, lastNDays, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { interpolate, round } from "../scale";
import type { DomainAssessment } from "../types";

export interface RoutineInput {
  id: number;
  timeOfDay: "morning" | "evening" | string;
  steps: { id: string; name: string }[];
  active: boolean;
  createdOn?: ISODate | null;
}

export interface RoutineCompletionInput {
  routineId: number;
  date: ISODate;
  complete: boolean;
  stepsCompleted: string[];
}

export interface SkincareBaseline {
  daysPerWeek?: number | null;
}

export interface SkincareInput {
  asOf: ISODate;
  routines: RoutineInput[];
  completions: RoutineCompletionInput[];
  baseline?: SkincareBaseline | null;
  startedOn?: ISODate | null;
}

/**
 * Adherence-based (docs/ranking-research.md → Skincare). Only ~30% of women
 * and ~14% of men use sunscreen daily; adherence to dermatologic regimens
 * typically drops to ~50–60%. 80% adherence sustained is uncommon; 95% over
 * 90 days is rare.
 */
/** E <30%, D 30–49, C 50–69, B 70–84, A 85–94, S ≥95 (30-day). */
export const ADHERENCE: [number, number][] = [
  [0, 0],
  [0.3, 30],
  [0.5, 50],
  [0.7, 70],
  [0.85, 85],
  [0.95, 95],
  [1, 98],
];
const STREAK: [number, number][] = [
  [0, 10],
  [3, 30],
  [7, 52],
  [14, 70],
  [30, 86],
  [60, 95],
  [90, 98],
];

export function routineAdherence(
  routines: RoutineInput[],
  completions: RoutineCompletionInput[],
  days: ISODate[],
): { completed: number; scheduled: number; ratio: number } {
  let scheduled = 0;
  let completed = 0;
  const done = new Set(completions.filter((c) => c.complete).map((c) => `${c.routineId}:${c.date}`));
  for (const r of routines) {
    if (!r.active) continue;
    for (const d of days) {
      if (r.createdOn && d < r.createdOn) continue;
      scheduled++;
      if (done.has(`${r.id}:${d}`)) completed++;
    }
  }
  return { completed, scheduled, ratio: scheduled ? completed / scheduled : 0 };
}

/** Consecutive days (ending today or yesterday) on which every active routine was completed. */
export function routineStreak(routines: RoutineInput[], completions: RoutineCompletionInput[], asOf: ISODate): number {
  const active = routines.filter((r) => r.active);
  if (active.length === 0) return 0;
  const done = new Set(completions.filter((c) => c.complete).map((c) => `${c.routineId}:${c.date}`));
  const allDone = (d: ISODate) => active.every((r) => (r.createdOn && d < r.createdOn) || done.has(`${r.id}:${d}`));
  let streak = 0;
  let d = asOf;
  // Today doesn't break the streak if it is simply not finished yet.
  if (!allDone(d)) d = addDays(d, -1);
  while (allDone(d) && streak < 1000) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export function assessSkincare(input: SkincareInput): DomainAssessment {
  const compute = (asOf: ISODate) => computeScore(input, asOf).score;
  const has = (d: ISODate) => input.completions.some((c) => c.date <= d);
  const score7 = has(addDays(input.asOf, -7)) ? compute(addDays(input.asOf, -7)) : null;
  const score30 = has(addDays(input.asOf, -30)) ? compute(addDays(input.asOf, -30)) : null;
  return computeScore(input, input.asOf, { score7, score30 }).assessment;
}

function computeScore(
  input: SkincareInput,
  asOf: ISODate,
  previous?: { score7: number | null; score30: number | null },
): { score: number; assessment: DomainAssessment } {
  const completions = input.completions.filter((c) => c.date <= asOf);
  const first = completions.map((c) => c.date).sort()[0];
  const startedOn = [input.startedOn, first].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, asOf) + 1) : 0;
  const active = input.routines.filter((r) => r.active);

  const days30 = lastNDays(asOf, Math.min(30, Math.max(1, tenureDays)));
  const days90 = lastNDays(asOf, Math.min(90, Math.max(1, tenureDays)));
  // Today is only counted once it has been completed (don't penalize mornings).
  const todayDone = active.length > 0 && active.every((r) => completions.some((c) => c.routineId === r.id && c.date === asOf && c.complete));
  const d30 = todayDone ? days30 : days30.filter((d) => d !== asOf);
  const d90 = todayDone ? days90 : days90.filter((d) => d !== asOf);

  const a30 = routineAdherence(active, completions, d30);
  const a90 = routineAdherence(active, completions, d90);
  const streak = routineStreak(active, completions, asOf);

  const hasMorning = active.some((r) => r.timeOfDay === "morning");
  const hasEvening = active.some((r) => r.timeOfDay === "evening");
  const hasSpf = active.some((r) => r.timeOfDay === "morning" && r.steps.some((s) => /spf|sunscreen/i.test(s.name)));
  let setupScore = 20;
  if (hasMorning) setupScore += 30;
  if (hasEvening) setupScore += 30;
  if (hasSpf) setupScore += 20;

  const baselineScore = input.baseline?.daysPerWeek != null ? interpolate(ADHERENCE, input.baseline.daysPerWeek / 7) * 0.8 + 10 : null;

  const substats = [
    sub("adherence30", "30-day adherence", interpolate(ADHERENCE, a30.ratio), `${Math.round(a30.ratio * 100)}% (${a30.completed}/${a30.scheduled})`, 0.45, {
      improve: "Complete routines on 85%+ of days this month",
    }),
    sub("adherence90", "90-day adherence", interpolate(ADHERENCE, a90.ratio), `${Math.round(a90.ratio * 100)}%`, 0.3, {
      improve: "Sustain 85%+ adherence across a full quarter",
    }),
    sub("streak", "Current streak", interpolate(STREAK, streak), `${streak} day${streak === 1 ? "" : "s"}`, 0.1, {
      note: "Streaks are a small part of the score on purpose — one miss won't sink you",
      improve: "Build a 14-day streak",
    }),
    sub("setup", "Routine setup", setupScore, `${hasMorning ? "AM" : "–"} / ${hasEvening ? "PM" : "–"}${hasSpf ? " · SPF" : ""}`, 0.15, {
      improve: !hasSpf ? "Add daily SPF to your morning routine" : "Keep both morning and evening routines active",
    }),
  ];

  const explanation = [
    "Rank is driven by sustained adherence, not product count. Only about 14% of men and 30% of women use sunscreen daily.",
    `Last 30 days: ${Math.round(a30.ratio * 100)}% of routines completed, current streak ${streak}.`,
  ];

  const suggestedAction = active.length === 0 ? "Set up a morning or evening routine" : !todayDone ? "Complete today's routine" : undefined;

  const assessment = buildAssessment({
    domain: "skincare",
    substats,
    tenureDays,
    dataPoints: completions.length,
    explanation,
    baselineScore,
    previous,
    suggestedAction,
  });
  return { score: round(assessment.score, 1), assessment };
}
