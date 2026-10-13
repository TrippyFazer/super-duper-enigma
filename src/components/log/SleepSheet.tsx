"use client";

import { useState, useTransition } from "react";
import { logSleepAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";
import { hhmmToMinutes, formatMinutes } from "@/lib/dates";

export function SleepSheet({ open, onClose, date, defaultBedtime }: { open: boolean; onClose: () => void; date: string; defaultBedtime?: string | null }) {
  const { notify } = useFeedback();
  const [bed, setBed] = useState(defaultBedtime ?? "23:00");
  const [wake, setWake] = useState("07:00");
  const [quality, setQuality] = useState<number>(3);
  const [when, setWhen] = useState(date);
  const [override, setOverride] = useState<string>("");
  const [pending, start] = useTransition();

  const computed = (() => {
    let b = hhmmToMinutes(bed);
    const w = hhmmToMinutes(wake);
    if (b > w) b -= 1440;
    return Math.max(0, w - b);
  })();
  const total = override ? Math.round(Number(override) * 60) : computed;

  const submit = () =>
    start(async () => {
      const r = await logSleepAction({ date: when, totalSleepMin: total, bedtime: bed, waketime: wake, quality });
      notify(r);
      if (r.ok) onClose();
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log sleep"
      footer={
        <Button onClick={submit} disabled={pending || total <= 0} full size="lg" variant="gold">
          {pending ? "Saving…" : `Log ${formatMinutes(total)} of sleep`}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="In bed">
            <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Woke up">
            <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="card-2 flex items-center justify-between px-4 py-3">
          <div>
            <div className="eyebrow">Time asleep</div>
            <div className="tabular text-xl font-semibold">{formatMinutes(total)}</div>
          </div>
          <label className="text-right text-xs text-muted">
            Override (hours)
            <input type="number" step="0.25" min="0" max="20" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={(computed / 60).toFixed(1)} className={cx(inputClass, "mt-1 w-24 py-1.5 text-right")} />
          </label>
        </div>
        <Field label="How did you feel?">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((q) => (
              <button key={q} type="button" onClick={() => setQuality(q)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm", q === quality ? "border-accent/60 bg-accent/15 text-accent-2" : "border-border bg-card-2 text-text-2")}>
                {["Rough", "Meh", "Okay", "Good", "Great"][q - 1]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Morning of">
          <input type="date" value={when} max={date} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Sheet>
  );
}
