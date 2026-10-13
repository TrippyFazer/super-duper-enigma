import { addDays, diffDays, lastNDays, startOfWeek, weekday, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { interpolate, mean, round } from "../scale";
import type { DomainAssessment } from "../types";

export interface HabitInput {
  id: number;
  name: string;
  scheduleType: "daily" | "weekdays" | "times_per_week" | string;
  weekdays: number[]; // 0..6
  timesPerWeek: number;
  active: boolean;
  createdOn: ISODate;
}

export interface HabitCompletionInput {
  habitId: number;
  date: ISODate;
}

export interface HabitsInput {
  asOf: ISODate;
  habits: HabitInput[];
  completions: HabitCompletionInput[];
  startedOn?: ISODate | null;
}

/**
 * Adherence → score (docs/ranking-research.md → Habits).
 * ~55% of resolvers maintain at 1 month; <50% of trial participants still
 * self-monitor at week 10; Lally: one miss is fine, chronic inconsistency is
 * not. E <40%, D 40–59, C 60–74, B 75–89, A 90–96, S ≥97.
 */
export const HABIT_ADHERENCE: [number, number][] = [
  [0, 0],
  [0.2, 12],
  [0.4, 30],
  [0.6, 50],
  [0.75, 70],
  [0.9, 85],
  [0.97, 95],
  [1, 98],
];
const HABIT_COUNT: [number, number][] = [
  [0, 0],
  [1, 50],
  [2, 70],
  [3, 86],
  [4, 93],
  [6, 98],
];

export interface HabitStats {
  habitId: number;
  name: string;
  scheduled30: number;
  completed30: number;
  adherence30: number;
  scheduled90: number;
  completed90: number;
  adherence90: number;
  streak: number;
  dueToday: boolean;
  doneToday: boolean;
  thisWeekDone: number;
  thisWeekTarget: number;
}

export function isScheduled(h: HabitInput, date: ISODate): boolean {
  if (date < h.createdOn) return false;
  if (h.scheduleType === "daily") return true;
  if (h.scheduleType === "weekdays") return h.weekdays.includes(weekday(date));
  // times_per_week: scheduled on any day; measured per week.
  return true;
}

/** Adherence over a window. For times_per_week habits we count weeks' targets. */
export function habitAdherence(
  h: HabitInput,
  completions: Set<string>,
  days: ISODate[],
): { scheduled: number; completed: number } {
  if (days.length === 0) return { scheduled: 0, completed: 0 };
  if (h.scheduleType === "times_per_week") {
    // Group by week; target per week = timesPerWeek scaled for partial weeks.
    const byWeek = new Map<string, ISODate[]>();
    for (const d of days) {
      if (d < h.createdOn) continue;
      const w = startOfWeek(d);
      byWeek.set(w, [...(byWeek.get(w) ?? []), d]);
    }
    let scheduled = 0;
    let completed = 0;
    for (const [, ds] of byWeek) {
      const target = Math.max(1, Math.round((h.timesPerWeek * ds.length) / 7));
      const done = ds.filter((d) => completions.has(`${h.id}:${d}`)).length;
      scheduled += target;
      completed += Math.min(target, done);
    }
    return { scheduled, completed };
  }
  let scheduled = 0;
  let completed = 0;
  for (const d of days) {
    if (!isScheduled(h, d)) continue;
    scheduled++;
    if (completions.has(`${h.id}:${d}`)) completed++;
  }
  return { scheduled, completed };
}

export function habitStreak(h: HabitInput, completions: Set<string>, asOf: ISODate): number {
  let streak = 0;
  let d = asOf;
  // Today only counts if done; otherwise start from yesterday.
  if (!completions.has(`${h.id}:${d}`)) d = addDays(d, -1);
  for (let i = 0; i < 1000; i++) {
    if (d < h.createdOn) break;
    if (h.scheduleType === "times_per_week") {
      // streak counted in weeks meeting target
      const ws = startOfWeek(d);
      const we = addDays(ws, 6);
      let done = 0;
      for (let x = ws; x <= we; x = addDays(x, 1)) if (completions.has(`${h.id}:${x}`)) done++;
      if (done >= h.timesPerWeek || (ws === startOfWeek(asOf) && done > 0)) {
        streak += 7;
        d = addDays(ws, -1);
        continue;
      }
      break;
    }
    if (!isScheduled(h, d)) {
      d = addDays(d, -1);
      continue;
    }
    if (completions.has(`${h.id}:${d}`)) {
      streak++;
      d = addDays(d, -1);
    } else break;
  }
  return streak;
}

export function computeHabitStats(habits: HabitInput[], completions: HabitCompletionInput[], asOf: ISODate): HabitStats[] {
  const done = new Set(completions.filter((c) => c.date <= asOf).map((c) => `${c.habitId}:${c.date}`));
  return habits.map((h) => {
    const tenure = Math.max(1, diffDays(h.createdOn, asOf) + 1);
    // Exclude today unless done, so an unfinished morning isn't a miss.
    const doneToday = done.has(`${h.id}:${asOf}`);
    const d30 = lastNDays(asOf, Math.min(30, tenure)).filter((d) => doneToday || d !== asOf);
    const d90 = lastNDays(asOf, Math.min(90, tenure)).filter((d) => doneToday || d !== asOf);
    const a30 = habitAdherence(h, done, d30);
    const a90 = habitAdherence(h, done, d90);
    const ws = startOfWeek(asOf);
    let thisWeekDone = 0;
    for (let x = ws; x <= asOf; x = addDays(x, 1)) if (done.has(`${h.id}:${x}`)) thisWeekDone++;
    const thisWeekTarget =
      h.scheduleType === "daily" ? 7 : h.scheduleType === "weekdays" ? h.weekdays.length : h.timesPerWeek;
    const dueToday =
      h.scheduleType === "times_per_week" ? thisWeekDone < h.timesPerWeek : isScheduled(h, asOf);
    return {
      habitId: h.id,
      name: h.name,
      scheduled30: a30.scheduled,
      completed30: a30.completed,
      adherence30: a30.scheduled ? a30.completed / a30.scheduled : 0,
      scheduled90: a90.scheduled,
      completed90: a90.completed,
      adherence90: a90.scheduled ? a90.completed / a90.scheduled : 0,
      streak: habitStreak(h, done, asOf),
      dueToday,
      doneToday,
      thisWeekDone,
      thisWeekTarget,
    };
  });
}

export function assessHabits(input: HabitsInput): DomainAssessment {
  const compute = (asOf: ISODate) => computeScore(input, asOf).score;
  const has = (d: ISODate) => input.completions.some((c) => c.date <= d);
  const score7 = has(addDays(input.asOf, -7)) ? compute(addDays(input.asOf, -7)) : null;
  const score30 = has(addDays(input.asOf, -30)) ? compute(addDays(input.asOf, -30)) : null;
  return computeScore(input, input.asOf, { score7, score30 }).assessment;
}

function computeScore(
  input: HabitsInput,
  asOf: ISODate,
  previous?: { score7: number | null; score30: number | null },
): { score: number; assessment: DomainAssessment } {
  const habits = input.habits.filter((h) => h.active && h.createdOn <= asOf);
  const completions = input.completions.filter((c) => c.date <= asOf);
  const first = [...habits.map((h) => h.createdOn), ...completions.map((c) => c.date)].sort()[0];
  const startedOn = [input.startedOn, first].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, asOf) + 1) : 0;

  const stats = computeHabitStats(habits, completions, asOf);
  const withData = stats.filter((s) => s.scheduled30 > 0);
  const adh30 = withData.length ? mean(withData.map((s) => s.adherence30)) : 0;
  const adh90 = withData.length ? mean(withData.map((s) => s.adherence90)) : 0;
  const sustained = stats.filter((s) => s.scheduled30 >= 10 && s.adherence30 >= 0.7).length;
  const bestStreak = stats.length ? Math.max(...stats.map((s) => s.streak)) : 0;

  const STREAK: [number, number][] = [
    [0, 10],
    [7, 40],
    [21, 60],
    [66, 85],
    [90, 92],
    [180, 98],
  ];

  const substats = [
    sub("adherence30", "30-day adherence", interpolate(HABIT_ADHERENCE, adh30), `${Math.round(adh30 * 100)}%`, 0.45, {
      note: "Average across your active habits (today excluded until done)",
      improve: "Complete scheduled habits on 75%+ of days this month",
    }),
    sub("adherence90", "90-day adherence", interpolate(HABIT_ADHERENCE, adh90), `${Math.round(adh90 * 100)}%`, 0.3, {
      improve: "Hold 80%+ adherence across a full quarter",
    }),
    sub("breadth", "Habits sustained", interpolate(HABIT_COUNT, sustained), `${sustained} habit${sustained === 1 ? "" : "s"} at 70%+`, 0.15, {
      improve: "Get 3+ habits each above 70% adherence",
    }),
    sub("streak", "Best streak", interpolate(STREAK, bestStreak), `${bestStreak} day${bestStreak === 1 ? "" : "s"}`, 0.1, {
      note: "A small share of the score on purpose — a miss never resets your rank",
      improve: "Build a 21-day streak on one habit",
    }),
  ];

  const explanation = [
    "Discipline is adherence over time: the share of scheduled habit-days you actually completed, averaged across habits.",
    "About 55% of people keep a new resolution at one month and under half still track at week ten. 75%+ over 90 days is uncommon; 95% is rare.",
  ];
  if (withData.length) explanation.push(`30-day adherence ${Math.round(adh30 * 100)}%, 90-day ${Math.round(adh90 * 100)}%, ${sustained} habit(s) above 70%.`);

  const due = stats.filter((s) => s.dueToday && !s.doneToday);
  const suggestedAction = habits.length === 0 ? "Add your first habit" : due.length ? `${due.length} habit${due.length === 1 ? "" : "s"} due today — tap to complete` : undefined;

  const assessment = buildAssessment({
    domain: "habits",
    substats,
    tenureDays,
    dataPoints: completions.length,
    explanation,
    previous,
    suggestedAction,
  });
  return { score: round(assessment.score, 1), assessment };
}
