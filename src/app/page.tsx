import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CalendarCheck, Sunrise, CalendarRange, Moon } from "lucide-react";
import { getProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { refreshOffers } from "@/services/planner";
import { unreadCount, listNotifications } from "@/services/notifications";
import { runScheduledNotifications } from "@/services/scheduler";
import { computeSleepSchedule, to12h } from "@/services/sleepPlan";
import { getWeek, planningWeekStart } from "@/services/foodWeek";
import { todaySummary } from "@/services/today";
import { startOfWeek, dateInTz, weekday } from "@/lib/dates";
import { CharacterHero } from "@/components/hero/CharacterHero";
import { SpecialQuestCard } from "@/components/quests/SpecialQuestCard";
import { TodayCard } from "@/components/home/TodayCard";
import { ProgressionStrip } from "@/components/home/ProgressionStrip";
import { NextRankCard } from "@/components/home/NextRankCard";
import { BrowserNotifier } from "@/components/notifications/BrowserNotifier";
import { SectionTitle } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * HOME = TODAY. Hero → ONE context card → ONE today card → (+ LOG floats) →
 * compact progression → next rank. Everything else lives on the tab that owns it.
 */
export default async function HomePage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");

  const { assessment } = reconcile();
  runScheduledNotifications(profile);
  const offer = await refreshOffers(profile);
  const today = profile.today;
  const unread = unreadCount();
  const localHour = Number(profile.localTime.slice(0, 2));
  const summary = todaySummary(profile, { localHour });

  // ---- ONE context card, by priority: special quest > Sunday reset > morning motivation > wind-down > weekly review.
  const isSunday = weekday(today) === 0;
  const shoppingDay = weekday(today) === profile.preferences.food.shoppingDay;
  const planningWeek = getWeek(planningWeekStart(today, profile.preferences.food.shoppingDay));
  const showSunday = profile.activeDomains.includes("cooking") && (isSunday || shoppingDay) && (!planningWeek || planningWeek.status === "planning");
  const morningNote = localHour < 11 ? (listNotifications(20).find((n) => n.key === `n:morning:${today}`) ?? null) : null;
  const sched = profile.activeDomains.includes("sleep") && localHour >= 19 ? computeSleepSchedule(profile.targets, profile.preferences.sleep) : null;
  const showReview = weekday(today) >= 1 && weekday(today) <= 2 && startOfWeek(today) !== dateInTz(new Date(profile.onboardingCompletedAt ?? ""), profile.timezone);

  const context = offer ? (
    <SpecialQuestCard offer={{ id: offer.id, title: offer.title, description: offer.description, domain: offer.domain, difficulty: offer.difficulty, kind: offer.kind, estimatedMinutes: offer.estimatedMinutes, xpReward: offer.xpReward, status: offer.status, expiresAt: offer.expiresAt }} />
  ) : showSunday ? (
    <Link href="/planner/week" className="plate press flex min-h-14 items-center gap-3 border-gold/40 px-4 py-3">
      <CalendarRange size={18} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Sunday reset</div>
        <div className="serif text-[13px] text-muted">Plan the week&apos;s meals, budget and list.</div>
      </div>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  ) : morningNote ? (
    <Link href="/profile#why" className="plate press flex items-start gap-3 px-4 py-3">
      <Sunrise size={16} className="mt-0.5 shrink-0 text-gold" />
      <p className="serif text-[15px] leading-snug text-text">{morningNote.body}</p>
    </Link>
  ) : sched ? (
    <Link href="/domains/sleep" className="plate press flex min-h-14 items-center gap-3 px-4 py-3">
      <Moon size={18} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Wind down {to12h(sched.windDown)} · bed {to12h(sched.inBed)}</div>
        <div className="serif text-[13px] text-muted">Wake {to12h(sched.wake)} for {Math.round((sched.targetMin / 60) * 10) / 10} h.</div>
      </div>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  ) : showReview ? (
    <Link href="/progress/review" className="plate press flex min-h-14 items-center gap-3 px-4 py-3">
      <CalendarCheck size={16} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Last week&apos;s review is ready</div>
        <div className="serif text-[13px] text-muted">What moved, what slipped.</div>
      </div>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  ) : null;

  return (
    <div className="page space-y-4">
      <CharacterHero name={profile.name} equippedTitle={profile.equippedTitle} assessment={assessment} unread={unread} />
      <BrowserNotifier enabled={profile.preferences.notifications.browser} />
      {context}
      <TodayCard s={summary} />
      <section>
        <SectionTitle action={<span className="display text-[11px] tracking-widest text-gold">{assessment.overall.rank} RANK</span>}>Progression</SectionTitle>
        <ProgressionStrip domains={assessment.domains} />
      </section>
      <NextRankCard assessment={assessment} />
    </div>
  );
}
