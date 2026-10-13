import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CalendarCheck, ChevronRight, Sparkles, Trophy } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getQuests, getUnlockedAchievements, reconcile } from "@/services/progression";
import { loadHabitCompletions, loadHabits, loadRecipes, loadRoutineCompletions, loadRoutines } from "@/services/loaders";
import { computeHabitStats } from "@/ranking/domains/habits";
import { getOuraStatus } from "@/integrations/oura/sync";
import { xpBetween } from "@/services/xp";
import { startOfWeek, formatLong, dateInTz, weekday } from "@/lib/dates";
import { CharacterCard } from "@/components/home/CharacterCard";
import { TodayChecklist, type ChecklistItem } from "@/components/home/TodayChecklist";
import { DomainGrid } from "@/components/home/DomainGrid";
import { QuickLog } from "@/components/log/QuickLog";
import { Card, ProgressBar, SectionTitle } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");

  const { assessment, context } = reconcile();
  const today = profile.today;
  const quests = getQuests(today);
  const recipes = loadRecipes().map((r) => ({ id: r.id, name: r.name, isFavorite: r.isFavorite, mealType: r.mealType }));
  const oura = getOuraStatus();

  // Today checklist: routines + habits due
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
    ...routines.map<ChecklistItem>((r) => ({
      id: `routine:${r.id}`,
      kind: "routine",
      refId: r.id,
      label: r.name,
      sub: `${r.stepsParsed.length} step${r.stepsParsed.length === 1 ? "" : "s"} · +10 XP`,
      done: rc.some((c) => c.routineId === r.id && c.date === today && c.complete),
      timeOfDay: r.timeOfDay as "morning" | "evening",
    })),
    ...hstats
      .filter((s) => s.dueToday || s.doneToday)
      .map<ChecklistItem>((s) => {
        const h = habits.find((x) => x.id === s.habitId)!;
        return {
          id: `habit:${s.habitId}`,
          kind: "habit",
          refId: s.habitId,
          label: h.name,
          sub: h.scheduleType === "times_per_week" ? `${s.thisWeekDone}/${h.timesPerWeek} this week · streak ${s.streak}` : s.streak > 0 ? `${s.streak}-day streak` : "+8 XP",
          done: s.doneToday,
          icon: h.icon,
        };
      }),
  ];

  const dailyDone = quests.daily.filter((q) => q.done).length;
  const weekXp = xpBetween(startOfWeek(today), today);
  const recentAch = getUnlockedAchievements().slice(0, 3);

  // Suggested next action: the cheapest useful thing right now.
  const suggestions = assessment.domains.map((d) => d.suggestedAction).filter((s): s is string => !!s);
  const openDaily = quests.daily.filter((q) => !q.done);
  const suggestion = openDaily.length ? `${openDaily[0].title} · +${openDaily[0].rewardXp} XP` : suggestions[0];

  const greeting = (() => {
    const h = Number(profile.localTime.slice(0, 2));
    return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  return (
    <div className="page space-y-5">
      <header className="flex items-end justify-between px-1">
        <div>
          <div className="eyebrow">{formatLong(today)}</div>
          <h1 className="display mt-0.5 text-xl font-semibold">
            {greeting}, {profile.name.split(" ")[0]}.
          </h1>
        </div>
        <Link href="/quests" className="tabular text-xs text-muted">
          {dailyDone}/{quests.daily.length} daily
        </Link>
      </header>

      <CharacterCard name={profile.name} title={profile.equippedTitle} assessment={assessment} />

      <section>
        <SectionTitle>Quick log</SectionTitle>
        <Suspense>
          <QuickLog today={today} activeDomains={profile.activeDomains} recipes={recipes} stepsTarget={profile.targets.stepsTarget} bedtimeTarget={profile.targets.bedtimeTarget} hasOura={oura.enabled && oura.connected} />
        </Suspense>
      </section>

      {suggestion && (
        <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-accent-2" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-accent-2/80">Easiest useful action</div>
            <div className="text-sm text-text">{suggestion}</div>
          </div>
        </div>
      )}

      <TodayChecklist items={checklist} today={today} />

      {weekday(today) <= 2 && weekday(today) >= 1 && startOfWeek(today) !== dateInTz(new Date(profile.onboardingCompletedAt ?? ""), profile.timezone) && (
        <Link href="/progress/review" className="press flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3">
          <CalendarCheck size={16} className="shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Last week&apos;s review is ready</div>
            <div className="text-xs text-muted">What moved, what slipped, what to focus on.</div>
          </div>
          <ChevronRight size={16} className="text-faint" />
        </Link>
      )}

      <section>
        <SectionTitle
          action={
            <Link href="/quests" className="flex items-center text-xs text-muted">
              All quests <ChevronRight size={14} />
            </Link>
          }
        >
          Today&apos;s quests
        </SectionTitle>
        <Card className="divide-y divide-border/70 p-0">
          {quests.daily.length === 0 && <p className="px-4 py-5 text-center text-sm text-muted">No quests yet — log something to generate today&apos;s.</p>}
          {quests.daily.map((q) => (
            <div key={q.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${q.done ? "border-success/50 bg-success/15 text-success" : "border-border-strong text-faint"}`}>{q.done ? "✓" : ""}</span>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${q.done ? "text-muted line-through" : ""}`}>{q.title}</div>
                {!q.done && q.target > 1 && <ProgressBar value={q.pct} tone="muted" className="mt-1.5 max-w-[160px]" height="h-1" />}
              </div>
              <span className="tabular text-xs text-gold">+{q.rewardXp}</span>
            </div>
          ))}
          {quests.daily.length > 0 && (
            <div className="px-4 py-2.5 text-xs text-muted">
              {dailyDone === quests.daily.length ? "Today's adventure complete. Rest well." : `Complete ${quests.daily.length - dailyDone} more to finish today's adventure.`}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Domains</SectionTitle>
        <DomainGrid domains={assessment.domains} />
      </section>

      <section>
        <SectionTitle
          action={
            <Link href="/progress" className="flex items-center text-xs text-muted">
              Progress <ChevronRight size={14} />
            </Link>
          }
        >
          This week
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="card-2 px-3 py-3">
            <div className="eyebrow">XP</div>
            <div className="tabular mt-1 text-lg font-semibold">{weekXp.toLocaleString()}</div>
          </div>
          <div className="card-2 px-3 py-3">
            <div className="eyebrow">Training</div>
            <div className="tabular mt-1 text-lg font-semibold">
              {context.fitness.sessionsThisWeek}
              <span className="text-xs font-normal text-muted"> sessions</span>
            </div>
          </div>
          <div className="card-2 px-3 py-3">
            <div className="eyebrow">Cooked</div>
            <div className="tabular mt-1 text-lg font-semibold">
              {context.cooking.mealsThisWeek}
              <span className="text-xs font-normal text-muted"> meals</span>
            </div>
          </div>
        </div>
        {quests.weekly.length > 0 && (
          <Card className="mt-2.5 space-y-3">
            {quests.weekly.map((q) => (
              <div key={q.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className={q.done ? "text-muted line-through" : ""}>{q.title}</span>
                  <span className="tabular text-xs text-muted">
                    {Math.min(q.progress, q.target)}/{q.target}
                  </span>
                </div>
                <ProgressBar value={q.pct} tone={q.done ? "success" : "accent"} className="mt-1.5" height="h-1.5" />
              </div>
            ))}
          </Card>
        )}
      </section>

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
              <div key={a.key} className="card flex w-44 shrink-0 items-start gap-2.5 p-3">
                <Trophy size={16} className="mt-0.5 shrink-0 text-gold" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.def.name}</div>
                  <div className="line-clamp-2 text-[11px] text-muted">{a.def.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="px-2 text-center text-[11px] text-faint">
        {assessment.overall.next.rank ? `Next overall rank ${assessment.overall.next.rank} — ${assessment.overall.next.requirements[0] ?? "keep going"}` : "You hold S rank. Sustain it."}
      </p>
    </div>
  );
}
