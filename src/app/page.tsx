import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CalendarCheck, Sunrise, CalendarRange, Moon } from "lucide-react";
import { getProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { refreshOffers } from "@/services/planner";
import { unreadCount, listNotifications } from "@/services/notifications";
import { runScheduledNotifications } from "@/services/scheduler";
import { computeSleepSchedule, to12h } from "@/services/sleepPlan";
import { relevantWeek, weekEnd } from "@/services/foodWeek";
import { todaySummary } from "@/services/today";
import { startOfWeek, dateInTz, weekday, addDays } from "@/lib/dates";
import { CharacterHero } from "@/components/hero/CharacterHero";
import { SpecialQuestHomeCard } from "@/components/quests/SpecialQuestCard";
import { offerView } from "@/components/quests/offerView";
import { hhmmToMin, pickContext } from "@/services/contextCard";
import { TodayCard } from "@/components/home/TodayCard";
import { ProgressionStrip } from "@/components/home/ProgressionStrip";
import { NextRankCard } from "@/components/home/NextRankCard";
import { BrowserNotifier } from "@/components/notifications/BrowserNotifier";
import { SectionTitle } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * HOME = TODAY. Hero → ONE context card (the most urgent) → ONE today card → (+ LOG floats) →
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

  // ---- ONE context card by urgency (services/contextCard.ts), not a rigid ladder.
  // The weekly reset is suggested on the preferred day only; it can be started any day from Planner.
  const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const preferredDay = profile.preferences.food.shoppingDay;
  const shoppingDay = weekday(today) === preferredDay;
  const planningWeek = relevantWeek(today);
  const covered = !!planningWeek && planningWeek.status !== "planning" && weekEnd(planningWeek) >= addDays(today, 2);
  const showSunday = profile.activeDomains.includes("cooking") && shoppingDay && !covered;
  const morningNote = localHour < 11 ? (listNotifications(20).find((n) => n.key === `n:morning:${today}`) ?? null) : null;
  const sched = profile.activeDomains.includes("sleep") ? computeSleepSchedule(profile.targets, profile.preferences.sleep) : null;
  const earlier = summary.sleep?.state.windDownEarlierMin ?? 0;
  const shiftClock = (hhmm: string, minutes: number) => {
    const [h, m] = hhmm.split(":").map(Number);
    const t = (h * 60 + m - minutes + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  const showReview = weekday(today) >= 1 && weekday(today) <= 2 && startOfWeek(today) !== dateInTz(new Date(profile.onboardingCompletedAt ?? ""), profile.timezone);
  const nowMin = hhmmToMin(profile.localTime);
  // Wind-down with an earlier start (sleep deficit) counts from the shifted time.
  const windStart = sched ? (earlier ? shiftClock(sched.windDown, earlier) : sched.windDown) : null;
  const kind = pickContext({
    nowMin,
    quest: offer ? { difficulty: offer.difficulty, accepted: offer.status === "accepted", msLeft: offer.expiresAt ? new Date(offer.expiresAt).getTime() - Date.now() : null } : null,
    sunday: showSunday,
    morning: !!morningNote,
    sleep: sched && windStart ? { windDownMin: hhmmToMin(windStart), inBedMin: hhmmToMin(sched.inBed) } : null,
    review: showReview,
  });

  const windIn = sched ? ((((hhmmToMin(sched.windDown) - nowMin + 720) % 1440) + 1440) % 1440) - 720 : 0;
  const windLabel = windIn > 0 ? `Wind down in ${windIn >= 60 ? `${Math.floor(windIn / 60)}h ${windIn % 60}m` : `${windIn} min`}` : "Time to wind down";

  const context = kind === "quest" && offer ? (
    <SpecialQuestHomeCard offer={offerView(offer)} />
  ) : kind === "sunday" ? (
    <Link href="/planner/week?start=today" className="plate press flex min-h-14 items-center gap-3 border-gold/40 px-4 py-3">
      <CalendarRange size={18} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{DAY_NAME[preferredDay]} reset</div>
        <div className="serif text-[13px] text-muted">Plan the next days&apos; meals, budget and list.</div>
      </div>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  ) : kind === "morning" && morningNote ? (
    <Link href="/profile#why" className="plate press flex items-start gap-3 px-4 py-3">
      <Sunrise size={16} className="mt-0.5 shrink-0 text-gold" />
      <p className="serif text-[15px] leading-snug text-text">{morningNote.body}</p>
    </Link>
  ) : kind === "winddown" && sched ? (
    <Link href="/domains/sleep" className="plate press flex min-h-14 items-center gap-3 px-4 py-3">
      <Moon size={18} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{earlier ? `Start wind-down ${earlier} min earlier? · ${to12h(shiftClock(sched.windDown, earlier))}` : windLabel}</div>
        <div className="serif text-[13px] text-muted">{earlier ? `Last night was ${Math.round((summary.sleep!.state.deficitMin / 60) * 10) / 10} h short. Tonight is the lever.` : `Bed ${to12h(sched.inBed)} · wake ${to12h(sched.wake)}`}</div>
      </div>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  ) : kind === "review" ? (
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
