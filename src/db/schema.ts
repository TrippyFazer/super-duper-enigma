import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/**
 * Ascend data model (single-user, SQLite).
 *
 * Dates:
 *  - `date` columns are local calendar days as ISO strings "YYYY-MM-DD".
 *  - timestamp columns are ISO-8601 strings (UTC) unless noted.
 * JSON columns are stored as text and parsed by the service layer.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ---------------------------------------------------------------------------
// Profile / character
// ---------------------------------------------------------------------------
export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("Adventurer"),
  equippedTitle: text("equipped_title"),
  age: integer("age"),
  sex: text("sex"), // 'male' | 'female' | 'other' | null
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  timezone: text("timezone").notNull().default("UTC"),
  /** Domains the user opted into, JSON string[] e.g. ["fitness","sleep"] */
  activeDomains: text("active_domains").notNull().default('["fitness","sleep","cooking","wealth","skincare","sobriety","habits"]'),
  /** Personal targets JSON: { stepsTarget, bedtimeTarget "23:00", sleepTargetMin, workoutsPerWeekTarget, mealsPerWeekTarget } */
  targets: text("targets").notNull().default("{}"),
  /** Onboarding baseline answers, JSON (kept for explanation + seeding substats) */
  baseline: text("baseline").notNull().default("{}"),
  goals: text("goals"),
  onboardingCompletedAt: text("onboarding_completed_at"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

// ---------------------------------------------------------------------------
// Fitness
// ---------------------------------------------------------------------------
export const workouts = sqliteTable(
  "workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    /** strength | cardio | mobility | sport | walk | other */
    type: text("type").notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    /** 1 easy, 2 moderate, 3 hard */
    intensity: integer("intensity").notNull().default(2),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("workouts_date_idx").on(t.date)],
);

export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    steps: integer("steps"),
    activeMinutes: integer("active_minutes"),
    activityScore: integer("activity_score"),
    source: text("source").notNull().default("manual"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("daily_activity_date_uq").on(t.date)],
);

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------
export const sleepEntries = sqliteTable(
  "sleep_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The calendar day the sleep ended on (the "morning of"). */
    date: text("date").notNull(),
    source: text("source").notNull().default("manual"), // manual | oura
    totalSleepMin: integer("total_sleep_min").notNull(),
    /** ISO timestamps (local offset preserved when from Oura) */
    bedtimeStart: text("bedtime_start"),
    bedtimeEnd: text("bedtime_end"),
    efficiency: integer("efficiency"), // 0-100
    latencyMin: integer("latency_min"),
    sleepScore: integer("sleep_score"), // 0-100 (Oura) or self-rated mapped
    readinessScore: integer("readiness_score"),
    restingHr: real("resting_hr"),
    hrv: real("hrv"),
    /** self-rated quality 1-5 for manual entries */
    quality: integer("quality"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("sleep_entries_date_uq").on(t.date)],
);

// ---------------------------------------------------------------------------
// Cooking / nutrition
// ---------------------------------------------------------------------------
export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** JSON string[] of ingredient names (lowercase, simple) */
  ingredients: text("ingredients").notNull().default("[]"),
  /** JSON string[] of steps */
  steps: text("steps").notNull().default("[]"),
  /** breakfast | lunch | dinner | snack | any */
  mealType: text("meal_type").notNull().default("dinner"),
  prepTimeMin: integer("prep_time_min").notNull().default(10),
  cookTimeMin: integer("cook_time_min").notNull().default(20),
  /** easy | medium | hard */
  difficulty: text("difficulty").notNull().default("easy"),
  /** JSON string[]: high-protein | healthy | cheap | comfort | quick | vegetarian | one-pan | meal-prep */
  tags: text("tags").notNull().default("[]"),
  servings: integer("servings").notNull().default(2),
  proteinG: integer("protein_g"),
  calories: integer("calories"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  isSaved: integer("is_saved", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("builtin"), // builtin | custom
  createdAt: text("created_at").notNull().default(now),
});

export const meals = sqliteTable(
  "meals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    /** breakfast | lunch | dinner | snack */
    mealType: text("meal_type").notNull().default("dinner"),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    isNewRecipe: integer("is_new_recipe", { mode: "boolean" }).notNull().default(false),
    /** JSON string[]: e.g. ["vegetables","protein"] quick quality flags */
    qualityTags: text("quality_tags").notNull().default("[]"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("meals_date_idx").on(t.date)],
);

