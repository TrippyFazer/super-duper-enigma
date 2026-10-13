import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { characterEvents, groceryWeeks, mealPrepSessions, quests, rankHistory, scoreSnapshots, userAchievements, type Quest } from "@/db/schema";
import { pantryCount } from "./pantry";
import { addDays, dateInTz, diffDays, endOfWeek, lastNDays, startOfWeek, hhmmToMinutes, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import { ACHIEVEMENT_MAP, evaluateAchievements, type AchievementDef } from "@/ranking/achievements";
import type { ProgressionContext } from "@/ranking/context";
import { DOMAINS } from "@/ranking/domains";
import { computeHabitStats } from "@/ranking/domains/habits";
import { routineAdherence, routineStreak } from "@/ranking/domains/skincare";
import { trackerStats } from "@/ranking/domains/sobriety";
import { assessCharacter, type EngineInput } from "@/ranking/engine";
import { levelFromXp } from "@/ranking/levels";
import { periodFor, QUEST_TEMPLATE_MAP, selectQuestTemplates, type QuestTemplate } from "@/ranking/quests";
import { RANK_LABELS, rankIndex } from "@/ranking/ranks";
import type { CharacterAssessment, DomainId, Rank } from "@/ranking/types";
import { SOBRIETY_MILESTONES } from "@/ranking/xp";
import {
  loadActivity,
  loadAllMealsCount,
  loadFinancialSnapshots,
  loadHabitCompletions,
  loadHabits,
  loadIntegration,
  loadMeals,
  loadRoutineCompletions,
  loadRoutines,
  loadSleep,
  loadSobriety,
  loadWorkouts,
} from "./loaders";
import { getProfile, updateProfile, type ProfileView } from "./profile";
import { awardXp, totalXp, voidXpForSource, liveEventsWithPrefix } from "./xp";
import { recordEvent } from "./events";
import { strengthProgress, recentSessions, getPlanForDate } from "./workouts";
import { nutritionConsistency, resolveTargets, dayTotals } from "./nutrition";
import { pushNotification } from "./notifications";
import { listOffers, offersCompletedCount } from "./questOffers";
import { RANK_VISUALS } from "@/ranking/rankVisuals";
import { SAFE_MIN_CALORIES } from "./preferences";
export { recordEvent } from "./events";

// ---------------------------------------------------------------------------
// Engine input
// ---------------------------------------------------------------------------
export function buildEngineInput(profile: ProfileView): EngineInput {
  const today = profile.today;
  const startedOn = profile.onboardingCompletedAt ? dateInTz(new Date(profile.onboardingCompletedAt), profile.timezone) : null;
  const sob = loadSobriety();

  return {
    activeDomains: profile.activeDomains,
    totalXp: totalXp(),
    fitness: {
      asOf: today,
      workouts: loadWorkouts(today).map((w) => ({ date: w.date, type: w.type, durationMin: w.durationMin, intensity: w.intensity })),
      activity: loadActivity(today).map((a) => ({ date: a.date, steps: a.steps, activeMinutes: a.activeMinutes })),
      baseline: {
        workoutsPerWeek: profile.baseline.workoutsPerWeek,
        exerciseTypes: profile.baseline.exerciseTypes,
        stepsPerDay: profile.baseline.stepsPerDay,
      },
      startedOn,
      stepsTarget: profile.targets.stepsTarget,
      strength: strengthProgress(today),
    },
    sleep: {
      asOf: today,
      entries: loadSleep(today).map((e) => ({
        date: e.date,
        totalSleepMin: e.totalSleepMin,
        bedtimeStart: e.bedtimeStart,
        bedtimeEnd: e.bedtimeEnd,
        efficiency: e.efficiency,
        sleepScore: e.sleepScore,
        readinessScore: e.readinessScore,
        restingHr: e.restingHr,
        hrv: e.hrv,
        quality: e.quality,
      })),
      baseline: { avgSleepHours: profile.baseline.avgSleepHours, consistentSchedule: profile.baseline.consistentSchedule },
      startedOn,
      sleepTargetMin: profile.targets.sleepTargetMin,
      bedtimeTarget: profile.targets.bedtimeTarget,
    },
    cooking: {
      asOf: today,
      meals: loadMeals(today).map((m) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId, name: m.name, isNewRecipe: m.isNewRecipe })),
      baseline: { mealsCookedPerWeek: profile.baseline.mealsCookedPerWeek },
      startedOn,
      mealsPerWeekTarget: profile.targets.mealsPerWeekTarget,
      nutrition: (() => {
        const t = resolveTargets(profile.preferences.nutrition, profile);
        const c = nutritionConsistency(today, 30, t.protein, SAFE_MIN_CALORIES(profile.sex));
        return c.loggedDays > 0 && !t.unsafe ? c : null;
      })(),
    },
    wealth: {
      asOf: today,
      snapshots: loadFinancialSnapshots(),
      age: profile.age,
      startedOn,
    },
    skincare: {
      asOf: today,
      routines: loadRoutines().map((r) => ({
        id: r.id,
        timeOfDay: r.timeOfDay,
        steps: r.stepsParsed,
        active: r.active,
        createdOn: dateInTz(new Date(r.createdAt), profile.timezone),
      })),
      completions: loadRoutineCompletions(today).map((c) => ({ routineId: c.routineId, date: c.date, complete: c.complete, stepsCompleted: c.stepsCompletedParsed })),
      baseline: { daysPerWeek: profile.baseline.skincareDaysPerWeek },
      startedOn,
    },
    sobriety: {
      asOf: today,
      now: new Date(),
      timezone: profile.timezone,
      trackers: sob.map((t) => ({ id: t.id, name: t.name, category: t.category, active: t.active, runs: t.runs.map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt })) })),
      startedOn,
    },
    habits: {
      asOf: today,
      habits: loadHabits().map((h) => ({
        id: h.id,
        name: h.name,
        scheduleType: h.scheduleType,
        weekdays: h.weekdaysParsed,
        timesPerWeek: h.timesPerWeek,
        active: h.active,
        createdOn: dateInTz(new Date(h.createdAt), profile.timezone),
      })),
      completions: loadHabitCompletions(today).map((c) => ({ habitId: c.habitId, date: c.date })),
      startedOn,
    },
  };
}

