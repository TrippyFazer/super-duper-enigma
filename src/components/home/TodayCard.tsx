"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, UtensilsCrossed, Footprints, Moon, Scroll, ListChecks, ChevronRight, ChevronDown, Check, Minus } from "lucide-react";
import { offerStepQuestAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cx } from "@/components/ui/primitives";
import { ChecklistRows } from "./TodayChecklist";
import type { TodaySummary } from "@/services/today";
import type { RowTone } from "@/services/todayState";

/**
 * ONE consolidated TODAY card. Each row is a summary; tapping goes to the
 * place that owns the detail. Quiet when things are fine ("Protein target hit ✓").
 */
export function TodayCard({ s }: { s: TodaySummary }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const checklistDone = s.checklist.filter((i) => i.done).length;

  const w = s.workout;
  const workoutHref = w?.activeSessionId ? "/planner/workout/session" : "/planner/workout";
  const n = s.nutrition;
  const st = s.steps;
  const sl = s.sleep;

  return (
    <section className="plate overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="eyebrow">Today</span>
        <span className="tabular text-[11px] text-muted">
          {s.quests.dailyDone}/{s.quests.dailyTotal} quests
        </span>
      </div>
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {w && <Row icon={Dumbbell} label="Workout" text={w.state.text} sub={w.state.sub} href={workoutHref} tone={w.state.tone} />}
        {n && <Row icon={UtensilsCrossed} label="Food" text={n.state.text} sub={n.state.sub} href="/planner/meals" tone={n.state.tone} />}
        {st && (
          <Row
            icon={Footprints}
            label="Steps"
            text={st.state.text}
            sub={st.state.sub}
            href="/domains/fitness"
            tone={st.state.tone}
            right={
              s.walkOffer && !s.hasWalkQuest && !offered && st.state.freshness.state === "available" ? (
                <button
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const r = await offerStepQuestAction();
                      setOffered(true);
                      notify(r);
                      router.refresh();
                    });
                  }}
                  className="press flex h-11 items-center rounded-full border border-gold/50 bg-gold/10 px-3 text-xs font-semibold text-gold"
                >
                  Walk it · +{s.walkOffer.xp}
                </button>
              ) : undefined
            }
          />
        )}
        {sl && <Row icon={Moon} label="Sleep" text={sl.state.text} sub={sl.state.sub} href="/domains/sleep" tone={sl.state.tone} />}
        <Row icon={Scroll} label="Quests" text={s.quests.dailyTotal ? `${s.quests.dailyDone}/${s.quests.dailyTotal} daily` : "None yet"} sub={s.quests.weeklyInProgress ? `${s.quests.weeklyInProgress} weekly in progress` : s.quests.dailyTotal && s.quests.dailyDone === s.quests.dailyTotal ? "Today's adventure complete ✓" : "Open the journal"} href="/quests" tone={s.quests.dailyTotal > 0 && s.quests.dailyDone === s.quests.dailyTotal ? "success" : "neutral"} />
        {s.checklist.length > 0 && (
          <li>
            <button onClick={() => setHabitsOpen((v) => !v)} aria-expanded={habitsOpen} className="press flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
              <Icon icon={ListChecks} tone={checklistDone === s.checklist.length ? "success" : "neutral"} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">Routines & habits</span>
                <span className="block truncate text-[12px] text-muted">{checklistDone === s.checklist.length ? "All done ✓" : `${checklistDone}/${s.checklist.length} · tap to tick off`}</span>
              </span>
              <ChevronDown size={16} className={cx("text-faint transition-transform", habitsOpen && "rotate-180")} />
            </button>
            {habitsOpen && (
              <div className="border-t border-border/60 bg-black/15">
                <ChecklistRows items={s.checklist} today={s.today} />
              </div>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}

const TONE_RING: Record<RowTone, string> = {
  success: "border-success/50 bg-success/10 text-success",
  resolved: "border-border bg-black/25 text-muted",
  pending: "border-border bg-black/25 text-muted animate-pulse-soft",
  attention: "border-gold/50 bg-gold/10 text-gold",
  neutral: "border-border bg-black/25 text-text-2",
};
const TONE_SUB: Record<RowTone, string> = { success: "text-success/90", resolved: "text-muted", pending: "text-muted", attention: "text-gold", neutral: "text-muted" };

function Icon({ icon: I, tone }: { icon: typeof Dumbbell; tone: RowTone }) {
  return <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", TONE_RING[tone])}>{tone === "success" ? <Check size={16} strokeWidth={3} /> : tone === "resolved" ? <Minus size={16} strokeWidth={3} /> : <I size={16} />}</span>;
}

/** A row is a summary; tapping goes to the owner screen. Tone encodes success / resolved / pending / attention. */
function Row({ icon, label, text, sub, href, tone, right }: { icon: typeof Dumbbell; label: string; text: string; sub?: string; href: string; tone: RowTone; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="press flex min-h-12 items-center gap-3 px-4 py-2" data-tone={tone}>
        <Icon icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">
            <span className="text-muted">{label} · </span>
            {text}
          </span>
          {sub && <span className={cx("block truncate text-[12px]", TONE_SUB[tone])}>{sub}</span>}
        </span>
        {right ?? <ChevronRight size={16} className="shrink-0 text-faint" />}
      </Link>
    </li>
  );
}
