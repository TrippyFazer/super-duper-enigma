/**
 * Development seed: creates an onboarded character with ~75 days of realistic,
 * imperfect history so charts, ranks, quests and achievements have something
 * to show. Safe to run on an empty database; refuses to run on one that
 * already has a character unless --force is passed.
 *
 *   npm run db:seed            # seed if empty
 *   npm run db:seed -- --force # wipe and reseed
 */
import fs from "node:fs";
import { getDb, resolveDbPath } from "../src/db/client";
import { seedRecipes } from "../src/db/seed";
import { profiles, recipes as recipesTable, routines, habits, sobrietyRuns, scoreSnapshots } from "../src/db/schema";
import { assessCharacter } from "../src/ranking/engine";
import { addDays, todayInTz, weekday } from "../src/lib/dates";
import * as m from "../src/services/mutations";
import { getProfile, updateProfile } from "../src/services/profile";
import { buildEngineInput, reconcile } from "../src/services/progression";
import { awardXp } from "../src/services/xp";
import { eq } from "drizzle-orm";

const force = process.argv.includes("--force");
const dbPath = resolveDbPath();
if (force) {
  for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(dbPath + s)) fs.rmSync(dbPath + s);
}
const db = getDb();
const existing = db.select().from(profiles).limit(1).get();
if (existing?.onboardingCompletedAt && !force) {
  console.log("A character already exists. Re-run with --force to wipe and reseed.");
  process.exit(0);
}

// Deterministic pseudo-random so seeds are reproducible.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const chance = (p: number) => rand() < p;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const tz = "America/New_York";
const today = todayInTz(tz);
const DAYS = 75;
const start = addDays(today, -DAYS);

updateProfile({
  name: "Tripp",
  age: 29,
  timezone: tz,
  activeDomains: ["fitness", "sleep", "cooking", "wealth", "skincare", "sobriety", "habits"],
  baseline: { workoutsPerWeek: 3, exerciseTypes: ["strength", "cardio"], avgSleepHours: 7, consistentSchedule: false, mealsCookedPerWeek: 6, skincareDaysPerWeek: 4 },
  targets: { stepsTarget: 8000, bedtimeTarget: "23:00", sleepTargetMin: 450, workoutsPerWeekTarget: 4, mealsPerWeekTarget: 8 },
  goals: "Hit B rank fitness by spring. Cook most dinners. Keep the streak.",
  onboardingCompletedAt: new Date(start + "T12:00:00Z").toISOString(),
});
db.update(profiles).set({ createdAt: new Date(start + "T12:00:00Z").toISOString() }).where(eq(profiles.id, 1)).run();
seedRecipes();
awardXp("onboarding", start);

const am = m.createRoutine({ name: "Morning routine", timeOfDay: "morning", steps: ["Cleanser", "Moisturizer", "SPF"] });
const pm = m.createRoutine({ name: "Evening routine", timeOfDay: "evening", steps: ["Cleanser", "Retinoid", "Moisturizer"] });
const hRead = m.createHabit({ name: "Read 20 minutes", icon: "📖", scheduleType: "daily" });
const hMed = m.createHabit({ name: "Meditate", icon: "🧘", scheduleType: "weekdays", weekdays: [1, 2, 3, 4, 5] });
const hStudy = m.createHabit({ name: "Work on project", icon: "💻", scheduleType: "times_per_week", timesPerWeek: 3 });
const tAlc = m.createSobrietyTracker({ name: "Alcohol", category: "alcohol", startedAt: new Date(addDays(today, -52) + "T02:00:00Z").toISOString() });
// An earlier run that ended 60 days ago, so history shows a reset (never erased).
db.insert(sobrietyRuns).values({ trackerId: tAlc, startedAt: new Date(addDays(today, -120) + "T02:00:00Z").toISOString(), endedAt: new Date(addDays(today, -60) + "T22:00:00Z").toISOString(), note: "Wedding weekend." }).run();

const recipes = db.select().from(recipesTable).all();
const dishes = recipes.map((r) => ({ id: r.id, name: r.name, type: r.mealType }));

// Backdate created_at so habits/routines are "scheduled" across the history.
db.update(routines).set({ createdAt: `${start}T12:00:00Z` }).run();
db.update(habits).set({ createdAt: `${start}T12:00:00Z` }).run();

