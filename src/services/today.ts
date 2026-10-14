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
import { getDayFlag } from "@/services/dayFlags";
import { metricFreshness } from "@/health/freshness";
import { nutritionState, sleepState, stepsState, workoutState, type NutritionState, type SleepState, type StepsState, type RowTone } from "@/services/todayState";

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
  localHour: number;
  workout: { name: string; status: string; exercises: number; minutes: number; activeSessionId: number | null; loggedToday: { type: string; durationMin: number }[]; state: { tone: RowTone; text: string; sub: string; done: boolean } } | null;
  nutrition: { calories: number; protein: number; calorieTarget: number; proteinTarget: number; entries: number; proteinHit: boolean; finished: boolean; state: NutritionState } | null;
  steps: { value: number | null; target: number; source: string | null; automatic: boolean; state: StepsState } | null;
  sleep: { lastNightMin: number | null; targetMin: number; source: string | null; automatic: boolean; state: SleepState } | null;
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
  const now = new Date();
  const finished = getDayFlag(today, "food_finished") === "1";
  const restDay = getDayFlag(today, "rest_day") === "1";
  const plannedRemaining = plan.meals ? Math.max(0, plan.meals.count - plan.meals.eaten) : 0;
  const sleepFresh = metricFreshness({ automatic: sources.sleepAutomatic, hasValueToday: lastNightMin != null, value: lastNightMin, lastSyncAt: sources.lastSyncAt, now });
  return {
    today,
    localHour: opts.localHour,
    workout: fitness
      ? {
          name: plan.workout?.name ?? "",
          status: plan.workout?.status ?? "none",
          exercises: plan.workout?.exercises ?? 0,
          minutes: plan.workout?.minutes ?? 0,
          activeSessionId: plan.activeSession?.id ?? null,
          loggedToday: loggedWorkouts.map((w) => ({ type: w.type, durationMin: w.durationMin })),
          state: workoutState({ planned: !!plan.workout && plan.workout.status !== "completed", planName: plan.workout?.name ?? "", exercises: plan.workout?.exercises ?? 0, minutes: plan.workout?.minutes ?? 0, activeSession: !!plan.activeSession, logged: plan.workout?.status === "completed" && loggedWorkouts.length === 0 ? [{ type: plan.workout.name, durationMin: plan.workout.minutes }] : loggedWorkouts.map((w) => ({ type: w.type, durationMin: w.durationMin })), restDay, localHour: opts.localHour }),
        }
      : null,
    nutrition: cooking
      ? {
          calories: plan.totals.calories,
          protein: plan.totals.protein,
          calorieTarget: plan.targets.calories,
          proteinTarget: plan.targets.protein,
          entries: plan.meals?.eaten ?? 0,
          proteinHit: plan.totals.protein >= plan.targets.protein && plan.targets.protein > 0,
          finished,
          state: nutritionState({ calories: plan.totals.calories, protein: plan.totals.protein, calorieTarget: plan.targets.calories, proteinTarget: plan.targets.protein, finished, plannedRemaining, localHour: opts.localHour }),
        }
      : null,
    steps: fitness ? { value: stepsValue, target: profile.targets.stepsTarget, source: health.stepsSource, automatic: sources.stepsAutomatic, state: stepsState({ value: stepsValue, target: profile.targets.stepsTarget, automatic: sources.stepsAutomatic, lastSyncAt: sources.lastSyncAt, sourceLabel: sources.stepsSourceLabel, now }) } : null,
    sleep: sleep ? { lastNightMin, targetMin: profile.targets.sleepTargetMin, source: health.lastNight?.source ?? (sleepRow ? sleepRow.source : null), automatic: sources.sleepAutomatic, state: sleepState({ lastNightMin, targetMin: profile.targets.sleepTargetMin, freshness: sleepFresh, localHour: opts.localHour }) } : null,
    quests: { dailyDone: quests.daily.filter((q) => q.done).length, dailyTotal: quests.daily.length, weeklyInProgress: quests.weekly.filter((q) => !q.done && q.progress > 0).length },
    checklist: todayChecklist(profile),
    walkOffer,
    hasWalkQuest,
  };
}
