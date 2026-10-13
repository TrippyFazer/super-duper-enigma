import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CalendarCheck } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getRankHistory, getScoreHistory, reconcile } from "@/services/progression";
import { xpByDay, xpBetween } from "@/services/xp";
import { loadHabitCompletions, loadHabits, loadMeals, loadRoutineCompletions, loadRoutines, loadSleep, loadWorkouts } from "@/services/loaders";
import { addDays, dateInTz, formatShort, lastNDays, startOfWeek } from "@/lib/dates";
import { DOMAINS } from "@/ranking/domains";
import { routineAdherence } from "@/ranking/domains/skincare";
import { computeHabitStats } from "@/ranking/domains/habits";
import { listSessions, listPersonalRecords } from "@/services/workouts";
import { nutritionConsistency, resolveTargets } from "@/services/nutrition";
import { SAFE_MIN_CALORIES } from "@/services/preferences";
import { Dumbbell, UtensilsCrossed } from "lucide-react";
import { Card, PageHeader, SectionTitle, Stat, Trend } from "@/components/ui/primitives";
import { RankBadge } from "@/components/ui/RankBadge";
import { RangeTabs } from "@/components/domain/DomainHeader";
import { BarsChart, ScoreHistoryChart, XpChart } from "@/components/charts/Charts";
import type { Rank } from "@/ranking/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress" };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const range = ([7, 30, 90] as const).find((n) => String(n) === sp.range) ?? 30;
  const { assessment } = reconcile();
  const today = profile.today;
  const days = lastNDays(today, range);
  const start = days[0];

  const overall = getScoreHistory("overall", addDays(today, -89), today).map((h) => ({ date: h.date, score: h.score }));
  const xp = xpByDay(start, today);
  const xpSeries = days.map((d) => ({ date: d, xp: xp.find((x) => x.date === d)?.xp ?? 0 }));
  const xpTotal = xpBetween(start, today);
  const xpPrev = xpBetween(addDays(start, -range), addDays(start, -1));

  const workouts = loadWorkouts(today);
  const meals = loadMeals(today);
  const sleep = loadSleep(today);
  const nWeeks = Math.max(1, Math.ceil(range / 7));
  const weekly = (dates: string[]) => {
    const out: { label: string; value: number }[] = [];
    for (let i = nWeeks - 1; i >= 0; i--) {
      const ws = addDays(startOfWeek(today), -7 * i);
      const we = addDays(ws, 6);
      out.push({ label: formatShort(ws), value: new Set(dates.filter((d) => d >= ws && d <= we)).size });
    }
    return out;
  };

  const routines = loadRoutines().filter((r) => r.active);
  const rc = loadRoutineCompletions(today);
  const adh = routineAdherence(
    routines.map((r) => ({ id: r.id, timeOfDay: r.timeOfDay, steps: r.stepsParsed, active: r.active, createdOn: dateInTz(new Date(r.createdAt), profile.timezone) })),
    rc.map((c) => ({ routineId: c.routineId, date: c.date, complete: c.complete, stepsCompleted: c.stepsCompletedParsed })),
    days.filter((d) => d !== today),
  );
  const habits = loadHabits();
  const hstats = computeHabitStats(
    habits.map((h) => ({ id: h.id, name: h.name, scheduleType: h.scheduleType, weekdays: h.weekdaysParsed, timesPerWeek: h.timesPerWeek, active: h.active, createdOn: dateInTz(new Date(h.createdAt), profile.timezone) })),
    loadHabitCompletions(today).map((c) => ({ habitId: c.habitId, date: c.date })),
    today,
  );
  const habitAdh = hstats.length ? hstats.reduce((a, s) => a + (range <= 30 ? s.adherence30 : s.adherence90), 0) / hstats.length : null;
  const sleepIn = sleep.filter((e) => e.date >= start);
  const avgSleep = sleepIn.length ? sleepIn.reduce((a, e) => a + e.totalSleepMin, 0) / sleepIn.length / 60 : null;

  const rankHist = getRankHistory().slice(0, 8);
  const sessions = listSessions(200).filter((x) => x.status === "completed" && x.date >= start);
  const prsIn = listPersonalRecords().filter((p) => p.date >= start && p.kind === "weight");
  const nTargets = resolveTargets(profile.preferences.nutrition, profile);
  const nut = nutritionConsistency(today, range, nTargets.protein, SAFE_MIN_CALORIES(profile.sex));

  return (
    <div className="page space-y-5">
      <PageHeader title="Progress" subtitle="Rolling views. Ranks move on 30 and 90-day averages." right={<RangeTabs current={range} base="/progress" />} />

      <Link href="/progress/review" className="card press flex items-center gap-3 px-4 py-3">
        <CalendarCheck size={18} className="text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Weekly review</div>
          <div className="text-xs text-muted">What moved last week, what to do next.</div>
        </div>
        <ChevronRight size={16} className="text-faint" />
      </Link>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="XP" value={xpTotal.toLocaleString()} sub={<Trend delta={xpPrev ? ((xpTotal - xpPrev) / xpPrev) * 100 : null} suffix="%" />} />
        <Stat label="Overall" value={<span className="flex items-center gap-2">{Math.round(assessment.overall.score)} <RankBadge rank={assessment.overall.rank} size="sm" /></span>} sub={`Level ${assessment.level.level}`} />
        <Stat label="Sleep avg" value={avgSleep != null ? `${avgSleep.toFixed(1)}h` : "—"} sub={`${sleepIn.length} nights`} />
      </div>

      <Card>
        <SectionTitle className="mb-3 px-0">Overall score · 90 days</SectionTitle>
        <ScoreHistoryChart data={overall} />
      </Card>

      <Card>
        <SectionTitle className="mb-3 px-0">XP per day</SectionTitle>
        <XpChart data={xpSeries} />
      </Card>

      <section>
        <SectionTitle>Domains · {range} days</SectionTitle>
        <Card className="divide-y divide-border/70 p-0">
          {assessment.domains.map((d) => (
            <Link key={d.domain} href={`/domains/${d.domain}?range=${range}`} className="press flex items-center gap-3 px-4 py-3">
              <RankBadge rank={d.rank} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{DOMAINS[d.domain].name}</div>
                <div className="truncate text-xs text-muted">{d.substats[0] ? `${d.substats[0].name}: ${d.substats[0].value}` : ""}</div>
              </div>
              <div className="text-right">
                <div className="tabular text-sm font-semibold">{Math.round(d.score)}</div>
                <Trend delta={range === 7 ? d.trend.delta7 : d.trend.delta30} />
              </div>
              <ChevronRight size={16} className="text-faint" />
            </Link>
          ))}
        </Card>
      </section>

      {profile.activeDomains.includes("fitness") && (
        <Card>
          <SectionTitle className="mb-3 px-0">Training days per week</SectionTitle>
          <BarsChart data={weekly(workouts.map((w) => w.date))} target={profile.targets.workoutsPerWeekTarget} />
        </Card>
      )}
      {profile.activeDomains.includes("cooking") && (
        <Card>
          <SectionTitle className="mb-3 px-0">Cooking days per week</SectionTitle>
          <BarsChart data={weekly(meals.map((m) => m.date))} color="#5fcf9b" />
        </Card>
      )}
      {(profile.activeDomains.includes("fitness") || profile.activeDomains.includes("cooking")) && (
        <div className="grid grid-cols-2 gap-2.5">
          {profile.activeDomains.includes("fitness") && (
            <Link href="/planner/workout/history" className="plate press px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <Dumbbell size={11} /> Tracked sessions
              </div>
              <div className="tabular display mt-1 text-xl font-semibold">{sessions.length}</div>
              <div className="text-[11px] text-muted">
                {prsIn.length} PR{prsIn.length === 1 ? "" : "s"} · {sessions.reduce((a, x) => a + x.volume, 0).toLocaleString()} kg lifted
              </div>
            </Link>
          )}
          {profile.activeDomains.includes("cooking") && (
            <Link href="/planner/meals" className="plate press px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <UtensilsCrossed size={11} /> Nutrition logged
              </div>
              <div className="tabular display mt-1 text-xl font-semibold">
                {nut.loggedDays}
                <span className="text-sm text-muted">/{range} days</span>
              </div>
              <div className="text-[11px] text-muted">Protein target hit {nut.proteinDays} day{nut.proteinDays === 1 ? "" : "s"}</div>
            </Link>
          )}
        </div>
      )}
      {(profile.activeDomains.includes("skincare") || profile.activeDomains.includes("habits")) && (
        <div className="grid grid-cols-2 gap-2.5">
          {profile.activeDomains.includes("skincare") && <Stat label="Routine adherence" value={adh.scheduled ? `${Math.round(adh.ratio * 100)}%` : "—"} sub={`${range}-day`} />}
          {profile.activeDomains.includes("habits") && <Stat label="Habit adherence" value={habitAdh != null ? `${Math.round(habitAdh * 100)}%` : "—"} sub={`${range <= 30 ? 30 : 90}-day`} />}
        </div>
      )}

      {rankHist.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/profile/history" className="flex items-center text-xs text-muted">
                History <ChevronRight size={14} />
              </Link>
            }
          >
            Rank changes
          </SectionTitle>
          <Card className="divide-y divide-border/70 p-0">
            {rankHist.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <RankBadge rank={r.rank as Rank} size="sm" />
                <span className="flex-1">{r.domain === "overall" ? "Overall" : DOMAINS[r.domain as keyof typeof DOMAINS]?.name}</span>
                <span className="text-xs text-muted">{formatShort(r.date)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
