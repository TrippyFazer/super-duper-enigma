"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, Dumbbell, Moon, ListChecks, MoreHorizontal, Footprints, Coins, Play, ClipboardList, ShieldCheck, ChevronRight } from "lucide-react";
import { logContextAction, type LogContext } from "@/actions/log";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/primitives";
import { orderByUsage, readUsage, recordUsage } from "@/lib/logUsage";
import { FoodLogSheet } from "@/components/food/log/FoodLogSheet";
import { ChecklistRows } from "@/components/home/TodayChecklist";
import { WorkoutSheet } from "./WorkoutSheet";
import { SleepSheet } from "./SleepSheet";
import { StepsSheet } from "./StepsSheet";
import { FinanceSheet } from "./FinanceSheet";

export type LogKind = "food" | "workout" | "sleep" | "routine" | "more" | "steps" | "finance" | "workout-manual";

const TOP: { key: LogKind; label: string; icon: typeof Dumbbell; sub: string }[] = [
  { key: "food", label: "Food", icon: UtensilsCrossed, sub: "Recent · search · restaurant · quick · recipe" },
  { key: "workout", label: "Workout", icon: Dumbbell, sub: "Start a session or log one you did" },
  { key: "sleep", label: "Sleep", icon: Moon, sub: "Last night" },
  { key: "routine", label: "Routine / Habit", icon: ListChecks, sub: "Tick off today's" },
  { key: "more", label: "More", icon: MoreHorizontal, sub: "Steps · finances · check-ins" },
];

/**
 * The one logging entry point. Opens from the floating + LOG button on every
 * tab. Fetches fresh context on open; orders options by what you log most.
 */
