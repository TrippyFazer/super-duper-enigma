"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteWorkoutAction, deleteMealAction, deleteFinancialSnapshotAction, deleteHabitAction, deleteRoutineAction, deleteSobrietyTrackerAction } from "@/actions";

const ACTIONS = {
  workout: deleteWorkoutAction,
  meal: deleteMealAction,
  snapshot: deleteFinancialSnapshotAction,
  habit: deleteHabitAction,
  routine: deleteRoutineAction,
  tracker: deleteSobrietyTrackerAction,
} as const;

export function DeleteButton({ kind, id, confirm = "Delete this entry?" }: { kind: keyof typeof ACTIONS; id: number; confirm?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(async () => {
          await ACTIONS[kind](id);
        });
      }}
      className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-danger/15 hover:text-danger disabled:opacity-40"
    >
      <Trash2 size={14} />
    </button>
  );
}
