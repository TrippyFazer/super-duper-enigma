import { addDays, diffDays, lastNDays, startOfWeek, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { interpolate, mean, round } from "../scale";
import type { DomainAssessment } from "../types";

export interface WorkoutInput {
  date: ISODate;
  type: string; // strength | cardio | mobility | sport | walk | other
  durationMin: number;
  intensity: number; // 1-3
}

export interface ActivityInput {
  date: ISODate;
  steps: number | null;
  activeMinutes?: number | null;
}

export interface FitnessBaseline {
  workoutsPerWeek?: number | null;
  exerciseTypes?: string[] | null; // ["strength","cardio"]
  stepsPerDay?: number | null;
}

export interface FitnessInput {
  asOf: ISODate;
  workouts: WorkoutInput[];
  activity: ActivityInput[];
  baseline?: FitnessBaseline | null;
  /** Date the user started tracking this domain (onboarding or first log). */
  startedOn?: ISODate | null;
  stepsTarget?: number | null;
  /** From tracked sessions: PRs and improving lifts in the last 60 days (null when no session data). */
  strength?: { prs60: number; trackedLifts: number; improvingLifts: number } | null;
}

/**
 * Anchors (see docs/ranking-research.md → Fitness).
 *
 * Sessions/week: ~1/4 of US adults do no leisure-time activity, ~half meet the
 * 150-minute aerobic guideline, ~1/4 meet both aerobic + strength guidelines.
 * 3 sessions/week ≈ median-plus, 5+ with strength+cardio ≈ top decile when
 * sustained.
 */
const SESSIONS_PER_WEEK: [number, number][] = [
  [0, 4],
  [1, 22],
  [2, 38],
  [3, 55],
  [4, 68],
  [5, 80],
  [6, 90],
  [7, 90], // no extra credit for 7/7 — recovery matters
];
/** Moderate-equivalent minutes per week (vigorous counts double). 150 = guideline (47% meet); 300+ = "additional benefits" tier. */
const MET_MINUTES_PER_WEEK: [number, number][] = [
  [0, 2],
  [60, 22],
  [150, 50],
  [225, 66],
  [300, 78],
  [450, 88],
  [600, 94],
  [800, 97],
];
/** 2 days = guideline (31% meet). */
const STRENGTH_DAYS_PER_WEEK: [number, number][] = [
  [0, 8],
  [1, 36],
  [2, 62],
  [3, 80],
  [4, 92],
  [5, 96],
];
/** Cardio minutes/week incl. partial credit for walking above 6,000 steps/day. */
const CARDIO_MINUTES_PER_WEEK: [number, number][] = [
  [0, 8],
  [50, 32],
  [100, 50],
  [150, 64],
  [225, 80],
  [300, 90],
  [420, 96],
];
/** Steps/day (Tudor-Locke categories; US adult mean ≈ 4,800–5,100). */
const STEPS_PER_DAY: [number, number][] = [
  [2000, 3],
  [4000, 20],
  [5000, 32],
  [7500, 55],
  [10000, 75],
  [12500, 90],
  [15000, 97],
];
/** % of weeks (last 12) with ≥ 3 sessions. */
const ACTIVE_WEEK_RATIO: [number, number][] = [
  [0, 5],
  [0.25, 25],
  [0.5, 45],
  [0.67, 60],
  [0.8, 74],
  [0.92, 88],
  [1, 97],
];

function metMinutes(w: WorkoutInput): number {
  const factor = w.intensity >= 3 ? 2 : w.intensity === 2 ? 1 : 0.75;
  return w.durationMin * factor;
}

function isStrength(w: WorkoutInput) {
  return w.type === "strength";
}
function isCardio(w: WorkoutInput) {
  return w.type === "cardio" || w.type === "sport" || w.type === "walk";
}

/** Hard-capped so logging 3 "workouts" in one day counts as (at most) 2 sessions. */
function sessionsPerWeek(ws: WorkoutInput[], days: number): number {
  const byDay = new Map<string, number>();
  for (const w of ws) byDay.set(w.date, Math.min(2, (byDay.get(w.date) ?? 0) + 1));
  const total = [...byDay.values()].reduce((a, b) => a + b, 0);
  return (total / days) * 7;
}

export function assessFitness(input: FitnessInput): DomainAssessment {
  const compute = (asOf: ISODate) => computeScore(input, asOf).score;
  const score7 = hasDataBefore(input, addDays(input.asOf, -7)) ? compute(addDays(input.asOf, -7)) : null;
  const score30 = hasDataBefore(input, addDays(input.asOf, -30)) ? compute(addDays(input.asOf, -30)) : null;
  return computeScore(input, input.asOf, { score7, score30 }).assessment;
}

function hasDataBefore(input: FitnessInput, date: ISODate) {
  return input.workouts.some((w) => w.date <= date) || input.activity.some((a) => a.date <= date);
}

function computeScore(
  input: FitnessInput,
  asOf: ISODate,
  previous?: { score7: number | null; score30: number | null },
): { score: number; assessment: DomainAssessment } {
  const workouts = input.workouts.filter((w) => w.date <= asOf);
  const activity = input.activity.filter((a) => a.date <= asOf && a.steps != null);

  const firstLog = [...workouts.map((w) => w.date), ...activity.map((a) => a.date)].sort()[0];
  const startedOn = [input.startedOn, firstLog].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, asOf) + 1) : 0;
  const dataPoints = workouts.length + activity.length;

  const window30 = lastNDays(asOf, 30);
  const window90 = lastNDays(asOf, 90);
  const w30 = workouts.filter((w) => w.date >= window30[0]);
  const w90 = workouts.filter((w) => w.date >= window90[0]);
  const days30 = Math.min(30, Math.max(7, tenureDays));
  const days90 = Math.min(90, Math.max(7, tenureDays));

  // --- Frequency -----------------------------------------------------------
  const spw30 = sessionsPerWeek(w30, days30);
  const spw90 = sessionsPerWeek(w90, days90);
  const spw = tenureDays >= 60 ? spw30 * 0.6 + spw90 * 0.4 : spw30;
  const met30 = (w30.reduce((a, w) => a + metMinutes(w), 0) / days30) * 7;
  const frequencyScore = interpolate(SESSIONS_PER_WEEK, spw) * 0.6 + interpolate(MET_MINUTES_PER_WEEK, met30) * 0.4;

  // --- Activity (steps) ----------------------------------------------------
  const a30 = activity.filter((a) => a.date >= window30[0]);
  const avgSteps = a30.length ? mean(a30.map((a) => a.steps as number)) : null;
  const activityScore = avgSteps != null ? interpolate(STEPS_PER_DAY, avgSteps) : 0;

  // --- Strength / Endurance -----------------------------------------------
  const strengthDays = (new Set(w30.filter(isStrength).map((w) => w.date)).size / days30) * 7;
  const cardioSessionMin = (w30.filter(isCardio).reduce((a, w) => a + w.durationMin, 0) / days30) * 7;
  // Walking is aerobic activity too: ~100 steps ≈ 1 minute. Credit 30% of steps above 6,000/day.
  const walkingCredit = avgSteps != null ? Math.max(0, ((avgSteps - 6000) / 100) * 7 * 0.3) : 0;
  const cardioMin = cardioSessionMin + walkingCredit;
  const strengthScore = interpolate(STRENGTH_DAYS_PER_WEEK, strengthDays);
  const enduranceScore = interpolate(CARDIO_MINUTES_PER_WEEK, cardioMin);

  // --- Consistency: active weeks over the last 12 ------------------------
  const weeksAvailable = Math.max(1, Math.min(12, Math.ceil(tenureDays / 7)));
  const weekStarts: ISODate[] = [];
  let ws = startOfWeek(asOf);
  for (let i = 0; i < weeksAvailable; i++) {
    weekStarts.push(ws);
    ws = addDays(ws, -7);
  }
  const sessionsByWeek = weekStarts.map((start) => {
    const end = addDays(start, 6);
    const days = new Set(workouts.filter((w) => w.date >= start && w.date <= end).map((w) => w.date));
    return days.size;
  });
  // Current (partial) week counts as active if on pace (≥1 session so far) to avoid punishing Mondays.
  const activeWeeks = sessionsByWeek.filter((n, i) => (i === 0 ? n >= 1 : n >= 3)).length;
  const partialWeeks = sessionsByWeek.filter((n, i) => i !== 0 && n > 0 && n < 3).length;
  const activeRatio = (activeWeeks + partialWeeks * 0.4) / weeksAvailable;
  const consistencyScore = interpolate(ACTIVE_WEEK_RATIO, activeRatio);

  // --- Recovery: rest days & no excessive hard streaks ---------------------
  const last14 = lastNDays(asOf, 14);
  const trainedDays = new Set(workouts.filter((w) => w.date >= last14[0]).map((w) => w.date));
  const hardDays = new Set(workouts.filter((w) => w.date >= last14[0] && w.intensity >= 3).map((w) => w.date));
  let longestStreak = 0;
  let cur = 0;
  for (const d of last14) {
    cur = trainedDays.has(d) ? cur + 1 : 0;
    longestStreak = Math.max(longestStreak, cur);
  }
  const restDays = 14 - trainedDays.size;
  let recoveryScore = 100;
  if (longestStreak >= 10) recoveryScore -= 35;
  else if (longestStreak >= 7) recoveryScore -= 15;
  if (restDays < 2) recoveryScore -= 30;
  if (hardDays.size > 8) recoveryScore -= 20;
  if (trainedDays.size === 0) recoveryScore = 70; // nothing to recover from; neutral-ish

  // --- Baseline (onboarding) ----------------------------------------------
  let baselineScore: number | null = null;
  if (input.baseline?.workoutsPerWeek != null) {
    const b = input.baseline;
    const types = b.exerciseTypes ?? [];
    const bFreq = interpolate(SESSIONS_PER_WEEK, b.workoutsPerWeek ?? 0);
    const bStrength = types.includes("strength") ? interpolate(STRENGTH_DAYS_PER_WEEK, Math.min(3, (b.workoutsPerWeek ?? 0) / 2)) : 15;
    const bCardio = types.includes("cardio") ? interpolate(CARDIO_MINUTES_PER_WEEK, Math.min(200, (b.workoutsPerWeek ?? 0) * 35)) : 15;
    const bSteps = b.stepsPerDay ? interpolate(STEPS_PER_DAY, b.stepsPerDay) : bFreq;
    baselineScore = bFreq * 0.45 + bStrength * 0.2 + bCardio * 0.2 + bSteps * 0.15;
  }

  // Strength progress: only when sets are tracked. Rewards improving lifts, never a single max.
  const sp = input.strength;
  const progressAvailable = !!sp && sp.trackedLifts >= 2;
  const progressScore = progressAvailable ? Math.min(100, 35 + Math.min(4, sp!.improvingLifts) * 12 + Math.min(6, sp!.prs60) * 3) : 0;

  const stepsTarget = input.stepsTarget ?? 7500;
  const substats = [
    sub("consistency", "Consistency", consistencyScore, `${activeWeeks}/${weeksAvailable} active weeks`, 0.3, {
      note: "Weeks with 3+ training days in the last 12",
      improve: "Train 3+ days in more weeks — consistency outweighs single big weeks",
    }),
    sub("frequency", "Frequency", frequencyScore, `${round(spw, 1)} sessions/wk · ${Math.round(met30)} active min`, progressAvailable ? 0.275 : 0.3, {
      note: "30-day average (90-day blended in after 60 days)",
      improve: spw < 4 ? "Average 4+ sessions a week" : "Push weekly active minutes past 300",
    }),
    sub("strength", "Strength", strengthScore, `${round(strengthDays, 1)} strength days/wk`, progressAvailable ? 0.1 : 0.125, {
      improve: "Lift or do resistance training on 2–3 days a week",
    }),
    sub("progress", "Strength progress", progressScore, progressAvailable ? `${sp!.improvingLifts} lifts improving · ${sp!.prs60} PRs (60d)` : "track sets to unlock", 0.075, {
      available: progressAvailable,
      note: "Progressive overload across tracked lifts (estimated 1RM trend)",
      improve: "Add a rep or a little weight on your main lifts over the next few weeks",
    }),
    sub("endurance", "Endurance", enduranceScore, `${Math.round(cardioSessionMin)} cardio min/wk${walkingCredit > 0 ? " + walking" : ""}`, progressAvailable ? 0.1 : 0.125, {
      improve: "Build to 150+ minutes of cardio a week",
    }),
    sub("activity", "Activity", activityScore, avgSteps != null ? `${Math.round(avgSteps).toLocaleString()} steps/day` : "no step data", 0.1, {
      available: avgSteps != null,
      improve: `Average ${stepsTarget.toLocaleString()}+ steps a day`,
    }),
    sub("recovery", "Recovery", recoveryScore, `${restDays} rest days / 14`, 0.05, {
      note: "Rest days and no 7+ day training streaks",
      improve: "Take at least 1–2 rest days a week",
    }),
  ];

  const explanation: string[] = [];
  if (w30.length) {
    explanation.push(
      `Last 30 days: ${round(spw30, 1)} sessions/week, ${round(strengthDays, 1)} strength days, ${Math.round(cardioSessionMin)} min cardio.`,
    );
  }
  explanation.push(
    "Roughly half of adults meet the aerobic guideline and about a quarter meet both aerobic and strength guidelines — meeting both consistently is where B rank begins.",
  );

  let suggestedAction: string | undefined;
  if (!trainedDays.has(asOf)) {
    const thisWeek = sessionsByWeek[0] ?? 0;
    suggestedAction = thisWeek < 3 ? `Log a workout — ${3 - thisWeek} more this week to keep it an active week` : undefined;
  }

  const assessment = buildAssessment({
    domain: "fitness",
    substats,
    tenureDays,
    dataPoints,
    explanation,
    percentile: undefined,
    baselineScore,
    previous,
    suggestedAction,
  });
  return { score: assessment.score, assessment };
}
