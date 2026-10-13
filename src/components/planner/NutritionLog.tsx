"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { deleteNutritionEntryAction, logNutritionAction, logRecipeNutritionAction, updateNutritionEntryAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";

interface Entry {
  id: number;
  name: string;
  mealType: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}
interface RecipeOpt {
  id: number;
  name: string;
  mealType: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  isFavorite: boolean;
}

const QUICK = [
  { name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4 },
  { name: "Greek yogurt", calories: 150, protein: 17, carbs: 10, fat: 4 },
  { name: "2 eggs", calories: 156, protein: 12, carbs: 1, fat: 10 },
  { name: "Chicken breast (6 oz)", calories: 280, protein: 52, carbs: 0, fat: 6 },
  { name: "Rice (1 cup)", calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Takeout meal (est.)", calories: 900, protein: 35, carbs: 90, fat: 40 },
  { name: "Coffee w/ milk", calories: 40, protein: 2, carbs: 4, fat: 2 },
];

export function NutritionLog({ today, entries, recipes }: { today: string; entries: Entry[]; recipes: RecipeOpt[] }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [, start] = useTransition();
  void today;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between px-1">
        <h2 className="eyebrow">Logged today</h2>
        <button onClick={() => setOpen(true)} className="press flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold">
          <Plus size={13} /> Log food
        </button>
      </div>
      <div className="plate divide-y divide-border/60 p-0">
        {entries.length === 0 && <p className="serif px-4 py-4 text-center text-[13.5px] text-muted">Nothing logged yet. Quick-add, pick a recipe, or mark a planned meal as eaten.</p>}
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{e.name}</div>
              <div className="text-[11px] text-muted">
                <span className="capitalize">{e.mealType}</span> · {e.calories} kcal · {e.protein}P {e.carbs}C {e.fat}F
              </div>
            </div>
            <button aria-label="Edit" onClick={() => setEditing(e)} className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-white/5">
              <Pencil size={13} />
            </button>
            <button aria-label="Delete" onClick={() => start(async () => { await deleteNutritionEntryAction(e.id); router.refresh(); })} className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-danger/15 hover:text-danger">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <LogSheet open={open} onClose={() => setOpen(false)} recipes={recipes} onLogged={(fb) => { notify(fb); setOpen(false); router.refresh(); }} />
      <EditSheet entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </section>
  );
}

function LogSheet({ open, onClose, recipes, onLogged }: { open: boolean; onClose: () => void; recipes: RecipeOpt[]; onLogged: (fb: Awaited<ReturnType<typeof logNutritionAction>>) => void }) {
  const [tab, setTab] = useState<"quick" | "recipe" | "custom">("quick");
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack">(defaultMealType());
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [cooked, setCooked] = useState(false);
  const [pending, start] = useTransition();
  const list = useMemo(() => recipes.filter((r) => r.calories != null && (!q || r.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)).slice(0, 12), [recipes, q]);
  return (
    <Sheet open={open} onClose={onClose} title="Log food">
      <div className="space-y-3 pb-2">
        <Segmented
          value={mealType}
          onChange={setMealType}
          options={[
            { value: "breakfast", label: "Bfast" },
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
            { value: "snack", label: "Snack" },
          ]}
        />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "quick", label: "Quick add" },
            { value: "recipe", label: "Recipe" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {tab === "quick" && (
          <ul className="divide-y divide-border/60">
            {QUICK.map((it) => (
              <li key={it.name}>
                <button disabled={pending} onClick={() => start(async () => onLogged(await logNutritionAction({ mealType, ...it, source: "quick" })))} className="press flex w-full items-center justify-between py-2.5 text-left text-sm">
                  <span>{it.name}</span>
                  <span className="text-xs text-muted">
                    {it.calories} kcal · {it.protein}P
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {tab === "recipe" && (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your recipes" className={inputClass} />
            <label className="flex items-center gap-2 text-xs text-text-2">
              <input type="checkbox" checked={!cooked} onChange={(e) => setCooked(!e.target.checked)} className="accent-[var(--color-accent)]" /> I cooked it (counts toward cooking rank)
            </label>
            <ul className="max-h-[40dvh] divide-y divide-border/60 overflow-y-auto">
              {list.map((r) => (
                <li key={r.id}>
                  <button disabled={pending} onClick={() => start(async () => onLogged(await logRecipeNutritionAction(r.id, mealType, !cooked)))} className="press flex w-full items-center justify-between py-2.5 text-left text-sm">
                    <span>{r.name}</span>
                    <span className="text-xs text-muted">
                      {r.calories} kcal · {r.protein}P
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "custom" && (
          <div className="space-y-3">
            <Field label="What">
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Burrito bowl" className={inputClass} />
            </Field>
            <div className="grid grid-cols-4 gap-2">
              {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
                <Field key={k} label={k === "calories" ? "kcal" : k}>
                  <input type="number" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "px-2 text-center")} />
                </Field>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-text-2">
              <input type="checkbox" checked={cooked} onChange={(e) => setCooked(e.target.checked)} className="accent-[var(--color-accent)]" /> I cooked this myself
            </label>
            <Button full variant="gold" disabled={pending || !f.name.trim() || !f.calories} onClick={() => start(async () => onLogged(await logNutritionAction({ mealType, name: f.name, calories: Number(f.calories), protein: Number(f.protein) || 0, carbs: Number(f.carbs) || 0, fat: Number(f.fat) || 0, source: "manual", cooked })))}>
              Log
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function EditSheet({ entry, onClose, onSaved }: { entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (!entry) return null;
  const v = (k: keyof Entry) => f[k] ?? String(entry[k]);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit entry"
      footer={
        <Button full variant="gold" disabled={pending} onClick={() => start(async () => { await updateNutritionEntryAction(entry.id, { name: v("name"), calories: Number(v("calories")), protein: Number(v("protein")), carbs: Number(v("carbs")), fat: Number(v("fat")) }); onSaved(); })}>
          Save
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Name">
          <input value={v("name")} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputClass} />
        </Field>
        <div className="flex gap-2">
          {[0.5, 0.75, 1.25].map((p) => (
            <button key={p} onClick={() => setF({ ...f, calories: String(Math.round(entry.calories * p)), protein: String(Math.round(entry.protein * p)), carbs: String(Math.round(entry.carbs * p)), fat: String(Math.round(entry.fat * p)) })} className="press flex-1 rounded-lg border border-border bg-card-2 py-2 text-xs text-text-2">
              {p}× portion
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <Field key={k} label={k === "calories" ? "kcal" : k}>
              <input type="number" inputMode="numeric" value={v(k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "px-2 text-center")} />
            </Field>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function defaultMealType(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
