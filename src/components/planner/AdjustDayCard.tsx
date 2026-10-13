"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, X } from "lucide-react";
import { applyDayAdjustmentAction, proposeDayAdjustmentAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button } from "@/components/ui/primitives";

type Proposal = NonNullable<Awaited<ReturnType<typeof proposeDayAdjustmentAction>>>;

/**
 * "You ate X instead of the plan — adjust the rest of the day?" Nothing changes
 * until the user taps Adjust; the proposal is shown in full first.
 */
export function AdjustDayCard({ unplanned, onDismiss }: { unplanned: string; onDismiss: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [proposal, setProposal] = useState<Proposal | null | undefined>(undefined);
  const [pending, start] = useTransition();
  useEffect(() => {
    let dead = false;
    proposeDayAdjustmentAction(unplanned)
      .then((p) => !dead && setProposal(p))
      .catch(() => !dead && setProposal(null));
    return () => {
      dead = true;
    };
  }, [unplanned]);

  if (proposal === null) return null;
  return (
    <section className="plate space-y-3 border-gold/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <Scale size={18} className="mt-0.5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Adjust the rest of today?</div>
          <p className="serif text-[13px] text-muted">
            {proposal === undefined ? "Working out what still fits…" : `${unplanned} changed the day. ${proposal.remainingCalories > 0 ? `${proposal.remainingCalories} kcal and ${Math.max(0, proposal.remainingProtein)} g protein left.` : "You're past today's calorie target — that's fine; here is the lightest way to finish."}`}
          </p>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-white/5">
          <X size={16} />
        </button>
      </div>
      {proposal && (
        <>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {proposal.meals.map((m) => (
              <li key={m.replacesId} className="px-3 py-2 text-sm">
                <div className="text-[10px] uppercase tracking-wider text-faint">{m.mealType} · replaces planned</div>
                <div className="font-medium">{m.name}</div>
                <div className="serif text-[12.5px] text-muted">
                  {m.calories} kcal · {m.protein} g protein{m.notes ? ` · ${m.notes}` : ""}
                </div>
              </li>
            ))}
          </ul>
          <p className="serif text-[12.5px] text-muted">{proposal.rationale}{proposal.source === "ai" ? " (AI)" : ""}</p>
          <div className="flex gap-2">
            <Button variant="gold" size="sm" disabled={pending} onClick={() => start(async () => { await applyDayAdjustmentAction(proposal.meals); toast("Plan adjusted", "quest"); onDismiss(); router.refresh(); })}>
              Adjust
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Keep the plan
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
