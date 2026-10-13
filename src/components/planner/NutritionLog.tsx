"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Search, Store, Zap, Sparkles, ChefHat, Clock, X } from "lucide-react";
import { deleteNutritionEntryAction, estimateFoodAction, logNutritionAction, logRecipeNutritionAction, recentFoodsAction, searchFoodsAction, updateNutritionEntryAction, deleteSavedFoodAction, type LogFoodInput } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import type { FoodHit } from "@/food/search";
import { RESTAURANT_BRANDS } from "@/food/restaurants";

interface Entry {
  id: number;
  name: string;
  mealType: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  isEstimate: boolean;
  venue: string | null;
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
export interface PlannedSlot {
  id: number;
  mealType: string;
  name: string;
  calories: number;
}
type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type Tab = "search" | "restaurant" | "quick" | "estimate" | "recipe";

const QUICK = [
  { name: "Protein shake", calories: 220, protein: 30, carbs: 10, fat: 4 },
  { name: "Greek yogurt", calories: 150, protein: 17, carbs: 10, fat: 4 },
  { name: "2 eggs", calories: 156, protein: 12, carbs: 1, fat: 10 },
  { name: "Chicken breast (6 oz)", calories: 280, protein: 52, carbs: 0, fat: 6 },
  { name: "Rice (1 cup)", calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Coffee w/ milk", calories: 40, protein: 2, carbs: 4, fat: 2 },
];

export function NutritionLog({ entries, recipes, plannedSlots, openInitially, onAdjustOffer }: { today: string; entries: Entry[]; recipes: RecipeOpt[]; plannedSlots: PlannedSlot[]; openInitially?: boolean; onAdjustOffer?: (unplanned: string) => void }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [open, setOpen] = useState(!!openInitially);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [, start] = useTransition();

  return (
    <section>
      <div className="mb-2 flex items-end justify-between px-1">
        <h2 className="eyebrow">Logged today</h2>
        <button onClick={() => setOpen(true)} className="press flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold">
          <Plus size={13} /> Log food
        </button>
      </div>
      <div className="plate divide-y divide-border/60 p-0">
        {entries.length === 0 && <p className="serif px-4 py-4 text-center text-[13.5px] text-muted">Nothing eaten yet. Only what you log here counts — generated plans don&apos;t.</p>}
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                {e.name}
                {e.isEstimate && <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warn">estimate</span>}
              </div>
              <div className="text-[11px] text-muted">
                <span className="capitalize">{e.mealType}</span>
                {e.venue ? ` · ${e.venue}` : ""} · {e.calories} kcal · {e.protein}P {e.carbs}C {e.fat}F
              </div>
            </div>
            <button aria-label="Edit" onClick={() => setEditing(e)} className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-white/5">
              <Pencil size={13} />
            </button>
            <button
              aria-label="Delete"
              onClick={() => {
                if (!window.confirm(`Delete “${e.name}”? Totals and any XP it earned are reversed.`)) return;
                start(async () => {
                  const r = await deleteNutritionEntryAction(e.id);
                  toast(r.voidedXp ? `Removed · ${r.voidedXp} XP reversed` : "Removed", "quest");
                  router.refresh();
                });
              }}
              className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-danger/15 hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <LogFoodSheet
        open={open}
        onClose={() => setOpen(false)}
        recipes={recipes}
        plannedSlots={plannedSlots}
        onLogged={(fb) => {
          notify(fb);
          setOpen(false);
          router.refresh();
          if (fb.adjustOffer) onAdjustOffer?.(fb.adjustOffer.unplanned);
        }}
      />
      <EditSheet entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </section>
  );
}

type LogResult = Awaited<ReturnType<typeof logNutritionAction>>;

/** The "+ Food" sheet: Search · Restaurant · Quick · Estimate · Recipe, plus one-tap recents. */
export function LogFoodSheet({ open, onClose, recipes, plannedSlots, onLogged, initialTab }: { open: boolean; onClose: () => void; recipes: RecipeOpt[]; plannedSlots: PlannedSlot[]; onLogged: (fb: LogResult) => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "search");
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [replaces, setReplaces] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{ name: string; brand: string | null; serving: string | null; calories: number; protein: number; carbs: number; fat: number; isEstimate: boolean; source: string; savedFoodId?: number; recipeId?: number } | null>(null);

  const slot = plannedSlots.find((p) => p.mealType === mealType);
  useEffect(() => {
    setReplaces(slot && (tab === "search" || tab === "restaurant" || tab === "quick" || tab === "estimate") ? slot.id : null);
  }, [slot, tab, mealType]);

  const submit = (input: Omit<LogFoodInput, "mealType">) =>
    start(async () => {
      const r = await logNutritionAction({ ...input, mealType, replacesPlannedMealId: replaces });
      onLogged(r);
      setDraft(null);
    });

  const commonHeader = (
    <div className="space-y-2">
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
      {slot && tab !== "recipe" && (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card-2 px-3 py-2 text-xs text-text-2">
          <input type="checkbox" checked={replaces === slot.id} onChange={(e) => setReplaces(e.target.checked ? slot.id : null)} className="accent-[var(--color-accent)]" />
          This replaces today&apos;s planned {mealType}: <span className="font-medium text-text">{slot.name}</span> ({slot.calories} kcal)
        </label>
      )}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Log food">
      <div className="space-y-3 pb-2">
        {commonHeader}
        <div className="scroll-x -mx-5 flex gap-1.5 px-5">
          {(
            [
              ["search", "Search", Search],
              ["restaurant", "Restaurant", Store],
              ["quick", "Quick macros", Zap],
              ["estimate", "Estimate", Sparkles],
              ["recipe", "Recipe", ChefHat],
            ] as const
          ).map(([v, l, Icon]) => (
            <button key={v} onClick={() => setTab(v)} className={cx("press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs", tab === v ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              <Icon size={12} /> {l}
            </button>
          ))}
        </div>

        {draft ? (
          <DraftForm draft={draft} onCancel={() => setDraft(null)} pending={pending} onSubmit={(d, save) => submit({ name: d.name, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat, source: d.source as LogFoodInput["source"], isEstimate: d.isEstimate, venue: d.brand, savedFoodId: d.savedFoodId ?? null, recipeId: d.recipeId ?? null, save })} />
        ) : (
          <>
            {tab === "search" && <SearchTab onPick={(h) => setDraft({ name: h.name, brand: h.brand, serving: h.serving, calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat, isEstimate: h.isEstimate, source: h.source === "saved" ? "saved" : h.source, savedFoodId: h.savedFoodId, recipeId: h.recipeId })} pending={pending} />}
            {tab === "restaurant" && <SearchTab restaurantOnly onPick={(h) => setDraft({ name: h.name, brand: h.brand, serving: h.serving, calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat, isEstimate: h.isEstimate, source: "restaurant", savedFoodId: h.savedFoodId })} pending={pending} />}
            {tab === "quick" && <QuickTab onSubmit={(d, save) => submit({ ...d, source: "quick", save })} pending={pending} />}
            {tab === "estimate" && <EstimateTab onEstimate={(d) => setDraft({ ...d, brand: null, serving: null, isEstimate: true, source: "estimate" })} />}
            {tab === "recipe" && <RecipeTab recipes={recipes} mealType={mealType} pending={pending} onLogged={onLogged} />}
          </>
        )}
      </div>
    </Sheet>
  );
}

interface Draft {
  name: string;
  brand: string | null;
  serving: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isEstimate: boolean;
  source: string;
  savedFoodId?: number;
  recipeId?: number;
}

function DraftForm({ draft, onCancel, onSubmit, pending }: { draft: Draft; onCancel: () => void; onSubmit: (d: { name: string; brand: string | null; calories: number; protein: number; carbs: number; fat: number; isEstimate: boolean; source: string; savedFoodId?: number; recipeId?: number }, save: boolean) => void; pending: boolean }) {
  const [f, setF] = useState({ name: draft.name, calories: String(draft.calories), protein: String(draft.protein), carbs: String(draft.carbs), fat: String(draft.fat) });
  const [portion, setPortion] = useState(1);
  const [save, setSave] = useState(!draft.savedFoodId && draft.source !== "recipe");
  const scaled = (v: string) => Math.round(Number(v || 0) * portion);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-faint">
            {draft.brand ?? "Custom"}
            {draft.serving ? ` · ${draft.serving}` : ""}
          </div>
          <div className="truncate text-base font-medium">{draft.name}</div>
          {draft.isEstimate ? <div className="text-[11px] text-warn">ESTIMATE — edit anything before saving.</div> : <div className="text-[11px] text-muted">{draft.source === "openfoodfacts" ? "Label data from Open Food Facts" : draft.source === "restaurant" ? "Chain menu data (approx.)" : draft.source === "recipe" ? "From your recipe" : draft.source === "saved" ? "Saved food" : "Entered by you"}</div>}
        </div>
        <button onClick={onCancel} aria-label="Back" className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-white/5">
          <X size={16} />
        </button>
      </div>
      <Field label="Name">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputClass} />
      </Field>
      <div className="grid grid-cols-4 gap-2">
        {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
          <Field key={k} label={k === "calories" ? "kcal" : k}>
            <input type="number" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "px-2 text-center")} />
          </Field>
        ))}
      </div>
      <Field label="Portion" group>
        <div className="flex gap-2">
          {[0.5, 1, 1.5, 2].map((p) => (
            <button key={p} onClick={() => setPortion(p)} className={cx("press flex-1 rounded-lg border py-2 text-sm tabular", p === portion ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {p}×
            </button>
          ))}
        </div>
      </Field>
      {draft.source !== "recipe" && (
        <label className="flex items-center gap-2 text-xs text-text-2">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[var(--color-accent)]" /> Save for one-tap logging next time
        </label>
      )}
      <Button full variant="gold" disabled={pending || !f.name.trim() || !f.calories} onClick={() => onSubmit({ name: f.name.trim(), brand: draft.brand, calories: scaled(f.calories), protein: scaled(f.protein), carbs: scaled(f.carbs), fat: scaled(f.fat), isEstimate: draft.isEstimate, source: draft.source, savedFoodId: draft.savedFoodId, recipeId: draft.recipeId }, save)}>
        {pending ? "Logging…" : `Add ${scaled(f.calories)} kcal · ${scaled(f.protein)} g protein`}
      </Button>
    </div>
  );
}

function SearchTab({ onPick, pending, restaurantOnly }: { onPick: (h: FoodHit) => void; pending: boolean; restaurantOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [recents, setRecents] = useState<Awaited<ReturnType<typeof recentFoodsAction>>>([]);
  const [busy, setBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  useEffect(() => {
    recentFoodsAction().then(setRecents).catch(() => {});
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    let dead = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchFoodsAction(q);
        if (dead) return;
        setHits(restaurantOnly ? r.hits.filter((h) => h.source === "restaurant" || h.source === "saved") : r.hits);
        setLiveError(r.liveError);
      } finally {
        if (!dead) setBusy(false);
      }
    }, 300);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [q, restaurantOnly]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={restaurantOnly ? "Starbucks breakfast sandwich, Chipotle bowl…" : "Search foods, products, chains, recipes"} className={inputClass} autoFocus />
      {restaurantOnly && !q && (
        <div className="flex flex-wrap gap-1.5">
          {RESTAURANT_BRANDS.slice(0, 14).map((b) => (
            <button key={b} onClick={() => setQ(b)} className="press rounded-full border border-border bg-card-2 px-2.5 py-1 text-[11.5px] text-text-2">
              {b}
            </button>
          ))}
        </div>
      )}
      {!q && recents.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-faint">
            <Clock size={10} /> Recently used
          </div>
          <ul className="divide-y divide-border/60">
            {recents.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <button disabled={pending} onClick={() => onPick({ key: `saved:${r.id}`, name: r.name, brand: r.brand, serving: r.serving, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, source: "saved", isEstimate: r.isEstimate, savedFoodId: r.id })} className="press flex min-w-0 flex-1 items-center justify-between py-2.5 text-left text-sm">
                  <span className="min-w-0 truncate">
                    {r.name}
                    {r.brand && <span className="text-muted"> · {r.brand}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {r.calories} kcal · {r.protein}P
                  </span>
                </button>
                <button aria-label="Forget" onClick={() => deleteSavedFoodAction(r.id).then(() => setRecents((xs) => xs.filter((x) => x.id !== r.id)))} className="press flex h-7 w-7 items-center justify-center rounded-full text-faint hover:text-danger">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {busy && <div className="animate-pulse-soft text-xs text-muted">Searching…</div>}
      <ul className="max-h-[42dvh] divide-y divide-border/60 overflow-y-auto">
        {hits.map((h) => (
          <li key={h.key}>
            <button disabled={pending} onClick={() => onPick(h)} className="press flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm">
              <span className="min-w-0">
                <span className="block truncate">{h.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {h.brand ?? ""}
                  {h.serving ? ` · ${h.serving}` : ""} · {h.source === "openfoodfacts" ? "label" : h.source === "restaurant" ? "menu" : h.source}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted">
                {h.calories} kcal
                <br />
                {h.protein}P {h.carbs}C {h.fat}F
              </span>
            </button>
          </li>
        ))}
        {q.length >= 2 && !busy && hits.length === 0 && <li className="serif py-3 text-center text-[13px] text-muted">No verified match. Try Quick macros or Estimate.</li>}
      </ul>
      {liveError && <p className="text-[11px] text-faint">Live product database unavailable ({liveError.slice(0, 40)}) — showing local results.</p>}
    </div>
  );
}

function QuickTab({ onSubmit, pending }: { onSubmit: (d: { name: string; calories: number; protein: number; carbs?: number; fat?: number }, save: boolean) => void; pending: boolean }) {
  const [f, setF] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [save, setSave] = useState(false);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
          <Field key={k} label={k === "calories" ? "kcal *" : k}>
            <input type="number" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "px-2 text-center")} autoFocus={k === "calories"} />
          </Field>
        ))}
      </div>
      <Field label="Name (optional)">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Starbucks sandwich" className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-text-2">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[var(--color-accent)]" /> Save as a common food
      </label>
      <Button full variant="gold" disabled={pending || !f.calories} onClick={() => onSubmit({ name: f.name.trim() || `Quick add ${f.calories} kcal`, calories: Number(f.calories), protein: Number(f.protein) || 0, carbs: Number(f.carbs) || 0, fat: Number(f.fat) || 0 }, save)}>
        Add
      </Button>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-faint">Common</div>
        <ul className="divide-y divide-border/60">
          {QUICK.map((it) => (
            <li key={it.name}>
              <button disabled={pending} onClick={() => onSubmit(it, false)} className="press flex w-full items-center justify-between py-2 text-left text-sm">
                <span>{it.name}</span>
                <span className="text-xs text-muted">
                  {it.calories} kcal · {it.protein}P
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EstimateTab({ onEstimate }: { onEstimate: (d: { name: string; calories: number; protein: number; carbs: number; fat: number }) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p className="serif text-[13.5px] text-muted">Describe what you ate. Used only when no verified data matches; the result is clearly an estimate and fully editable.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Chicken burrito with rice, black beans, cheese and guac from a local Mexican place" className={inputClass} maxLength={300} />
      {err && <p className="text-xs text-danger">{err}</p>}
      <Button
        full
        variant="gold"
        disabled={busy || text.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await estimateFoodAction(text);
            if (!r.ok || !r.estimate) setErr(r.error ?? "Could not estimate");
            else onEstimate({ name: r.estimate.name, calories: r.estimate.calories, protein: r.estimate.protein, carbs: r.estimate.carbs, fat: r.estimate.fat });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Estimating…" : "Estimate with AI"}
      </Button>
    </div>
  );
}

function RecipeTab({ recipes, mealType, pending, onLogged }: { recipes: RecipeOpt[]; mealType: MealType; pending: boolean; onLogged: (fb: LogResult) => void }) {
  const [q, setQ] = useState("");
  const [cooked, setCooked] = useState(true);
  const [, start] = useTransition();
  const list = useMemo(() => recipes.filter((r) => r.calories != null && (!q || r.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)).slice(0, 14), [recipes, q]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your recipes" className={inputClass} />
      <label className="flex items-center gap-2 text-xs text-text-2">
        <input type="checkbox" checked={cooked} onChange={(e) => setCooked(e.target.checked)} className="accent-[var(--color-accent)]" /> I cooked it (counts toward cooking rank)
      </label>
      <ul className="max-h-[40dvh] divide-y divide-border/60 overflow-y-auto">
        {list.map((r) => (
          <li key={r.id}>
            <button disabled={pending} onClick={() => start(async () => onLogged(await logRecipeNutritionAction(r.id, mealType, cooked)))} className="press flex w-full items-center justify-between py-2.5 text-left text-sm">
              <span>{r.name}</span>
              <span className="text-xs text-muted">
                {r.calories} kcal · {r.protein}P
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
        <Button full variant="gold" disabled={pending} onClick={() => start(async () => { await updateNutritionEntryAction(entry.id, { name: v("name"), calories: Number(v("calories")), protein: Number(v("protein")), carbs: Number(v("carbs")), fat: Number(v("fat")), mealType: v("mealType") }); onSaved(); })}>
          Save
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Name">
          <input value={v("name")} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputClass} />
        </Field>
        <Segmented
          value={v("mealType") as MealType}
          onChange={(m) => setF({ ...f, mealType: m })}
          options={[
            { value: "breakfast", label: "Bfast" },
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
            { value: "snack", label: "Snack" },
          ]}
        />
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

function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
