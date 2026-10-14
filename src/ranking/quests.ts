import { addDays, endOfWeek, startOfWeek, type ISODate } from "@/lib/dates";
import type { ProgressionContext } from "./context";
import type { DomainId } from "./types";

export type QuestKind = "daily" | "weekly" | "long";

export interface QuestTemplate {
  key: string;
  kind: QuestKind;
  domain: DomainId | "overall";
  /** Should this quest be offered given the user's setup/behaviour? */
  applies: (ctx: ProgressionContext) => boolean;
  /** Build the concrete quest instance (title, target, params). */
  build: (ctx: ProgressionContext) => { title: string; description: string; target: number; rewardXp: number; params?: Record<string, unknown>; titleReward?: string };
  /** Current progress toward target, from the context. */
  progress: (ctx: ProgressionContext, params: Record<string, unknown>) => number;
  /** Priority for selection; higher first. */
  priority: (ctx: ProgressionContext) => number;
}

const has = (ctx: ProgressionContext, d: DomainId) => ctx.activeDomains.includes(d);

export const QUEST_TEMPLATES: QuestTemplate[] = [
  // ------------------------------ DAILY ------------------------------------
  {
    key: "daily.skincare",
    kind: "daily",
    domain: "skincare",
    applies: (c) => has(c, "skincare") && c.skincare.routinesCount > 0,
    build: (c) => ({
      title: c.skincare.routinesCount > 1 ? "Complete both routines" : "Complete your routine",
      description: "Morning and evening — small, boring, effective.",
      target: c.skincare.routinesCount,
      rewardXp: 10,
    }),
    progress: (c) => c.skincare.completedToday,
    priority: () => 70,
  },
  {
    key: "daily.steps",
    kind: "daily",
    domain: "fitness",
    applies: (c) => has(c, "fitness") && c.fitness.hasStepData,
    build: (c) => ({
      title: `Walk ${c.fitness.stepsTarget.toLocaleString()} steps`,
      description: "Movement counts even when training doesn't happen.",
      target: c.fitness.stepsTarget,
      rewardXp: 10,
    }),
    progress: (c) => c.fitness.stepsToday ?? 0,
    priority: () => 50,
  },
  {
    key: "daily.cook",
    kind: "daily",
    domain: "cooking",
    applies: (c) => has(c, "cooking"),
    build: () => ({ title: "Cook one meal", description: "Anything you made yourself counts.", target: 1, rewardXp: 15 }),
    progress: (c) => c.cooking.mealsToday,
    priority: (c) => (c.cooking.mealsThisWeek < c.cooking.target ? 65 : 40),
  },
  {
    key: "daily.sleep_log",
    kind: "daily",
    domain: "sleep",
    applies: (c) => has(c, "sleep") && !c.sleep.hasOura,
    build: () => ({ title: "Log last night's sleep", description: "Two taps. Keeps your rolling averages honest.", target: 1, rewardXp: 5 }),
    progress: (c) => (c.sleep.loggedToday ? 1 : 0),
    priority: () => 45,
  },
  {
    key: "daily.bedtime",
    kind: "daily",
    domain: "sleep",
    applies: (c) => has(c, "sleep") && !!c.sleep.bedtimeTarget,
    build: (c) => ({
      title: `In bed by ${c.sleep.bedtimeTarget}`,
      description: "Checked against last night's logged bedtime.",
      target: 1,
      rewardXp: 10,
    }),
    progress: (c) => (c.sleep.inBedByTargetLastNight ? 1 : 0),
    priority: () => 42,
  },
  {
    key: "daily.habits",
    kind: "daily",
    domain: "habits",
    applies: (c) => has(c, "habits") && c.habits.dueToday > 0,
    build: (c) => ({
      title: c.habits.dueToday === 1 ? "Complete today's habit" : `Complete ${c.habits.dueToday} habits due today`,
      description: "Discipline is just showing up for the small things.",
      target: c.habits.dueToday,
      rewardXp: 15,
    }),
    progress: (c) => c.habits.doneToday,
    priority: () => 68,
  },
  {
    key: "daily.workout",
    kind: "daily",
    domain: "fitness",
    applies: (c) => has(c, "fitness"),
    build: () => ({ title: "Train today", description: "Any session of 20+ minutes counts.", target: 1, rewardXp: 20 }),
    progress: (c) => (c.fitness.workoutsToday > 0 ? 1 : 0),
    priority: (c) => {
      // Push harder when behind pace for the weekly target.
      const target = Math.max(3, Math.round(c.fitness.avgSessionsLast4Weeks));
      const daysLeft = 7 - (new Date(c.today + "T00:00:00Z").getUTCDay() || 7) + 1;
      const needed = target - c.fitness.sessionsThisWeek;
      return needed >= daysLeft ? 80 : needed > 0 ? 60 : 30;
    },
  },

  // ------------------------------ WEEKLY -----------------------------------
  {
    key: "weekly.train",
    kind: "weekly",
    domain: "fitness",
    applies: (c) => has(c, "fitness"),
    build: (c) => {
      const n = Math.min(6, Math.max(2, Math.floor(c.fitness.avgSessionsLast4Weeks) + 1));
      return { title: `Train ${n} times this week`, description: "Consistency is the whole game.", target: n, rewardXp: 100 };
    },
    progress: (c) => c.fitness.sessionsThisWeek,
    priority: () => 90,
  },
  {
    key: "weekly.cook",
    kind: "weekly",
    domain: "cooking",
    applies: (c) => has(c, "cooking"),
    build: (c) => {
      const n = Math.min(14, Math.max(3, Math.floor(Math.max(c.cooking.avgMealsLast4Weeks, c.cooking.target - 1)) + 1));
      return { title: `Cook ${n} meals this week`, description: "Become someone who can feed themselves well.", target: n, rewardXp: 75 };
    },
    progress: (c) => c.cooking.mealsThisWeek,
    priority: () => 80,
  },
  {
    key: "weekly.habits",
    kind: "weekly",
    domain: "habits",
    applies: (c) => has(c, "habits") && c.habits.count > 0,
    build: () => ({ title: "80% habit adherence this week", description: "Perfect isn't the goal. Reliable is.", target: 80, rewardXp: 75 }),
    progress: (c) => (c.habits.weekScheduled ? Math.round((c.habits.weekCompleted / c.habits.weekScheduled) * 100) : 0),
    priority: () => 70,
  },
  {
    key: "weekly.skincare",
    kind: "weekly",
    domain: "skincare",
    applies: (c) => has(c, "skincare") && c.skincare.routinesCount > 0,
    build: (c) => {
      const n = Math.max(1, Math.round(c.skincare.routinesCount * 7 * 0.85));
      return { title: `Complete ${n} routines this week`, description: "Six of seven days is excellent.", target: n, rewardXp: 50 };
    },
    progress: (c) => c.skincare.completionsThisWeek,
    priority: () => 60,
  },
  {
    key: "weekly.sleep",
    kind: "weekly",
    domain: "sleep",
    applies: (c) => has(c, "sleep"),
    build: (c) => ({
      title: `${Math.round(c.sleep.sleepTargetMin / 60)}+ hours on 5 nights`,
      description: "Rolling consistency beats one heroic night.",
      target: 5,
      rewardXp: 75,
    }),
    progress: (c) => c.sleep.nightsThisWeekAtTarget,
    priority: () => 65,
  },
  {
    key: "weekly.plan_meals",
    kind: "weekly",
    domain: "cooking",
    applies: (c) => has(c, "cooking"),
    build: () => ({ title: "Plan your meals for the week", description: "Budget, meals, shopping list — any day that suits you.", target: 1, rewardXp: 50 }),
    progress: (c) => (c.food.weekPlanned ? 1 : 0),
    priority: (c) => (c.food.weekPlanned ? 20 : 72),
  },
  {
    key: "weekly.budget_shop",
    kind: "weekly",
    domain: "cooking",
    applies: (c) => has(c, "cooking") && c.food.weekPlanned,
    build: () => ({ title: "Grocery shop within your planned budget", description: "Enter what you actually paid. Within 5% counts — this rewards planning, not skimping.", target: 1, rewardXp: 40 }),
    progress: (c) => (c.food.shoppedWithinBudget ? 1 : 0),
    priority: () => 66,
  },
  {
    key: "weekly.meal_prep",
    kind: "weekly",
    domain: "cooking",
    applies: (c) => has(c, "cooking") && c.food.weekPlanned,
    build: () => ({ title: "Complete your meal prep", description: "One session that makes the whole week easier.", target: 1, rewardXp: 60 }),
    progress: (c) => (c.food.prepCompleted ? 1 : 0),
    priority: () => 64,
  },
  {
    key: "weekly.finance",
    kind: "weekly",
    domain: "wealth",
    applies: (c) => has(c, "wealth") && (c.wealth.daysSinceLast == null || c.wealth.daysSinceLast >= 28),
    build: () => ({ title: "Do your financial check-in", description: "Ten minutes. Net worth, savings, debt.", target: 1, rewardXp: 60 }),
    progress: (c) => (c.wealth.daysSinceLast != null && c.wealth.daysSinceLast < 7 ? 1 : 0),
    priority: () => 55,
  },

  // ------------------------------ LONG / BOSS ------------------------------
  {
    key: "boss.routine_30",
    kind: "long",
    domain: "skincare",
    applies: (c) => has(c, "skincare") && c.skincare.routinesCount > 0,
    build: () => ({
      title: "30 days above 80% routine adherence",
      description: "Boss quest. Unlocks the title “Disciplined”.",
      target: 30,
      rewardXp: 250,
      titleReward: "Disciplined",
    }),
    progress: (c) => (c.skincare.adherence30 >= 0.8 ? Math.min(30, c.skincare.daysTracked) : Math.min(29, Math.round(c.skincare.adherence30 * 30))),
    priority: () => 50,
  },
  {
    key: "boss.fitness_12w",
    kind: "long",
    domain: "fitness",
    applies: (c) => has(c, "fitness"),
    build: () => ({ title: "12 consecutive active weeks", description: "Boss quest. Three training days a week, twelve weeks straight.", target: 12, rewardXp: 500 }),
    progress: (c) => c.fitness.activeWeekStreak,
    priority: () => 50,
  },
  {
    key: "boss.sobriety_90",
    kind: "long",
    domain: "sobriety",
    applies: (c) => has(c, "sobriety") && c.sobriety.length > 0,
    build: (c) => {
      const t = [...c.sobriety].sort((a, b) => b.currentDays - a.currentDays)[0];
      return { title: `90 days: ${t.name}`, description: "Boss quest. The hardest window is behind you by then.", target: 90, rewardXp: 300, params: { trackerId: t.trackerId } };
    },
    progress: (c, p) => c.sobriety.find((t) => t.trackerId === p.trackerId)?.currentDays ?? 0,
    priority: () => 50,
  },
  {
    key: "boss.cook_100",
    kind: "long",
    domain: "cooking",
    applies: (c) => has(c, "cooking"),
    build: () => ({ title: "Cook 100 meals", description: "Boss quest. Unlocks the title “Home Chef”.", target: 100, rewardXp: 300, titleReward: "Home Chef" }),
    progress: (c) => c.cooking.totalMeals,
    priority: () => 40,
  },
  {
    key: "boss.sleep_30",
    kind: "long",
    domain: "sleep",
    applies: (c) => has(c, "sleep"),
    build: (c) => ({
      title: `Average ${Math.round(c.sleep.sleepTargetMin / 60)}h over 30 nights`,
      description: "Boss quest. 25+ nights logged, average at target.",
      target: 30,
      rewardXp: 250,
    }),
    progress: (c) => ((c.sleep.avg30 ?? 0) >= c.sleep.sleepTargetMin ? Math.min(30, c.sleep.logs30) : Math.min(24, c.sleep.logs30)),
    priority: () => 40,
  },
  {
    key: "boss.emergency_3",
    kind: "long",
    domain: "wealth",
    applies: (c) => has(c, "wealth") && c.wealth.snapshots > 0 && (c.wealth.emergencyMonths ?? 0) < 3,
    build: () => ({ title: "Build a 3-month emergency fund", description: "Boss quest. Liquid savings ≥ 3× monthly expenses.", target: 3, rewardXp: 300 }),
    progress: (c) => Math.min(3, c.wealth.emergencyMonths ?? 0),
    priority: () => 45,
  },
  {
    key: "boss.habit_66",
    kind: "long",
    domain: "habits",
    applies: (c) => has(c, "habits") && c.habits.count > 0,
    build: () => ({ title: "66-day habit streak", description: "Boss quest. The median time for a habit to become automatic.", target: 66, rewardXp: 400 }),
    progress: (c) => c.habits.bestStreak,
    priority: () => 45,
  },
];

export const QUEST_TEMPLATE_MAP = new Map(QUEST_TEMPLATES.map((q) => [q.key, q]));

export function periodFor(kind: QuestKind, today: ISODate): { start: ISODate; end: ISODate } {
  if (kind === "daily") return { start: today, end: today };
  if (kind === "weekly") return { start: startOfWeek(today), end: endOfWeek(today) };
  // long quests: open-ended, re-offered monthly if not complete
  return { start: today.slice(0, 7) + "-01", end: addDays(today.slice(0, 7) + "-01", 400) };
}

/** Select which templates to offer today. Daily: up to 4, weekly: up to 3, long: up to 3. */
export function selectQuestTemplates(ctx: ProgressionContext): { daily: QuestTemplate[]; weekly: QuestTemplate[]; long: QuestTemplate[] } {
  const pick = (kind: QuestKind, max: number) =>
    QUEST_TEMPLATES.filter((q) => q.kind === kind && q.applies(ctx))
      .sort((a, b) => b.priority(ctx) - a.priority(ctx))
      .slice(0, max);
  return { daily: pick("daily", 4), weekly: pick("weekly", 5), long: pick("long", 3) };
}
