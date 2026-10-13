"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles, ChefHat, AlertTriangle, Clock } from "lucide-react";
import { cookSuggestionAction, deletePantryAction, setPantryLevelAction, updatePantryAction, upsertPantryAction, whatCanIEatAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Segmented, cx, inputClass } from "@/components/ui/primitives";

export interface PantryVM {
  id: number;
  name: string;
  qty: number | null;
  unit: string;
  level: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  servings: number | null;
  expiring: boolean;
}
type Suggest = Awaited<ReturnType<typeof whatCanIEatAction>>;

const LEVELS: { v: "none" | "some" | "lot"; l: string }[] = [
  { v: "none", l: "None" },
  { v: "some", l: "Some" },
  { v: "lot", l: "A lot" },
];

/** Lightweight inventory + "What can I eat tonight?" */
export function PantryScreen({ items, aiEnabled }: { items: PantryVM[]; aiEnabled: boolean }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack">(new Date().getHours() < 11 ? "breakfast" : new Date().getHours() < 15 ? "lunch" : "dinner");
  const [sug, setSug] = useState<Suggest | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      setSug(await whatCanIEatAction({ mealType }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="plate space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-gold" />
          <div className="eyebrow">What can I eat tonight?</div>
        </div>
        <p className="serif text-[13.5px] text-muted">Suggestions use what you have, what&apos;s left of today&apos;s targets, what&apos;s expiring and how much time you have. {aiEnabled ? "AI builds the recipe; your catalog is the fallback." : "Without an AI key, suggestions come from your recipe catalog."}</p>
        <div className="flex items-center gap-2">
          <Segmented
            value={mealType}
            onChange={setMealType}
            options={[
              { value: "breakfast", label: "Bfast" },
              { value: "lunch", label: "Lunch" },
              { value: "dinner", label: "Dinner" },
              { value: "snack", label: "Snack" },
            ]}
            className="flex-1"
          />
          <Button variant="gold" disabled={busy || items.length === 0} onClick={ask}>
            {busy ? "Thinking…" : "Suggest"}
          </Button>
        </div>
        {items.length === 0 && <p className="text-xs text-warn">Add what you have first — or finish a shopping list and it fills itself.</p>}
        {sug && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted">
              You have: {sug.pantry.slice(0, 10).join(", ")}
              {sug.pantry.length > 10 ? "…" : ""} · {sug.remainingCalories} kcal and {Math.max(0, sug.remainingProtein)} g protein left today{sug.source === "ai" ? " · AI" : " · from your recipes"}
            </div>
            {sug.suggestions.length === 0 && <p className="serif text-[13px] text-muted">Nothing fits well enough. Add a couple of staples (eggs, rice, a protein) or search recipes by ingredient.</p>}
            {sug.suggestions.map((s) => (
              <div key={s.name} className="rounded-xl border border-border/70 bg-card-2 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium">{s.name}</div>
                    <div className="serif text-[12.5px] text-muted">
                      {s.calories} kcal · {s.protein} g protein · {s.prepMinutes} min
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="gold"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await cookSuggestionAction({ ...s, mealType });
                        notify(r);
                        toast("Logged as cooked · pantry updated", "quest");
                        setSug(null);
                        router.refresh();
                      })
                    }
                  >
                    <ChefHat size={13} /> Cook this
                  </Button>
                </div>
                <div className="mt-1.5 text-[11.5px] text-text-2">
                  <span className="text-muted">Uses:</span> {s.uses.join(", ") || "—"}
                  {s.additional.length > 0 && (
                    <>
                      {" "}
                      <span className="text-muted">· Additional:</span> {s.additional.join(", ")}
                    </>
                  )}
                </div>
                {s.steps.length > 0 && (
                  <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[12px] text-text-2">
                    {s.steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                )}
                {s.why && <div className="mt-1 text-[11px] text-faint">{s.why}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between px-1">
          <h2 className="eyebrow">Pantry · {items.length} items</h2>
        </div>
        <div className="plate p-0">
          <div className="flex gap-2 border-b border-border/60 px-3 py-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add: chicken 2 lb, eggs, rice…" className={inputClass} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) start(async () => { await upsertPantryAction({ name }); setName(""); router.refresh(); }); }} />
            <Button variant="secondary" disabled={pending || !name.trim()} onClick={() => start(async () => { await upsertPantryAction({ name }); setName(""); router.refresh(); })}>
              <Plus size={14} />
            </Button>
          </div>
          {items.length === 0 && <p className="serif px-4 py-4 text-center text-[13.5px] text-muted">Empty. Rough is fine — “chicken”, “rice”, “some spinach”.</p>}
          <ul className="divide-y divide-border/60">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm capitalize">
                    {it.name}
                    {it.expiring && (
                      <span className="flex items-center gap-0.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warn">
                        <AlertTriangle size={9} /> use soon
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    <QtyEditor it={it} />
                    {it.servings != null && <span>· ~{it.servings} meals</span>}
                    {it.purchasedAt && (
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} /> {it.purchasedAt.slice(5)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex rounded-lg border border-border bg-black/30 p-0.5">
                  {LEVELS.map((l) => (
                    <button key={l.v} disabled={pending} onClick={() => start(async () => { await setPantryLevelAction(it.id, l.v); router.refresh(); })} className={cx("press rounded-md px-2 py-1 text-[11px]", it.level === l.v ? "bg-card-2 text-text" : "text-muted")}>
                      {l.l}
                    </button>
                  ))}
                </div>
                <button aria-label={`Remove ${it.name}`} disabled={pending} onClick={() => start(async () => { await deletePantryAction(it.id); router.refresh(); })} className="press flex h-8 w-8 items-center justify-center rounded-full text-faint hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function QtyEditor({ it }: { it: PantryVM }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(it.qty != null ? String(it.qty) : "");
  const [, start] = useTransition();
  if (!edit)
    return (
      <button onClick={() => setEdit(true)} className="press underline decoration-dotted">
        {it.qty != null ? `${it.qty} ${it.unit}` : (it.level ?? "some")}
      </button>
    );
  return (
    <span className="flex items-center gap-1">
      <input autoFocus type="number" step="0.25" value={v} onChange={(e) => setV(e.target.value)} className={cx(inputClass, "h-7 w-20 px-2 py-0 text-xs")} onKeyDown={(e) => { if (e.key === "Enter") start(async () => { await updatePantryAction(it.id, { qty: v === "" ? null : Number(v) }); setEdit(false); router.refresh(); }); if (e.key === "Escape") setEdit(false); }} />
      <span>{it.unit}</span>
    </span>
  );
}
