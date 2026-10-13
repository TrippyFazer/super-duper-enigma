"use client";

import { useState, useTransition } from "react";
import { logStepsAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, inputClass } from "@/components/ui/primitives";

export function StepsSheet({ open, onClose, date, target }: { open: boolean; onClose: () => void; date: string; target: number }) {
  const { notify } = useFeedback();
  const [steps, setSteps] = useState("");
  const [when, setWhen] = useState(date);
  const [pending, start] = useTransition();
  const n = Number(steps) || 0;

  const submit = () =>
    start(async () => {
      const r = await logStepsAction({ date: when, steps: n });
      notify(r);
      if (r.ok) {
        setSteps("");
        onClose();
      }
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log steps"
      footer={
        <Button onClick={submit} disabled={pending || n <= 0} full size="lg" variant="gold">
          {pending ? "Saving…" : n >= target ? `Log ${n.toLocaleString()} steps · target hit +10 XP` : `Log ${n.toLocaleString()} steps`}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Steps" hint={`Daily target: ${target.toLocaleString()}. Connect Oura in Settings to sync automatically.`}>
          <input type="number" inputMode="numeric" min="0" max="100000" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="8,200" className={inputClass} autoFocus />
        </Field>
        <Field label="Date">
          <input type="date" value={when} max={date} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Sheet>
  );
}
