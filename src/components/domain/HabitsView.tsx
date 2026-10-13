import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadHabitCompletions, loadHabits } from "@/services/loaders";
import { dateInTz, lastNDays } from "@/lib/dates";
import { computeHabitStats, isScheduled } from "@/ranking/domains/habits";
import { Card, SectionTitle, Stat } from "@/components/ui/primitives";
import { DayHeatmap } from "@/components/charts/Charts";
import { HabitList } from "./HabitList";

export function HabitsView({ profile, range }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const today = profile.today;
  const habits = loadHabits(true);
  const completions = loadHabitCompletions(today);
  const active = habits.filter((h) => h.active);
  const hInput = active.map((h) => ({ id: h.id, name: h.name, scheduleType: h.scheduleType, weekdays: h.weekdaysParsed, timesPerWeek: h.timesPerWeek, active: h.active, createdOn: dateInTz(new Date(h.createdAt), profile.timezone) }));
  const cInput = completions.map((c) => ({ habitId: c.habitId, date: c.date }));
  const stats = computeHabitStats(hInput, cInput, today);
  const withData = stats.filter((s) => (range <= 30 ? s.scheduled30 : s.scheduled90) > 0);
  const adh = withData.length ? withData.reduce((a, s) => a + (range <= 30 ? s.adherence30 : s.adherence90), 0) / withData.length : 0;
  const totalInRange = completions.filter((c) => c.date >= lastNDays(today, range)[0]).length;

  const heat = lastNDays(today, 91).map((d) => {
    const scheduled = hInput.filter((h) => isScheduled(h, d) && h.scheduleType !== "times_per_week");
    const anyDone = cInput.filter((c) => c.date === d).length;
    if (!scheduled.length && !anyDone) return { date: d, value: null };
    const done = scheduled.filter((h) => cInput.some((c) => c.habitId === h.id && c.date === d)).length;
    const v = scheduled.length ? done / scheduled.length : Math.min(1, anyDone / 2);
    return { date: d, value: v, label: `${anyDone} completed` };
  });

  return (
    <div className="space-y-4">
      <HabitList
        today={today}
        habits={habits.map((h) => ({ id: h.id, name: h.name, icon: h.icon, scheduleType: h.scheduleType as "daily" | "weekdays" | "times_per_week", weekdays: h.weekdaysParsed, timesPerWeek: h.timesPerWeek, active: h.active }))}
        stats={stats.map((s) => ({ habitId: s.habitId, doneToday: s.doneToday, dueToday: s.dueToday, streak: s.streak, adherence30: s.adherence30, thisWeekDone: s.thisWeekDone, thisWeekTarget: s.thisWeekTarget }))}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Adherence" value={withData.length ? `${Math.round(adh * 100)}%` : "—"} sub={`${range}-day`} />
        <Stat label="Completions" value={totalInRange} sub={`${range} days`} />
        <Stat label="Best streak" value={stats.length ? Math.max(...stats.map((s) => s.streak)) : 0} sub="days" />
      </div>

      <Card>
        <SectionTitle className="mb-3 px-0">Last 13 weeks</SectionTitle>
        <DayHeatmap days={heat} tone="accent" />
      </Card>
    </div>
  );
}