export function getAssessment(profile = getProfile()): CharacterAssessment {
  return assessCharacter(buildEngineInput(profile));
}

// ---------------------------------------------------------------------------
// Context for quests/achievements
// ---------------------------------------------------------------------------
export function buildContext(profile: ProfileView, input: EngineInput, assessment: CharacterAssessment): ProgressionContext {
  const today = profile.today;
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const inWeek = (d: ISODate) => d >= weekStart && d <= weekEnd;
  const last30 = lastNDays(today, 30);
  const d30start = last30[0];

  // Fitness
  const ws = input.fitness!.workouts;
  const sessionsOnDay = (d: ISODate) => Math.min(2, ws.filter((w) => w.date === d).length);
  const sessionsThisWeek = new Set(ws.filter((w) => inWeek(w.date)).map((w) => w.date)).size;
  const weekStarts: ISODate[] = [];
  for (let i = 1; i <= 4; i++) weekStarts.push(addDays(weekStart, -7 * i));
  const sessionsPerWeek = weekStarts.map((s) => new Set(ws.filter((w) => w.date >= s && w.date <= addDays(s, 6)).map((w) => w.date)).size);
  const avgSessionsLast4Weeks = sessionsPerWeek.reduce((a, b) => a + b, 0) / 4;
  let activeWeekStreak = sessionsThisWeek >= 3 ? 1 : 0;
  for (let i = 1; i < 60; i++) {
    const s = addDays(weekStart, -7 * i);
    const n = new Set(ws.filter((w) => w.date >= s && w.date <= addDays(s, 6)).map((w) => w.date)).size;
    if (n >= 3) activeWeekStreak++;
    else break;
  }
  const act = input.fitness!.activity;
  const stepsToday = act.find((a) => a.date === today)?.steps ?? null;
  const act30 = act.filter((a) => a.date >= d30start && a.steps != null);
  const avgSteps30 = act30.length ? act30.reduce((a, b) => a + (b.steps ?? 0), 0) / act30.length : null;

  // Sleep
  const se = input.sleep!.entries;
  const sleepTargetMin = profile.targets.sleepTargetMin;
  const s30 = se.filter((e) => e.date >= d30start);
  const lastNight = se.find((e) => e.date === today) ?? null;
  let inBedByTarget: boolean | null = null;
  if (lastNight?.bedtimeStart && profile.targets.bedtimeTarget) {
    const m = lastNight.bedtimeStart.match(/T(\d{2}):(\d{2})/);
    if (m) {
      const bed = Number(m[1]) * 60 + Number(m[2]);
      const target = hhmmToMinutes(profile.targets.bedtimeTarget);
      // Bedtimes before 04:00 count as "late previous evening".
      const bedAdj = bed < 240 ? bed + 1440 : bed;
      const targetAdj = target < 240 ? target + 1440 : target;
      inBedByTarget = bedAdj <= targetAdj + 15;
    }
  }
  const earlyWakes30 = s30.filter((e) => {
    const m = e.bedtimeEnd?.match(/T(\d{2}):(\d{2})/);
    return m && Number(m[1]) * 60 + Number(m[2]) <= 7 * 60;
  }).length;
  const oura = loadIntegration("oura");

  // Cooking
  const ms = input.cooking!.meals;
  const cappedCount = (list: typeof ms) => {
    const byDay = new Map<string, number>();
    for (const m of list) byDay.set(m.date, Math.min(3, (byDay.get(m.date) ?? 0) + 1));
    return [...byDay.values()].reduce((a, b) => a + b, 0);
  };
  const mealsPerWeek = weekStarts.map((s) => cappedCount(ms.filter((m) => m.date >= s && m.date <= addDays(s, 6))));
  const distinct30 = new Set(ms.filter((m) => m.date >= d30start).map((m) => (m.recipeId != null ? `r${m.recipeId}` : m.name.toLowerCase()))).size;

  // Skincare
  const sk = input.skincare!;
  const activeRoutines = sk.routines.filter((r) => r.active);
  const completedToday = activeRoutines.filter((r) => sk.completions.some((c) => c.routineId === r.id && c.date === today && c.complete)).length;
  const weekDays = lastNDays(weekEnd, 7).filter((d) => d <= today);
  const weekAdh = routineAdherence(activeRoutines, sk.completions, weekDays);
  const adh30 = routineAdherence(activeRoutines, sk.completions, last30.filter((d) => d !== today || completedToday === activeRoutines.length));
  const firstCompletion = sk.completions.map((c) => c.date).sort()[0];

  // Habits
  const hb = input.habits!;
  const hstats = computeHabitStats(hb.habits.filter((h) => h.active), hb.completions, today);
  const weekScheduled = hstats.reduce((a, s) => a + Math.min(s.thisWeekTarget, weekDays.length), 0);
  const weekCompleted = hstats.reduce((a, s) => a + Math.min(s.thisWeekDone, s.thisWeekTarget), 0);
  const withData = hstats.filter((s) => s.scheduled30 > 0);

  // Sobriety
  const sobStats = input.sobriety!.trackers.filter((t) => t.active).map((t) => trackerStats(t, input.sobriety!.now, today, profile.timezone));

  // Wealth
  const snaps = input.wealth!.snapshots;
  const latest = snaps[snaps.length - 1];
  const emergencyMonths = latest?.liquidSavings != null && latest.monthlyExpenses ? latest.liquidSavings / latest.monthlyExpenses : null;

  const xp = totalXp();
  const unlocked = new Set(getDb().select({ key: userAchievements.key }).from(userAchievements).all().map((r) => r.key));

  const bestRanks: Partial<Record<DomainId | "overall", Rank>> = {};
  for (const r of getDb().select().from(rankHistory).all()) {
    const k = r.domain as DomainId | "overall";
    if (!bestRanks[k] || rankIndex(r.rank as Rank) > rankIndex(bestRanks[k]!)) bestRanks[k] = r.rank as Rank;
  }

  return {
    today,
    weekStart,
    weekEnd,
    activeDomains: profile.activeDomains,
    assessment,
    bestRanks,
    fitness: {
      workoutsToday: sessionsOnDay(today),
      sessionsThisWeek,
      avgSessionsLast4Weeks,
      totalWorkouts: ws.length,
      stepsToday,
      stepsTarget: profile.targets.stepsTarget,
      hasStepData: act.some((a) => a.date >= addDays(today, -14)),
      avgSteps30,
      daysAtStepTarget30: act30.filter((a) => (a.steps ?? 0) >= profile.targets.stepsTarget).length,
      activeWeekStreak,
    },
    sleep: {
      loggedToday: !!lastNight,
      nightsThisWeekAtTarget: se.filter((e) => inWeek(e.date) && e.totalSleepMin >= sleepTargetMin).length,
      avg30: s30.length ? s30.reduce((a, b) => a + b.totalSleepMin, 0) / s30.length : null,
      logs30: s30.length,
      totalLogs: se.length,
      hasOura: !!oura?.enabled,
      sleepTargetMin,
      bedtimeTarget: profile.targets.bedtimeTarget,
      inBedByTargetLastNight: inBedByTarget,
      earlyWakes30,
    },
    cooking: {
      mealsToday: Math.min(3, ms.filter((m) => m.date === today).length),
      mealsThisWeek: cappedCount(ms.filter((m) => inWeek(m.date))),
      totalMeals: loadAllMealsCount(),
      newRecipesTotal: ms.filter((m) => m.isNewRecipe).length,
      avgMealsLast4Weeks: mealsPerWeek.reduce((a, b) => a + b, 0) / 4,
      target: profile.targets.mealsPerWeekTarget,
      distinctRecipes30: distinct30,
    },
    skincare: {
      routinesCount: activeRoutines.length,
      completedToday,
      completionsThisWeek: weekAdh.completed,
      scheduledThisWeek: weekAdh.scheduled,
      adherence30: adh30.ratio,
      streak: routineStreak(activeRoutines, sk.completions, today),
      totalCompletions: sk.completions.filter((c) => c.complete).length,
      daysTracked: firstCompletion ? diffDays(firstCompletion, today) + 1 : 0,
    },
    habits: {
      count: hstats.length,
      dueToday: hstats.filter((s) => s.dueToday).length,
      doneToday: hstats.filter((s) => s.dueToday && s.doneToday).length + hstats.filter((s) => !s.dueToday && s.doneToday).length,
      weekCompleted,
      weekScheduled,
      bestStreak: hstats.length ? Math.max(...hstats.map((s) => s.streak)) : 0,
      totalCompletions: hb.completions.length,
      adherence30: withData.length ? withData.reduce((a, s) => a + s.adherence30, 0) / withData.length : 0,
    },
    sobriety: sobStats,
    wealth: {
      snapshots: snaps.length,
      daysSinceLast: latest ? diffDays(latest.date, today) : null,
      emergencyMonths,
      investsMonthlyCount: snaps.filter((s) => s.investsMonthly).length,
      noHighInterestDebt: latest ? (latest.highInterestDebt == null ? null : latest.highInterestDebt <= 0) : null,
    },
    xp: { total: xp, level: levelFromXp(xp).level },
    unlocked,
    special: (() => {
      const offers = listOffers({ limit: 200 });
      return { completed: offersCompletedCount(), accepted: offers.filter((o) => o.status === "accepted").length, offeredToday: offers.filter((o) => o.date === today).length };
    })(),
    training: (() => {
      const sessions = recentSessions(400, today);
      // A "PR" for achievements means an improvement over a previous record (baselines don't count).
      const prs = liveEventsWithPrefix("personal_record:");
      const plan = getPlanForDate(today);
      return { sessions: sessions.length, prs: prs.length, planToday: !!plan, planCompletedToday: plan?.status === "completed" };
    })(),
    nutrition: (() => {
      const t = resolveTargets(profile.preferences.nutrition, profile);
      const c = nutritionConsistency(today, 30, t.protein, SAFE_MIN_CALORIES(profile.sex));
      const todayT = dayTotals(today);
      return { loggedDays30: c.loggedDays, proteinDays30: c.proteinDays, proteinToday: todayT.protein, proteinTarget: t.protein, caloriesToday: todayT.calories, calorieTarget: t.calories, unsafeTargets: t.unsafe };
    })(),
    food: (() => {
      const db = getDb();
      // The week that "this week's" planning quest refers to: when planning ahead on Sat/Sun, the upcoming week also counts.
      const candidates = [weekStart, addDays(weekStart, 7)];
      const rows = db.select().from(groceryWeeks).where(inArray(groceryWeeks.weekStart, candidates)).all();
      const wk = rows.find((r) => r.weekStart === weekStart && r.status !== "planning") ?? rows.find((r) => r.status !== "planning") ?? rows[0];
      const prep = wk ? db.select().from(mealPrepSessions).where(and(eq(mealPrepSessions.weekId, wk.id), eq(mealPrepSessions.status, "completed"))).get() : null;
      const all = db.select().from(groceryWeeks).all();
      return {
        weekPlanned: !!wk && wk.status !== "planning",
        shopped: !!wk && (wk.status === "shopped" || wk.status === "reviewed"),
        shoppedWithinBudget: wk && wk.actualCost != null && (wk.status === "shopped" || wk.status === "reviewed") ? wk.actualCost <= wk.budget * 1.05 : null,
        prepCompleted: !!prep,
        weeksPlanned: all.filter((w) => w.status !== "planning").length,
        pantryItems: pantryCount(),
        leftoverReviews: all.filter((w) => w.reviewedAt).length,
      };
    })(),
  };
}

