import type { ProgressionContext } from "./context";
import { rankIndex } from "./ranks";
import type { DomainId, Rank } from "./types";

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  /** Title unlocked for the character profile (optional). */
  title?: string;
  xp: number;
  domain: DomainId | "overall" | "system";
  /** Hidden until unlocked (shown as ???). */
  secret?: boolean;
  check: (ctx: ProgressionContext) => boolean;
}

const rankAtLeast = (ctx: ProgressionContext, domain: DomainId, rank: Rank) => {
  const d = ctx.assessment.domains.find((x) => x.domain === domain);
  return !!d && rankIndex(d.rank) >= rankIndex(rank);
};
const overallAtLeast = (ctx: ProgressionContext, rank: Rank) => rankIndex(ctx.assessment.overall.rank) >= rankIndex(rank);
const anyTracker = (ctx: ProgressionContext, f: (t: ProgressionContext["sobriety"][number]) => boolean) => ctx.sobriety.some(f);

export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Beginnings ------------------------------------------------------------
  {
    key: "first_step",
    name: "First Step",
    description: "Log your first action of any kind.",
    xp: 25,
    domain: "system",
    check: (c) =>
      c.fitness.totalWorkouts + c.cooking.totalMeals + c.skincare.totalCompletions + c.habits.totalCompletions + c.sleep.totalLogs > 0,
  },
  {
    key: "character_created",
    name: "A New Adventurer",
    description: "Complete onboarding and create your character.",
    title: "Novice Squire",
    xp: 0,
    domain: "system",
    check: () => true,
  },

  // --- Fitness ---------------------------------------------------------------
  { key: "warm_up", name: "Warm-Up", description: "Log your first workout.", xp: 25, domain: "fitness", check: (c) => c.fitness.totalWorkouts >= 1 },
  { key: "fitness_25", name: "Regular", description: "Log 25 workouts.", xp: 75, domain: "fitness", check: (c) => c.fitness.totalWorkouts >= 25 },
  { key: "fitness_100", name: "Centurion", description: "Log 100 workouts.", title: "Centurion", xp: 250, domain: "fitness", check: (c) => c.fitness.totalWorkouts >= 100 },
  {
    key: "consistency_over_motivation",
    name: "Consistency > Motivation",
    description: "12 consecutive weeks with 3+ training days.",
    title: "The Consistent",
    xp: 500,
    domain: "fitness",
    check: (c) => c.fitness.activeWeekStreak >= 12,
  },
  { key: "four_week_streak", name: "Month of Iron", description: "4 consecutive active training weeks.", xp: 150, domain: "fitness", check: (c) => c.fitness.activeWeekStreak >= 4 },
  { key: "step_master", name: "Wayfarer", description: "Hit your step target on 20 days in a 30-day window.", title: "Wayfarer", xp: 150, domain: "fitness", check: (c) => c.fitness.daysAtStepTarget30 >= 20 },

  // --- Sleep -----------------------------------------------------------------
  { key: "first_sleep", name: "Lights Out", description: "Log your first night of sleep.", xp: 15, domain: "sleep", check: (c) => c.sleep.totalLogs >= 1 },
  {
    key: "well_rested",
    name: "Well Rested",
    description: "Average 7+ hours across a 30-day window with 25+ nights logged.",
    title: "Well Rested",
    xp: 200,
    domain: "sleep",
    check: (c) => c.sleep.logs30 >= 25 && (c.sleep.avg30 ?? 0) >= 420,
  },
  { key: "early_riser", name: "Early Riser", description: "Wake before 7:00 on 20 days in a 30-day window.", title: "Early Riser", xp: 150, domain: "sleep", check: (c) => c.sleep.earlyWakes30 >= 20 },
  { key: "sleep_tracker_30", name: "Night Watch", description: "Log 30 nights of sleep.", xp: 75, domain: "sleep", check: (c) => c.sleep.totalLogs >= 30 },

  // --- Cooking ---------------------------------------------------------------
  { key: "cook", name: "Cook", description: "Cook your first meal.", xp: 15, domain: "cooking", check: (c) => c.cooking.totalMeals >= 1 },
  { key: "home_chef_1", name: "Home Chef I", description: "Cook 25 meals.", xp: 75, domain: "cooking", check: (c) => c.cooking.totalMeals >= 25 },
  { key: "home_chef_2", name: "Home Chef II", description: "Cook 100 meals.", title: "Home Chef", xp: 200, domain: "cooking", check: (c) => c.cooking.totalMeals >= 100 },
  { key: "home_chef_3", name: "Home Chef III", description: "Cook 300 meals.", title: "Master of the Hearth", xp: 500, domain: "cooking", check: (c) => c.cooking.totalMeals >= 300 },
  { key: "explorer", name: "Culinary Explorer", description: "Try 10 new recipes.", xp: 150, domain: "cooking", check: (c) => c.cooking.newRecipesTotal >= 10 },

  // --- Skincare --------------------------------------------------------------
  { key: "routine_first", name: "Ritual", description: "Complete your first routine.", xp: 10, domain: "skincare", check: (c) => c.skincare.totalCompletions >= 1 },
  { key: "seven_day_streak", name: "Seven Day Streak", description: "7 days in a row of completed routines.", xp: 50, domain: "skincare", check: (c) => c.skincare.streak >= 7 },
  { key: "thirty_day_streak", name: "Thirty Day Streak", description: "30 days in a row of completed routines.", title: "Disciplined", xp: 250, domain: "skincare", check: (c) => c.skincare.streak >= 30 },
  { key: "glow", name: "Glow", description: "90%+ routine adherence over 30 days.", title: "Radiant", xp: 150, domain: "skincare", check: (c) => c.skincare.daysTracked >= 30 && c.skincare.adherence30 >= 0.9 },

  // --- Sobriety --------------------------------------------------------------
  { key: "day_one", name: "Day One", description: "Start a sobriety tracker.", xp: 10, domain: "sobriety", check: (c) => c.sobriety.length > 0 },
  { key: "clean_week", name: "One Week Clear", description: "7-day streak on any tracker.", xp: 50, domain: "sobriety", check: (c) => anyTracker(c, (t) => t.currentDays >= 7 || t.longestDays >= 7) },
  { key: "clean_month", name: "Thirty Clear", description: "30-day streak on any tracker.", xp: 150, domain: "sobriety", check: (c) => anyTracker(c, (t) => t.currentDays >= 30 || t.longestDays >= 30) },
  { key: "unbreakable", name: "Unbreakable", description: "90-day streak on any tracker.", title: "Unbreakable", xp: 300, domain: "sobriety", check: (c) => anyTracker(c, (t) => t.currentDays >= 90 || t.longestDays >= 90) },
  { key: "one_year", name: "One Year", description: "365-day streak on any tracker.", title: "Steadfast", xp: 750, domain: "sobriety", check: (c) => anyTracker(c, (t) => t.currentDays >= 365 || t.longestDays >= 365) },

  // --- Habits ----------------------------------------------------------------
  { key: "habit_first", name: "Small Beginnings", description: "Complete your first habit.", xp: 10, domain: "habits", check: (c) => c.habits.totalCompletions >= 1 },
  { key: "iron_habit", name: "Iron Habit", description: "30-day streak on a single habit.", title: "Iron Disciple", xp: 250, domain: "habits", check: (c) => c.habits.bestStreak >= 30 },
  { key: "habit_66", name: "Automatic", description: "66-day streak — the median time to form a habit.", title: "Automatic", xp: 400, domain: "habits", check: (c) => c.habits.bestStreak >= 66 },
  { key: "habit_100", name: "Hundredfold", description: "100 habit completions.", xp: 150, domain: "habits", check: (c) => c.habits.totalCompletions >= 100 },

  // --- Wealth ----------------------------------------------------------------
  { key: "financial_apprentice", name: "Financial Apprentice", description: "Complete your first financial check-in.", title: "Financial Apprentice", xp: 25, domain: "wealth", check: (c) => c.wealth.snapshots >= 1 },
  { key: "quartermaster", name: "Quartermaster", description: "Three monthly financial check-ins.", title: "Quartermaster", xp: 100, domain: "wealth", check: (c) => c.wealth.snapshots >= 3 },
  { key: "investor", name: "Investor", description: "Invest monthly across three check-ins.", title: "The Investor", xp: 150, domain: "wealth", check: (c) => c.wealth.investsMonthlyCount >= 3 },
  { key: "rainy_day", name: "Rainy Day Fund", description: "Hold 3+ months of expenses in liquid savings.", xp: 200, domain: "wealth", check: (c) => (c.wealth.emergencyMonths ?? 0) >= 3 },
  { key: "fortress", name: "Fortress", description: "Hold 6+ months of expenses with no high-interest debt.", title: "Fortress", xp: 400, domain: "wealth", check: (c) => (c.wealth.emergencyMonths ?? 0) >= 6 && c.wealth.noHighInterestDebt === true },

  // --- Ranks & levels --------------------------------------------------------
  { key: "rank_d", name: "D-Rank Adventurer", description: "Reach D rank overall.", title: "Rising Adventurer", xp: 100, domain: "overall", check: (c) => overallAtLeast(c, "D") },
  { key: "rank_c", name: "C-Rank Adventurer", description: "Reach C rank overall.", title: "Seasoned Knight", xp: 250, domain: "overall", check: (c) => overallAtLeast(c, "C") },
  { key: "rank_b", name: "B-Rank Adventurer", description: "Reach B rank overall.", title: "Elite Knight", xp: 500, domain: "overall", check: (c) => overallAtLeast(c, "B") },
  { key: "rank_a", name: "A-Rank Adventurer", description: "Reach A rank overall.", title: "Royal Champion", xp: 1000, domain: "overall", check: (c) => overallAtLeast(c, "A") },
  { key: "rank_s", name: "S-Rank Adventurer", description: "Reach S rank overall.", title: "Legendary Paladin", xp: 2500, domain: "overall", check: (c) => overallAtLeast(c, "S") },
  { key: "level_10", name: "Level 10", description: "Reach character level 10.", xp: 0, domain: "system", check: (c) => c.xp.level >= 10 },
  { key: "level_25", name: "Level 25", description: "Reach character level 25.", title: "Seasoned", xp: 0, domain: "system", check: (c) => c.xp.level >= 25 },
  { key: "level_50", name: "Level 50", description: "Reach character level 50.", title: "Veteran", xp: 0, domain: "system", check: (c) => c.xp.level >= 50 },
  { key: "domain_a_any", name: "Specialist", description: "Reach A rank in any domain.", title: "Specialist", xp: 300, domain: "overall", check: (c) => c.assessment.domains.some((d) => rankIndex(d.rank) >= rankIndex("A")) },
  { key: "domain_s_any", name: "Legend", description: "Reach S rank in any domain.", title: "Legend", xp: 1000, domain: "overall", check: (c) => c.assessment.domains.some((d) => d.rank === "S") },
  { key: "balanced", name: "Balanced", description: "Hold C rank or better in every active domain.", title: "Balanced", xp: 300, domain: "overall", check: (c) => c.assessment.domains.length >= 3 && c.assessment.domains.every((d) => rankIndex(d.rank) >= rankIndex("C")) },
  { key: "fitness_b", name: "Strong Body", description: "Reach B rank in Fitness.", xp: 200, domain: "fitness", check: (c) => rankAtLeast(c, "fitness", "B") },

  // --- Training, nutrition, special quests ------------------------------------
  { key: "first_session", name: "Under the Bar", description: "Finish your first tracked workout session.", xp: 40, domain: "fitness", check: (c) => c.training.sessions >= 1 },
  { key: "sessions_20", name: "Regular at the Forge", description: "Finish 20 tracked sessions.", xp: 150, domain: "fitness", check: (c) => c.training.sessions >= 20 },
  { key: "first_pr", name: "Trailblazer", description: "Set a personal record on a tracked lift.", title: "Trailblazer", xp: 75, domain: "fitness", check: (c) => c.training.prs >= 1 },
  { key: "prs_10", name: "Overload", description: "Set 10 personal records on tracked lifts.", xp: 200, domain: "fitness", check: (c) => c.training.prs >= 10 },
  { key: "nutrition_7", name: "Quartermaster's Ledger", description: "Log nutrition on 7 days in a month.", xp: 60, domain: "cooking", check: (c) => c.nutrition.loggedDays30 >= 7 },
  { key: "protein_14", name: "Well Fed", description: "Hit your protein target on 14 logged days in a month.", title: "Well Fed", xp: 150, domain: "cooking", check: (c) => !c.nutrition.unsafeTargets && c.nutrition.proteinDays30 >= 14 },
  { key: "special_first", name: "Side Quest", description: "Complete your first special quest.", xp: 30, domain: "overall", check: (c) => c.special.completed >= 1 },
  { key: "special_10", name: "Errand Knight", description: "Complete 10 special quests.", title: "Errand Knight", xp: 150, domain: "overall", check: (c) => c.special.completed >= 10 },
  { key: "special_30", name: "Wanderer", description: "Complete 30 special quests.", title: "Wanderer", xp: 400, domain: "overall", check: (c) => c.special.completed >= 30 },
  { key: "sleep_b", name: "Deep Rest", description: "Reach B rank in Sleep.", xp: 200, domain: "sleep", check: (c) => rankAtLeast(c, "sleep", "B") },
];

export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

/** Returns achievements newly satisfied by the context (not already unlocked). */
export function evaluateAchievements(ctx: ProgressionContext): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (ctx.unlocked.has(a.key)) continue;
    try {
      if (a.check(ctx)) out.push(a);
    } catch {
      // A single broken check must never take the app down.
    }
  }
  return out;
}

export const ALL_TITLES: string[] = Array.from(new Set(ACHIEVEMENTS.map((a) => a.title).filter((t): t is string => !!t)));
