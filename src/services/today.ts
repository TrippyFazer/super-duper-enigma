import type { ProfileView } from "@/services/profile";
import { loadHabitCompletions, loadHabits, loadRoutineCompletions, loadRoutines, loadWorkouts } from "@/services/loaders";
import { computeHabitStats } from "@/ranking/domains/habits";
import { dateInTz } from "@/lib/dates";
import { todayPlanSummary } from "@/services/planner";
import { todayHealthSnapshot } from "@/health/apple";
import { healthSources } from "@/health/sources";
import { getQuests } from "@/services/progression";
import { listOffers } from "@/services/questOffers";
import { loadSleep } from "@/services/loaders";

export interface ChecklistItem {
  id: string; // "routine:1" | "habit:3"
  kind: "routine" | "habit";
  refId: number;
  label: string;
  sub?: string;
  done: boolean;
  timeOfDay?: "morning" | "evening";
  icon?: string | null;
}

/** Routines and habits due today, with completion state. Shared by Home and the + LOG sheet. */
export function todayChecklist(profile: ProfileView): ChecklistItem[] {
  const today = profile.today;
  const routines = loadRoutines().filter((r) => r.active);
  const rc = loadRoutineCompletions(today);
  const habits = loadHabits();
  const hc = loadHabitCompletions(today);
  const hstats = computeHabitStats(
    habits.map((h) => ({ id: h.id, name: h.name, scheduleType: h.scheduleType, weekdays: h.weekdaysParsed, timesPerWeek: h.timesPerWeek, active: h.active, createdOn: dateInTz(new Date(h.createdAt), profile.timezone) })),
    hc.map((c) => ({ habitId: c.habitId, date: c.date })),
    today,
  );
  return [
    ...routines.map<ChecklistItem>((r) => ({ id: `routine:${r.id}`, kind: "routine", refId: r.id, label: r.name, sub: r.timeOfDay === "morning" ? "Morning routine" : "Evening routine", done: rc.some((c) => c.routineId === r.id && c.date === today && c.complete), timeOfDay: r.timeOfDay as "morning" | "evening" })),
    ...hstats
      .filter((s) => s.dueToday || s.doneToday)
      .map<ChecklistItem>((s) => {
        const h = habits.find((x) => x.id === s.habitId)!;
        return { id: `habit:${s.habitId}`, kind: "habit", refId: s.habitId, label: h.name, sub: h.scheduleType === "times_per_week" ? `${s.thisWeekDone}/${h.timesPerWeek} this week` : s.streak > 0 ? `${s.streak}-day streak` : undefined, done: s.doneToday, icon: h.icon };
      }),
  ];
}

export interface TodaySummary {
  today: string;
  workout: { name: string; status: string; exercises: number; minutes: number; activeSessionId: number | null; loggedToday: { type: string; durationMin: number }[] } | null;
  nutrition: { calories: number; protein: number; calorieTarget: number; proteinTarget: number; entries: number; proteinHit: boolean } | null;
  steps: { value: number | null; target: number; source: string | null; automatic: boolean } | null;
  sleep: { lastNightMin: number | null; targetMin: number; source: string | null; automatic: boolean } | null;
  quests: { dailyDone: number; dailyTotal: number; weeklyInProgress: number };
  checklist: ChecklistItem[];
  walkOffer: { remaining: number; xp: number } | null;
  hasWalkQuest: boolean;
}

/** Everything the consolidated TODAY card shows. Only real, logged data — plans never count. */
export function todaySummary(profile: ProfileView, opts: { localHour: number }): TodaySummary {
  const today = profile.today;
  const plan = todayPlanSummary(profile);
  const health = todayHealthSnapshot();
  const sources = healthSources();
  const quests = getQuests(today);
  const loggedWorkouts = loadWorkouts(today).filter((w) => w.date === today);
  const sleepRow = loadSleep(today).find((e) => e.date === today) ?? null;
  const lastNightMin = health.lastNight?.totalSleepMin ?? sleepRow?.totalSleepMin ?? null;
  const stepsValue = health.steps;
  const stepsRemaining = stepsValue != null ? Math.max(0, profile.targets.stepsTarget - stepsValue) : 0;
  const walkOffer = stepsValue != null && opts.localHour >= 16 && opts.localHour < 22 && stepsRemaining > 0 && stepsRemaining <= 4000 ? { remaining: stepsRemaining, xp: stepsRemaining >= 2500 ? 40 : 25 } : null;
  const hasWalkQuest = listOffers({ statuses: ["accepted", "offered", "completed"], limit: 5 }).some((o) => o.templateKey === "steps-finish" && o.date === today);
  const fitness = profile.activeDomains.includes("fitness");
  const cooking = profile.activeDomains.includes("cooking");
  const sleep = profile.activeDomains.includes("sleep");
  return {
    today,
    workout: fitness
      ? {
          name: plan.workout?.name ?? "",
          status: plan.workout?.status ?? "none",
          exercises: plan.workout?.exercises ?? 0,
          minutes: plan.workout?.minutes ?? 0,
          activeSessionId: plan.activeSession?.id ?? null,
          loggedToday: loggedWorkouts.map((w) => ({ type: w.type, durationMin: w.durationMin })),
        }
      : null,
    nutrition: cooking
      ? { calories: plan.totals.calories, protein: plan.totals.protein, calorieTarget: plan.targets.calories, proteinTarget: plan.targets.protein, entries: plan.meals?.eaten ?? 0, proteinHit: plan.totals.protein >= plan.targets.protein && plan.targets.protein > 0 }
      : null,
    steps: fitness ? { value: stepsValue, target: profile.targets.stepsTarget, source: health.stepsSource, automatic: sources.stepsAutomatic } : null,
    sleep: sleep ? { lastNightMin, targetMin: profile.targets.sleepTargetMin, source: health.lastNight?.source ?? (sleepRow ? sleepRow.source : null), automatic: sources.sleepAutomatic } : null,
    quests: { dailyDone: quests.daily.filter((q) => q.done).length, dailyTotal: quests.daily.length, weeklyInProgress: quests.weekly.filter((q) => !q.done && q.progress > 0).length },
    checklist: todayChecklist(profile),
    walkOffer,
    hasWalkQuest,
  };
}
