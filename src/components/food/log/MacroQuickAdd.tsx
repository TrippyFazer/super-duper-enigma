"use client";

import { useState } from "react";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";
import { COMMON_FOODS } from "./types";

/** Calories only is enough. Name and macros are optional. */
export function MacroQuickAdd({ onSubmit, pending }: { onSubmit: (d: { name: string; calories: number; protein: number; carbs: number; fat: number }, save: boolean) => void; pending: boolean }) {
  const [f, setF] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [save, setSave] = useState(false);
  const submit = () => onSubmit({ name: f.name.trim() || `Quick add ${f.calories} kcal`, calories: Number(f.calories), protein: Number(f.protein) || 0, carbs: Number(f.carbs) || 0, fat: Number(f.fat) || 0 }, save);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
          <Field key={k} label={k === "calories" ? "kcal *" : k}>
            <input
              type="number"
              inputMode="numeric"
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && f.calories && submit()}
              className={cx(inputClass, "tabular px-1 text-center")}
              autoFocus={k === "calories"}
              aria-label={k}
            />
          </Field>
        ))}
      </div>
      <Field label="Name (optional)">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Starbucks sandwich" className={inputClass} />
      </Field>
      <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-xs text-text-2">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" /> Remember for one-tap next time
      </label>
      <Button full size="lg" variant="gold" disabled={pending || !f.calories} onClick={submit}>
        {f.calories ? `Log ${f.calories} kcal` : "Enter calories"}
      </Button>
      <div>
        <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-faint">Common</div>
        <ul className="divide-y divide-border/60">
          {COMMON_FOODS.map((it) => (
            <li key={it.name}>
              <button disabled={pending} onClick={() => onSubmit(it, false)} className="press flex min-h-12 w-full items-center justify-between py-2 text-left text-sm">
                <span>{it.name}</span>
                <span className="tabular text-xs text-muted">
                  {it.calories} kcal · {it.protein} g
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