// ---------------------------------------------------------------------------
// Skincare / personal care
// ---------------------------------------------------------------------------
export const routines = sqliteTable("routines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** morning | evening */
  timeOfDay: text("time_of_day").notNull(),
  /** JSON {id:string,name:string}[] */
  steps: text("steps").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const routineCompletions = sqliteTable(
  "routine_completions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routineId: integer("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    /** JSON string[] of step ids completed */
    stepsCompleted: text("steps_completed").notNull().default("[]"),
    complete: integer("complete", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("routine_completions_uq").on(t.routineId, t.date)],
);

// ---------------------------------------------------------------------------
// Sobriety / abstinence
// ---------------------------------------------------------------------------
export const sobrietyTrackers = sqliteTable("sobriety_trackers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** alcohol | cannabis | nicotine | custom */
  category: text("category").notNull().default("custom"),
  icon: text("icon"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const sobrietyRuns = sqliteTable(
  "sobriety_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    trackerId: integer("tracker_id")
      .notNull()
      .references(() => sobrietyTrackers.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(), // ISO timestamp
    endedAt: text("ended_at"), // null = current run
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("sobriety_runs_tracker_idx").on(t.trackerId)],
);

// ---------------------------------------------------------------------------
// Habits / discipline
// ---------------------------------------------------------------------------
export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon"),
  /** daily | weekdays | times_per_week */
  scheduleType: text("schedule_type").notNull().default("daily"),
  /** JSON number[] 0=Sun..6=Sat, used when scheduleType = weekdays */
  weekdays: text("weekdays").notNull().default("[1,2,3,4,5]"),
  timesPerWeek: integer("times_per_week").notNull().default(3),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
  archivedAt: text("archived_at"),
});

export const habitCompletions = sqliteTable(
  "habit_completions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("habit_completions_uq").on(t.habitId, t.date)],
);

// ---------------------------------------------------------------------------
// Wealth
// ---------------------------------------------------------------------------
export const financialSnapshots = sqliteTable(
  "financial_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    netWorth: real("net_worth"),
    liquidSavings: real("liquid_savings"),
    monthlyExpenses: real("monthly_expenses"),
    monthlyIncome: real("monthly_income"),
    /** Percent of gross income saved/invested each month */
    savingsRatePct: real("savings_rate_pct"),
    highInterestDebt: real("high_interest_debt"),
    totalDebt: real("total_debt"),
    retirementBalance: real("retirement_balance"),
    investsMonthly: integer("invests_monthly", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("financial_snapshots_date_idx").on(t.date)],
);

// ---------------------------------------------------------------------------
// Progression: XP, quests, achievements, history
// ---------------------------------------------------------------------------
export const xpEvents = sqliteTable(
  "xp_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    domain: text("domain").notNull(), // fitness | sleep | ... | quest | achievement | system
    /** Unique idempotency key so the same action never awards twice */
    key: text("key").notNull(),
    description: text("description").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("xp_events_key_uq").on(t.key), index("xp_events_date_idx").on(t.date)],
);

export const quests = sqliteTable(
  "quests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** daily | weekly | long */
    kind: text("kind").notNull(),
    /** template key, e.g. "daily.skincare" */
    templateKey: text("template_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    domain: text("domain").notNull(),
    target: real("target").notNull().default(1),
    rewardXp: integer("reward_xp").notNull().default(10),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    /** progress is derived from logs; cached here for display */
    progress: real("progress").notNull().default(0),
    completedAt: text("completed_at"),
    /** JSON params needed to evaluate progress */
    params: text("params").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("quests_period_uq").on(t.templateKey, t.periodStart)],
);

export const userAchievements = sqliteTable(
  "user_achievements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    unlockedAt: text("unlocked_at").notNull().default(now),
    seen: integer("seen", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("user_achievements_key_uq").on(t.key)],
);

export const rankHistory = sqliteTable(
  "rank_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** 'overall' or a domain id */
    domain: text("domain").notNull(),
    rank: text("rank").notNull(),
    score: real("score").notNull(),
    level: integer("level"),
    date: text("date").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("rank_history_domain_idx").on(t.domain, t.date)],
);

/** Narrative character history: rank-ups, level-ups, milestones, titles. */
export const characterEvents = sqliteTable(
  "character_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** rank_up | rank_down | level_up | achievement | milestone | streak | title | system */
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    domain: text("domain"),
    key: text("key"),
    occurredAt: text("occurred_at").notNull().default(now),
  },
  (t) => [uniqueIndex("character_events_key_uq").on(t.key)],
);

/** Daily snapshot of scores for charts (one row per day, written when the engine runs). */
export const scoreSnapshots = sqliteTable(
  "score_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    domain: text("domain").notNull(),
    score: real("score").notNull(),
    rank: text("rank").notNull(),
  },
  (t) => [uniqueIndex("score_snapshots_uq").on(t.date, t.domain)],
);

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------
export const integrations = sqliteTable("integrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().unique(), // 'oura'
  /** personal_token | oauth */
  authType: text("auth_type").notNull().default("personal_token"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"),
  lastSyncAt: text("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastError: text("last_error"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(now),
});

export type Profile = typeof profiles.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type SleepEntry = typeof sleepEntries.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineCompletion = typeof routineCompletions.$inferSelect;
export type SobrietyTracker = typeof sobrietyTrackers.$inferSelect;
export type SobrietyRun = typeof sobrietyRuns.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type HabitCompletion = typeof habitCompletions.$inferSelect;
export type FinancialSnapshot = typeof financialSnapshots.$inferSelect;
export type XpEvent = typeof xpEvents.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type CharacterEvent = typeof characterEvents.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
