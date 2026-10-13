"use client";

import { useMemo, useState } from "react";
import { Ban, Flag, Pause, Play, Replace, SkipForward, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button, cx, inputClass } from "@/components/ui/primitives";
import { EXERCISES, findExercise } from "@/planner/exercises";
import type { ExVM } from "./types";

/** Per-exercise: skip / swap / remove. */
export function ExerciseMenu({ ex, pending, onClose, onSkip, onReplace, onRemove }: { ex: ExVM | null; pending: boolean; onClose: () => void; onSkip: (ex: ExVM) => void; onReplace: (ex: ExVM, slug: string) => void; onRemove: (ex: ExVM) => void }) {
  return (
    <Sheet open={!!ex} onClose={onClose} title={ex?.name}>
      {ex && (
        <div className="space-y-2 pb-2">
          <Button full variant="secondary" disabled={pending} onClick={() => onSkip(ex)}>
            <SkipForward size={14} /> {ex.status === "skipped" ? "Un-skip" : "Skip today"}
          </Button>
          {(findExercise(ex.slug)?.alternatives ?? []).map((alt) => {
            const def = findExercise(alt);
            if (!def) return null;
            return (
              <Button key={alt} full variant="secondary" disabled={pending} onClick={() => onReplace(ex, def.slug)}>
                <Replace size={14} /> Swap for {def.name}
              </Button>
            );
          })}
          <Button full variant="danger" disabled={pending} onClick={() => onRemove(ex)}>
            <Trash2 size={14} /> Remove from this session
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Add an exercise from the catalog, or a custom one. */
export function AddExerciseSheet({ open, pending, onClose, onAdd }: { open: boolean; pending: boolean; onClose: () => void; onAdd: (slugOrName: string) => void }) {
  const [query, setQuery] = useState("");
  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q))).slice(0, 14);
  }, [query]);
  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or muscle" className={inputClass} autoFocus aria-label="Search exercises" />
      <ul className="mt-3 max-h-[50dvh] divide-y divide-border/60 overflow-y-auto pb-2">
        {catalog.map((e) => (
          <li key={e.slug}>
            <button disabled={pending} onClick={() => { onAdd(e.slug); setQuery(""); }} className="press flex min-h-12 w-full items-center justify-between px-1 py-2 text-left text-sm">
              <span>{e.name}</span>
              <span className="text-[11px] text-muted">{e.muscles.slice(0, 2).join(", ")}</span>
            </button>
          </li>
        ))}
        {query && !catalog.length && (
          <li>
            <button disabled={pending} onClick={() => { onAdd(query); setQuery(""); }} className="press min-h-12 w-full py-2 text-left text-sm text-gold">
              Add “{query}” as a custom exercise
            </button>
          </li>
        )}
      </ul>
    </Sheet>
  );
}

/**
 * Session menu. Plain language for the lifecycle:
 *  End early = keep what you did · Cancel = nothing counted · Discard = erase entirely (confirm).
 */
export function SessionMenu({ open, paused, pending, doneSets, onClose, onPause, onResume, onEndEarly, onCancel, onDiscard }: { open: boolean; paused: boolean; pending: boolean; doneSets: number; onClose: () => void; onPause: () => void; onResume: () => void; onEndEarly: () => void; onCancel: () => void; onDiscard: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Session">
      <div className="space-y-2 pb-2">
        {paused ? (
          <Button full variant="secondary" disabled={pending} onClick={onResume}>
            <Play size={14} /> Resume
          </Button>
        ) : (
          <Button full variant="secondary" disabled={pending} onClick={onPause}>
            <Pause size={14} /> Pause the clock
          </Button>
        )}
        <Button full variant="secondary" disabled={pending} onClick={onEndEarly}>
          <Flag size={14} /> End early {doneSets > 0 ? `· keep ${doneSets} set${doneSets === 1 ? "" : "s"}` : ""}
        </Button>
        <Button full variant="secondary" disabled={pending} onClick={onCancel}>
          <Ban size={14} /> Cancel · nothing counted
        </Button>
        <Button full variant="danger" disabled={pending} onClick={onDiscard}>
          <Trash2 size={14} /> Discard · erase entirely
        </Button>
        <p className="serif px-1 text-center text-[12px] text-muted">No XP is ever lost for stopping.</p>
      </div>
    </Sheet>
  );
}

/** Finish: confirms what gets saved. No sets → closes without logging anything. */
export function FinishWorkoutSheet({ open, onClose, doneSets, onFinish, onAbandon, pending }: { open: boolean; onClose: () => void; doneSets: number; onFinish: (notes: string) => void; onAbandon: () => void; pending: boolean }) {
  const [notes, setNotes] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={doneSets > 0 ? "Finish workout" : "Close workout"}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" disabled={pending} onClick={onAbandon}>
            <X size={14} /> Cancel
          </Button>
          <Button full size="lg" variant="gold" disabled={pending} onClick={() => onFinish(notes)}>
            {doneSets > 0 ? `Finish · ${doneSets} set${doneSets === 1 ? "" : "s"}` : "Close without logging"}
          </Button>
        </div>
      }
    >
      <p className="serif text-[14px] text-text-2">{doneSets > 0 ? "Saves what you did, checks for personal records and updates your rank. Ending early is fine." : "No sets completed. Nothing is logged or awarded."}</p>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className={cx(inputClass, "mt-3")} maxLength={300} />
    </Sheet>
  );
}
