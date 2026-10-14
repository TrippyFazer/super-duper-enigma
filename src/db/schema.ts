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
  /** Preferences JSON: fitness goal/equipment, nutrition targets, quest frequency, notification toggles, AI settings */
  preferences: text("preferences").notNull().default("{}"),
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
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
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
    /** What earned this XP, e.g. workout / session / nutrition / quest / achievement / habit / routine / offer */
    sourceType: text("source_type"),
    /** Id of the source row (string so dates and composite ids fit) */
    sourceId: text("source_id"),
    /** Set when the source was deleted/invalidated. Voided events never count toward totals. */
    voidedAt: text("voided_at"),
    voidReason: text("void_reason"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("xp_events_key_uq").on(t.key), index("xp_events_date_idx").on(t.date), index("xp_events_source_idx").on(t.sourceType, t.sourceId)],
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

// ---------------------------------------------------------------------------
// Special (optional) quest offers — library or AI generated, never punitive
// ---------------------------------------------------------------------------
export const questOffers = sqliteTable(
  "quest_offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Library template key, or null for AI-generated */
    templateKey: text("template_key"),
    source: text("source").notNull().default("library"), // library | ai
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    domain: text("domain").notNull(),
    /** common | uncommon | rare | epic | legendary */
    difficulty: text("difficulty").notNull().default("common"),
    /** special | side | recovery | social | discipline | bonus */
    kind: text("kind").notNull().default("special"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(20),
    xpReward: integer("xp_reward").notNull().default(30),
    /** offered | accepted | completed | declined | expired */
    status: text("status").notNull().default("offered"),
    date: text("date").notNull(),
    offeredAt: text("offered_at").notNull().default(now),
    acceptedAt: text("accepted_at"),
    completedAt: text("completed_at"),
    declinedAt: text("declined_at"),
    expiresAt: text("expires_at"),
    params: text("params").notNull().default("{}"),
    // ---- Real-world (adventure) quests: facts come from a verified event, never from the model.
    eventId: integer("event_id"),
    category: text("category"),
    venue: text("venue"),
    startAt: text("start_at"),
    endAt: text("end_at"),
    priceLabel: text("price_label"),
    distanceMi: real("distance_mi"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    why: text("why"),
    /** loved | good | meh | not-for-me | skipped (set after completion / "did you go?") */
    feedback: text("feedback"),
    /** JSON follow-up hook, e.g. {"kind":"pantry","prompt":"Which ingredient did you pick up?"} */
    followUp: text("follow_up"),
  },
  (t) => [index("quest_offers_date_idx").on(t.date), index("quest_offers_status_idx").on(t.status)],
);

/** Cached public events from real sources (Ticketmaster, public ICS calendars). Facts only; never AI-written. */
export const localEvents = sqliteTable(
  "local_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** music | sports | food | comedy | film | arts | outdoor | market | festival | community | class | nightlife | family | other */
    category: text("category").notNull().default("other"),
    startAt: text("start_at").notNull(),
    endAt: text("end_at"),
    venue: text("venue"),
    address: text("address"),
    city: text("city"),
    lat: real("lat"),
    lng: real("lng"),
    priceMin: real("price_min"),
    priceMax: real("price_max"),
    isFree: integer("is_free", { mode: "boolean" }),
    url: text("url"),
    sourceName: text("source_name").notNull(),
    fetchedAt: text("fetched_at").notNull().default(now),
  },
  (t) => [uniqueIndex("local_events_ext_uq").on(t.provider, t.externalId), index("local_events_start_idx").on(t.startAt)],
);

/** Small per-day flags the user sets explicitly, e.g. "done eating for today". */
export const dayFlags = sqliteTable(
  "day_flags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull().default("1"),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("day_flags_date_key_uq").on(t.date, t.key)],
);

// ---------------------------------------------------------------------------
// Workout planning & tracking
// ---------------------------------------------------------------------------
export const workoutPlans = sqliteTable(
  "workout_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    name: text("name").notNull(),
    focus: text("focus").notNull().default("full"),
    goal: text("goal").notNull().default("general"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(45),
    source: text("source").notNull().default("template"), // template | ai
    /** JSON PlanExercise[] */
    exercises: text("exercises").notNull().default("[]"),
    /** Optional bonus quest attached to the plan, JSON */
    bonus: text("bonus"),
    notes: text("notes"),
    /** planned | started | completed | skipped */
    status: text("status").notNull().default("planned"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("workout_plans_date_idx").on(t.date)],
);

export const workoutSessions = sqliteTable(
  "workout_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id").references(() => workoutPlans.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    name: text("name").notNull(),
    focus: text("focus").notNull().default("full"),
    startedAt: text("started_at").notNull().default(now),
    finishedAt: text("finished_at"),
    durationMin: integer("duration_min"),
    /** active | paused | completed | cancelled | discarded  (abandoned = legacy alias of cancelled) */
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    /** The fitness log row created when the session finishes */
    workoutId: integer("workout_id").references(() => workouts.id, { onDelete: "set null" }),
    /** Pause bookkeeping: when the current pause started, and total seconds paused so far */
    pausedAt: text("paused_at"),
    pausedSec: integer("paused_sec").notNull().default(0),
  },
  (t) => [index("workout_sessions_date_idx").on(t.date)],
);

