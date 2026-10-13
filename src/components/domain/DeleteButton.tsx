"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteWorkoutAction, deleteMealAction, deleteFinancialSnapshotAction, deleteHabitAction, deleteRoutineAction, deleteSobrietyTrackerAction, deleteSleepAction } from "@/actions";

const ACTIONS = {
  workout: deleteWorkoutAction,
  sleep: (id: number | string) => deleteSleepAction(String(id)),
  meal: deleteMealAction,
  snapshot: deleteFinancialSnapshotAction,
  habit: deleteHabitAction,
  routine: deleteRoutineAction,
  tracker: deleteSobrietyTrackerAction,
} as const;

export function DeleteButton({ kind, id, confirm = "Delete this entry? Any XP it earned is reversed." }: { kind: keyof typeof ACTIONS; id: number | string; confirm?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(async () => {
          await (ACTIONS[kind] as (id: number | string) => Promise<unknown>)(id);
        });
      }}
      className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-danger/15 hover:text-danger disabled:opacity-40"
    >
      <Trash2 size={14} />
    </button>
  );
}
