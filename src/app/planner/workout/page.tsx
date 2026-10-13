import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Trophy } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getActiveSession, getPlanForDate, listPersonalRecords, listSessions } from "@/services/workouts";
import { isAiEnabled } from "@/ai/config";
import { PageHeader, SectionTitle } from "@/components/ui/primitives";
import { WorkoutPlanView } from "@/components/planner/WorkoutPlanView";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workout" };

export default function WorkoutPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const active = getActiveSession();
  if (active) redirect("/planner/workout/session");
  const plan = getPlanForDate(profile.today);
  const sessions = listSessions(5);
  const prs = listPersonalRecords().filter((p) => p.kind === "weight").slice(0, 6);

  return (
    <div className="page space-y-5">
      <PageHeader title="Today's workout" subtitle={`${profile.preferences.fitness.goal} · ${profile.preferences.fitness.daysPerWeek} days/wk · ~${profile.preferences.fitness.workoutLengthMin} min`} back="/planner" />
      <WorkoutPlanView plan={plan ? { id: plan.id, name: plan.name, focus: plan.focus, estimatedMinutes: plan.estimatedMinutes, source: plan.source, status: plan.status, notes: plan.notes, exercises: plan.exercisesParsed, bonus: plan.bonusParsed ?? null } : null} aiEnabled={isAiEnabled()} />

      {sessions.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/planner/workout/history" className="flex items-center text-xs text-muted">
                All <ChevronRight size={14} />
              </Link>
            }
          >
            Recent sessions
          </SectionTitle>
          <div className="plate divide-y divide-border/60 p-0">
            {sessions.map((s) => (
              <Link key={s.id} href={`/planner/workout/history#s${s.id}`} className="press flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted">
                  {s.setCount} sets · {s.volume.toLocaleString()} vol · {formatShort(s.date)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {prs.length > 0 && (
        <section>
          <SectionTitle>Personal records</SectionTitle>
          <div className="plate divide-y divide-border/60 p-0">
            {prs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Trophy size={14} className="text-gold" />
                <span className="flex-1 truncate">{p.exerciseName}</span>
                <span className="tabular text-xs text-gold">
                  {p.weight} × {p.reps}
                </span>
                <span className="text-[11px] text-faint">{formatShort(p.date)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