export const sessionExercises = sqliteTable(
  "session_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    targetSets: integer("target_sets").notNull().default(3),
    targetReps: text("target_reps").notNull().default("8-12"),
    restSeconds: integer("rest_seconds").notNull().default(90),
    notes: text("notes"),
    /** pending | done | skipped */
    status: text("status").notNull().default("pending"),
  },
  (t) => [index("session_exercises_session_idx").on(t.sessionId)],
);

export const exerciseSets = sqliteTable(
  "exercise_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionExerciseId: integer("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    weight: real("weight"),
    reps: integer("reps"),
    durationSec: integer("duration_sec"),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    completedAt: text("completed_at"),
  },
  (t) => [uniqueIndex("exercise_sets_uq").on(t.sessionExerciseId, t.setIndex)],
);

export const personalRecords = sqliteTable(
  "personal_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    exerciseSlug: text("exercise_slug").notNull(),
    exerciseName: text("exercise_name").notNull(),
    /** weight | e1rm | reps */
    kind: text("kind").notNull(),
    value: real("value").notNull(),
    weight: real("weight"),
    reps: integer("reps"),
    date: text("date").notNull(),
    sessionId: integer("session_id").references(() => workoutSessions.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("personal_records_uq").on(t.exerciseSlug, t.kind)],
);

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------
export const mealPlans = sqliteTable(
  "meal_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    source: text("source").notNull().default("template"), // template | ai
    calorieTarget: integer("calorie_target").notNull(),
    proteinTarget: integer("protein_target").notNull(),
    /** JSON PlannedMeal[] */
    meals: text("meals").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("meal_plans_date_uq").on(t.date)],
);

export const nutritionEntries = sqliteTable(
  "nutrition_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    mealType: text("meal_type").notNull().default("snack"),
    name: text("name").notNull(),
    calories: integer("calories").notNull().default(0),
    protein: integer("protein").notNull().default(0),
    carbs: integer("carbs").notNull().default(0),
    fat: integer("fat").notNull().default(0),
    fiber: integer("fiber"),
    /** manual | quick | plan | recipe | ai */
    source: text("source").notNull().default("manual"),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    planMealIndex: integer("plan_meal_index"),
    /** Linked cooked-meal row when the food was home-cooked */
    mealId: integer("meal_id").references(() => meals.id, { onDelete: "set null" }),
    /** Planned meal this entry fulfilled (eaten) */
    plannedMealId: integer("planned_meal_id"),
    savedFoodId: integer("saved_food_id"),
    /** true when the numbers are an estimate (AI or rough manual) rather than label/verified data */
    isEstimate: integer("is_estimate", { mode: "boolean" }).notNull().default(false),
    /** restaurant / brand name for eating-out entries */
    venue: text("venue"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("nutrition_entries_date_idx").on(t.date)],
);

/**
 * Planned meals are rows (not JSON) so each one has a lifecycle:
 * planned → prepared → eaten | skipped | replaced | discarded.
 * Only *eaten* meals ever count toward nutrition totals (via nutrition_entries).
 */
export const plannedMeals = sqliteTable(
  "planned_meals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    /** Position within the day (0..n) */
    slot: integer("slot").notNull().default(0),
    mealType: text("meal_type").notNull().default("dinner"),
    name: text("name").notNull(),
    calories: integer("calories").notNull().default(0),
    protein: integer("protein").notNull().default(0),
    carbs: integer("carbs").notNull().default(0),
    fat: integer("fat").notNull().default(0),
    /** JSON string[] (ingredient names) or [{name, qty, unit}] */
    ingredients: text("ingredients").notNull().default("[]"),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    notes: text("notes"),
    prepMinutes: integer("prep_minutes"),
    /** template | ai | manual | adjust */
    source: text("source").notNull().default("template"),
    /** planned | prepared | eaten | skipped | replaced | discarded */
    status: text("status").notNull().default("planned"),
    weekId: integer("week_id"),
    nutritionEntryId: integer("nutrition_entry_id"),
    /** Id of the meal that replaced this one (when status = replaced) */
    replacedById: integer("replaced_by_id"),
    statusChangedAt: text("status_changed_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("planned_meals_date_idx").on(t.date), index("planned_meals_week_idx").on(t.weekId)],
);

/** Foods the user saves for one-tap logging (restaurant items, quick macros, verified products). */
export const savedFoods = sqliteTable(
  "saved_foods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    brand: text("brand"),
    servingDesc: text("serving_desc"),
    calories: integer("calories").notNull(),
    protein: integer("protein").notNull().default(0),
    carbs: integer("carbs").notNull().default(0),
    fat: integer("fat").notNull().default(0),
    /** manual | restaurant | openfoodfacts | estimate | recipe */
    source: text("source").notNull().default("manual"),
    isEstimate: integer("is_estimate", { mode: "boolean" }).notNull().default(false),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("saved_foods_name_idx").on(t.name)],
);

