"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, UtensilsCrossed, Footprints, Moon, Scroll, ListChecks, ChevronRight, ChevronDown, Check } from "lucide-react";
import { offerStepQuestAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cx } from "@/components/ui/primitives";
import { ChecklistRows } from "./TodayChecklist";
import type { TodaySummary } from "@/services/today";

const fmtH = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

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
  const workoutLine = !w
    ? null
    : w.activeSessionId
      ? { text: "Session in progress", sub: "Tap to resume", href: "/planner/workout/session", done: false }
      : w.loggedToday.length > 0
        ? { text: `${w.loggedToday.map((x) => `${x.type} ${x.durationMin} min`).join(" · ")}`, sub: "Done ✓", href: "/planner/workout", done: true }
        : w.status === "completed"
          ? { text: w.name, sub: "Done ✓", href: "/planner/workout", done: true }
          : w.name
            ? { text: w.name, sub: `${w.exercises} exercises · ~${w.minutes} min · tap to start`, href: "/planner/workout", done: false }
            : { text: "No workout planned", sub: "Build one or log what you did", href: "/planner/workout", done: false };

  const n = s.nutrition;
  const nutritionLine = !n
    ? null
    : n.calories === 0
      ? { text: "Nothing logged yet", sub: `${n.calorieTarget} kcal · ${n.proteinTarget} g protein target`, done: false }
      : n.proteinHit
        ? { text: `${n.calories} kcal · ${n.protein} g protein`, sub: "Protein target hit ✓", done: true }
        : { text: `${n.calories} kcal · ${n.protein} g protein`, sub: `${Math.max(0, n.proteinTarget - n.protein)} g protein to go`, done: false };

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
        {workoutLine && <Row icon={Dumbbell} label="Workout" text={workoutLine.text} sub={workoutLine.sub} href={workoutLine.href} done={workoutLine.done} />}
        {nutritionLine && <Row icon={UtensilsCrossed} label="Nutrition" text={nutritionLine.text} sub={nutritionLine.sub} href="/planner/meals" done={nutritionLine.done} />}
        {st && (
          <Row
            icon={Footprints}
            label="Steps"
            text={st.value != null ? `${st.value.toLocaleString()} / ${st.target.toLocaleString()}` : "—"}
            sub={st.value == null ? (st.automatic ? "Waiting for today's samples" : "Not tracked · log in + LOG › More") : st.value >= st.target ? "Target hit ✓" : `${(st.target - st.value).toLocaleString()} to go`}
            href="/domains/fitness"
            done={st.value != null && st.value >= st.target}
            right={
              s.walkOffer && !s.hasWalkQuest && !offered ? (
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
        {sl && <Row icon={Moon} label="Sleep" text={sl.lastNightMin != null ? fmtH(sl.lastNightMin) : "—"} sub={sl.lastNightMin == null ? (sl.automatic ? "No night data yet" : "Log last night in + LOG") : sl.lastNightMin >= sl.targetMin ? "At target ✓" : `${fmtH(sl.targetMin - sl.lastNightMin)} short of target`} href="/domains/sleep" done={sl.lastNightMin != null && sl.lastNightMin >= sl.targetMin} />}
        <Row icon={Scroll} label="Quests" text={s.quests.dailyTotal ? `${s.quests.dailyDone}/${s.quests.dailyTotal} daily` : "None yet"} sub={s.quests.weeklyInProgress ? `${s.quests.weeklyInProgress} weekly in progress` : s.quests.dailyTotal && s.quests.dailyDone === s.quests.dailyTotal ? "Today's adventure complete ✓" : "Open the journal"} href="/quests" done={s.quests.dailyTotal > 0 && s.quests.dailyDone === s.quests.dailyTotal} />
        {s.checklist.length > 0 && (
          <li>
            <button onClick={() => setHabitsOpen((v) => !v)} aria-expanded={habitsOpen} className="press flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
              <Icon icon={ListChecks} done={checklistDone === s.checklist.length} />
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

function Icon({ icon: I, done }: { icon: typeof Dumbbell; done?: boolean }) {
  return (
    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", done ? "border-success/50 bg-success/10 text-success" : "border-border bg-black/25 text-text-2")}>
      {done ? <Check size={16} strokeWidth={3} /> : <I size={16} />}
    </span>
  );
}

function Row({ icon, label, text, sub, href, done, right }: { icon: typeof Dumbbell; label: string; text: string; sub?: string; href: string; done?: boolean; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="press flex min-h-12 items-center gap-3 px-4 py-2">
        <Icon icon={icon} done={done} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">
            <span className="text-muted">{label} · </span>
            {text}
          </span>
          {sub && <span className={cx("block truncate text-[12px]", done ? "text-success/90" : "text-muted")}>{sub}</span>}
        </span>
        {right ?? <ChevronRight size={16} className="shrink-0 text-faint" />}
      </Link>
    </li>
  );
}
