import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { groceryWeeks, mealPrepSessions, notifications, workoutSessions } from "@/db/schema";
import { addDays, hhmmToMinutes, startOfWeek } from "@/lib/dates";
import { buildMorningMessage, motivationInput, rememberMessage } from "./motivation";
import { pushNotification } from "./notifications";
import { getProfile, type ProfileView } from "./profile";
import { buildContext, buildEngineInput, getQuests } from "./progression";
import { assessCharacter } from "@/ranking/engine";
import { computeSleepSchedule, to12h } from "./sleepPlan";
import { getPlanForDate } from "./workouts";
import { dayTotals, resolveTargets } from "./nutrition";

/**
 * Time-based notifications without a push service: runs on page loads and on
 * the notifier poll. Every notification has a per-day key, so running this
 * every minute is harmless. Each category is independently switchable.
 */
export function runScheduledNotifications(profile: ProfileView = getProfile()): string[] {
  if (!profile.onboarded) return [];
  const prefs = profile.preferences;
  const n = prefs.notifications;
  const today = profile.today;
  const nowMin = hhmmToMinutes(profile.localTime.slice(0, 5));
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const fired: string[] = [];
  const due = (hhmm: string, windowMin: number) => {
    const t = hhmmToMinutes(hhmm);
    return nowMin >= t && nowMin < t + windowMin;
  };
  const sched = computeSleepSchedule(profile.targets, prefs.sleep);

  // Morning motivation: at wake time (3h window).
  if (n.morningMotivation && sched && due(sched.wake, 180)) {
    const key = `n:morning:${today}`;
    if (!exists(key)) {
      const input = buildEngineInput(profile);
      const ctx = buildContext(profile, input, assessCharacter(input));
      const mi = motivationInput(profile, ctx);
      const first = getQuests(today).daily.find((q) => !q.done);
      mi.firstQuest = first ? first.title : null;
      const seed = Number(today.replace(/-/g, "")) + prefs.motivation.recent.length;
      const msg = buildMorningMessage(mi, prefs.motivation.recent, seed);
      pushNotification(n, { kind: "system", title: to12h(sched.wake), body: msg.text, href: "/", key });
      rememberMessage(msg.key);
      fired.push(key);
    }
  }

  // Wind-down reminder: lead minutes before wind-down (45 min window so a late open still shows it once).
  if (n.windDown && sched) {
    const t = (hhmmToMinutes(sched.windDown) - (n.windDownLeadMin || 0) + 1440) % 1440;
    const fireAt = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    if (due(fireAt, 45)) {
      const key = `n:winddown:${today}`;
      const variants = [`Your wind-down starts ${n.windDownLeadMin ? `in ${n.windDownLeadMin} minutes` : "now"}. Tomorrow is built tonight.`, `You're aiming for ${to12h(sched.wake)}. Time to start shutting things down.`, `In bed by ${to12h(sched.inBed)} for ${Math.round(sched.targetMin / 60)} hours. Screens down, lights low.`];
      pushNotification(n, { kind: "system", title: `Wind-down · ${to12h(sched.windDown)}`, body: variants[Number(today.slice(-2)) % variants.length], href: "/domains/sleep", key });
      fired.push(key);
    }
  }

  // Workout reminder: at the chosen time if nothing trained today.
  const trainingDay = !prefs.fitness.trainingDays.length || prefs.fitness.trainingDays.includes(weekday);
  if (n.workoutReminder && trainingDay && profile.activeDomains.includes("fitness") && due(n.workoutReminderTime, 120)) {
    const key = `n:workoutreminder:${today}`;
    const plan = getPlanForDate(today);
    const done = plan?.status === "completed" || getDb().select().from(workoutSessions).where(and(eq(workoutSessions.date, today), inArray(workoutSessions.status, ["completed", "active", "paused"]))).get();
    if (!done && !exists(key)) {
      pushNotification(n, { kind: "workout", title: plan ? `Today's workout: ${plan.name}` : "Training time", body: plan ? `${plan.estimatedMinutes} min · ${plan.exercisesParsed.length} exercises. Or make it a walk — anything counts.` : "No plan yet. Build one in Planner or log a walk.", href: "/planner/workout", key });
      fired.push(key);
    }
  }

  // Sunday: weekly planning + meal-prep reminder.
  if (weekday === prefs.food.shoppingDay) {
    if (n.weeklyPlanning && due(n.weeklyPlanningTime, 240)) {
      const key = `n:weeklyplan:${today}`;
      const wk = getDb().select().from(groceryWeeks).where(eq(groceryWeeks.weekStart, addDays(startOfWeek(today), 7))).get();
      if (!wk || wk.status === "planning") pushNotification(n, { kind: "system", title: "Prepare for the week ahead", body: "Weekly planning is ready: review, leftovers, budget, meals, shopping list, prep.", href: "/planner/week", key });
      fired.push(key);
    }
    if (n.mealPrepReminder && due("15:00", 300)) {
      const key = `n:mealprep:${today}`;
      const prep = getDb().select().from(mealPrepSessions).where(and(eq(mealPrepSessions.date, today), eq(mealPrepSessions.status, "planned"))).get();
      if (prep) pushNotification(n, { kind: "meals", title: "Sunday prep is planned", body: `${prep.estimatedMinutes} min of prep sets up the week. +60 XP when done.`, href: "/planner/week", key });
      fired.push(key);
    }
  }

  // Evening nudge: protein far behind with the day mostly done (only when nutrition is being tracked today).
  if (n.meals && profile.activeDomains.includes("cooking") && due("18:30", 90)) {
    const t = resolveTargets(prefs.nutrition, profile);
    const tot = dayTotals(today);
    if (tot.calories > 0 && !t.unsafe && tot.protein < t.protein * 0.5) {
      const key = `n:protein:${today}`;
      pushNotification(n, { kind: "meals", title: `${t.protein - tot.protein} g protein to go`, body: "Dinner can close most of that. Open Meals for what fits.", href: "/planner/meals", key });
      fired.push(key);
    }
  }
  return fired;
}

function exists(key: string): boolean {
  return !!getDb().select({ id: notifications.id }).from(notifications).where(eq(notifications.key, key)).get();
}
