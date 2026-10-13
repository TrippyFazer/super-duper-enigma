import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadRoutineCompletions, loadRoutines } from "@/services/loaders";
import { dateInTz, lastNDays } from "@/lib/dates";
import { routineAdherence, routineStreak } from "@/ranking/domains/skincare";
import { Card, SectionTitle, Stat } from "@/components/ui/primitives";
import { DayHeatmap } from "@/components/charts/Charts";
import { RoutineManager } from "./RoutineManager";

export function SkincareView({ profile, range }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const today = profile.today;
  const routines = loadRoutines();
  const completions = loadRoutineCompletions(today);
  const active = routines.filter((r) => r.active);
  const rInput = active.map((r) => ({ id: r.id, timeOfDay: r.timeOfDay, steps: r.stepsParsed, active: r.active, createdOn: dateInTz(new Date(r.createdAt), profile.timezone) }));
  const cInput = completions.map((c) => ({ routineId: c.routineId, date: c.date, complete: c.complete, stepsCompleted: c.stepsCompletedParsed }));
  const days = lastNDays(today, range).filter((d) => d !== today);
  const adh = routineAdherence(rInput, cInput, days);
  const streak = routineStreak(rInput, cInput, today);

  const heat = lastNDays(today, 91).map((d) => {
    const scheduled = rInput.filter((r) => !r.createdOn || d >= r.createdOn);
    if (!scheduled.length) return { date: d, value: null };
    const done = scheduled.filter((r) => cInput.some((c) => c.routineId === r.id && c.date === d && c.complete)).length;
    return { date: d, value: done ? done / scheduled.length : null, label: `${done}/${scheduled.length} routines` };
  });

  return (
    <div className="space-y-4">
      <RoutineManager
        today={today}
        routines={routines.map((r) => ({ id: r.id, name: r.name, timeOfDay: r.timeOfDay as "morning" | "evening", steps: r.stepsParsed, active: r.active }))}
        completions={completions.filter((c) => c.date === today).map((c) => ({ routineId: c.routineId, complete: c.complete, stepsCompleted: c.stepsCompletedParsed }))}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Adherence" value={adh.scheduled ? `${Math.round(adh.ratio * 100)}%` : "—"} sub={`${range}-day`} />
        <Stat label="Streak" value={streak} sub={streak === 1 ? "day" : "days"} />
        <Stat label="Completed" value={adh.completed} sub={`of ${adh.scheduled}`} />
      </div>
      <p className="px-1 text-[11px] text-faint">Streaks are a small part of your score by design. Missing a day costs a few points, not your rank.</p>

      <Card>
        <SectionTitle className="mb-3 px-0">Last 13 weeks</SectionTitle>
        <DayHeatmap days={heat} tone="gold" />
      </Card>
    </div>
  );
}