// ---------------------------------------------------------------------------
// Reconcile: quests, achievements, rank history, snapshots, milestones
// ---------------------------------------------------------------------------
export interface ReconcileResult {
  assessment: CharacterAssessment;
  context: ProgressionContext;
  newAchievements: AchievementDef[];
  completedQuests: Quest[];
  rankUps: { domain: DomainId | "overall"; from: Rank | null; to: Rank }[];
  levelUp: { from: number; to: number } | null;
  xpGained: number;
}

export interface QuestView extends Quest {
  paramsParsed: Record<string, unknown>;
  pct: number;
  done: boolean;
}

/**
 * The single place where "the world advances". Called after every mutation
 * and on dashboard load. Idempotent: running it twice awards nothing twice.
 */
export function reconcile(): ReconcileResult {
  const db = getDb();
  const profile = getProfile();
  const today = profile.today;
  const xpBefore = totalXp();
  const levelBefore = levelFromXp(xpBefore).level;

  let input = buildEngineInput(profile);
  let assessment = assessCharacter(input);
  let context = buildContext(profile, input, assessment);

  // 1. Sobriety milestones (XP once per tracker per milestone)
  for (const t of context.sobriety) {
    for (const m of SOBRIETY_MILESTONES) {
      if (t.currentDays >= m.days && t.currentRunStart) {
        const runKey = t.currentRunStart.slice(0, 19);
        awardXp("sobriety_milestone", today, {
          suffix: `${t.trackerId}:${runKey}:${m.days}`,
          amount: m.xp,
          description: `${t.name}: ${m.label} milestone`,
          source: { type: "sobriety", id: `${t.trackerId}:${runKey}:${m.days}` },
        });
        recordEvent({
          type: "milestone",
          key: `sob:${t.trackerId}:${runKey}:${m.days}`,
          title: `${m.label} ${t.name.toLowerCase()}-free`,
          description: `Reached the ${m.label} milestone on ${t.name}.`,
          domain: "sobriety",
        });
      }
    }
  }

  // 2. Quests: ensure instances exist for current periods, update progress, complete.
  const completedQuests = ensureAndUpdateQuests(context, today);

  // 3. Achievements — revoke recent ones whose condition no longer holds (their source was deleted), then evaluate new.
  const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
  for (const ua of db.select().from(userAchievements).where(gte(userAchievements.unlockedAt, cutoff)).all()) {
    const def = ACHIEVEMENT_MAP.get(ua.key);
    if (!def) continue;
    let holds = true;
    try {
      holds = def.check(context);
    } catch {
      holds = true;
    }
    if (!holds) {
      voidXpForSource({ type: "achievement", id: ua.key }, "achievement condition no longer met");
      db.delete(userAchievements).where(eq(userAchievements.id, ua.id)).run();
      db.delete(characterEvents).where(eq(characterEvents.key, `ach:${ua.key}`)).run();
      if (def.title && profile.equippedTitle === def.title) updateProfile({ equippedTitle: null });
      context.unlocked.delete(ua.key);
    }
  }
  const newAchievements = evaluateAchievements(context);
  for (const a of newAchievements) {
    db.insert(userAchievements).values({ key: a.key }).onConflictDoNothing().run();
    if (a.xp > 0) awardXp("achievement", today, { suffix: a.key, amount: a.xp, description: `Achievement: ${a.name}`, source: { type: "achievement", id: a.key } });
    recordEvent({ type: "achievement", key: `ach:${a.key}`, title: a.name, description: a.description + (a.title ? ` Title unlocked: “${a.title}”.` : ""), domain: a.domain === "system" || a.domain === "overall" ? null : a.domain });
    if (a.title && !profile.equippedTitle) updateProfile({ equippedTitle: a.title });
    pushNotification(profile.preferences.notifications, { kind: "achievement", title: `Achievement unlocked: ${a.name}`, body: a.title ? `New title available: “${a.title}”` : a.description, href: "/profile#achievements", key: `n:ach:${a.key}` });
  }
  for (const q of completedQuests) {
    if (q.kind !== "daily") pushNotification(profile.preferences.notifications, { kind: "quest", title: `Quest complete: ${q.title}`, body: `+${q.rewardXp} XP`, href: "/quests", key: `n:quest:${q.id}` });
  }

  // XP may have changed → recompute level/assessment
  if (newAchievements.length || completedQuests.length) {
    input = buildEngineInput(profile);
    assessment = assessCharacter(input);
    context = buildContext(profile, input, assessment);
  }

  // 4. Rank history + score snapshots + rank-up events
  const rankUps: ReconcileResult["rankUps"] = [];
  const recordRank = (domain: DomainId | "overall", rank: Rank, score: number) => {
    const last = db.select().from(rankHistory).where(eq(rankHistory.domain, domain)).orderBy(desc(rankHistory.id)).limit(1).get();
    if (!last || last.rank !== rank) {
      db.insert(rankHistory).values({ domain, rank, score, level: assessment.level.level, date: today }).run();
      if (last && rankIndex(rank) > rankIndex(last.rank as Rank)) {
        rankUps.push({ domain, from: last.rank as Rank, to: rank });
        const name = domain === "overall" ? "Overall" : DOMAINS[domain].name;
        pushNotification(profile.preferences.notifications, { kind: "rank", title: domain === "overall" ? `Rank up: ${RANK_VISUALS[rank].title}` : `${name} reached ${rank} rank`, body: domain === "overall" ? RANK_VISUALS[rank].quote : `Up from ${last.rank}.`, href: domain === "overall" ? "/profile" : `/domains/${domain}`, key: `n:rankup:${domain}:${rank}:${today}` });
        if (domain === "overall") recordEvent({ type: "title", key: `title:${RANK_VISUALS[rank].title}`, title: `Title unlocked: “${RANK_VISUALS[rank].title}”`, description: `Reached ${rank} rank overall.`, domain: null });
        recordEvent({
          type: "rank_up",
          key: `rankup:${domain}:${rank}:${today}`,
          title: `${name} reached ${rank} rank`,
          description: `${RANK_LABELS[rank]} — up from ${last.rank}.`,
          domain: domain === "overall" ? null : domain,
        });
      } else if (last && rankIndex(rank) < rankIndex(last.rank as Rank)) {
        const name = domain === "overall" ? "Overall" : DOMAINS[domain].name;
        recordEvent({
          type: "rank_down",
          key: `rankdown:${domain}:${rank}:${today}`,
          title: `${name} slipped to ${rank}`,
          description: `Down from ${last.rank}. Ranks follow rolling averages — it comes back the same way.`,
          domain: domain === "overall" ? null : domain,
        });
      } else if (!last && rankIndex(rank) > 0) {
        rankUps.push({ domain, from: null, to: rank });
      }
    }
    db.insert(scoreSnapshots).values({ date: today, domain, score, rank }).onConflictDoUpdate({ target: [scoreSnapshots.date, scoreSnapshots.domain], set: { score, rank } }).run();
  };
  recordRank("overall", assessment.overall.rank, assessment.overall.score);
  for (const d of assessment.domains) recordRank(d.domain, d.rank, d.score);

  // 5. Level-up event
  const xpAfter = totalXp();
  const levelAfter = levelFromXp(xpAfter).level;
  let levelUp: ReconcileResult["levelUp"] = null;
  if (levelAfter > levelBefore) {
    levelUp = { from: levelBefore, to: levelAfter };
    recordEvent({ type: "level_up", key: `level:${levelAfter}`, title: `Reached Level ${levelAfter}`, description: `${xpAfter.toLocaleString()} total XP.`, domain: null });
    pushNotification(profile.preferences.notifications, { kind: "level", title: `Level ${levelAfter}`, body: `Up from level ${levelBefore}. ${levelFromXp(xpAfter).xpToNext} XP to the next.`, href: "/profile", key: `n:level:${levelAfter}` });
  }
  // Weekly review reminder (Mondays / Tuesdays) and sobriety milestone notifications
  const wd = new Date(today + "T00:00:00Z").getUTCDay();
  if ((wd === 1 || wd === 2) && profile.onboarded && diffDays(dateInTz(new Date(profile.onboardingCompletedAt ?? ""), profile.timezone), today) >= 7) {
    pushNotification(profile.preferences.notifications, { kind: "review", title: "Your weekly review is ready", body: "What moved, what slipped, what to focus on.", href: "/progress/review", key: `n:review:${startOfWeek(today)}` });
  }
  for (const t of context.sobriety) {
    if (t.lastMilestone && t.currentRunStart) pushNotification(profile.preferences.notifications, { kind: "sobriety", title: `${t.lastMilestone.label} on ${t.name}`, body: `Milestone reached. +${t.lastMilestone.xp} XP.`, href: "/domains/sobriety", key: `n:sob:${t.trackerId}:${t.currentRunStart.slice(0, 19)}:${t.lastMilestone.days}` });
  }
  // Ensure the first-ever level event exists for history continuity
  if (levelAfter >= 1 && !db.select().from(characterEvents).where(eq(characterEvents.key, "level:1")).get() && profile.onboarded) {
    db.insert(characterEvents).values({ type: "system", key: "level:1", title: "Character created", description: `${profile.name} begins the climb at E rank.`, occurredAt: profile.onboardingCompletedAt ?? new Date().toISOString() }).onConflictDoNothing().run();
  }

  return { assessment, context, newAchievements, completedQuests, rankUps, levelUp, xpGained: xpAfter - xpBefore };
}

