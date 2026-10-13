import type { DomainId } from "./types";

/**
 * Curated optional quest library. These are offered occasionally as
 * "special quests" and are always opt-in: declining has no penalty anywhere.
 *
 * Difficulty → XP bands (docs/ranking-methodology.md → Optional quests):
 *   common 15–30 · uncommon 30–60 · rare 60–100 · epic 100–250 · legendary = boss quests only
 */
export type QuestDifficulty = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type QuestKindLabel = "special" | "side" | "recovery" | "social" | "discipline" | "bonus";

export const DIFFICULTY_XP: Record<QuestDifficulty, [number, number]> = {
  common: [15, 30],
  uncommon: [30, 60],
  rare: [60, 100],
  epic: [100, 250],
  legendary: [250, 1000],
};

/** Signals the offer engine evaluates (all derived from real logs). */
export interface OfferSignals {
  hour: number; // local hour 0-23
  weekday: number; // 0 Sun
  workedOutToday: boolean;
  trainedHardYesterday: boolean;
  stepsToday: number | null;
  stepsTarget: number;
  mealsCookedToday: number;
  cookingBehindThisWeek: boolean;
  proteinLow: boolean; // nutrition tracked and below 60% of target by evening
  nutritionTracked: boolean;
  sleepPoorRecently: boolean; // 7-day avg below target by 45+ min
  bedtimeTarget: string | null;
  routinesDueTonight: boolean;
  habitsDueToday: number;
  dailyQuestsDone: number;
  dailyQuestsTotal: number;
  sobrietyActive: boolean;
  financeDueForCheckin: boolean;
  activeDomains: DomainId[];
  hasWorkoutPlanToday: boolean;
  planCompletedToday: boolean;
  readinessLow: boolean;
}

export interface LibraryQuest {
  key: string;
  kind: QuestKindLabel;
  domain: DomainId;
  title: string;
  description: string;
  difficulty: QuestDifficulty;
  estimatedMinutes: number;
  xp: number;
  /** Hours until expiry after offer. */
  expiresInHours: number;
  /** Earliest / latest local hour the quest may be offered. */
  window?: [number, number];
  /** Should this quest be offered given the signals? Higher weight = more likely. 0 = never. */
  weight: (s: OfferSignals) => number;
}

const active = (s: OfferSignals, d: DomainId) => s.activeDomains.includes(d);

