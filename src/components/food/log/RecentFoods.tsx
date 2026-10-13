"use client";

import { X } from "lucide-react";
import { deleteSavedFoodAction } from "@/actions/planner";
import { macroLine, type RecentFood } from "./types";

/** One tap selects; the draft's button is the second tap. */
export function RecentFoods({ recents, onPick, onForget, pending, emptyHint }: { recents: RecentFood[]; onPick: (r: RecentFood) => void; onForget: (id: number) => void; pending: boolean; emptyHint?: string }) {
  if (recents.length === 0) return <p className="serif px-1 py-4 text-center text-[13.5px] text-muted">{emptyHint ?? "Foods you log show up here for one-tap repeats."}</p>;
  return (
    <ul className="divide-y divide-border/60">
      {recents.map((r) => (
        <li key={r.id} className="flex items-center">
          <button disabled={pending} onClick={() => onPick(r)} className="press flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left text-sm">
            <span className="min-w-0 truncate">
              {r.name}
              {r.brand && <span className="text-muted"> · {r.brand}</span>}
            </span>
            <span className="tabular shrink-0 text-xs text-muted">{macroLine(r)}</span>
          </button>
          <button
            aria-label={`Forget ${r.name}`}
            onClick={() => {
              onForget(r.id);
              deleteSavedFoodAction(r.id).catch(() => {});
            }}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint hover:text-danger"
          >
            <X size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
