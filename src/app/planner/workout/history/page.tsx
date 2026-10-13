import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getSession, listPersonalRecords, listSessions } from "@/services/workouts";
import { loadWorkouts } from "@/services/loaders";
import { Card, PageHeader, SectionTitle, EmptyHint } from "@/components/ui/primitives";
import { DiscardSessionButton } from "@/components/planner/SessionHistoryActions";
import { DeleteButton } from "@/components/domain/DeleteButton";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training history" };

export default function HistoryPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sessions = listSessions(40);
  const completed = sessions.filter((s) => s.status === "completed");
  const cancelled = sessions.filter((s) => s.status !== "completed");
  const prs = listPersonalRecords();
  const sessionWorkoutIds = new Set(sessions.map((s) => s.workoutId).filter((x): x is number => x != null));
  const manual = loadWorkouts(profile.today).filter((w) => !sessionWorkoutIds.has(w.id)).slice(0, 15);
  return (
    <div className="page space-y-5">
      <PageHeader title="Training history" subtitle={`${completed.length} completed sessions`} back="/planner/workout" />
      {prs.length > 0 && (
        <section>
          <SectionTitle>Personal records</SectionTitle>
          <Card className="divide-y divide-border/70 p-0">
            {prs
              .filter((p) => p.kind === "e1rm")
              .map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Trophy size={14} className="text-gold" />
                  <span className="flex-1 truncate">{p.exerciseName}</span>
                  <span className="tabular text-xs text-text-2">
                    best {p.weight}×{p.reps} · e1RM <span className="text-gold">{Math.round(p.value)}</span>
                  </span>
                </div>
              ))}
          </Card>
        </section>
      )}

      {cancelled.length > 0 && (
        <section>
          <SectionTitle>Cancelled &amp; empty sessions</SectionTitle>
          <Card className="divide-y divide-border/70 p-0">
            {cancelled.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{s.name}</div>
                  <div className="text-[11px] text-muted">
                    Started {new Date(s.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {s.setCount} sets · not counted
                  </div>
                </div>
                <DiscardSessionButton id={s.id} status={s.status} setCount={s.setCount} label="Discard" />
              </div>
            ))}
          </Card>
          <p className="serif mt-1 px-1 text-[12px] text-muted">These never counted toward XP, streaks or ranks. Discard removes them from the list.</p>
        </section>
      )}

      {completed.length === 0 && <Card className="p-0"><EmptyHint text="No finished sessions yet." action="Start a workout" href="/planner/workout" /></Card>}
      {completed.map((s) => {
        const full = getSession(s.id)!;
        return (
          <Card key={s.id} id={`s${s.id}`} className="p-0">
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
              <div className="min-w-0">
                <div className="display text-[15px] font-semibold">{s.name}</div>
                <div className="text-[11px] text-muted">
                  {formatShort(s.date)} · {s.durationMin ?? 0} min · {s.setCount} sets · {s.volume.toLocaleString()} lb volume
                </div>
              </div>
              <DiscardSessionButton id={s.id} status={s.status} setCount={s.setCount} label="Discard" />
            </div>
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {full.exercises.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <span className="tabular text-right text-xs text-text-2">{e.status === "skipped" ? "skipped" : e.sets.filter((x) => x.completed).map((x) => `${x.weight ?? "–"}×${x.reps ?? "–"}`).join(" · ") || "—"}</span>
                </li>
              ))}
            </ul>
            {s.notes && <p className="serif px-4 py-2 text-[13px] text-muted">{s.notes}</p>}
          </Card>
        );
      })}

      {manual.length > 0 && (
        <section>
          <SectionTitle>Logged workouts (quick log)</SectionTitle>
          <Card className="divide-y divide-border/70 p-0">
            {manual.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="capitalize">
                    {w.type} · {w.durationMin} min
                  </div>
                  <div className="text-[11px] text-muted">
                    {formatShort(w.date)} · {w.source === "health" ? "Apple Health" : w.source}
                    {w.notes ? ` · ${w.notes}` : ""}
                  </div>
                </div>
                <DeleteButton kind="workout" id={w.id} confirm="Delete this workout? Any XP it earned is reversed." />
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
