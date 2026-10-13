import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, CalendarCheck, Trophy } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getQuests, getUnlockedAchievements, reconcile } from "@/services/progression";
import { loadHabitCompletions, loadHabits, loadRecipes, loadRoutineCompletions, loadRoutines } from "@/services/loaders";
import { computeHabitStats } from "@/ranking/domains/habits";
import { getOuraStatus } from "@/integrations/oura/sync";
import { isAiEnabled } from "@/ai/config";
import { refreshOffers, todayPlanSummary } from "@/services/planner";
import { unreadCount } from "@/services/notifications";
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

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");

  const { assessment } = reconcile();
  const offer = await refreshOffers(profile);
  const today = profile.today;
  const quests = getQuests(today);
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, isFavorite: r.isFavorite, mealType: r.mealType }));
  const oura = getOuraStatus();
  const plan = todayPlanSummary(profile);
  const unread = unreadCount();

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

  return (
    <div className="page space-y-5">
      <CharacterHero name={profile.name} equippedTitle={profile.equippedTitle} assessment={assessment} unread={unread} />
      <BrowserNotifier enabled={profile.preferences.notifications.browser} />

      {offer && <SpecialQuestCard offer={{ id: offer.id, title: offer.title, description: offer.description, domain: offer.domain, difficulty: offer.difficulty, kind: offer.kind, estimatedMinutes: offer.estimatedMinutes, xpReward: offer.xpReward, status: offer.status, expiresAt: offer.expiresAt }} />}

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

      <TodayChecklist items={checklist} today={today} />

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

      <section>
        <SectionTitle>Quick log</SectionTitle>
        <Suspense>
          <QuickLog today={today} activeDomains={profile.activeDomains} recipes={recipes} stepsTarget={profile.targets.stepsTarget} bedtimeTarget={profile.targets.bedtimeTarget} hasOura={oura.enabled && oura.connected} />
        </Suspense>
      </section>

      {showReview && (
        <Link href="/progress/review" className="plate press flex items-center gap-3 px-4 py-3">
          <CalendarCheck size={16} className="shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Last week&apos;s review is ready</div>
            <div className="serif text-[13px] text-muted">What moved, what slipped, what to focus on.</div>
          </div>
          <ChevronRight size={16} className="text-faint" />
        </Link>
      )}

      <section>
        <SectionTitle action={<span className="display text-[11px] tracking-widest text-gold">OVERALL: {assessment.overall.rank} RANK</span>}>Domain stats</SectionTitle>
        <DomainGrid domains={assessment.domains} />
      </section>

      <NextRankCard assessment={assessment} />

      {recentAch.length > 0 && (
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
      )}
    </div>
  );
}
