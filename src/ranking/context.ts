import type { ISODate } from "@/lib/dates";
import type { TrackerStats } from "./domains/sobriety";
import type { CharacterAssessment, DomainId, Rank } from "./types";

/**
 * Everything quests and achievements need to evaluate themselves, pre-aggregated
 * by the service layer. Keeping this a plain object makes both systems unit
 * testable without a database.
 */
export interface ProgressionContext {
  today: ISODate;
  weekStart: ISODate;
  weekEnd: ISODate;
  activeDomains: DomainId[];
  assessment: CharacterAssessment;
  /** Best historical rank per domain (and 'overall'), for rank-up detection. */
  bestRanks: Partial<Record<DomainId | "overall", Rank>>;
  fitness: {
    workoutsToday: number;
    sessionsThisWeek: number;
    avgSessionsLast4Weeks: number;
    totalWorkouts: number;
    stepsToday: number | null;
    stepsTarget: number;
    hasStepData: boolean;
    avgSteps30: number | null;
    daysAtStepTarget30: number;
    activeWeekStreak: number;
  };
  sleep: {
    loggedToday: boolean;
    nightsThisWeekAtTarget: number;
    avg30: number | null;
    logs30: number;
    totalLogs: number;
    hasOura: boolean;
    sleepTargetMin: number;
    bedtimeTarget: string | null;
    inBedByTargetLastNight: boolean | null;
    earlyWakes30: number;
  };
  cooking: {
    mealsToday: number;
    mealsThisWeek: number;
    totalMeals: number;
    newRecipesTotal: number;
    avgMealsLast4Weeks: number;
    target: number;
    distinctRecipes30: number;
  };
  skincare: {
    routinesCount: number;
    completedToday: number;
    completionsThisWeek: number;
    scheduledThisWeek: number;
    adherence30: number;
    streak: number;
    totalCompletions: number;
    daysTracked: number;
  };
  habits: {
    count: number;
    dueToday: number;
    doneToday: number;
    weekCompleted: number;
    weekScheduled: number;
    bestStreak: number;
    totalCompletions: number;
    adherence30: number;
  };
  sobriety: TrackerStats[];
  wealth: {
    snapshots: number;
    daysSinceLast: number | null;
    emergencyMonths: number | null;
    investsMonthlyCount: number;
    noHighInterestDebt: boolean | null;
  };
  xp: { total: number; level: number };
  unlocked: Set<string>;
  special: { completed: number; accepted: number; offeredToday: number };
  training: { sessions: number; prs: number; planToday: boolean; planCompletedToday: boolean };
  nutrition: { loggedDays30: number; proteinDays30: number; proteinToday: number; proteinTarget: number; caloriesToday: number; calorieTarget: number; unsafeTargets: boolean };
  /** Weekly food planning state for the week containing `today` (and the upcoming one when planning ahead). */
  food: { weekPlanned: boolean; shopped: boolean; shoppedWithinBudget: boolean | null; prepCompleted: boolean; weeksPlanned: number; pantryItems: number; leftoverReviews: number };
}
