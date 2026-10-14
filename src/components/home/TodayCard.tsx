"use client";

import { Fragment, useState, useTransition } from "react";
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
 * place that owns the detail.
 *
 * WHAT STILL MATTERS FIRST. Open rows come first; settled rows fold into one
 * quiet line that opens in place. Settled ≠ successful: a short night is
 * RESOLVED (nothing to do about it now) and shows as such — never as "done".
 * Tones come from services/todayState.ts: success · resolved · pending ·
 * attention · neutral.
 */
export function TodayCard({ s }: { s: TodaySummary }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const checklistDone = s.checklist.filter((i) => i.done).length;

  const rows: { key: string; tone: RowTone; first?: boolean; node: (quiet: boolean) => React.ReactNode }[] = [];

  const w = s.workout;
  if (w) {
    const href = w.activeSessionId ? "/planner/workout/session" : "/planner/workout";
    rows.push({ key: "workout", tone: w.state.tone, first: !!w.activeSessionId, node: (q) => <Row icon={Dumbbell} label="Workout" text={w.state.text} sub={w.state.sub} href={href} tone={w.state.tone} quiet={q} /> });
  }
  const n = s.nutrition;
  if (n) rows.push({ key: "nutrition", tone: n.state.tone, node: (q) => <Row icon={UtensilsCrossed} label="Food" text={n.state.text} sub={n.state.sub} href="/planner/meals" tone={n.state.tone} quiet={q} /> });

  const st = s.steps;
  if (st) {
    const walk =
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
          className="press flex h-11 shrink-0 items-center rounded-full border border-gold/50 bg-gold/10 px-3 text-xs font-semibold text-gold"
        >
          Walk it · +{s.walkOffer.xp}
        </button>
      ) : undefined;
    rows.push({ key: "steps", tone: st.state.tone, node: (q) => <Row icon={Footprints} label="Steps" text={st.state.text} sub={st.state.sub} href="/domains/fitness" tone={st.state.tone} quiet={q} right={walk} /> });
  }

  const sl = s.sleep;
  if (sl) rows.push({ key: "sleep", tone: sl.state.tone, node: (q) => <Row icon={Moon} label="Sleep" text={sl.state.text} sub={sl.state.sub} href="/domains/sleep" tone={sl.state.tone} quiet={q} /> });

  const qDone = s.quests.dailyTotal > 0 && s.quests.dailyDone === s.quests.dailyTotal;
  rows.push({
    key: "quests",
    tone: qDone ? "success" : "neutral",
    node: (q) => (
      <Row
        icon={Scroll}
        label="Quests"
        text={s.quests.dailyTotal ? (qDone ? "All daily quests done" : `${s.quests.dailyTotal - s.quests.dailyDone} daily quests left`) : "No daily quests"}
        sub={s.quests.weeklyInProgress ? `${s.quests.weeklyInProgress} weekly in progress` : s.quests.dailyTotal ? `${s.quests.dailyDone} of ${s.quests.dailyTotal}` : "Add a habit to get some"}
        href={s.quests.dailyTotal ? "/quests" : "/domains/habits"}
        tone={qDone ? "success" : "neutral"}
        quiet={q}
      />
    ),
  });

  if (s.checklist.length > 0) {
    const all = checklistDone === s.checklist.length;
    rows.push({
      key: "checklist",
      tone: all ? "success" : "neutral",
      node: (q) => (
        <li className={cx(q && "opacity-75")}>
          <button onClick={() => setHabitsOpen((v) => !v)} aria-expanded={habitsOpen} className="press flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
            <Icon icon={ListChecks} tone={all ? "success" : "neutral"} />
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

  // Settled = success or resolved. Pending / attention / neutral rows stay open.
  const settled = (t: RowTone) => t === "success" || t === "resolved";
  const todo = [...rows.filter((r) => !settled(r.tone) && r.first), ...rows.filter((r) => !settled(r.tone) && !r.first)];
  const done = rows.filter((r) => settled(r.tone));
  const successes = done.filter((r) => r.tone === "success").length;

  return (
    <section className="plate overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="eyebrow">Today</span>
        <span className="tabular text-[11px] text-muted">
          {successes}/{rows.length} done
        </span>
      </div>
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {todo.map((r) => (
          <Fragment key={r.key}>{r.node(false)}</Fragment>
        ))}
        {todo.length === 0 && (
          <li className="flex min-h-12 items-center gap-3 px-4 py-2">
            <Icon icon={Check} tone="success" />
            <span className="text-[14px]">Nothing left for today</span>
          </li>
        )}
        {done.length > 0 && (
          <li>
            <button onClick={() => setDoneOpen((v) => !v)} aria-expanded={doneOpen} data-testid="today-settled" className="press flex min-h-11 w-full items-center gap-3 px-4 py-1.5 text-left text-[13px] text-success/90">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                <Check size={15} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {successes} done{done.length > successes ? ` · ${done.length - successes} settled` : ""}
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
function Row({ icon, label, text, sub, href, tone, right, quiet }: { icon: typeof Dumbbell; label: string; text: string; sub?: string; href: string; tone: RowTone; right?: React.ReactNode; quiet?: boolean }) {
  return (
    <li className={cx(quiet && "opacity-75")}>
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
