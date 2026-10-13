"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Undo2 } from "lucide-react";
import { completePrepAction, skipPrepAction, uncompletePrepAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, cx } from "@/components/ui/primitives";
import { StepTitle } from "./parts";
import type { WeekVM } from "./types";

/** Step 6: batch what repeats. Completing prep counts as cooking and pays the weekly prep quest. */
export function PrepStep({ week: w, onNext }: { week: WeekVM | null; onNext: () => void }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const prep = w?.prep ?? null;
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 6" title="Sunday prep" body="Batch the parts that repeat." />
      {!prep ? (
        <div className="plate serif px-4 py-4 text-[14px] text-muted">No prep plan this week{w && w.status !== "planning" ? " — the recipes don't share enough to batch." : ". Plan the week first."}</div>
      ) : (
        <div className="plate overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div>
              <div className="display text-[15px] font-semibold">Prepare</div>
              <div className="text-[11px] text-muted">~{prep.estimatedMinutes} min</div>
            </div>
            <span className={cx("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider", prep.status === "completed" ? "bg-success/15 text-success" : "bg-white/5 text-muted")}>{prep.status === "completed" ? "done" : prep.status}</span>
          </div>
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {prep.items.map((it) => (
              <li key={it.name} className="flex min-h-11 items-center gap-3 px-4 py-1.5 text-sm">
                <span className="flex-1">{it.name}</span>
                <span className="tabular text-xs text-text-2">
                  {it.servings} servings · {it.minutes} min
                </span>
              </li>
            ))}
          </ul>
          {prep.supports.length > 0 && <p className="serif px-4 py-2 text-[12.5px] text-muted">Supports: {prep.supports.join(", ")}.</p>}
          <div className="flex gap-2 border-t border-border/60 px-4 py-3">
            {prep.status === "completed" ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await uncompletePrepAction(prep.id); toast("Prep un-completed · XP reversed", "quest"); router.refresh(); })}>
                <Undo2 size={13} /> Undo
              </Button>
            ) : (
              <>
                <Button variant="gold" disabled={pending} onClick={() => start(async () => { const r = await completePrepAction(prep.id); notify(r); router.refresh(); })}>
                  <Check size={13} /> Prep done · +60 XP
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await skipPrepAction(prep.id); router.refresh(); })}>
                  Skip this week
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <Button full variant="gold" onClick={onNext}>
        Training days <ChevronRight size={14} />
      </Button>
    </section>
  );
}