export function LogSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: LogKind | null }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [ctx, setCtx] = useState<LogContext | null>(null);
  const [view, setView] = useState<LogKind | null>(initial ?? null);
  const [usageTick, setUsageTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setView(initial ?? null);
    let dead = false;
    logContextAction().then((c) => !dead && setCtx(c)).catch(() => toast("Could not load logging options", "error"));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = useMemo(() => {
    if (!ctx) return [];
    const show: Record<string, boolean> = {
      food: ctx.activeDomains.includes("cooking"),
      workout: ctx.activeDomains.includes("fitness"),
      sleep: ctx.activeDomains.includes("sleep") && ctx.showManualSleep,
      routine: ctx.checklist.length > 0 || ctx.activeDomains.includes("habits") || ctx.activeDomains.includes("skincare"),
      more: true,
    };
    return orderByUsage(TOP.filter((t) => show[t.key]), readUsage(), { pinFirst: ["more"].filter(() => false) }).sort((a, b) => (a.key === "more" ? 1 : b.key === "more" ? -1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, usageTick]);

  const pick = (k: LogKind) => {
    if (k !== "more") recordUsage(k);
    setUsageTick((t) => t + 1);
    if (k === "workout" && ctx?.activeSessionId) {
      onClose();
      router.push("/planner/workout/session");
      return;
    }
    setView(k);
  };
  const done = () => {
    setView(null);
    onClose();
    router.refresh();
  };

  const subOpen = view === "food" || view === "sleep" || view === "steps" || view === "finance" || view === "workout-manual";
  const title = view === "workout" ? "Workout" : view === "routine" ? "Routine / Habit" : view === "more" ? "More" : "Log";

  return (
    <>
      <Sheet open={open && !subOpen} onClose={onClose} title={title}>
        {!ctx ? (
          <div className="space-y-2 pb-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse-soft rounded-xl bg-card-2" />
            ))}
          </div>
        ) : view === null ? (
          <ul className="space-y-2 pb-3">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.key}>
                  <button onClick={() => pick(it.key)} className="press flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card-2 px-4 py-2 text-left">
                    <Icon size={20} className="shrink-0 text-gold" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{it.label}</span>
                      <span className="block truncate text-xs text-muted">{it.sub}</span>
                    </span>
                    <ChevronRight size={16} className="text-faint" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : view === "workout" ? (
          <ul className="space-y-2 pb-3">
            <li>
              <button onClick={() => { onClose(); router.push("/planner/workout"); }} className="press flex min-h-14 w-full items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-left">
                <Play size={18} className="shrink-0 text-gold" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-gold">Start a session</span>
                  <span className="block text-xs text-muted">Track sets live. Only what you finish counts.</span>
                </span>
              </button>
            </li>
            <li>
              <button onClick={() => { recordUsage("workout-manual"); setView("workout-manual"); }} className="press flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card-2 px-4 py-2 text-left">
                <ClipboardList size={18} className="shrink-0 text-text-2" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">Log a finished workout</span>
                  <span className="block text-xs text-muted">Type, minutes, intensity.</span>
                </span>
              </button>
            </li>
          </ul>
        ) : view === "routine" ? (
          <div className="-mx-5 pb-2">
            <ChecklistRows items={ctx.checklist} today={ctx.today} />
            <div className="px-5 pt-2">
              <button onClick={() => { onClose(); router.push("/domains/habits"); }} className="press h-10 text-xs text-muted">
                Manage habits & routines
              </button>
            </div>
          </div>
        ) : view === "more" ? (
          <ul className="space-y-2 pb-3">
            {ctx.activeDomains.includes("fitness") && ctx.showManualSteps && <MoreRow icon={Footprints} label="Steps" sub="Today's count" onClick={() => { recordUsage("steps"); setView("steps"); }} />}
            {ctx.activeDomains.includes("sleep") && !ctx.showManualSleep && <MoreRow icon={Moon} label="Sleep (manual)" sub="Apple Health already supplies sleep" onClick={() => { recordUsage("sleep"); setView("sleep"); }} />}
            {ctx.activeDomains.includes("wealth") && <MoreRow icon={Coins} label="Finances" sub="Monthly check-in" onClick={() => { recordUsage("finance"); setView("finance"); }} />}
            {ctx.activeDomains.includes("sobriety") && <MoreRow icon={ShieldCheck} label="Sobriety check-in" sub="Mark today" onClick={() => { onClose(); router.push("/domains/sobriety"); }} />}
            {ctx.activeDomains.includes("fitness") && <MoreRow icon={Dumbbell} label="Workout history" sub="Edit, link or discard past sessions" onClick={() => { onClose(); router.push("/planner/workout/history"); }} />}
          </ul>
        ) : null}
      </Sheet>

      {ctx && (
        <>
          <FoodLogSheet
            open={open && view === "food"}
            onClose={() => {
              setView(null);
              onClose();
            }}
            recipes={ctx.recipes}
            plannedSlots={ctx.plannedSlots}
            recents={ctx.recents}
            onLogged={(fb) => {
              notify(fb);
              if (fb.ok) {
                if (fb.adjustOffer) toast("Plan for the rest of today?", "quest", { sub: "An unplanned meal landed far from plan", action: { label: "Review", onClick: () => router.push(`/planner/meals?adjust=${encodeURIComponent(fb.adjustOffer!.unplanned)}`) } });
                done();
              }
            }}
          />
          <WorkoutSheet open={open && view === "workout-manual"} onClose={done} date={ctx.today} />
          <SleepSheet open={open && view === "sleep"} onClose={done} date={ctx.today} defaultBedtime={ctx.bedtimeTarget} />
          <StepsSheet open={open && view === "steps"} onClose={done} date={ctx.today} target={ctx.stepsTarget} />
          <FinanceSheet open={open && view === "finance"} onClose={done} date={ctx.today} />
        </>
      )}
    </>
  );
}

function MoreRow({ icon: Icon, label, sub, onClick }: { icon: typeof Dumbbell; label: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className={cx("press flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card-2 px-4 py-2 text-left")}>
        <Icon size={18} className="shrink-0 text-text-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{label}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        <ChevronRight size={16} className="text-faint" />
      </button>
    </li>
  );
}
