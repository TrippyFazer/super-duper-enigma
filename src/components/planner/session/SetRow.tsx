"use client";

import { Check, Minus, Plus } from "lucide-react";
import { cx, inputClass } from "@/components/ui/primitives";
import { stepWeight } from "@/planner/weightStep";
import { setInputId, type ExVM, type SetVM } from "./types";

/**
 * One set: [n] [−] weight [+] reps [✓]. Thumb-sized targets, numeric keypads,
 * Enter moves weight → reps → complete. Previous values show as placeholders.
 */
export function SetRow({ ex, set, step, onChange, onCommit, onCommitWith, onToggle }: { ex: ExVM; set: SetVM; step: number | null; onChange: (patch: Partial<SetVM>) => SetVM; onCommit: () => void; onCommitWith: (next: SetVM) => void; onToggle: () => void }) {
  const prev = ex.previous?.[set.setIndex];
  const focus = (field: "weight" | "reps") => document.getElementById(setInputId(ex.id, set.setIndex, field))?.focus();
  const nudge = (dir: 1 | -1) => {
    if (!step) return;
    const base = set.weight ?? prev?.weight ?? null;
    // commit the exact value we just set (never a stale closure)
    onCommitWith(onChange({ weight: stepWeight(base, step, dir) }));
  };
  return (
    <div className={cx("grid items-center gap-1 rounded-md px-1 py-0.5", step ? "grid-cols-[1.6rem_2.5rem_1fr_2.5rem_1fr_2.75rem]" : "grid-cols-[1.6rem_1fr_1fr_2.75rem]", set.completed && "bg-success/8")}>
      <span className="tabular text-center text-sm text-muted">{set.setIndex + 1}</span>
      {step && (
        <button type="button" onClick={() => nudge(-1)} aria-label={`Set ${set.setIndex + 1} minus ${step}`} className="press flex h-11 w-10 items-center justify-center rounded-md border border-border bg-black/25 text-text-2">
          <Minus size={14} />
        </button>
      )}
      <input
        id={setInputId(ex.id, set.setIndex, "weight")}
        type="number"
        inputMode="decimal"
        enterKeyHint="next"
        value={set.weight ?? ""}
        placeholder={prev?.weight != null ? String(prev.weight) : "lb"}
        onChange={(e) => onChange({ weight: e.target.value === "" ? null : Number(e.target.value) })}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            focus("reps");
          }
        }}
        className={cx(inputClass, "tabular h-11 px-1 py-0 text-center")}
        aria-label={`Set ${set.setIndex + 1} weight`}
      />
      {step && (
        <button type="button" onClick={() => nudge(1)} aria-label={`Set ${set.setIndex + 1} plus ${step}`} className="press flex h-11 w-10 items-center justify-center rounded-md border border-border bg-black/25 text-text-2">
          <Plus size={14} />
        </button>
      )}
      <input
        id={setInputId(ex.id, set.setIndex, "reps")}
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        value={set.reps ?? ""}
        placeholder={prev?.reps != null ? String(prev.reps) : ex.targetReps.split("-")[0]}
        onChange={(e) => onChange({ reps: e.target.value === "" ? null : Number(e.target.value) })}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
            onToggle();
          }
        }}
        className={cx(inputClass, "tabular h-11 px-1 py-0 text-center")}
        aria-label={`Set ${set.setIndex + 1} reps`}
      />
      <button type="button" onClick={onToggle} aria-pressed={set.completed} aria-label={`Complete set ${set.setIndex + 1}`} className={cx("press flex h-11 w-11 items-center justify-center rounded-md border", set.completed ? "border-success bg-success text-[#071a10]" : "border-border-strong bg-black/30 text-faint")}>
        <Check size={18} strokeWidth={3} />
      </button>
    </div>
  );
}
