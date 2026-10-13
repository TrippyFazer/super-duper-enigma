"use client";

import { Fragment, useState, useTransition } from "react";
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
 * place that owns the detail.
 *
 * WHAT STILL MATTERS FIRST. Unfinished rows come first and lead with what is
 * left ("2,976 steps left", "42 g protein to go"). Finished rows fold into one
 * quiet "3 done ✓" line that opens in place — still one tap from each detail,
 * never hidden: a sleep shortfall or a missing log is never "done".
 */
export function TodayCard({ s }: { s: TodaySummary }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const checklistDone = s.checklist.filter((i) => i.done).length;

  const rows: { key: string; done: boolean; first?: boolean; node: (quiet: boolean) => React.ReactNode }[] = [];

  const w = s.workout;
  if (w) {
    const line = w.activeSessionId
      ? { text: "Session in progress", sub: "Tap to resume", href: "/planner/workout/session", done: false }
      : w.loggedToday.length > 0
        ? { text: w.loggedToday.map((x) => `${x.type} ${x.durationMin} min`).join(" · "), sub: "Done", href: "/planner/workout", done: true }
        : w.status === "completed"
          ? { text: w.name, sub: "Done", href: "/planner/workout", done: true }
          : w.name
            ? { text: w.name, sub: `${w.exercises} exercises · ~${w.minutes} min`, href: "/planner/workout", done: false }
            : { text: "No workout yet", sub: "Plan one or log what you did", href: "/planner/workout", done: false };
    rows.push({ key: "workout", done: line.done, first: !!w.activeSessionId, node: (q) => <Row icon={Dumbbell} label="Workout" text={line.text} sub={line.sub} href={line.href} done={line.done} quiet={q} /> });
  }

  const n = s.nutrition;
  if (n) {
    const toGo = Math.max(0, n.proteinTarget - n.protein);
    const line =
      n.calories === 0
        ? { text: "Nothing logged yet", sub: `${n.proteinTarget} g protein · ${n.calorieTarget} kcal today`, done: false }
        : n.proteinHit
          ? { text: `${n.protein} g protein · ${n.calories} kcal`, sub: "Protein hit", done: true }
          : { text: `${toGo} g protein to go`, sub: `${n.protein} g · ${n.calories} kcal so far`, done: false };
    rows.push({ key: "nutrition", done: line.done, node: (q) => <Row icon={UtensilsCrossed} label="Food" text={line.text} sub={line.sub} href="/planner/meals" done={line.done} quiet={q} /> });
  }

  const st = s.steps;
  if (st) {
    const hit = st.value != null && st.value >= st.target;
    const text = st.value == null ? "No steps yet" : hit ? `${st.value.toLocaleString()} steps` : `${(st.target - st.value).toLocaleString()} steps left`;
    const sub = st.value == null ? (st.automatic ? "Waiting for your ring" : "Log them in + › More") : hit ? "Target hit" : `${st.value.toLocaleString()} of ${st.target.toLocaleString()}`;
    const walk =
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
          className="press flex h-11 shrink-0 items-center rounded-full border border-gold/50 bg-gold/10 px-3 text-xs font-semibold text-gold"
        >
          Walk it · +{s.walkOffer.xp}
        </button>
      ) : undefined;
    rows.push({ key: "steps", done: hit, node: (q) => <Row icon={Footprints} label="Steps" text={text} sub={sub} href="/domains/fitness" done={hit} quiet={q} right={walk} /> });
  }

  const sl = s.sleep;
  if (sl) {
    const hit = sl.lastNightMin != null && sl.lastNightMin >= sl.targetMin;
    const text = sl.lastNightMin == null ? "No night yet" : `${fmtH(sl.lastNightMin)} last night`;
    const sub = sl.lastNightMin == null ? (sl.automatic ? "Oura hasn't sent it yet" : "Log it in +") : hit ? "On target" : `${fmtH(sl.targetMin - sl.lastNightMin)} short`;
    rows.push({ key: "sleep", done: hit, node: (q) => <Row icon={Moon} label="Sleep" text={text} sub={sub} href="/domains/sleep" done={hit} quiet={q} /> });
  }

  const qDone = s.quests.dailyTotal > 0 && s.quests.dailyDone === s.quests.dailyTotal;
  rows.push({
    key: "quests",
    done: qDone,
    node: (q) => (
      <Row
        icon={Scroll}
        label="Quests"
        text={s.quests.dailyTotal ? (qDone ? "All daily quests done" : `${s.quests.dailyTotal - s.quests.dailyDone} daily quests left`) : "No daily quests"}
        sub={s.quests.weeklyInProgress ? `${s.quests.weeklyInProgress} weekly in progress` : s.quests.dailyTotal ? `${s.quests.dailyDone} of ${s.quests.dailyTotal}` : "Add a habit to get some"}
        href={s.quests.dailyTotal ? "/quests" : "/domains/habits"}
        done={qDone}
        quiet={q}
      />
    ),
  });

  if (s.checklist.length > 0) {
    const all = checklistDone === s.checklist.length;
    rows.push({
      key: "checklist",
      done: all,
      node: (q) => (
        <li className={cx(q && "opacity-75")}>
          <button onClick={() => setHabitsOpen((v) => !v)} aria-expanded={habitsOpen} className="press flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
            <Icon icon={ListChecks} done={all} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{all ? "Routines & habits done" : `${s.checklist.length - checklistDone} routines & habits left`}</span>
              <span className={cx("block truncate text-[12px]", all ? "text-success/90" : "text-muted")}>{all ? `${s.checklist.length} of ${s.checklist.length}` : "Tap to check off"}</span>
            </span>
            <ChevronDown size={16} className={cx("text-faint transition-transform", habitsOpen && "rotate-180")} />
          </button>
          {habitsOpen && (
            <div className="border-t border-border/60 bg-black/15">
              <ChecklistRows items={s.checklist} today={s.today} />
            </div>
          )}
        </li>
      ),
    });
  }

  const todo = [...rows.filter((r) => !r.done && r.first), ...rows.filter((r) => !r.done && !r.first)];
  const done = rows.filter((r) => r.done);

  return (
    <section className="plate overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="eyebrow">Today</span>
        <span className="tabular text-[11px] text-muted">
          {done.length}/{rows.length} done
        </span>
      </div>
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {todo.map((r) => (
          <Fragment key={r.key}>{r.node(false)}</Fragment>
        ))}
        {todo.length === 0 && (
          <li className="flex min-h-12 items-center gap-3 px-4 py-2">
            <Icon icon={Check} done />
            <span className="text-[14px]">Everything for today is done</span>
          </li>
        )}
        {done.length > 0 && (
          <li>
            <button onClick={() => setDoneOpen((v) => !v)} aria-expanded={doneOpen} className="press flex min-h-11 w-full items-center gap-3 px-4 py-1.5 text-left text-[13px] text-success/90">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                <Check size={15} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {done.length} done
                <span className="text-muted"> · {done.map((r) => LABEL[r.key]).join(", ")}</span>
              </span>
              <ChevronDown size={16} className={cx("text-faint transition-transform", doneOpen && "rotate-180")} />
            </button>
            {doneOpen && (
              <ul className="divide-y divide-border/60 border-t border-border/60 bg-black/10">
                {done.map((r) => (
                  <Fragment key={r.key}>{r.node(true)}</Fragment>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}

const LABEL: Record<string, string> = { workout: "workout", nutrition: "food", steps: "steps", sleep: "sleep", quests: "quests", checklist: "habits" };

function Icon({ icon: I, done }: { icon: typeof Dumbbell; done?: boolean }) {
  return (
    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", done ? "border-success/50 bg-success/10 text-success" : "border-border bg-black/25 text-text-2")}>
      {done ? <Check size={16} strokeWidth={3} /> : <I size={16} />}
    </span>
  );
}

function Row({ icon, label, text, sub, href, done, right, quiet }: { icon: typeof Dumbbell; label: string; text: string; sub?: string; href: string; done?: boolean; right?: React.ReactNode; quiet?: boolean }) {
  return (
    <li className={cx(quiet && "opacity-75")}>
      <Link href={href} className="press flex min-h-12 items-center gap-3 px-4 py-2">
        <Icon icon={icon} done={done} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">
            <span className="sr-only">{label}: </span>
            {text}
          </span>
          {sub && <span className={cx("block truncate text-[12px]", done ? "text-success/90" : "text-muted")}>{sub}</span>}
        </span>
        {right ?? <ChevronRight size={16} className="shrink-0 text-faint" />}
      </Link>
    </li>
  );
}
