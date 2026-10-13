"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { saveSleepPlanAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Field, cx, inputClass } from "@/components/ui/primitives";
import { computeSleepSchedule, to12h } from "@/services/sleepPlan";

/** Wake time → derived wind-down / in-bed / asleep targets. All editable. */
export function SleepSettings({ initial }: { initial: { wakeTarget: string | null; sleepTargetMin: number; windDownMin: number; fallAsleepMin: number; bedtimeTarget: string | null } }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ wakeTarget: initial.wakeTarget ?? "07:30", hours: String(Math.round((initial.sleepTargetMin / 60) * 2) / 2), windDownMin: String(initial.windDownMin), fallAsleepMin: String(initial.fallAsleepMin) });
  const sched = useMemo(() => computeSleepSchedule({ stepsTarget: 0, bedtimeTarget: initial.bedtimeTarget, sleepTargetMin: Math.round(Number(f.hours) * 60) || 480, workoutsPerWeekTarget: 3, mealsPerWeekTarget: 7 }, { wakeTarget: f.wakeTarget || null, windDownMin: Number(f.windDownMin) || 0, fallAsleepMin: Number(f.fallAsleepMin) || 0 }), [f, initial.bedtimeTarget]);
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Moon size={15} className="text-gold" />
        <div className="eyebrow">Sleep schedule</div>
      </div>
      <p className="text-xs text-muted">Pick when you want to wake up; the rest is derived. Most adults do well on 7–9 hours — there is no single perfect bedtime, so adjust anything.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target wake time">
          <input type="time" value={f.wakeTarget} onChange={(e) => setF({ ...f, wakeTarget: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Target sleep (hours)">
          <select value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className={inputClass}>
            {["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5"].map((h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
          </select>
        </Field>
        <Field label="Wind-down (min before bed)">
          <input type="number" min={0} max={120} step={5} value={f.windDownMin} onChange={(e) => setF({ ...f, windDownMin: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Time to fall asleep (min)">
          <input type="number" min={0} max={60} step={5} value={f.fallAsleepMin} onChange={(e) => setF({ ...f, fallAsleepMin: e.target.value })} className={inputClass} />
        </Field>
      </div>
      {sched && (
        <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-card-2 px-2 py-2 text-center">
          {[
            ["Wind-down", sched.windDown],
            ["In bed", sched.inBed],
            ["Asleep", sched.asleep],
            ["Wake", sched.wake],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="text-[10px] uppercase tracking-wider text-faint">{l}</div>
              <div className={cx("tabular text-sm font-semibold", l === "Wake" ? "text-gold" : "")}>{to12h(v)}</div>
            </div>
          ))}
        </div>
      )}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await saveSleepPlanAction({ wakeTarget: f.wakeTarget || null, sleepTargetMin: Math.round(Number(f.hours) * 60), windDownMin: Number(f.windDownMin) || 0, fallAsleepMin: Number(f.fallAsleepMin) || 0 });
            toast("Sleep schedule saved · reminders recalculated", "quest");
            router.refresh();
          })
        }
      >
        Save sleep schedule
      </Button>
    </Card>
  );
}