function ensureAndUpdateQuests(ctx: ProgressionContext, today: ISODate): Quest[] {
  const db = getDb();
  const selected = selectQuestTemplates(ctx);
  const completed: Quest[] = [];

  const ensure = (t: QuestTemplate) => {
    const period = periodFor(t.kind, today);
    const existing = db.select().from(quests).where(and(eq(quests.templateKey, t.key), eq(quests.periodStart, period.start))).get();
    if (existing) return;
    // For long quests: don't recreate if an incomplete one is still open from an earlier period.
    if (t.kind === "long") {
      const open = db.select().from(quests).where(and(eq(quests.templateKey, t.key), gte(quests.periodEnd, today))).get();
      if (open) return;
    }
    const built = t.build(ctx);
    db.insert(quests)
      .values({
        kind: t.kind,
        templateKey: t.key,
        title: built.title,
        description: built.description,
        domain: t.domain,
        target: built.target,
        rewardXp: built.rewardXp,
        periodStart: period.start,
        periodEnd: period.end,
        params: toJson({ ...(built.params ?? {}), titleReward: built.titleReward ?? null }),
      })
      .onConflictDoNothing()
      .run();
  };
  for (const t of [...selected.daily, ...selected.weekly, ...selected.long]) ensure(t);

  // Update progress for every open quest in-period.
  const open = db.select().from(quests).where(and(lte(quests.periodStart, today), gte(quests.periodEnd, today))).all();
  for (const q of open) {
    const t = QUEST_TEMPLATE_MAP.get(q.templateKey);
    if (!t) continue;
    const params = parseJson<Record<string, unknown>>(q.params, {});
    let progress = 0;
    try {
      progress = t.progress(ctx, params);
    } catch {
      progress = q.progress;
    }
    const nowDone = progress >= q.target;
    if (q.completedAt) {
      if (nowDone) {
        db.update(quests).set({ progress }).where(eq(quests.id, q.id)).run();
      } else {
        // The source of the progress was deleted/corrected (e.g. a discarded workout): un-complete and void the XP.
        voidXpForSource({ type: "quest", id: q.id }, "quest progress reverted");
        db.update(quests).set({ progress, completedAt: null }).where(eq(quests.id, q.id)).run();
        db.delete(characterEvents).where(eq(characterEvents.key, `quest:${q.id}`)).run();
      }
      continue;
    }
    db.update(quests)
      .set({ progress, completedAt: nowDone ? new Date().toISOString() : null })
      .where(eq(quests.id, q.id))
      .run();
    if (nowDone) {
      const rule = q.kind === "daily" ? "quest_daily" : q.kind === "weekly" ? "quest_weekly" : "quest_long";
      awardXp(rule, today, { suffix: q.id, amount: q.rewardXp, description: `Quest: ${q.title}`, source: { type: "quest", id: q.id } });
      if (q.kind !== "daily") {
        recordEvent({ type: "milestone", key: `quest:${q.id}`, title: `Quest complete: ${q.title}`, description: `+${q.rewardXp} XP`, domain: q.domain === "overall" ? null : (q.domain as DomainId) });
      }
      const titleReward = params.titleReward as string | null | undefined;
      if (titleReward) {
        recordEvent({ type: "title", key: `title:${titleReward}`, title: `Title unlocked: “${titleReward}”`, description: `Earned by completing “${q.title}”.`, domain: null });
      }
      completed.push({ ...q, progress, completedAt: new Date().toISOString() });
    }
  }
  return completed;
}


