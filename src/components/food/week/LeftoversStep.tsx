"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { leftoverReviewAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, cx } from "@/components/ui/primitives";
import { WeekFeedbackCard } from "@/components/food/WeekFeedbackCard";
import { StepTitle } from "./parts";
import type { WeekPlannerProps } from "./types";

/** Step 1: look back. */
export function ReviewStep({ lastWeek }: { lastWeek: WeekPlannerProps["lastWeek"] }) {
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 1" title="How did last week go?" body="Information for next week's plan, not a judgement." />
      {lastWeek ? <WeekFeedbackCard fb={lastWeek} title="Last week" /> : <div className="plate serif px-4 py-4 text-[14px] text-muted">No food week recorded yet.</div>}
      <Link href="/progress/review" className="plate press flex min-h-12 items-center gap-3 px-4 py-2.5">
        <CalendarCheck size={16} className="text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Weekly review</div>
          <div className="serif text-[13px] text-muted">Every domain, what moved and what slipped.</div>
        </div>
        <ChevronRight size={16} className="text-faint" />
      </Link>
    </section>
  );
}

/** Step 2: what is still in the kitchen. Anything on hand is skipped or reduced on the list. */
export function LeftoversStep({ pantry, onDone }: { pantry: WeekPlannerProps["pantry"]; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [levels, setLevels] = useState<Record<number, "none" | "some" | "lot">>(() => Object.fromEntries(pantry.map((x) => [x.id, (x.level as "none" | "some" | "lot") ?? "some"])));
  return (
    <section className="space-y-3">
      <StepTitle eyebrow="Step 2" title="What do you still have?" body="Tap a level per item." />
      {pantry.length === 0 ? (
        <div className="plate serif px-4 py-4 text-[14px] text-muted">
          Pantry is empty. Add items on the{" "}
          <Link href="/planner/pantry" className="text-gold underline">
            Pantry
          </Link>{" "}
          screen or skip — the first shopping trip fills it.
        </div>
      ) : (
        <div className="plate divide-y divide-border/60 p-0">
          {pantry.map((it) => (
            <div key={it.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1 text-sm capitalize">
                {it.name}
                {it.qty != null && (
                  <span className="text-muted">
                    {" "}
                    · {it.qty} {it.unit}
                  </span>
                )}
              </div>
              <div className="flex rounded-lg border border-border bg-black/30 p-0.5" role="group" aria-label={`${it.name} level`}>
                {(["none", "some", "lot"] as const).map((l) => (
                  <button key={l} onClick={() => setLevels({ ...levels, [it.id]: l })} aria-pressed={levels[it.id] === l} className={cx("press h-9 rounded-md px-2.5 text-[11px]", levels[it.id] === l ? "bg-card-2 text-text" : "text-muted")}>
                    {l === "lot" ? "A lot" : l[0].toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Button
        full
        size="lg"
        variant="gold"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await leftoverReviewAction(null, Object.entries(levels).map(([id, level]) => ({ pantryId: Number(id), level })));
            toast(`${r.carried} item${r.carried === 1 ? "" : "s"} carried into this week`, "quest");
            router.refresh();
            onDone();
          })
        }
      >
        Save &amp; continue
      </Button>
    </section>
  );
}