// ---------------------------------------------------------------------------
// AI cache + notifications
// ---------------------------------------------------------------------------
export const aiCache = sqliteTable(
  "ai_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(), // workout | meals | quest | coach | review
    cacheKey: text("cache_key").notNull(),
    date: text("date").notNull(),
    response: text("response").notNull(),
    provider: text("provider"),
    model: text("model"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("ai_cache_key_uq").on(t.cacheKey)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** quest | workout | meals | level | rank | achievement | sobriety | review | system */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    key: text("key"),
    createdAt: text("created_at").notNull().default(now),
    readAt: text("read_at"),
  },
  (t) => [uniqueIndex("notifications_key_uq").on(t.key)],
);

export type QuestOffer = typeof questOffers.$inferSelect;
export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type ExerciseSet = typeof exerciseSets.$inferSelect;
export type PersonalRecord = typeof personalRecords.$inferSelect;
export type MealPlan = typeof mealPlans.$inferSelect;
export type NutritionEntry = typeof nutritionEntries.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

// ---------------------------------------------------------------------------
// Health samples (Apple Health / HealthKit via native bridge or Shortcut)
// ---------------------------------------------------------------------------
export const healthSamples = sqliteTable(
  "health_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** steps | active_energy | distance | exercise_minutes | stand_hours | sleep | resting_hr | heart_rate | hrv | body_mass | workout */
    type: text("type").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull().default(""),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    /** HealthKit source name (e.g. "Oura", "Tripp's Apple Watch", "iPhone") */
    sourceName: text("source_name").notNull().default("unknown"),
    sourceBundle: text("source_bundle"),
    device: text("device"),
    /** HKObject UUID when provided; otherwise a hash of type+start+end+source */
    uuid: text("uuid").notNull(),
    /** JSON: sleep stage, workout activity type, etc. */
    metadata: text("metadata").notNull().default("{}"),
    ingestedAt: text("ingested_at").notNull().default(now),
  },
  (t) => [uniqueIndex("health_samples_uuid_uq").on(t.uuid), index("health_samples_type_start_idx").on(t.type, t.startAt)],
);

/** Workouts reported by Apple Health, kept separately so they can be linked to (not duplicated with) logged sessions. */
export const healthWorkouts = sqliteTable(
  "health_workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull(),
    activityType: text("activity_type").notNull(),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    durationMin: integer("duration_min").notNull(),
    activeEnergyKcal: real("active_energy_kcal"),
    distanceKm: real("distance_km"),
    sourceName: text("source_name").notNull().default("unknown"),
    date: text("date").notNull(),
    /** Linked app workout row (manual log or finished session), when matched */
    workoutId: integer("workout_id").references(() => workouts.id, { onDelete: "set null" }),
    /** pending | linked | counted | ignored */
    status: text("status").notNull().default("pending"),
    /** A likely duplicate the user hasn't confirmed yet */
    suggestedWorkoutId: integer("suggested_workout_id"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("health_workouts_uuid_uq").on(t.uuid), index("health_workouts_date_idx").on(t.date)],
);

