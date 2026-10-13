"use client";

import { useState, useTransition } from "react";
import { Dumbbell, HeartPulse, Footprints, Trophy, StretchHorizontal, CircleDot } from "lucide-react";
import { logWorkoutAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";

const TYPES = [
  { value: "strength", label: "Strength", icon: Dumbbell },
  { value: "cardio", label: "Cardio", icon: HeartPulse },
  { value: "walk", label: "Walk", icon: Footprints },
  { value: "sport", label: "Sport", icon: Trophy },
  { value: "mobility", label: "Mobility", icon: StretchHorizontal },
  { value: "other", label: "Other", icon: CircleDot },
] as const;

const DURATIONS = [20, 30, 45, 60, 90];

export function WorkoutSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const { notify } = useFeedback();
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("strength");
  const [duration, setDuration] = useState(45);
  const [intensity, setIntensity] = useState<"1" | "2" | "3">("2");
  const [when, setWhen] = useState(date);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await logWorkoutAction({ date: when, type, durationMin: duration, intensity: Number(intensity), notes: notes || null });
      notify(r);
      if (r.ok) {
        setNotes("");
        onClose();
      }
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log workout"
      footer={
        <Button onClick={submit} disabled={pending} full size="lg" variant="gold">
          {pending ? "Saving…" : `Log ${TYPES.find((t) => t.value === type)?.label.toLowerCase()} · +25 XP`}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = t.value === type;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cx("press flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium", active ? "border-gold/60 bg-gold/10 text-gold" : "border-border bg-card-2 text-text-2")}
              >
                <Icon size={20} />
                {t.label}
              </button>
            );
          })}
        </div>
        <Field label="Duration" group>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", d === duration ? "border-accent/60 bg-accent/15 text-accent-2" : "border-border bg-card-2 text-text-2")}>
                {d}m
              </button>
            ))}
          </div>
        </Field>
        <Field label="Intensity" group>
          <Segmented
            value={intensity}
            onChange={setIntensity}
            options={[
              { value: "1", label: "Easy" },
              { value: "2", label: "Moderate" },
              { value: "3", label: "Hard" },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={when} max={date} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Notes (optional)">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Squats, 5×5…" className={inputClass} maxLength={200} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
