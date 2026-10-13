import Link from "next/link";
import { Moon, Sunrise, BedDouble, Wind } from "lucide-react";
import type { SleepSchedule, ActualVsPlan } from "@/services/sleepPlan";
import { to12h } from "@/services/sleepPlan";
import { cx } from "@/components/ui/primitives";

/** TONIGHT: wind-down / bed / wake / target, with last night vs plan when data exists. */
export function SleepScheduleCard({ sched, lastNight, compact }: { sched: SleepSchedule | null; lastNight: ActualVsPlan | null; compact?: boolean }) {
  if (!sched) {
    return (
      <Link href="/profile/settings#sleep" className="plate press flex items-center gap-3 px-4 py-3">
        <Moon size={18} className="text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Set a wake-up time</div>
          <div className="serif text-[13px] text-muted">Bedtime, wind-down and reminders are derived from it.</div>
        </div>
      </Link>
    );
  }
  const hours = Math.round((sched.targetMin / 60) * 10) / 10;
  return (
    <section className="plate overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gold">
          <Moon size={11} /> Tonight
        </div>
        <Link href="/profile/settings#sleep" className="text-[11px] text-muted">
          Edit
        </Link>
      </div>
      <div className={cx("grid gap-1 px-3 pb-3", compact ? "grid-cols-4" : "grid-cols-4")}>
        {[
          ["Wind down", sched.windDown, Wind],
          ["Bed", sched.inBed, BedDouble],
          ["Wake", sched.wake, Sunrise],
          ["Target", `${hours}h`, Moon],
        ].map(([l, v, Icon]) => {
          const I = Icon as typeof Moon;
          return (
            <div key={l as string} className="rounded-lg bg-black/25 px-2 py-2 text-center">
              <I size={12} className="mx-auto text-muted" />
              <div className="tabular mt-1 text-[13px] font-semibold">{(v as string).includes(":") ? to12h(v as string) : (v as string)}</div>
              <div className="text-[9px] uppercase tracking-wider text-faint">{l as string}</div>
            </div>
          );
        })}
      </div>
      {lastNight && (
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2 text-[12px]">
          <span className="text-muted">Last night</span>
          <span className="tabular">{Math.floor(lastNight.sleepMin / 60)}h {String(lastNight.sleepMin % 60).padStart(2, "0")}m</span>
          {lastNight.bedActual && (
            <span className="text-muted">
              · asleep {to12h(lastNight.bedActual)}
              {lastNight.bedDeltaMin != null && lastNight.bedDeltaMin !== 0 ? ` (${lastNight.bedDeltaMin > 0 ? "+" : ""}${lastNight.bedDeltaMin} min)` : ""}
            </span>
          )}
          <span className={cx("ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider", lastNight.verdict === "On plan" ? "bg-success/15 text-success" : lastNight.verdict === "Close" ? "bg-warn/15 text-warn" : "bg-white/5 text-muted")}>{lastNight.verdict}</span>
        </div>
      )}
    </section>
  );
}
