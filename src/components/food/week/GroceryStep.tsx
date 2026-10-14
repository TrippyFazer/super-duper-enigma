"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { ShoppingList } from "@/components/food/ShoppingList";
import { StepTitle } from "./parts";
import type { WeekVM } from "./types";

/** Step 5: the categorised list. Shopping mode (actual purchases) lives inside ShoppingList. */
export function GroceryStep({ week: w, onSetup, onNext }: { week: WeekVM | null; onSetup: () => void; onNext: () => void }) {
  if (!w || w.status === "planning") {
    return (
      <section className="space-y-3">
        <StepTitle eyebrow="Step 5" title="Shopping list" body="Plan the week first." />
        <Button full size="lg" variant="gold" onClick={onSetup}>
          Set up the week
        </Button>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 5" title="Shopping list" body="Prices are estimates. What you actually buy becomes your pantry and your real spend." />
      <ShoppingList weekId={w.id} status={w.status} items={w.items} budget={w.budget} reconciled={w.summary.reconciled ?? null} />
      {w.summary.ignorePantry && <p className="serif px-1 text-[12px] text-faint">Planned without using your pantry (you asked for a fresh start).</p>}
      {w.summary.staplesAssumed && w.summary.staplesAssumed.length > 0 && <p className="serif px-1 text-[12px] text-faint">Assumed on hand: {w.summary.staplesAssumed.join(", ")}.</p>}
      <Button full variant="gold" onClick={onNext}>
        Meal prep <ChevronRight size={14} />
      </Button>
    </section>
  );
}
