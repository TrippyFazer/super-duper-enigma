"use client";

import { useState, useTransition } from "react";
import { Sun, Moon, Check, Plus, Pencil } from "lucide-react";
import { completeRoutineAction, createRoutineAction, deleteRoutineAction, uncompleteRoutineAction, updateRoutineAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { StepEditor } from "@/components/onboarding/OnboardingWizard";

interface RoutineItem {
  id: number;
  name: string;
  timeOfDay: "morning" | "evening";
  steps: { id: string; name: string }[];
  active: boolean;
}
interface CompletionItem {
  routineId: number;
  complete: boolean;
  stepsCompleted: string[];
}

export function RoutineManager({ today, routines, completions }: { today: string; routines: RoutineItem[]; completions: CompletionItem[] }) {
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<RoutineItem | "new" | null>(null);
  const [local, setLocal] = useState<Record<number, string[]>>(() => Object.fromEntries(completions.map((c) => [c.routineId, c.stepsCompleted])));

  const isDone = (r: RoutineItem) => completions.some((c) => c.routineId === r.id && c.complete);

  const toggleStep = (r: RoutineItem, stepId: string) => {
    const cur = local[r.id] ?? [];
    const next = cur.includes(stepId) ? cur.filter((s) => s !== stepId) : [...cur, stepId];
    setLocal((l) => ({ ...l, [r.id]: next }));
    if (next.length === r.steps.length && !isDone(r)) {
      start(async () => notify(await completeRoutineAction({ routineId: r.id, date: today, stepsCompleted: next })));
    }
  };
  const completeAll = (r: RoutineItem) => {
    setLocal((l) => ({ ...l, [r.id]: r.steps.map((s) => s.id) }));
    start(async () => notify(await completeRoutineAction({ routineId: r.id, date: today, stepsCompleted: r.steps.map((s) => s.id) })));
  };
  const undo = (r: RoutineItem) => {
    setLocal((l) => ({ ...l, [r.id]: [] }));
    start(async () => {
      await uncompleteRoutineAction(r.id, today);
    });
  };

  return (
    <div className="space-y-3">
      {routines.filter((r) => r.active).length === 0 && (
        <div className="card p-5 text-center text-sm text-muted">
          No routines yet. Add a morning or evening routine to start tracking.
        </div>
      )}
      {routines
        .filter((r) => r.active)
        .map((r) => {
          const done = isDone(r);
          const checked = local[r.id] ?? [];
          return (
            <div key={r.id} className={cx("card overflow-hidden", done && "border-success/40")}>
              <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
                {r.timeOfDay === "morning" ? <Sun size={16} className="text-gold" /> : <Moon size={16} className="text-accent-2" />}
                <div className="flex-1 text-sm font-semibold">{r.name}</div>
                <button aria-label="Edit routine" onClick={() => setEditing(r)} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-white/5">
                  <Pencil size={14} />
                </button>
                {done ? (
                  <button onClick={() => undo(r)} className="press rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    Done ✓
                  </button>
                ) : (
                  <button onClick={() => completeAll(r)} disabled={pending} className="press rounded-full bg-gold px-3 py-1 text-xs font-semibold text-[#1a1406]">
                    Complete all
                  </button>
                )}
              </div>
              <ul className="divide-y divide-border/60 border-t border-border/60">
                {r.steps.map((s) => {
                  const on = done || checked.includes(s.id);
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => !done && toggleStep(r, s.id)} className="press flex w-full items-center gap-3 px-4 py-2.5 text-left">
                        <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border", on ? "border-success bg-success text-[#071a10]" : "border-border-strong text-transparent")}>
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <span className={cx("text-sm", on && "text-muted line-through decoration-faint")}>{s.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      <button onClick={() => setEditing("new")} className="press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm text-text-2">
        <Plus size={16} /> Add routine
      </button>

      {editing && <RoutineEditor routine={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoutineEditor({ routine, onClose }: { routine: RoutineItem | null; onClose: () => void }) {
  const [name, setName] = useState(routine?.name ?? "");
  const [time, setTime] = useState<"morning" | "evening">(routine?.timeOfDay ?? "morning");
  const [steps, setSteps] = useState<string[]>(routine?.steps.map((s) => s.name) ?? ["Cleanser", "Moisturizer", "SPF"]);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      if (routine) await updateRoutineAction(routine.id, { name: name || routine.name, steps });
      else await createRoutineAction({ name: name || (time === "morning" ? "Morning routine" : "Evening routine"), timeOfDay: time, steps });
      onClose();
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title={routine ? "Edit routine" : "New routine"}
      footer={
        <div className="flex gap-2">
          {routine && (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm("Delete this routine and its history?")) start(async () => { await deleteRoutineAction(routine.id); onClose(); });
              }}
            >
              Delete
            </Button>
          )}
          <Button onClick={save} disabled={pending || steps.length === 0} full variant="gold">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={time === "morning" ? "Morning routine" : "Evening routine"} className={inputClass} maxLength={60} />
        </Field>
        {!routine && (
          <Segmented
            value={time}
            onChange={setTime}
            options={[
              { value: "morning", label: "Morning" },
              { value: "evening", label: "Evening" },
            ]}
          />
        )}
        <StepEditor label="Steps (tap to toggle)" steps={steps} onChange={setSteps} suggestions={time === "morning" ? ["Cleanser", "Vitamin C", "Moisturizer", "SPF", "Eye cream"] : ["Cleanser", "Treatment", "Retinoid", "Moisturizer", "Floss", "Lip balm"]} />
        <p className="text-[11px] text-faint">Editing steps keeps your completion history. Order follows the order you toggle them on.</p>
      </div>
    </Sheet>
  );
}