export const QUEST_LIBRARY: LibraryQuest[] = [
  // ----------------------------------------------------------------- fitness
  {
    key: "walk20",
    kind: "special",
    domain: "fitness",
    title: "Take a 20-minute walk tonight",
    description: "Clear your mind. Build momentum.",
    difficulty: "uncommon",
    estimatedMinutes: 20,
    xp: 40,
    expiresInHours: 8,
    window: [15, 21],
    weight: (s) => (!active(s, "fitness") ? 0 : !s.workedOutToday ? 3 : 1),
  },
  {
    key: "steps8k",
    kind: "special",
    domain: "fitness",
    title: "Reach 8,000 steps today",
    description: "A stronger tomorrow starts with more ground covered today.",
    difficulty: "uncommon",
    estimatedMinutes: 40,
    xp: 45,
    expiresInHours: 12,
    window: [8, 17],
    weight: (s) => (!active(s, "fitness") || s.stepsToday == null ? 0 : s.stepsToday < 5000 ? 2 : 0.5),
  },
  {
    key: "mobility10",
    kind: "recovery",
    domain: "fitness",
    title: "10 minutes of mobility",
    description: "Hips, shoulders, spine. Slow and easy.",
    difficulty: "common",
    estimatedMinutes: 10,
    xp: 25,
    expiresInHours: 10,
    weight: (s) => (!active(s, "fitness") ? 0 : s.trainedHardYesterday || s.readinessLow ? 3 : 1),
  },
  {
    key: "stretch-bed",
    kind: "recovery",
    domain: "fitness",
    title: "Stretch for 10 minutes before bed",
    description: "Loosen up, sleep better.",
    difficulty: "common",
    estimatedMinutes: 10,
    xp: 30,
    expiresInHours: 6,
    window: [19, 23],
    weight: (s) => (!active(s, "fitness") ? 0 : s.workedOutToday ? 2 : 1),
  },
  {
    key: "planned-workout",
    kind: "special",
    domain: "fitness",
    title: "Complete today's planned workout",
    description: "The plan is written. Go execute it.",
    difficulty: "rare",
    estimatedMinutes: 50,
    xp: 70,
    expiresInHours: 14,
    window: [6, 18],
    weight: (s) => (active(s, "fitness") && s.hasWorkoutPlanToday && !s.planCompletedToday && !s.workedOutToday ? 3 : 0),
  },
  {
    key: "incline-walk",
    kind: "bonus",
    domain: "fitness",
    title: "Add a 10-minute incline walk after training",
    description: "Finish the session with easy cardio.",
    difficulty: "common",
    estimatedMinutes: 10,
    xp: 30,
    expiresInHours: 8,
    weight: (s) => (active(s, "fitness") && s.hasWorkoutPlanToday && !s.workedOutToday ? 1.5 : 0),
  },
  {
    key: "recovery-walk",
    kind: "recovery",
    domain: "fitness",
    title: "Easy 30-minute recovery walk",
    description: "Low readiness today — move gently and let the body catch up.",
    difficulty: "uncommon",
    estimatedMinutes: 30,
    xp: 45,
    expiresInHours: 12,
    weight: (s) => (active(s, "fitness") && s.readinessLow && !s.workedOutToday ? 4 : 0),
  },

  // ----------------------------------------------------------------- cooking
  {
    key: "cook-dinner",
    kind: "side",
    domain: "cooking",
    title: "Cook dinner tonight",
    description: "Fuel the journey. Anything you make yourself counts.",
    difficulty: "uncommon",
    estimatedMinutes: 35,
    xp: 45,
    expiresInHours: 8,
    window: [14, 20],
    weight: (s) => (!active(s, "cooking") ? 0 : s.cookingBehindThisWeek ? 3 : s.mealsCookedToday === 0 ? 1.5 : 0.3),
  },
  {
    key: "pantry-meal",
    kind: "side",
    domain: "cooking",
    title: "Cook a meal using only what's already in your kitchen",
    description: "No shopping trip. Improvise.",
    difficulty: "uncommon",
    estimatedMinutes: 30,
    xp: 55,
    expiresInHours: 10,
    window: [10, 19],
    weight: (s) => (!active(s, "cooking") ? 0 : 1),
  },
  {
    key: "new-recipe",
    kind: "side",
    domain: "cooking",
    title: "Try a recipe you've never made",
    description: "Range is what makes cooking sustainable.",
    difficulty: "rare",
    estimatedMinutes: 45,
    xp: 65,
    expiresInHours: 24,
    weight: (s) => (!active(s, "cooking") ? 0 : 0.8),
  },
  {
    key: "prep-lunch",
    kind: "discipline",
    domain: "cooking",
    title: "Prep tomorrow's lunch tonight",
    description: "Future you will be grateful at noon.",
    difficulty: "uncommon",
    estimatedMinutes: 20,
    xp: 40,
    expiresInHours: 6,
    window: [17, 22],
    weight: (s) => (!active(s, "cooking") ? 0 : s.weekday >= 0 && s.weekday <= 4 ? 1.2 : 0.4),
  },
  {
    key: "protein-breakfast",
    kind: "side",
    domain: "cooking",
    title: "Make a high-protein breakfast",
    description: "30g+ before 10am sets up the whole day.",
    difficulty: "common",
    estimatedMinutes: 15,
    xp: 30,
    expiresInHours: 5,
    window: [5, 9],
    weight: (s) => (!active(s, "cooking") ? 0 : 1),
  },
  {
    key: "protein-snack",
    kind: "side",
    domain: "cooking",
    title: "Add a high-protein snack",
    description: "You're behind on protein. Yogurt, eggs, a shake — close the gap.",
    difficulty: "common",
    estimatedMinutes: 5,
    xp: 20,
    expiresInHours: 5,
    window: [13, 21],
    weight: (s) => (active(s, "cooking") && s.nutritionTracked && s.proteinLow ? 3 : 0),
  },

  // ------------------------------------------------------------------- sleep
  {
    key: "winddown-early",
    kind: "recovery",
    domain: "sleep",
    title: "Begin your wind-down 30 minutes early",
    description: "Lights lower, screens dimmer, tomorrow sharper.",
    difficulty: "uncommon",
    estimatedMinutes: 30,
    xp: 35,
    expiresInHours: 5,
    window: [18, 22],
    weight: (s) => (!active(s, "sleep") ? 0 : s.sleepPoorRecently ? 3 : 1),
  },
  {
    key: "no-phone-bed",
    kind: "discipline",
    domain: "sleep",
    title: "No phone for 30 minutes before bed",
    description: "Read, stretch, or just sit. The feed will survive.",
    difficulty: "uncommon",
    estimatedMinutes: 30,
    xp: 35,
    expiresInHours: 6,
    window: [18, 23],
    weight: (s) => (!active(s, "sleep") ? 0 : 1.2),
  },
  {
    key: "bedtime-target",
    kind: "special",
    domain: "sleep",
    title: "In bed by your target tonight",
    description: "Rest builds stronger warriors.",
    difficulty: "common",
    estimatedMinutes: 0,
    xp: 25,
    expiresInHours: 8,
    window: [16, 22],
    weight: (s) => (!active(s, "sleep") || !s.bedtimeTarget ? 0 : s.sleepPoorRecently ? 2 : 0.8),
  },

  // ------------------------------------------------------------------ habits
  {
    key: "clean15",
    kind: "discipline",
    domain: "habits",
    title: "Clean your space for 15 minutes",
    description: "Set a timer. Stop when it rings.",
    difficulty: "uncommon",
    estimatedMinutes: 15,
    xp: 35,
    expiresInHours: 10,
    weight: (s) => (!active(s, "habits") ? 0 : 1),
  },
  {
    key: "read20",
    kind: "discipline",
    domain: "habits",
    title: "Read for 20 minutes",
    description: "Pages, not scrolling.",
    difficulty: "common",
    estimatedMinutes: 20,
    xp: 25,
    expiresInHours: 10,
    weight: (s) => (!active(s, "habits") ? 0 : 0.8),
  },
  {
    key: "avoided-task",
    kind: "discipline",
    domain: "habits",
    title: "Finish one task you've been avoiding",
    description: "The small dread you've been carrying. Put it down.",
    difficulty: "rare",
    estimatedMinutes: 30,
    xp: 70,
    expiresInHours: 12,
    weight: (s) => (!active(s, "habits") ? 0 : 0.9),
  },
  {
    key: "social-reach",
    kind: "social",
    domain: "habits",
    title: "Call or text someone you haven't talked to in a while",
    description: "Connection is a stat too.",
    difficulty: "uncommon",
    estimatedMinutes: 10,
    xp: 40,
    expiresInHours: 12,
    window: [10, 21],
    weight: () => 0.7,
  },
  {
    key: "bonus-stretch",
    kind: "bonus",
    domain: "fitness",
    title: "Bonus quest: 10-minute stretch",
    description: "You've already cleared today's board. One more for the road.",
    difficulty: "common",
    estimatedMinutes: 10,
    xp: 30,
    expiresInHours: 6,
    window: [15, 23],
    weight: (s) => (s.dailyQuestsTotal > 0 && s.dailyQuestsDone >= s.dailyQuestsTotal ? 2.5 : 0),
  },
  {
    key: "journal5",
    kind: "discipline",
    domain: "habits",
    title: "Write five lines about today",
    description: "What went well, what didn't, what's next.",
    difficulty: "common",
    estimatedMinutes: 5,
    xp: 20,
    expiresInHours: 6,
    window: [18, 23],
    weight: (s) => (!active(s, "habits") ? 0 : 0.8),
  },

  // ---------------------------------------------------------------- skincare
  {
    key: "pm-routine",
    kind: "special",
    domain: "skincare",
    title: "Complete your evening routine before 10pm",
    description: "Care for the vessel.",
    difficulty: "common",
    estimatedMinutes: 5,
    xp: 20,
    expiresInHours: 5,
    window: [17, 21],
    weight: (s) => (active(s, "skincare") && s.routinesDueTonight ? 1.2 : 0),
  },

  // ---------------------------------------------------------------- sobriety
  {
    key: "craving-swap",
    kind: "special",
    domain: "sobriety",
    title: "Do an alternative activity during your usual craving window",
    description: "Walk, shower, cook, call someone — anything that moves you through it.",
    difficulty: "uncommon",
    estimatedMinutes: 20,
    xp: 50,
    expiresInHours: 6,
    window: [16, 22],
    weight: (s) => (active(s, "sobriety") && s.sobrietyActive ? 1.2 : 0),
  },
  {
    key: "sober-evening",
    kind: "special",
    domain: "sobriety",
    title: "A clear evening, on purpose",
    description: "Plan something you'll enjoy tonight that doesn't involve what you're stepping away from.",
    difficulty: "uncommon",
    estimatedMinutes: 60,
    xp: 45,
    expiresInHours: 8,
    window: [14, 19],
    weight: (s) => (active(s, "sobriety") && s.sobrietyActive && (s.weekday === 5 || s.weekday === 6) ? 2 : 0),
  },

  // ------------------------------------------------------------------ wealth
  {
    key: "review-spending",
    kind: "discipline",
    domain: "wealth",
    title: "Review this week's spending",
    description: "Ten minutes with the statements. No judgement, just awareness.",
    difficulty: "uncommon",
    estimatedMinutes: 10,
    xp: 35,
    expiresInHours: 24,
    weight: (s) => (!active(s, "wealth") ? 0 : s.weekday === 0 || s.weekday === 6 ? 1.5 : 0.5),
  },
  {
    key: "move-savings",
    kind: "discipline",
    domain: "wealth",
    title: "Move your planned amount into savings",
    description: "Pay the future first.",
    difficulty: "uncommon",
    estimatedMinutes: 5,
    xp: 40,
    expiresInHours: 24,
    weight: (s) => (!active(s, "wealth") ? 0 : 0.6),
  },
  {
    key: "no-spend-evening",
    kind: "discipline",
    domain: "wealth",
    title: "No-spend evening",
    description: "Nothing ordered, nothing delivered. Use what you have.",
    difficulty: "common",
    estimatedMinutes: 0,
    xp: 25,
    expiresInHours: 8,
    window: [15, 20],
    weight: (s) => (!active(s, "wealth") ? 0 : 0.8),
  },
  {
    key: "finance-checkin",
    kind: "special",
    domain: "wealth",
    title: "Do your monthly financial check-in",
    description: "It's been a month. Ten minutes keeps your wealth rank honest.",
    difficulty: "uncommon",
    estimatedMinutes: 10,
    xp: 40,
    expiresInHours: 48,
    weight: (s) => (active(s, "wealth") && s.financeDueForCheckin ? 2 : 0),
  },
];

