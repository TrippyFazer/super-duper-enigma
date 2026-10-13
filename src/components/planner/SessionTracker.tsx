"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addExerciseAction, addSetAction, cancelSessionAction, discardSessionAction, finishSessionAction, logSetAction, pauseSessionAction, removeExerciseAction, replaceExerciseAction, resumeSessionAction, skipExerciseAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { ActiveWorkoutHeader } from "./session/ActiveWorkoutHeader";
import { ExerciseCard } from "./session/ExerciseCard";
import { AddExerciseSheet, ExerciseMenu, FinishWorkoutSheet, SessionMenu } from "./session/Menus";
import { setInputId, type ExVM, type SessionVM, type SetVM } from "./session/types";

export type { SessionVM } from "./session/types";

/**
 * Orchestrates the live workout. Local state is the source of truth while
 * logging; every change is committed to the server as it happens.
 */
export function SessionTracker({ session }: { session: SessionVM }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [exs, setExs] = useState<ExVM[]>(session.exercises);
  const [rest, setRest] = useState<{ total: number; left: number } | null>(null);
  const [menu, setMenu] = useState<ExVM | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sessionMenu, setSessionMenu] = useState(false);
  const paused = session.status === "paused";
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setExs(session.exercises), [session.exercises]);
  useEffect(() => {
    if (!rest) return;
    restRef.current = setInterval(() => setRest((r) => (r && r.left > 1 ? { ...r, left: r.left - 1 } : null)), 1000);
    return () => {
      if (restRef.current) clearInterval(restRef.current);
    };
  }, [rest?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSets = exs.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = exs.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);

  const current = (ex: ExVM, set: SetVM) => exs.find((x) => x.id === ex.id)?.sets.find((x) => x.setIndex === set.setIndex) ?? set;
  const updateSet = (ex: ExVM, set: SetVM, patch: Partial<SetVM>) => {
    const next = { ...set, ...patch };
    setExs((list) => list.map((e) => (e.id === ex.id ? { ...e, sets: e.sets.map((s) => (s.setIndex === set.setIndex ? next : s)) } : e)));
    return next;
  };
  const commit = (ex: ExVM, set: SetVM) => start(async () => { await logSetAction({ sessionExerciseId: ex.id, setIndex: set.setIndex, weight: set.weight, reps: set.reps, completed: set.completed }); });

  /** Complete a set → rest timer → focus the next set's first empty field (one-handed flow). */
  const toggleDone = (ex: ExVM, set: SetVM) => {
    const live = current(ex, set);
    const willComplete = !live.completed;
    const reps = live.reps ?? ex.previous?.[live.setIndex]?.reps ?? (parseInt(ex.targetReps, 10) || null);
    const weight = live.weight ?? ex.previous?.[live.setIndex]?.weight ?? null;
    const next = updateSet(ex, live, { completed: willComplete, reps: willComplete ? reps : live.reps, weight: willComplete ? weight : live.weight });
    commit(ex, next);
    if (willComplete) {
      if (ex.restSeconds > 0) setRest({ total: ex.restSeconds, left: ex.restSeconds });
      const after = ex.sets.find((s) => s.setIndex > live.setIndex && !s.completed);
      if (after) setTimeout(() => document.getElementById(setInputId(ex.id, after.setIndex, after.weight == null && weight == null ? "weight" : "reps"))?.focus(), 30);
    }
  };

  /** COPY PREVIOUS: fill every incomplete set from last time, without completing them. */
  const copyPrevious = (ex: ExVM) => {
    if (!ex.previous) return;
    const filled = ex.sets.map((s) => (s.completed ? s : { ...s, weight: s.weight ?? ex.previous![s.setIndex]?.weight ?? ex.previous![ex.previous!.length - 1]?.weight ?? null, reps: s.reps ?? ex.previous![s.setIndex]?.reps ?? ex.previous![ex.previous!.length - 1]?.reps ?? null }));
    setExs((list) => list.map((e) => (e.id === ex.id ? { ...e, sets: filled } : e)));
    start(async () => {
      for (const s of filled.filter((x) => !x.completed)) await logSetAction({ sessionExerciseId: ex.id, setIndex: s.setIndex, weight: s.weight, reps: s.reps, completed: false });
    });
    toast("Copied last session", "quest");
  };

  const finish = (notes: string) =>
    start(async () => {
      const r = await finishSessionAction(session.id, { notes: notes || null });
      if (!r.ok) return toast(r.error ?? "Could not finish", "error");
      notify(r);
      if (r.abandoned) toast("Closed · nothing recorded", "quest");
      router.replace("/planner/workout");
    });
  const cancel = () =>
    start(async () => {
      await cancelSessionAction(session.id);
      toast("Workout cancelled · nothing counted", "quest");
      router.replace("/planner/workout");
    });
  const discard = () => {
    if (!window.confirm("Discard this session? It is erased entirely and never counts.")) return;
    start(async () => {
      await discardSessionAction(session.id);
      toast("Session discarded", "quest");
      router.replace("/planner/workout");
    });
  };
  const refresh = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="page space-y-3">
      <ActiveWorkoutHeader name={session.name} startedAt={session.startedAt} pausedAt={session.pausedAt} pausedSec={session.pausedSec} doneSets={doneSets} totalSets={totalSets} rest={rest} paused={paused} onBack={() => router.push("/planner/workout")} onDismissRest={() => setRest(null)} onResume={() => refresh(() => resumeSessionAction(session.id))} onFinish={() => setFinishing(true)} onMenu={() => setSessionMenu(true)} />
      {paused && <div className="rounded-lg border border-border bg-card-2 px-3 py-2 text-center text-xs text-muted">Clock paused.</div>}

      {exs.map((ex, i) => (
        <ExerciseCard key={ex.id} ex={ex} index={i} onMenu={() => setMenu(ex)} onSetChange={(s, patch) => updateSet(ex, s, patch)} onSetCommit={(s) => commit(ex, current(ex, s))} onSetCommitWith={(next) => commit(ex, next)} onToggle={(s) => toggleDone(ex, s)} onCopyPrevious={() => copyPrevious(ex)} onAddSet={() => refresh(() => addSetAction(ex.id))} />
      ))}

      <button onClick={() => setAdding(true)} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-sm text-text-2">
        <Plus size={16} /> Add exercise
      </button>

      <ExerciseMenu ex={menu} pending={pending} onClose={() => setMenu(null)} onSkip={(ex) => { setMenu(null); refresh(() => skipExerciseAction(ex.id, ex.status !== "skipped")); }} onReplace={(ex, slug) => { setMenu(null); refresh(() => replaceExerciseAction(ex.id, slug)); }} onRemove={(ex) => { setMenu(null); refresh(() => removeExerciseAction(ex.id)); }} />
      <AddExerciseSheet open={adding} pending={pending} onClose={() => setAdding(false)} onAdd={(s) => { setAdding(false); refresh(() => addExerciseAction(session.id, s)); }} />
      <SessionMenu open={sessionMenu} paused={paused} pending={pending} doneSets={doneSets} onClose={() => setSessionMenu(false)} onPause={() => { setSessionMenu(false); refresh(() => pauseSessionAction(session.id)); }} onResume={() => { setSessionMenu(false); refresh(() => resumeSessionAction(session.id)); }} onEndEarly={() => { setSessionMenu(false); setFinishing(true); }} onCancel={() => { setSessionMenu(false); cancel(); }} onDiscard={() => { setSessionMenu(false); discard(); }} />
      <FinishWorkoutSheet open={finishing} onClose={() => setFinishing(false)} doneSets={doneSets} onFinish={finish} onAbandon={() => { setFinishing(false); cancel(); }} pending={pending} />
    </div>
  );
}
