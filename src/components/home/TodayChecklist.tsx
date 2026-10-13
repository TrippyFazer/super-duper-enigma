"use client";

import { useOptimistic, useTransition } from "react";
import { Check, Sun, Moon, Sparkles } from "lucide-react";
import { completeHabitAction, completeRoutineAction, uncompleteHabitAction, uncompleteRoutineAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cx } from "@/components/ui/primitives";

export interface ChecklistItem {
  id: string; // "routine:1" | "habit:3"
  kind: "routine" | "habit";
  refId: number;
  label: string;
  sub?: string;
  done: boolean;
  timeOfDay?: "morning" | "evening";
  icon?: string | null;
}

/** One-tap completion for routines and habits due today. Optimistic. */
export function TodayChecklist({ items, today }: { items: ChecklistItem[]; today: string }) {
  const { notify } = useFeedback();
  const [, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (state, update: { id: string; done: boolean }) => state.map((i) => (i.id === update.id ? { ...i, done: update.done } : i)));

  if (items.length === 0) return null;
  const done = optimistic.filter((i) => i.done).length;

  const toggle = (item: ChecklistItem) => {
    const next = !item.done;
    start(async () => {
      setOptimistic({ id: item.id, done: next });
      if (item.kind === "habit") {
        if (next) notify(await completeHabitAction(item.refId, today));
        else await uncompleteHabitAction(item.refId, today);
      } else {
        if (next) notify(await completeRoutineAction({ routineId: item.refId, date: today }));
        else await uncompleteRoutineAction(item.refId, today);
      }
    });
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="text-sm font-semibold">Today</div>
        <div className="tabular text-xs text-muted">
          {done}/{optimistic.length} done
        </div>
      </div>
      <ul className="divide-y divide-border/70">
        {optimistic.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => toggle(item)}
              aria-pressed={item.done}
              className={cx("press flex w-full items-center gap-3 px-4 py-3 text-left", item.done && "opacity-70")}
            >
              <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors", item.done ? "border-success bg-success text-[#071a10]" : "border-border-strong bg-black/30 text-transparent")}>
                <Check size={15} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-[15px]", item.done && "line-through decoration-faint")}>{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-muted">{item.sub}</span>}
              </span>
              <span className="text-faint">
                {item.kind === "routine" ? item.timeOfDay === "morning" ? <Sun size={16} /> : <Moon size={16} /> : item.icon ? <span className="text-base">{item.icon}</span> : <Sparkles size={16} />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