export const QUEST_LIBRARY_MAP = new Map(QUEST_LIBRARY.map((q) => [q.key, q]));

/** Safety guardrails for any candidate quest (library or AI). */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(fast|fasting|skip (a )?meal|no food|starv|under \d{3,4} calories|calorie restrict|cut calories|lose \d+ ?(lb|pounds|kg))\b/i,
  /\b(max(imum)? (out|effort)|1 ?rm|one[- ]rep max|pr attempt|as heavy as|until failure|to failure)\b/i,
  /\b(all[- ]nighter|stay up|sleep (less|deprivation)|skip sleep|no sleep)\b/i,
  /\b(\d{3,}|two|three|four|five) (push ?ups|pull ?ups|burpees|squats)\b/i,
  /\b(\d+ hours? of (running|cardio)|marathon|ultra|\b[5-9]\d km)\b/i,
  /\b(drink|drinks|beer|wine|shots?|cocktail|vape|smoke|weed|edible)\b/i,
  /\b(bet|gamble|gambling|casino|lottery|crypto|leverage|margin)\b/i,
  /\b(dare|prank|cold plunge for \d{2,}|ice bath for \d{2,}|hold your breath)\b/i,
  /\b(laxative|purge|diet pill|supplement stack|steroid)\b/i,
];

export function violatesSafety(text: string): string | null {
  for (const p of FORBIDDEN_PATTERNS) if (p.test(text)) return `matched ${p.source.slice(0, 40)}`;
  return null;
}