// ---------------------------------------------------------------------------
// Motivation
// ---------------------------------------------------------------------------
export const motivationReasons = sqliteTable("motivation_reasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------------
// Weekly food planning: grocery weeks, shopping list, pantry, meal prep
// ---------------------------------------------------------------------------
export const groceryWeeks = sqliteTable(
  "grocery_weeks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** First day the plan covers. Usually a Monday, but a supply run started on a Wednesday starts on that Wednesday. */
    weekStart: text("week_start").notNull(),
    /** How many days the plan covers (3–14). */
    spanDays: integer("days").notNull().default(7),
    /** week (regular weekly reset) | supply (ad-hoc "I'm shopping today" run) */
    kind: text("kind").notNull().default("week"),
    budget: real("budget").notNull().default(80),
    /** budget | balanced | flexible */
    budgetMode: text("budget_mode").notNull().default("balanced"),
    calorieTarget: integer("calorie_target").notNull(),
    proteinTarget: integer("protein_target").notNull(),
    /** JSON {breakfast, lunch, dinner, snacks, eatingOut} */
    mealsNeeded: text("meals_needed").notNull().default("{}"),
    /** JSON {quickWeekdays, mealPrep, highProtein, reuseIngredients, notes} */
    prefs: text("prefs").notNull().default("{}"),
    /** planning | planned | shopped | reviewed */
    status: text("status").notNull().default("planning"),
    source: text("source").notNull().default("template"),
    estimatedCost: real("estimated_cost"),
    actualCost: real("actual_cost"),
    /** JSON summary: reuse %, leftovers carried, rationale */
    summary: text("summary").notNull().default("{}"),
    shoppedAt: text("shopped_at"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("grocery_weeks_start_uq").on(t.weekStart)],
);

export const groceryItems = sqliteTable(
  "grocery_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekId: integer("week_id")
      .notNull()
      .references(() => groceryWeeks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** produce | protein | dairy | grains | frozen | pantry | other */
    category: text("category").notNull().default("other"),
    qty: real("qty").notNull().default(1),
    unit: text("unit").notNull().default("each"),
    estPrice: real("est_price"),
    actualQty: real("actual_qty"),
    actualPrice: real("actual_price"),
    purchased: integer("purchased", { mode: "boolean" }).notNull().default(false),
    skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
    /** JSON string[] meal names using this ingredient */
    usedIn: text("used_in").notNull().default("[]"),
    /** true when the item was not added (or reduced) because leftovers cover it */
    coveredByPantry: integer("covered_by_pantry", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    // ---- Reconciliation: the list is WHAT THE PLAN NEEDS minus WHAT YOU HAVE
    /** servings the planned meals need */
    requiredServings: real("required_servings"),
    /** servings the pantry can cover (compatible variant only) */
    onHandServings: real("on_hand_servings"),
    /** full | partial | none | confirm (pantry says "some") | manual (user said "I have it") | stock-up (buy anyway) */
    coverage: text("coverage"),
    /** canonical ingredient the row satisfies (family/variant aware) */
    canonical: text("canonical"),
    /** original ingredient when a food rule swapped it (e.g. "milk" → "lactose-free milk") */
    substitutedFrom: text("substituted_from"),
    /** JSON {name, count}[]: which meals, how many times */
    usedInCounts: text("used_in_counts"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("grocery_items_week_idx").on(t.weekId)],
);

export const pantryItems = sqliteTable(
  "pantry_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    qty: real("qty"),
    unit: text("unit").notNull().default("each"),
    /** none | some | lot — coarse level used by the leftover review */
    level: text("level"),
    purchasedAt: text("purchased_at"),
    expiresAt: text("expires_at"),
    /** grocery | manual | leftover | adventure */
    source: text("source").notNull().default("manual"),
    /** ingredient family ("milk") and exact variant ("lactose-free milk") */
    family: text("family"),
    variant: text("variant"),
    /** optional product / display metadata ("Fairlife Lactose-Free 2%") */
    product: text("product"),
    updatedAt: text("updated_at").notNull().default(now),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("pantry_items_name_uq").on(t.name)],
);

export const mealPrepSessions = sqliteTable(
  "meal_prep_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekId: integer("week_id").references(() => groceryWeeks.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    /** JSON [{name, servings, minutes}] */
    items: text("items").notNull().default("[]"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(60),
    /** JSON string[] recipe/meal names supported */
    supports: text("supports").notNull().default("[]"),
    /** planned | completed | skipped */
    status: text("status").notNull().default("planned"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("meal_prep_week_idx").on(t.weekId)],
);

export type PlannedMeal = typeof plannedMeals.$inferSelect;
export type SavedFood = typeof savedFoods.$inferSelect;
export type HealthSample = typeof healthSamples.$inferSelect;
export type HealthWorkout = typeof healthWorkouts.$inferSelect;
export type MotivationReason = typeof motivationReasons.$inferSelect;
export type GroceryWeek = typeof groceryWeeks.$inferSelect;
export type GroceryItem = typeof groceryItems.$inferSelect;
export type PantryItem = typeof pantryItems.$inferSelect;
export type LocalEvent = typeof localEvents.$inferSelect;
export type DayFlag = typeof dayFlags.$inferSelect;
export type MealPrepSession = typeof mealPrepSessions.$inferSelect;
