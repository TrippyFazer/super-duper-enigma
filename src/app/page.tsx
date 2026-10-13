import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, CalendarCheck, Trophy, Sunrise, CalendarRange, UtensilsCrossed } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getQuests, getUnlockedAchievements, reconcile } from "@/services/progression";
import { loadHabitCompletions, loadHabits, loadRecipes, loadRoutineCompletions, loadRoutines } from "@/services/loaders";
import { computeHabitStats } from "@/ranking/domains/habits";
import { getOuraStatus } from "@/integrations/oura/sync";
import { isAiEnabled } from "@/ai/config";
import { refreshOffers, todayPlanSummary } from "@/services/planner";
import { unreadCount, listNotifications } from "@/services/notifications";
import { runScheduledNotifications } from "@/services/scheduler";
import { computeSleepSchedule } from "@/services/sleepPlan";
import { SleepScheduleCard } from "@/components/sleep/SleepScheduleCard";
import { getMealPlan } from "@/services/nutrition";
import { getWeek, planningWeekStart } from "@/services/foodWeek";
import { addDays } from "@/lib/dates";
import { startOfWeek, dateInTz, weekday } from "@/lib/dates";
import { CharacterHero } from "@/components/hero/CharacterHero";
import { SpecialQuestCard } from "@/components/quests/SpecialQuestCard";
import { QuestRow } from "@/components/quests/QuestRow";
import { TodayChecklist, type ChecklistItem } from "@/components/home/TodayChecklist";
import { DomainGrid } from "@/components/home/DomainGrid";
import { PlanCard } from "@/components/home/PlanCard";
import { NextRankCard } from "@/components/home/NextRankCard";
import { QuickLog } from "@/components/log/QuickLog";
import { SectionTitle } from "@/components/ui/primitives";
import { BrowserNotifier } from "@/components/notifications/BrowserNotifier";
import { HealthCards } from "@/components/home/HealthCards";
import { todayHealthSnapshot } from "@/health/apple";
import { loadSleep } from "@/services/loaders";
import { listOffers } from "@/services/questOffers";
import { lastNDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");

  const { assessment } = reconcile();
  runScheduledNotifications(profile);
  const offer = await refreshOffers(profile);
  const today = profile.today;
  const quests = getQuests(today);
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, isFavorite: r.isFavorite, mealType: r.mealType }));
  const oura = getOuraStatus();
  const plan = todayPlanSummary(profile);
  const unread = unreadCount();
  const health = todayHealthSnapshot();
  const localHour = Number(profile.localTime.slice(0, 2));
  const stepsRemaining = health.steps != null ? Math.max(0, profile.targets.stepsTarget - health.steps) : 0;
  const walkOffer = health.steps != null && localHour >= 16 && localHour < 22 && stepsRemaining > 0 && stepsRemaining <= 4000 ? { remaining: stepsRemaining, xp: stepsRemaining >= 2500 ? 40 : 25 } : null;
  const hasWalkQuest = listOffers({ statuses: ["accepted", "offered", "completed"], limit: 5 }).some((o) => o.templateKey === "steps-finish" && o.date === today);
  const consistency = (() => {
    const nights = loadSleep(today).filter((e) => e.date >= lastNDays(today, 8)[0] && e.bedtimeStart);
    const mins = nights.map((e) => { const m = e.bedtimeStart!.match(/T(\d{2}):(\d{2})/); if (!m) return null; let v = Number(m[1]) * 60 + Number(m[2]); if (v < 240) v += 1440; return v; }).filter((x): x is number => x != null);
    if (mins.length < 3) return null;
    const last = mins[mins.length - 1];
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    const d = Math.abs(last - avg);
    return d <= 30 ? ("Good" as const) : d <= 60 ? ("Fair" as const) : ("Off" as const);
  })();

  const routines = loadRoutines().filter((r) => r.active);
  const rc = loadRoutineCompletions(today);
  const habits = loadHabits();
  const hc = loadHabitCompletions(today);
  const hstats = computeHabitStats(
    habits.map((h) => ({ id: h.id, name: h.name, scheduleType: h.scheduleType, weekdays: h.weekdaysParsed, timesPerWeek: h.timesPerWeek, active: h.active, createdOn: dateInTz(new Date(h.createdAt), profile.timezone) })),
    hc.map((c) => ({ habitId: c.habitId, date: c.date })),
    today,
  );
  const checklist: ChecklistItem[] = [
    ...routines.map<ChecklistItem>((r) => ({ id: `routine:${r.id}`, kind: "routine", refId: r.id, label: r.name, sub: "Care for the vessel. +10 XP", done: rc.some((c) => c.routineId === r.id && c.date === today && c.complete), timeOfDay: r.timeOfDay as "morning" | "evening" })),
    ...hstats
      .filter((s) => s.dueToday || s.doneToday)
      .map<ChecklistItem>((s) => {
        const h = habits.find((x) => x.id === s.habitId)!;
        return { id: `habit:${s.habitId}`, kind: "habit", refId: s.habitId, label: h.name, sub: h.scheduleType === "times_per_week" ? `${s.thisWeekDone}/${h.timesPerWeek} this week · streak ${s.streak}` : s.streak > 0 ? `${s.streak}-day streak · +8 XP` : "+8 XP", done: s.doneToday, icon: h.icon };
      }),
  ];

  const dailyDone = quests.daily.filter((q) => q.done).length;
  const recentAch = getUnlockedAchievements().slice(0, 3);
  const showReview = weekday(today) >= 1 && weekday(today) <= 2 && startOfWeek(today) !== dateInTz(new Date(profile.onboardingCompletedAt ?? ""), profile.timezone);
  const LINK: Record<string, string> = { fitness: "/planner/workout", sleep: "/domains/sleep", cooking: "/planner/meals", wealth: "/domains/wealth", skincare: "/domains/skincare", sobriety: "/domains/sobriety", habits: "/domains/habits" };

  // ---- Time-of-day prioritisation: the same cards, ordered by what is useful now.
  const period: "morning" | "midday" | "evening" = localHour < 11 ? "morning" : localHour < 17 ? "midday" : "evening";
  const morningNote = period === "morning" ? listNotifications(20).find((n) => n.key === `n:morning:${today}`) ?? null : null;
  const sched = computeSleepSchedule(profile.targets, profile.preferences.sleep);
  const tomorrow = addDays(today, 1);
  const tomorrowMeals = getMealPlan(tomorrow)?.meals.filter((m) => m.status === "planned" || m.status === "prepared") ?? [];
  const tomorrowTraining = profile.preferences.fitness.trainingDays.length ? profile.preferences.fitness.trainingDays.includes(weekday(tomorrow)) : null;
  const shoppingDay = weekday(today) === profile.preferences.food.shoppingDay;
  const planningWeek = getWeek(planningWeekStart(today, profile.preferences.food.shoppingDay));
  const showSunday = profile.activeDomains.includes("cooking") && (shoppingDay || weekday(today) === 6) && (!planningWeek || planningWeek.status === "planning");
  const remainingCal = plan.targets.calories - plan.totals.calories;
  const remainingPro = plan.targets.protein - plan.totals.protein;

  const sections: Record<string, React.ReactNode> = {
    morning: morningNote ? (
      <Link href="/profile" className="plate press flex items-start gap-3 px-4 py-3">
        <Sunrise size={16} className="mt-0.5 shrink-0 text-gold" />
        <p className="serif text-[15px] leading-snug text-text">{morningNote.body}</p>
      </Link>
    ) : null,
    sunday: showSunday ? (
      <Link href="/planner/week" className="plate press flex items-center gap-3 border-gold/40 px-4 py-3">
        <CalendarRange size={18} className="shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Prepare for the week ahead</div>
          <div className="serif text-[13px] text-muted">Review · leftovers · budget · meals · shopping list · prep · training days.</div>
        </div>
        <ChevronRight size={16} className="text-faint" />
      </Link>
    ) : null,
    offer: offer ? <SpecialQuestCard offer={{ id: offer.id, title: offer.title, description: offer.description, domain: offer.domain, difficulty: offer.difficulty, kind: offer.kind, estimatedMinutes: offer.estimatedMinutes, xpReward: offer.xpReward, status: offer.status, expiresAt: offer.expiresAt }} /> : null,
    quests: (
      <section>
        <SectionTitle
          action={
            <Link href="/quests" className="flex items-center text-xs text-muted">
              {dailyDone}/{quests.daily.length} · All quests <ChevronRight size={14} />
            </Link>
          }
        >
          Today&apos;s quests
        </SectionTitle>
        <div className="plate divide-y divide-border/60 p-1">
          {quests.daily.length === 0 && <p className="px-4 py-5 text-center text-sm text-muted">No quests yet — log something to generate today&apos;s.</p>}
          {quests.daily.map((q) => (
            <QuestRow key={q.id} title={q.title} subtitle={q.description || undefined} domain={q.domain} done={q.done} progress={q.pct} progressLabel={q.target > 1 ? `${Math.min(Math.round(q.progress), q.target)}/${q.target}` : undefined} rewardXp={q.rewardXp} href={LINK[q.domain] ?? "/quests"} />
          ))}
          {quests.daily.length > 0 && <div className="serif px-4 py-2 text-[13px] text-muted">{dailyDone === quests.daily.length ? "Today's adventure is complete. Rest well." : `Complete ${quests.daily.length - dailyDone} more to finish today's adventure.`}</div>}
        </div>
      </section>
    ),
    health: <HealthCards steps={health.steps} stepsTarget={profile.targets.stepsTarget} stepsSource={health.stepsSource} lastNight={health.lastNight} sleepTargetMin={profile.targets.sleepTargetMin} plannedBed={profile.targets.bedtimeTarget} plannedWake={profile.preferences.sleep.wakeTarget} consistency={consistency} walkOffer={walkOffer} hasWalkQuest={hasWalkQuest} />,
    checklist: <TodayChecklist items={checklist} today={today} />,
    plan: (
      <PlanCard
        p={{
          workout: plan.workout,
          meals: plan.meals,
          totals: plan.totals,
          targets: plan.targets,
          activeSessionId: plan.activeSession?.id ?? null,
          aiEnabled: isAiEnabled(),
          showFitness: profile.activeDomains.includes("fitness"),
          showNutrition: profile.activeDomains.includes("cooking"),
        }}
      />
    ),
    remaining:
      period === "evening" && profile.activeDomains.includes("cooking") && plan.totals.calories > 0 ? (
        <Link href="/planner/meals" className="plate press flex items-center gap-3 px-4 py-3">
          <UtensilsCrossed size={16} className="shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{remainingCal > 0 ? `${remainingCal} kcal and ${Math.max(0, remainingPro)} g protein left today` : "You're at today's calorie target"}</div>
            <div className="serif text-[13px] text-muted">{remainingPro > 20 ? "Dinner or a protein snack closes the gap. Nothing is lost by stopping here either." : "Protein is handled. Rest well."}</div>
          </div>
          <ChevronRight size={16} className="text-faint" />
        </Link>
      ) : null,
    sleep: period === "evening" && profile.activeDomains.includes("sleep") ? <SleepScheduleCard sched={sched} lastNight={null} compact /> : null,
    tomorrow:
      period === "evening" && (tomorrowMeals.length > 0 || tomorrowTraining != null) ? (
        <section className="plate px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gold">
            <Sunrise size={11} /> Tomorrow
          </div>
          <div className="serif mt-1 text-[13.5px] text-text-2">
            {tomorrowTraining != null && <span>{tomorrowTraining ? "Training day. " : "Rest day. "}</span>}
            {tomorrowMeals.length > 0 ? `Planned: ${tomorrowMeals.map((m) => m.name).slice(0, 3).join(", ")}${tomorrowMeals.length > 3 ? "…" : ""}.` : ""}
          </div>
        </section>
      ) : null,
    quicklog: (
      <section>
        <SectionTitle>Quick log</SectionTitle>
        <Suspense>
          <QuickLog today={today} activeDomains={profile.activeDomains} recipes={recipes} stepsTarget={profile.targets.stepsTarget} bedtimeTarget={profile.targets.bedtimeTarget} hasOura={oura.enabled && oura.connected} />
        </Suspense>
      </section>
    ),
    review: showReview ? (
      <Link href="/progress/review" className="plate press flex items-center gap-3 px-4 py-3">
        <CalendarCheck size={16} className="shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Last week&apos;s review is ready</div>
          <div className="serif text-[13px] text-muted">What moved, what slipped, what to focus on.</div>
        </div>
        <ChevronRight size={16} className="text-faint" />
      </Link>
    ) : null,
    domains: (
      <section>
        <SectionTitle action={<span className="display text-[11px] tracking-widest text-gold">OVERALL: {assessment.overall.rank} RANK</span>}>Domain stats</SectionTitle>
        <DomainGrid domains={assessment.domains} />
      </section>
    ),
    nextRank: <NextRankCard assessment={assessment} />,
    achievements:
      recentAch.length > 0 ? (
        <section>
          <SectionTitle
            action={
              <Link href="/profile#achievements" className="flex items-center text-xs text-muted">
                All <ChevronRight size={14} />
              </Link>
            }
          >
            Recent achievements
          </SectionTitle>
          <div className="scroll-x -mx-4 flex gap-2.5 px-4">
            {recentAch.map((a) => (
              <div key={a.key} className="plate flex w-44 shrink-0 items-start gap-2.5 p-3">
                <Trophy size={16} className="mt-0.5 shrink-0 text-gold" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.def.name}</div>
                  <div className="serif line-clamp-2 text-[12.5px] text-muted">{a.def.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null,
  };
  const ORDER: Record<typeof period, string[]> = {
    morning: ["morning", "sunday", "offer", "quests", "plan", "checklist", "health", "quicklog", "review", "domains", "nextRank", "achievements"],
    midday: ["sunday", "offer", "quests", "plan", "health", "checklist", "quicklog", "review", "domains", "nextRank", "achievements"],
    evening: ["remaining", "offer", "sunday", "sleep", "tomorrow", "quests", "plan", "health", "checklist", "quicklog", "review", "domains", "nextRank", "achievements"],
  };

  return (
    <div className="page space-y-5">
      <CharacterHero name={profile.name} equippedTitle={profile.equippedTitle} assessment={assessment} unread={unread} />
      <BrowserNotifier enabled={profile.preferences.notifications.browser} />
      {ORDER[period].map((k) => (sections[k] ? <div key={k}>{sections[k]}</div> : null))}
    </div>
  );
}
