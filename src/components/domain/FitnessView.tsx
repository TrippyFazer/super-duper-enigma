import { Dumbbell, HeartPulse, Footprints, Trophy, StretchHorizontal, CircleDot } from "lucide-react";
import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadActivity, loadWorkouts } from "@/services/loaders";
import { healthSources } from "@/health/sources";
import { addDays, formatShort, formatWeekdayShort, lastNDays, startOfWeek } from "@/lib/dates";
import { LogHereButton } from "@/components/log/LogHereButton";
import { BarsChart, DayHeatmap } from "@/components/charts/Charts";
import { Card, SectionTitle, Stat } from "@/components/ui/primitives";
import { DeleteButton } from "./DeleteButton";

const ICON: Record<string, typeof Dumbbell> = { strength: Dumbbell, cardio: HeartPulse, walk: Footprints, sport: Trophy, mobility: StretchHorizontal, other: CircleDot };

export function FitnessView({ profile, assessment, range }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const today = profile.today;
  const workouts = loadWorkouts(today);
  const activity = loadActivity(today);
  const sources = healthSources();
  const days = lastNDays(today, range);
  const inRange = workouts.filter((w) => w.date >= days[0]);
  const minutes = inRange.reduce((a, w) => a + w.durationMin, 0);
  const steps = activity.filter((a) => a.date >= days[0] && a.steps != null);
  const avgSteps = steps.length ? Math.round(steps.reduce((a, b) => a + (b.steps ?? 0), 0) / steps.length) : null;

  // Weekly bars (sessions per week) across range
  const weeks: { label: string; value: number }[] = [];
  const nWeeks = Math.max(1, Math.ceil(range / 7));
  for (let i = nWeeks - 1; i >= 0; i--) {
    const ws = addDays(startOfWeek(today), -7 * i);
    const we = addDays(ws, 6);
    const n = new Set(workouts.filter((w) => w.date >= ws && w.date <= we).map((w) => w.date)).size;
    weeks.push({ label: formatShort(ws), value: n });
  }
  const dailyBars = range === 7 ? days.map((d) => ({ label: formatWeekdayShort(d), value: workouts.filter((w) => w.date === d).reduce((a, w) => a + w.durationMin, 0) })) : null;

  const heat = lastNDays(today, 91).map((d) => {
    const mins = workouts.filter((w) => w.date === d).reduce((a, w) => a + w.durationMin, 0);
    return { date: d, value: mins ? Math.min(1, mins / 60) : null, label: mins ? `${mins} min` : "rest" };
  });

  return (
    <div className="space-y-4">
      <LogHereButton kind="workout" label="Log a workout" />

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Sessions" value={new Set(inRange.map((w) => w.date)).size} sub={`${range} days`} />
        <Stat label="Minutes" value={minutes.toLocaleString()} sub={`${Math.round((minutes / range) * 7)}/wk`} />
        <Stat label="Steps" value={avgSteps != null ? avgSteps.toLocaleString() : "—"} sub={avgSteps != null ? `avg/day${sources.stepsSourceLabel ? ` · ${sources.stepsSourceLabel}` : ""}` : sources.stepsAutomatic ? "no samples yet" : "not tracked"} />
      </div>

      <Card>
        <SectionTitle className="mb-3 px-0">{range === 7 ? "Minutes per day" : "Sessions per week"}</SectionTitle>
        {dailyBars ? <BarsChart data={dailyBars} unit=" min" /> : <BarsChart data={weeks} target={profile.targets.workoutsPerWeekTarget} />}
      </Card>

      <Card>
        <SectionTitle className="mb-3 px-0">Last 13 weeks</SectionTitle>
        <DayHeatmap days={heat} tone="accent" />
      </Card>

      <Card className="p-0">
        <div className="px-4 pt-3.5 pb-2 text-sm font-semibold">Recent workouts</div>
        {inRange.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-muted">No workouts in this range. {assessment.suggestedAction ?? "Log one above."}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {[...inRange].reverse().slice(0, 15).map((w) => {
              const Icon = ICON[w.type] ?? CircleDot;
              return (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon size={16} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm capitalize">
                      {w.type} · {w.durationMin} min · {["", "easy", "moderate", "hard"][w.intensity]}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {formatShort(w.date)}
                      {w.notes ? ` · ${w.notes}` : ""}
                    </div>
                  </div>
                  <DeleteButton kind="workout" id={w.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
