"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Flag } from "lucide-react";
import { saveTrainingDaysAction } from "@/actions/food";
import { Button, cx } from "@/components/ui/primitives";
import { StepTitle } from "./parts";
import type { WeekPlannerProps, WeekVM } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Step 7: which days are realistic. Drives the workout reminder and plan sizing. */
export function TrainingStep({ initial, onSaved }: { initial: number[]; onSaved: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState<number[]>(initial);
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 7" title="Training days" body="Pick what's realistic." />
      <div className="flex gap-1.5" role="group" aria-label="Training days">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} onClick={() => setDays((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]))} aria-pressed={days.includes(d)} className={cx("press h-11 flex-1 rounded-lg border text-sm", days.includes(d) ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
            {DAYS[d]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{days.length ? `${days.length} training day${days.length === 1 ? "" : "s"}.` : "No fixed days — train when it fits."}</p>
      <Button full size="lg" variant="gold" disabled={pending} onClick={() => start(async () => { await saveTrainingDaysAction(days); router.refresh(); onSaved(); })}>
        Save
      </Button>
    </section>
  );
}

/** Step 8: this week's quests, read-only. */
export function QuestsStep({ quests, onNext }: { quests: WeekPlannerProps["weeklyQuests"]; onNext: () => void }) {
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 8" title="This week's quests" body="Planning and shopping pay XP. Spending less does not." />
      <div className="plate divide-y divide-border/60 p-0">
        {quests.length === 0 && <p className="serif px-4 py-4 text-center text-[13.5px] text-muted">Weekly quests appear once the week starts.</p>}
        {quests.map((q) => (
          <div key={q.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5 text-sm">
            <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", q.done ? "border-success bg-success text-[#071a10]" : "border-border-strong")}>{q.done && <Check size={13} strokeWidth={3} />}</span>
            <span className="min-w-0 flex-1 truncate">{q.title}</span>
            <span className="tabular text-xs text-gold">+{q.rewardXp}</span>
          </div>
        ))}
      </div>
      <Button full variant="gold" onClick={onNext}>
        Finish <ChevronRight size={14} />
      </Button>
    </section>
  );
}

/** Step 9: done. */
export function ReadyStep({ week: w }: { week: WeekVM | null }) {
  return (
    <section className="space-y-3">
      <div className="plate px-5 py-6 text-center">
        <Flag size={28} className="mx-auto text-gold" />
        <div className="display mt-3 text-xl font-semibold">Next week ready</div>
        <p className="serif mt-1 text-[14.5px] text-muted">
          {w && w.status !== "planning" ? `${w.summary.distinctRecipes ?? "A few"} recipes, ${w.items.filter((i) => !i.coveredByPantry).length} items${w.estimatedCost != null ? ` around $${w.estimatedCost.toFixed(0)}` : ""}${w.prep ? `, ${w.prep.estimatedMinutes} min of prep` : ""}.` : "Nothing generated — the week can start without a plan."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/" className="plate press flex h-12 items-center justify-center text-sm">
          Home
        </Link>
        <Link href="/planner/meals" className="plate press flex h-12 items-center justify-center text-sm">
          Today&apos;s food
        </Link>
      </div>
    </section>
  );
}
