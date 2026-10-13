"use client";

import { useState } from "react";
import { estimateFoodAction } from "@/actions/planner";
import { Button, inputClass } from "@/components/ui/primitives";

/** Describe → AI (or template) estimate → editable draft clearly labelled ESTIMATE. */
export function FoodEstimate({ onEstimate, onQuick }: { onEstimate: (d: { name: string; calories: number; protein: number; carbs: number; fat: number }) => void; onQuick?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await estimateFoodAction(text);
      if (!r.ok || !r.estimate) setErr(r.error ?? "Could not estimate");
      else onEstimate({ name: r.estimate.name, calories: r.estimate.calories, protein: r.estimate.protein, carbs: r.estimate.carbs, fat: r.estimate.fat });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Chicken burrito with rice, beans, cheese and guac" className={inputClass} maxLength={300} autoFocus aria-label="Describe what you ate" />
      {err && (
        <div className="rounded-lg border border-border bg-card-2 px-3 py-2 text-xs text-text-2">
          <p>{err}</p>
          {onQuick && (
            <button onClick={onQuick} className="press mt-1 h-9 text-xs font-semibold text-gold">
              Use Quick add instead
            </button>
          )}
        </div>
      )}
      <Button full size="lg" variant="gold" disabled={busy || text.trim().length < 3} onClick={run}>
        {busy ? "Estimating…" : "Estimate"}
      </Button>
      <p className="serif px-1 text-[12.5px] text-muted">Results are marked ESTIMATE and fully editable.</p>
    </div>
  );
}
