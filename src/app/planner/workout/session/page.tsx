import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { getActiveSession, getSession } from "@/services/workouts";
import { SessionTracker } from "@/components/planner/SessionTracker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session" };

export default async function SessionPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const s = sp.id ? getSession(Number(sp.id)) : getActiveSession();
  if (!s || s.status !== "active") redirect("/planner/workout");
  return (
    <SessionTracker
      session={{
        id: s.id,
        name: s.name,
        focus: s.focus,
        startedAt: s.startedAt,
        exercises: s.exercises.map((e) => ({ id: e.id, slug: e.slug, name: e.name, targetSets: e.targetSets, targetReps: e.targetReps, restSeconds: e.restSeconds, status: e.status, notes: e.notes, sets: e.sets.map((x) => ({ id: x.id, setIndex: x.setIndex, weight: x.weight, reps: x.reps, completed: x.completed })), previous: e.previous })),
      }}
    />
  );
}
