"use client";

import { useState } from "react";
import { ChevronLeft, ChefHat } from "lucide-react";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";
import type { Draft } from "./types";

export interface DraftSubmit {
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isEstimate: boolean;
  source: string;
  savedFoodId?: number;
  recipeId?: number;
  cooked: boolean;
  save: boolean;
}

const SOURCE_LABEL: Record<string, string> = { openfoodfacts: "Label data", restaurant: "Chain menu (approx.)", recipe: "Your recipe", saved: "Saved food", manual: "Entered by you", quick: "Entered by you", estimate: "AI estimate" };

/**
 * Second tap: confirm the selected food. Portion, macros and "I cooked this"
 * live here so one action updates nutrition AND cooking.
 */
export function FoodDraft({ draft, onBack, onSubmit, pending, allowCooked = true }: { draft: Draft; onBack: () => void; onSubmit: (d: DraftSubmit) => void; pending: boolean; allowCooked?: boolean }) {
  const [f, setF] = useState({ name: draft.name, calories: draft.calories == null ? "" : String(draft.calories), protein: String(draft.protein), carbs: String(draft.carbs), fat: String(draft.fat) });
  const [portion, setPortion] = useState(1);
  const [save, setSave] = useState(!draft.savedFoodId && draft.source !== "recipe");
  const [cooked, setCooked] = useState(!!draft.cooked);
  const [more, setMore] = useState(false);
  const scaled = (v: string) => Math.round(Number(v || 0) * portion);
  const hasCalories = f.calories.trim() !== "" && Number(f.calories) > 0;
  const canSubmit = !!f.name.trim() && (hasCalories || (cooked && allowCooked));
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <button onClick={onBack} aria-label="Back" className="press -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 pt-1.5">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Food name" className="w-full bg-transparent text-base font-medium outline-none" />
          <div className="text-[11px] text-muted">
            {draft.brand ? `${draft.brand} · ` : ""}
            {draft.serving ? `${draft.serving} · ` : ""}
            {draft.isEstimate ? <span className="text-warn">ESTIMATE · edit before saving</span> : (SOURCE_LABEL[draft.source] ?? "Entered by you")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="kcal">
          <input type="number" inputMode="numeric" value={f.calories} onChange={(e) => setF({ ...f, calories: e.target.value })} className={cx(inputClass, "tabular text-center")} autoFocus={draft.calories == null} />
        </Field>
        <Field label="protein g">
          <input type="number" inputMode="numeric" value={f.protein} onChange={(e) => setF({ ...f, protein: e.target.value })} className={cx(inputClass, "tabular text-center")} />
        </Field>
      </div>
      {more ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="carbs g">
            <input type="number" inputMode="numeric" value={f.carbs} onChange={(e) => setF({ ...f, carbs: e.target.value })} className={cx(inputClass, "tabular text-center")} />
          </Field>
          <Field label="fat g">
            <input type="number" inputMode="numeric" value={f.fat} onChange={(e) => setF({ ...f, fat: e.target.value })} className={cx(inputClass, "tabular text-center")} />
          </Field>
        </div>
      ) : (
        <button onClick={() => setMore(true)} className="press h-9 px-1 text-left text-xs text-muted">
          Carbs {scaled(f.carbs)} g · Fat {scaled(f.fat)} g · edit
        </button>
      )}

      <div className="flex gap-2" role="group" aria-label="Portion">
        {[0.5, 1, 1.5, 2].map((p) => (
          <button key={p} onClick={() => setPortion(p)} aria-pressed={p === portion} className={cx("press tabular h-11 flex-1 rounded-lg border text-sm", p === portion ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
            {p}×
          </button>
        ))}
      </div>

      {allowCooked && (
        <button onClick={() => setCooked((v) => !v)} aria-pressed={cooked} className={cx("press flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm", cooked ? "border-success/50 bg-success/10 text-success" : "border-border bg-card-2 text-text-2")}>
          <ChefHat size={15} /> I cooked this
          <span className="ml-auto text-[11px] text-muted">{cooked ? "counts for cooking too" : ""}</span>
        </button>
      )}
      {draft.source !== "recipe" && (
        <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-xs text-text-2">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" /> Remember for one-tap next time
        </label>
      )}
      <Button
        full
        size="lg"
        variant="gold"
        disabled={pending || !canSubmit}
        onClick={() => onSubmit({ name: f.name.trim(), brand: draft.brand, calories: scaled(f.calories), protein: scaled(f.protein), carbs: scaled(f.carbs), fat: scaled(f.fat), isEstimate: draft.isEstimate, source: draft.source, savedFoodId: draft.savedFoodId, recipeId: draft.recipeId, cooked: cooked && allowCooked, save })}
      >
        {pending ? "Logging…" : hasCalories ? `Log · ${scaled(f.calories)} kcal · ${scaled(f.protein)} g protein` : cooked ? "Log as cooked (no macros)" : "Enter calories to log"}
      </Button>
    </div>
  );
}