// ---------------------------------------------------------------------------
// Reads used by pages
// ---------------------------------------------------------------------------
export function getQuests(today: ISODate): { daily: QuestView[]; weekly: QuestView[]; long: QuestView[] } {
  const rows = getDb().select().from(quests).where(and(lte(quests.periodStart, today), gte(quests.periodEnd, today))).orderBy(quests.id).all();
  const view = (q: Quest): QuestView => ({
    ...q,
    paramsParsed: parseJson(q.params, {}),
    pct: Math.min(1, q.target > 0 ? q.progress / q.target : 0),
    done: !!q.completedAt,
  });
  const all = rows.map(view);
  return {
    daily: all.filter((q) => q.kind === "daily"),
    weekly: all.filter((q) => q.kind === "weekly"),
    long: all.filter((q) => q.kind === "long"),
  };
}

export function getUnlockedAchievements() {
  const rows = getDb().select().from(userAchievements).orderBy(desc(userAchievements.unlockedAt)).all();
  return rows
    .map((r) => ({ ...r, def: ACHIEVEMENT_MAP.get(r.key) }))
    .filter((r) => r.def)
    .map((r) => ({ key: r.key, unlockedAt: r.unlockedAt, seen: r.seen, def: r.def! }));
}

export function getUnlockedTitles(): string[] {
  const titles = new Set<string>();
  for (const a of getUnlockedAchievements()) if (a.def.title) titles.add(a.def.title);
  for (const e of getDb().select().from(characterEvents).where(eq(characterEvents.type, "title")).all()) {
    const m = e.title.match(/“(.+)”/);
    if (m) titles.add(m[1]);
  }
  return [...titles];
}

export function getCharacterEvents(limit = 100) {
  return getDb().select().from(characterEvents).orderBy(desc(characterEvents.occurredAt), desc(characterEvents.id)).limit(limit).all();
}

export function getScoreHistory(domain: DomainId | "overall", start: ISODate, end: ISODate) {
  return getDb()
    .select()
    .from(scoreSnapshots)
    .where(and(eq(scoreSnapshots.domain, domain), gte(scoreSnapshots.date, start), lte(scoreSnapshots.date, end)))
    .orderBy(scoreSnapshots.date)
    .all();
}

export function getRankHistory() {
  return getDb().select().from(rankHistory).orderBy(desc(rankHistory.id)).all();
}