for (let i = 0; i <= DAYS; i++) {
  const d = addDays(start, i);
  const wd = weekday(d);
  const momentum = Math.min(1, 0.55 + i / DAYS / 1.6); // gets more consistent over time

  // Fitness: lifts Mon/Wed/Fri, cardio Tue/Sat, sometimes skips
  if ([1, 3, 5].includes(wd) && chance(0.8 * momentum + 0.1)) m.logWorkout({ date: d, type: "strength", durationMin: pick([45, 55, 60]), intensity: pick([2, 2, 3]) });
  if ([2, 6].includes(wd) && chance(0.65 * momentum + 0.1)) m.logWorkout({ date: d, type: "cardio", durationMin: pick([30, 40, 50]), intensity: pick([2, 3]) });
  if (wd === 0 && chance(0.3)) m.logWorkout({ date: d, type: "walk", durationMin: 60, intensity: 1 });
  m.logSteps({ date: d, steps: Math.round(5500 + rand() * 5000 + (wd === 0 || wd === 6 ? 1500 : 0)) });

  // Sleep: ~7h, bedtime drifts, better recently
  const bedMin = 22 * 60 + 40 + Math.round((rand() - 0.5) * (wd === 5 || wd === 6 ? 150 : 70) * (1.3 - momentum * 0.5));
  const total = Math.round(400 + rand() * 90 + (momentum - 0.6) * 40);
  const wake = (bedMin + total + 20) % 1440;
  const hh = (n: number) => `${String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((n % 60) + 60) % 60).padStart(2, "0")}`;
  if (chance(0.93)) m.logSleep({ date: d, totalSleepMin: total, bedtime: hh(bedMin), waketime: hh(wake), quality: total > 450 ? pick([4, 5]) : pick([2, 3, 4]) });

  // Cooking: dinner most nights, lunch sometimes, breakfast on weekends
  if (chance(0.72 * momentum + 0.15)) {
    const r = pick(dishes.filter((x) => x.type === "dinner"));
    m.logMeal({ date: d, mealType: "dinner", name: r.name, recipeId: r.id });
  }
  if (chance(0.35)) {
    const r = pick(dishes.filter((x) => x.type === "lunch"));
    m.logMeal({ date: d, mealType: "lunch", name: r.name, recipeId: r.id });
  }
  if ((wd === 0 || wd === 6) && chance(0.6)) {
    const r = pick(dishes.filter((x) => x.type === "breakfast"));
    m.logMeal({ date: d, mealType: "breakfast", name: r.name, recipeId: r.id });
  }

  // Skincare: AM most days, PM a bit less
  if (chance(0.85 * momentum + 0.1)) m.completeRoutine({ routineId: am, date: d });
  if (chance(0.7 * momentum + 0.1)) m.completeRoutine({ routineId: pm, date: d });

  // Habits
  if (chance(0.8 * momentum + 0.1)) m.completeHabit({ habitId: hRead, date: d });
  if (wd >= 1 && wd <= 5 && chance(0.7 * momentum + 0.1)) m.completeHabit({ habitId: hMed, date: d });
  if ([1, 3, 5].includes(wd) && chance(0.75)) m.completeHabit({ habitId: hStudy, date: d });
}

// Financial check-ins: monthly, improving
m.addFinancialSnapshot({ date: addDays(today, -62), liquidSavings: 6500, monthlyExpenses: 3200, monthlyIncome: 6400, savingsRatePct: 12, highInterestDebt: 2400, totalDebt: 18400, netWorth: 31000, retirementBalance: 24000, investsMonthly: true });
m.addFinancialSnapshot({ date: addDays(today, -31), liquidSavings: 7900, monthlyExpenses: 3150, monthlyIncome: 6400, savingsRatePct: 16, highInterestDebt: 1100, totalDebt: 16900, netWorth: 35500, retirementBalance: 25800, investsMonthly: true });
m.addFinancialSnapshot({ date: addDays(today, -2), liquidSavings: 9600, monthlyExpenses: 3100, monthlyIncome: 6600, savingsRatePct: 18, highInterestDebt: 0, totalDebt: 15600, netWorth: 40800, retirementBalance: 27900, investsMonthly: true });

// Mark a few recipes as favorites
for (const r of recipes.slice(0, 4)) m.toggleRecipeFlag(r.id, "isFavorite", true);

// Rebuild daily score snapshots so history charts have a curve: run the engine as-of each day.
// (reconcile() only writes today; for seed data we backfill by temporarily shifting "today".)
const profile = getProfile();
for (let i = 1; i <= DAYS; i++) {
  const d = addDays(start, i);
  const input = buildEngineInput({ ...profile, today: d });
  for (const k of ["fitness", "sleep", "cooking", "wealth", "skincare", "sobriety", "habits"] as const) {
    const dom = input[k]!;
    (dom as { asOf: string }).asOf = d;
  }
  (input.sobriety as { now: Date }).now = new Date(d + "T20:00:00Z");
  const a = assessCharacter(input);
  db.insert(scoreSnapshots).values({ date: d, domain: "overall", score: a.overall.score, rank: a.overall.rank }).onConflictDoNothing().run();
  for (const dm of a.domains) db.insert(scoreSnapshots).values({ date: d, domain: dm.domain, score: dm.score, rank: dm.rank }).onConflictDoNothing().run();
}

const r = reconcile();
console.log(`Seeded ${DAYS} days. Level ${r.assessment.level.level}, overall ${r.assessment.overall.rank} (${r.assessment.overall.score}).`);
for (const d of r.assessment.domains) console.log(`  ${d.domain.padEnd(9)} ${d.rank}  ${d.score}`);
console.log(`Achievements unlocked: ${r.newAchievements.length}`);
