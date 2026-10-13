"use client";

import { Copy, MoreHorizontal, Plus } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { findExercise } from "@/planner/exercises";
import { weightStepFor } from "@/planner/weightStep";
import { SetRow } from "./SetRow";
import type { ExVM, SetVM } from "./types";

/** One exercise: header with last time, COPY PREVIOUS, set rows, add set. */
export function ExerciseCard({ ex, index, onMenu, onSetChange, onSetCommit, onSetCommitWith, onToggle, onCopyPrevious, onAddSet }: { ex: ExVM; index: number; onMenu: () => void; onSetChange: (set: SetVM, patch: Partial<SetVM>) => SetVM; onSetCommit: (set: SetVM) => void; onSetCommitWith: (next: SetVM) => void; onToggle: (set: SetVM) => void; onCopyPrevious: () => void; onAddSet: () => void }) {
  const skipped = ex.status === "skipped";
  const def = findExercise(ex.slug);
  const step = weightStepFor(def?.equipment);
  const canCopy = !!ex.previous && ex.previous.some((p) => p.weight != null || p.reps != null) && ex.sets.some((s) => !s.completed && (s.weight == null || s.reps == null));
  return (
    <section className={cx("plate overflow-hidden", skipped && "opacity-50")}>
      <div className="flex items-center gap-2 py-1 pl-3.5 pr-1">
        <span className="display w-5 text-sm text-gold">{index + 1}</span>
        <div className="min-w-0 flex-1 py-1">
          <div className="truncate text-[15px] font-medium">{ex.name}</div>
          <div className="truncate text-[11px] text-muted">
            {ex.targetSets} × {ex.targetReps} · rest {ex.restSeconds}s{ex.previous ? ` · last ${ex.previous.map((p) => `${p.weight ?? "–"}×${p.reps ?? "–"}`).join(", ")}` : " · first time"}
          </div>
        </div>
        {canCopy && !skipped && (
          <button onClick={onCopyPrevious} className="press flex h-11 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] text-text-2" aria-label={`Copy previous for ${ex.name}`}>
            <Copy size={12} /> Copy last
          </button>
        )}
        <button onClick={onMenu} aria-label={`Options for ${ex.name}`} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-white/5">
          <MoreHorizontal size={18} />
        </button>
      </div>
      {!skipped && (
        <div className="px-1.5 pb-2">
          {ex.sets.map((s) => (
            <SetRow key={s.setIndex} ex={ex} set={s} step={step} onChange={(patch) => onSetChange(s, patch)} onCommit={() => onSetCommit(s)} onCommitWith={onSetCommitWith} onToggle={() => onToggle(s)} />
          ))}
          <button onClick={onAddSet} className="press mt-0.5 flex h-10 items-center gap-1 px-2 text-xs text-muted">
            <Plus size={12} /> Add set
          </button>
        </div>
      )}
    </section>
  );
}
