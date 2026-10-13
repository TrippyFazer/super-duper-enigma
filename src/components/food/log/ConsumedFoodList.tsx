"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteNutritionEntryAction, logNutritionAction, updateNutritionEntryAction, type LogFoodInput } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { MEAL_TYPES, mealTypeLabel, type MealType } from "@/food/mealType";
import type { Entry } from "./types";

/** EATEN: only logged entries. Rows show "610 kcal · 52 g protein"; details on edit. Delete is undoable. */
export function ConsumedFoodList({ entries, today }: { entries: Entry[]; today: string }) {
  const router = useRouter();
  const { undoable, toast } = useFeedback();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const visible = entries.filter((e) => !hidden.has(e.id));

  const remove = (e: Entry) => {
    setHidden((h) => new Set(h).add(e.id));
    start(async () => {
      const r = await deleteNutritionEntryAction(e.id);
      undoable(r.voidedXp ? `Removed · ${r.voidedXp} XP reversed` : "Removed", async () => {
        await logNutritionAction({ date: today, mealType: e.mealType as MealType, name: e.name, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat, source: (e.source as LogFoodInput["source"]) ?? "manual", isEstimate: e.isEstimate, venue: e.venue });
        toast("Restored", "quest");
        router.refresh();
      });
      router.refresh();
    });
  };

  return (
    <>
      <div className="plate divide-y divide-border/60 p-0">
        {visible.length === 0 && <p className="serif px-4 py-4 text-center text-[13.5px] text-muted">Nothing logged yet.</p>}
        {visible.map((e) => (
          <div key={e.id} className="flex items-center gap-1 py-1 pl-4 pr-1">
            <button onClick={() => setEditing(e)} className="press flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
              <span className="truncate text-sm">
                {e.name}
                {e.isEstimate && <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warn">estimate</span>}
              </span>
              <span className="tabular text-[11.5px] text-muted">
                {e.calories} kcal · {e.protein} g protein
                <span className="text-faint">
                  {" · "}
                  {mealTypeLabel(e.mealType)}
                  {e.venue ? ` · ${e.venue}` : ""}
                </span>
              </span>
            </button>
            <button aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-white/5">
              <Pencil size={14} />
            </button>
            <button aria-label={`Remove ${e.name}`} onClick={() => remove(e)} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-danger/15 hover:text-danger">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </>
  );
}

function EditEntrySheet({ entry, onClose, onSaved }: { entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (!entry) return null;
  const v = (k: keyof Entry) => f[k] ?? String(entry[k]);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit"
      footer={
        <Button full size="lg" variant="gold" disabled={pending} onClick={() => start(async () => { await updateNutritionEntryAction(entry.id, { name: v("name"), calories: Number(v("calories")), protein: Number(v("protein")), carbs: Number(v("carbs")), fat: Number(v("fat")), mealType: v("mealType") }); onSaved(); })}>
          Save
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Name">
          <input value={v("name")} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputClass} />
        </Field>
        <Segmented value={v("mealType") as MealType} onChange={(m) => setF({ ...f, mealType: m })} options={MEAL_TYPES.map((m) => ({ value: m.value, label: m.label }))} />
        <div className="flex gap-2" role="group" aria-label="Portion">
          {[0.5, 0.75, 1.25].map((p) => (
            <button key={p} onClick={() => setF({ ...f, calories: String(Math.round(entry.calories * p)), protein: String(Math.round(entry.protein * p)), carbs: String(Math.round(entry.carbs * p)), fat: String(Math.round(entry.fat * p)) })} className="press h-10 flex-1 rounded-lg border border-border bg-card-2 text-xs text-text-2">
              {p}× portion
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <Field key={k} label={k === "calories" ? "kcal" : k}>
              <input type="number" inputMode="numeric" value={v(k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "tabular px-1 text-center")} aria-label={k} />
            </Field>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
