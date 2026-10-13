"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, MoreHorizontal, Plus, Timer, X, Replace, SkipForward, Trash2, Pause, Play, Flag, Ban } from "lucide-react";
import { addExerciseAction, addSetAction, cancelSessionAction, discardSessionAction, finishSessionAction, logSetAction, pauseSessionAction, removeExerciseAction, replaceExerciseAction, resumeSessionAction, skipExerciseAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, cx, inputClass } from "@/components/ui/primitives";
import { EXERCISES, findExercise } from "@/planner/exercises";

interface SetVM {
  id: number;
  setIndex: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
}
interface ExVM {
  id: number;
  slug: string;
  name: string;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  status: string;
  notes: string | null;
  sets: SetVM[];
  previous: { weight: number | null; reps: number | null }[] | null;
}
export interface SessionVM {
  id: number;
  name: string;
  focus: string;
  startedAt: string;
  status: string;
  pausedAt: string | null;
  pausedSec: number;
  exercises: ExVM[];
}

function useElapsed(startedAt: string, pausedAt: string | null, pausedSec: number) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const tick = () => {
      const end = pausedAt ? new Date(pausedAt).getTime() : Date.now();
      setS(Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000) - pausedSec));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, pausedAt, pausedSec]);
  return s;
}
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Fast in-workout logging: tap weight/reps, check the set, rest timer starts. */
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
  const [query, setQuery] = useState("");
  const paused = session.status === "paused";
  const elapsed = useElapsed(session.startedAt, session.pausedAt, session.pausedSec);
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

  const updateSet = (ex: ExVM, set: SetVM, patch: Partial<SetVM>) => {
    const next = { ...set, ...patch };
    setExs((list) => list.map((e) => (e.id === ex.id ? { ...e, sets: e.sets.map((s) => (s.setIndex === set.setIndex ? next : s)) } : e)));
    return next;
  };
  const commit = (ex: ExVM, set: SetVM) =>
    start(async () => {
      await logSetAction({ sessionExerciseId: ex.id, setIndex: set.setIndex, weight: set.weight, reps: set.reps, completed: set.completed });
    });
  const toggleDone = (ex: ExVM, set: SetVM) => {
    const willComplete = !set.completed;
    const reps = set.reps ?? ex.previous?.[set.setIndex]?.reps ?? (parseInt(ex.targetReps, 10) || null);
    const next = updateSet(ex, set, { completed: willComplete, reps: willComplete ? reps : set.reps });
    commit(ex, next);
    if (willComplete && ex.restSeconds > 0) setRest({ total: ex.restSeconds, left: ex.restSeconds });
  };

  const finish = (notes: string) =>
    start(async () => {
      const r = await finishSessionAction(session.id, { notes: notes || null });
      if (!r.ok) return toast(r.error ?? "Could not finish", "error");
      notify(r);
      if (r.abandoned) toast("Session cancelled — no sets logged, nothing recorded.", "quest");
      router.replace("/planner/workout");
    });
  const cancel = () =>
    start(async () => {
      await cancelSessionAction(session.id);
      toast("Workout cancelled. Nothing was recorded.", "quest");
      router.replace("/planner/workout");
    });
  const discard = () => {
    if (!window.confirm("Discard this session? It will be removed entirely and will not count toward progress.")) return;
    start(async () => {
      await discardSessionAction(session.id);
      toast("Session discarded", "quest");
      router.replace("/planner/workout");
    });
  };

  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q))).slice(0, 14);
  }, [query]);

  return (
    <div className="page space-y-3">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 border-b border-border/70 bg-bg/90 px-4 py-2 backdrop-blur" style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}>
        <button onClick={() => router.push("/planner/workout")} aria-label="Back" className="press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-2">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[15px] font-semibold">{session.name}</div>
          <div className="tabular text-[11px] text-muted">
            {mmss(elapsed)} · {doneSets}/{totalSets} sets
          </div>
        </div>
        {rest && !paused && (
          <button onClick={() => setRest(null)} className="press flex items-center gap-1.5 rounded-sm border border-gold/50 bg-gold/10 px-2.5 py-1.5 text-sm text-gold" aria-label="Rest timer, tap to dismiss">
            <Timer size={14} /> <span className="tabular font-semibold">{mmss(rest.left)}</span>
          </button>
        )}
        {paused ? (
          <button onClick={() => start(async () => { await resumeSessionAction(session.id); router.refresh(); })} className="press flex items-center gap-1.5 rounded-sm border border-success/50 bg-success/10 px-3 py-2 text-sm font-semibold text-success">
            <Play size={14} /> Resume
          </button>
        ) : (
          <button onClick={() => setFinishing(true)} className="press rounded-sm bg-gradient-to-b from-gold-2 to-gold px-3.5 py-2 text-sm font-semibold text-[#1a1406]" style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}>
            Finish
          </button>
        )}
        <button onClick={() => setSessionMenu(true)} aria-label="Session options" className="press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-2">
          <MoreHorizontal size={18} />
        </button>
      </header>
      {paused && <div className="rounded-lg border border-border bg-card-2 px-3 py-2 text-center text-xs text-muted">Paused — the clock is stopped. Resume when you&apos;re back.</div>}

      {rest && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-black/40">
          <div className="h-full bg-gold transition-[width] duration-1000 ease-linear" style={{ width: `${(rest.left / rest.total) * 100}%` }} />
        </div>
      )}

      {exs.map((ex, i) => {
        const skipped = ex.status === "skipped";
        return (
          <section key={ex.id} className={cx("plate overflow-hidden", skipped && "opacity-50")}>
            <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5">
              <span className="display w-5 text-sm text-gold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{ex.name}</div>
                <div className="text-[11px] text-muted">
                  {ex.targetSets} × {ex.targetReps} · rest {ex.restSeconds}s{ex.previous ? ` · last: ${ex.previous.map((p) => `${p.weight ?? "–"}×${p.reps ?? "–"}`).join(", ")}` : " · first time"}
                </div>
              </div>
              <button onClick={() => setMenu(ex)} aria-label="Exercise options" className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-white/5">
                <MoreHorizontal size={16} />
              </button>
            </div>
            {!skipped && (
              <div className="px-2 pb-2">
                <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-1 px-1.5 text-[10px] uppercase tracking-wider text-faint">
                  <span>Set</span>
                  <span>lb</span>
                  <span>Reps</span>
                  <span />
                </div>
                {ex.sets.map((s) => (
                  <div key={s.setIndex} className={cx("grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-1 rounded-md px-1.5 py-1", s.completed && "bg-success/8")}>
                    <span className="tabular text-sm text-muted">{s.setIndex + 1}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={s.weight ?? ""}
                      placeholder={String(ex.previous?.[s.setIndex]?.weight ?? "")}
                      onChange={(e) => updateSet(ex, s, { weight: e.target.value === "" ? null : Number(e.target.value) })}
                      onBlur={() => commit(ex, exs.find((x) => x.id === ex.id)!.sets.find((x) => x.setIndex === s.setIndex)!)}
                      className={cx(inputClass, "tabular h-11 px-2 py-0 text-center")}
                      aria-label={`Set ${s.setIndex + 1} weight`}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={s.reps ?? ""}
                      placeholder={String(ex.previous?.[s.setIndex]?.reps ?? ex.targetReps.split("-")[0])}
                      onChange={(e) => updateSet(ex, s, { reps: e.target.value === "" ? null : Number(e.target.value) })}
                      onBlur={() => commit(ex, exs.find((x) => x.id === ex.id)!.sets.find((x) => x.setIndex === s.setIndex)!)}
                      className={cx(inputClass, "tabular h-11 px-2 py-0 text-center")}
                      aria-label={`Set ${s.setIndex + 1} reps`}
                    />
                    <button onClick={() => toggleDone(ex, s)} aria-pressed={s.completed} aria-label={`Complete set ${s.setIndex + 1}`} className={cx("press flex h-11 w-10 items-center justify-center rounded-md border", s.completed ? "border-success bg-success text-[#071a10]" : "border-border-strong bg-black/30 text-faint")}>
                      <Check size={16} strokeWidth={3} />
                    </button>
                  </div>
                ))}
                <button onClick={() => start(async () => { await addSetAction(ex.id); router.refresh(); })} className="press mt-1 flex items-center gap-1 px-2 py-1 text-xs text-muted">
                  <Plus size={12} /> Add set
                </button>
              </div>
            )}
          </section>
        );
      })}

      <button onClick={() => setAdding(true)} className="press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm text-text-2">
        <Plus size={16} /> Add exercise
      </button>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <div className="space-y-2 pb-2">
            <Button full variant="secondary" disabled={pending} onClick={() => start(async () => { await skipExerciseAction(menu.id, menu.status !== "skipped"); setMenu(null); router.refresh(); })}>
              <SkipForward size={14} /> {menu.status === "skipped" ? "Un-skip" : "Skip exercise"}
            </Button>
            {(findExercise(menu.slug)?.alternatives ?? []).map((alt) => {
              const def = findExercise(alt);
              if (!def) return null;
              return (
                <Button key={alt} full variant="secondary" disabled={pending} onClick={() => start(async () => { await replaceExerciseAction(menu.id, def.slug); setMenu(null); router.refresh(); })}>
                  <Replace size={14} /> Swap for {def.name}
                </Button>
              );
            })}
            <Button full variant="danger" disabled={pending} onClick={() => start(async () => { await removeExerciseAction(menu.id); setMenu(null); router.refresh(); })}>
              <Trash2 size={14} /> Remove
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add exercise">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or muscle" className={inputClass} autoFocus />
        <ul className="mt-3 max-h-[50dvh] divide-y divide-border/60 overflow-y-auto pb-2">
          {catalog.map((e) => (
            <li key={e.slug}>
              <button
                disabled={pending}
                onClick={() => start(async () => { await addExerciseAction(session.id, e.slug); setAdding(false); setQuery(""); router.refresh(); })}
                className="press flex w-full items-center justify-between px-1 py-2.5 text-left text-sm"
              >
                <span>{e.name}</span>
                <span className="text-[11px] text-muted">{e.muscles.slice(0, 2).join(", ")}</span>
              </button>
            </li>
          ))}
          {query && !catalog.length && (
            <li>
              <button disabled={pending} onClick={() => start(async () => { await addExerciseAction(session.id, query); setAdding(false); setQuery(""); router.refresh(); })} className="press w-full py-2.5 text-left text-sm text-gold">
                Add “{query}” as a custom exercise
              </button>
            </li>
          )}
        </ul>
      </Sheet>

      <Sheet open={sessionMenu} onClose={() => setSessionMenu(false)} title="Session">
        <div className="space-y-2 pb-2">
          {paused ? (
            <Button full variant="secondary" disabled={pending} onClick={() => start(async () => { await resumeSessionAction(session.id); setSessionMenu(false); router.refresh(); })}>
              <Play size={14} /> Resume
            </Button>
          ) : (
            <Button full variant="secondary" disabled={pending} onClick={() => start(async () => { await pauseSessionAction(session.id); setSessionMenu(false); router.refresh(); })}>
              <Pause size={14} /> Pause
            </Button>
          )}
          <Button full variant="secondary" disabled={pending} onClick={() => { setSessionMenu(false); setFinishing(true); }}>
            <Flag size={14} /> End early {doneSets > 0 ? `· keep ${doneSets} sets` : ""}
          </Button>
          <Button full variant="secondary" disabled={pending} onClick={() => { setSessionMenu(false); cancel(); }}>
            <Ban size={14} /> Cancel workout
          </Button>
          <Button full variant="danger" disabled={pending} onClick={() => { setSessionMenu(false); discard(); }}>
            <Trash2 size={14} /> Discard session
          </Button>
          <p className="serif px-1 text-center text-[12px] text-muted">End early saves what you did. Cancel keeps a note that nothing happened. Discard removes every trace — no XP, no penalty either way.</p>
        </div>
      </Sheet>

      <FinishSheet open={finishing} onClose={() => setFinishing(false)} doneSets={doneSets} onFinish={finish} onAbandon={() => { setFinishing(false); cancel(); }} pending={pending} />
    </div>
  );
}

function FinishSheet({ open, onClose, doneSets, onFinish, onAbandon, pending }: { open: boolean; onClose: () => void; doneSets: number; onFinish: (notes: string) => void; onAbandon: () => void; pending: boolean }) {
  const [notes, setNotes] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish session"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" disabled={pending} onClick={onAbandon}>
            <X size={14} /> Cancel
          </Button>
          <Button full variant="gold" disabled={pending} onClick={() => onFinish(notes)}>
            {doneSets > 0 ? `Finish · ${doneSets} sets` : "Close without logging"}
          </Button>
        </div>
      }
    >
      <p className="serif text-[14px] text-text-2">{doneSets > 0 ? "Logging this session counts as today's workout, checks for personal records and updates your fitness rank. Ending early is fine — what you did is what gets saved." : "No sets were completed. Closing won't log a workout, award XP, or count toward anything."}</p>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className={cx(inputClass, "mt-3")} maxLength={300} />
    </Sheet>
  );
}
