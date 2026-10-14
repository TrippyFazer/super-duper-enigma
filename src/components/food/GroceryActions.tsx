"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBasket, ChevronRight, RefreshCw, Check, Package } from "lucide-react";
import { replanRemainderAction, startSupplyRunAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, cx, inputClass } from "@/components/ui/primitives";

export interface GroceryState {
  /** none | planned | shopped */
  state: "none" | "planned" | "shopped";
  weekId: number | null;
  weekStart: string | null;
  endDate: string | null;
  itemCount: number;
  purchased: number;
  estimated: number;
  actual: number | null;
  budget: number;
  daysLeft: number;
  replannedFrom: string | null;
}

/**
 * Groceries are always actionable. The tile reflects the real state of the list
 * and "I'm shopping today" works on any day — the preferred day is only where
 * the app proactively suggests it.
 */
export function GroceryActions({ g, defaultBudget }: { g: GroceryState; defaultBudget: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [days, setDays] = useState(5);
  const [custom, setCustom] = useState("");
  const [budget, setBudget] = useState(String(Math.round(defaultBudget * (5 / 7))));
  const [usePantry, setUsePantry] = useState(true);
  const nDays = custom ? Number(custom) : days;

  const go = () =>
    start(async () => {
      const r = await startSupplyRunAction({ days: Math.max(2, Math.min(14, nDays || 5)), budget: Number(budget) || 0, usePantry });
      if (!r.ok) return toast(r.error ?? "Could not plan", "error");
      toast(`Supply run ready · ~$${(r.estimatedCost ?? 0).toFixed(0)}`, "quest", r.source === "ai" ? "Planned by AI" : "Planned from your recipes");
      setOpen(false);
      router.push(`/planner/week?week=${r.weekStart}&step=shop`);
    });
  const replan = () =>
    start(async () => {
      if (!g.weekId) return;
      const r = await replanRemainderAction(g.weekId);
      if (!r.ok) return toast(r.error ?? "Could not replan", "error");
      toast(`Replanned ${r.daysReplanned} day${r.daysReplanned === 1 ? "" : "s"} · $${(r.budgetLeft ?? 0).toFixed(0)} left`, "quest");
      router.push(`/planner/week?week=${g.weekStart}&step=meals`);
    });

  const sub = g.state === "none" ? "No active list" : g.state === "planned" ? `${g.itemCount} items · ~$${g.estimated.toFixed(0)} est.${g.purchased ? ` · ${g.purchased} bought` : ""}` : `Shopped · $${(g.actual ?? 0).toFixed(0)} spent · pantry updated`;
  const cta = g.state === "none" ? "Build shopping list" : g.state === "planned" ? (g.purchased ? "Continue shopping" : "Start shopping") : "Pantry";
  const href = g.state === "none" ? null : g.state === "planned" ? `/planner/week?week=${g.weekStart}&step=shop` : "/planner/pantry";

  return (
    <>
      <div className="plate overflow-hidden">
        <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <span className="plate-tile flex h-10 w-10 shrink-0 items-center justify-center">{g.state === "shopped" ? <Check size={18} className="text-success" /> : <ShoppingBasket size={18} className="text-gold" />}</span>
          <span className="min-w-0 flex-1">
            <span className="display block text-[15px] font-semibold">Groceries</span>
            <span className="serif block truncate text-[13px] text-muted">{sub}</span>
          </span>
          {href ? (
            <Link href={href} className="press flex h-10 items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-3 text-xs font-semibold text-gold">
              {g.state === "shopped" ? <Package size={13} /> : null} {cta} <ChevronRight size={14} />
            </Link>
          ) : (
            <button onClick={() => setOpen(true)} className="press flex h-10 items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-3 text-xs font-semibold text-gold">
              {cta} <ChevronRight size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-2">
          {g.state !== "none" && (
            <button onClick={() => setOpen(true)} className="press flex h-9 items-center gap-1 rounded-full border border-border px-3 text-xs text-text-2">
              <ShoppingBasket size={12} /> I&apos;m shopping today
            </button>
          )}
          {g.weekId && g.daysLeft > 0 && (
            <button onClick={replan} disabled={pending} className="press flex h-9 items-center gap-1 rounded-full border border-border px-3 text-xs text-text-2 disabled:opacity-50">
              <RefreshCw size={12} /> {pending ? "Replanning…" : `Replan the next ${g.daysLeft} day${g.daysLeft === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Shopping today">
        <div className="space-y-4 pb-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-text-2">How long should these groceries cover?</div>
            <div className="flex gap-2">
              {[3, 5, 7].map((d) => (
                <button key={d} onClick={() => { setDays(d); setCustom(""); setBudget(String(Math.round(defaultBudget * (d / 7)))); }} aria-pressed={!custom && days === d} className={cx("press h-11 flex-1 rounded-lg border text-sm", !custom && days === d ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                  {d} days
                </button>
              ))}
              <input type="number" inputMode="numeric" min={2} max={14} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom" className={cx(inputClass, "tabular w-20 text-center")} aria-label="Custom days" />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-text-2">Budget $</div>
            <input type="number" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} className={cx(inputClass, "tabular")} aria-label="Budget" />
          </div>
          <button onClick={() => setUsePantry((v) => !v)} aria-pressed={usePantry} className={cx("press flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm", usePantry ? "border-success/50 bg-success/10 text-success" : "border-border bg-card-2 text-text-2")}>
            <Package size={15} /> Use what&apos;s in the pantry
            <span className="ml-auto text-[11px] text-muted">{usePantry ? "leftovers reduce the list" : "plan from scratch"}</span>
          </button>
          <Button full size="lg" variant="gold" disabled={pending || !(nDays >= 2)} onClick={go}>
            {pending ? "Planning…" : `Plan ${nDays || 5} days · build the list`}
          </Button>
          <p className="serif text-[12.5px] text-muted">Meal ideas, the list, an estimated total and ingredient reuse — then the rest of the week adjusts around it. Supply run quest: +50 XP when you finish shopping.</p>
        </div>
      </Sheet>
    </>
  );
}
