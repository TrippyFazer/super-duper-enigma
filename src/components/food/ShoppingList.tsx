"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Pencil, ShoppingBasket, Undo2 } from "lucide-react";
import { addGroceryItemAction, deleteGroceryItemAction, finishShoppingAction, reopenShoppingAction, updateGroceryItemAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";
import { CATEGORY_LABEL, CATEGORY_ORDER, type GroceryCategory } from "@/food/ingredients";

export interface ItemVM {
  id: number;
  name: string;
  category: string;
  qty: number;
  unit: string;
  estPrice: number | null;
  actualQty: number | null;
  actualPrice: number | null;
  purchased: boolean;
  skipped: boolean;
  usedIn: string[];
  coveredByPantry: boolean;
  note: string | null;
}

const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

/** Consolidated shopping list with check / purchased / skip / edit qty & price, budget vs estimate vs actual. */
export function ShoppingList({ weekId, status, items, budget, embedded }: { weekId: number; status: string; items: ItemVM[]; budget: number; embedded?: boolean }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<ItemVM | null>(null);
  const [adding, setAdding] = useState(false);
  const live = items.filter((i) => !i.coveredByPantry);
  const estimated = live.filter((i) => !i.skipped).reduce((a, i) => a + (i.estPrice ?? 0), 0);
  const actual = live.filter((i) => i.purchased).reduce((a, i) => a + (i.actualPrice ?? i.estPrice ?? 0), 0);
  const anyActual = live.some((i) => i.purchased);
  const remaining = budget - (anyActual ? actual : estimated);
  const covered = items.filter((i) => i.coveredByPantry);
  const shopped = status === "shopped" || status === "reviewed";

  const toggle = (it: ItemVM) => start(async () => { await updateGroceryItemAction(it.id, { purchased: !it.purchased }); router.refresh(); });

  return (
    <section className={cx(!embedded && "plate overflow-hidden")}>
      <div className="grid grid-cols-4 gap-1 border-b border-border/60 px-3 py-2.5 text-center">
        {[
          ["Budget", money(budget), ""],
          ["Estimated", `~${money(estimated)}`, "text-muted"],
          ["Actual", anyActual ? money(actual) : "—", actual > budget ? "text-warn" : "text-success"],
          ["Remaining", money(remaining), remaining < 0 ? "text-warn" : "text-gold"],
        ].map(([l, v, c]) => (
          <div key={l}>
            <div className="text-[9px] uppercase tracking-wider text-faint">{l}</div>
            <div className={cx("tabular text-[13px] font-semibold", c)}>{v}</div>
          </div>
        ))}
      </div>
      <p className="px-4 pt-2 text-[11px] text-faint">Prices marked ~ are estimates. Tap an item to mark it bought; use the pencil to enter actual quantity and price.</p>
      {CATEGORY_ORDER.filter((c) => live.some((i) => i.category === c)).map((cat) => (
        <div key={cat}>
          <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gold">{CATEGORY_LABEL[cat as GroceryCategory]}</div>
          <ul className="divide-y divide-border/60">
            {live
              .filter((i) => i.category === cat)
              .map((it) => (
                <li key={it.id} className={cx("flex items-center gap-2 px-4 py-2", it.skipped && "opacity-50")}>
                  <button aria-label={it.purchased ? `Unmark ${it.name}` : `Mark ${it.name} bought`} disabled={pending} onClick={() => toggle(it)} className={cx("press flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", it.purchased ? "border-success bg-success text-[#071a10]" : "border-border-strong bg-black/30 text-faint")}>
                    {it.purchased && <Check size={14} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={cx("text-sm capitalize", it.skipped && "line-through")}>
                      {it.name}
                      <span className="text-muted">
                        {" "}
                        · {it.purchased && it.actualQty != null ? it.actualQty : it.qty} {it.unit}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {it.purchased && it.actualPrice != null ? <span className="text-text-2">{money(it.actualPrice)} paid</span> : <span>~{money(it.estPrice)}</span>}
                      {it.usedIn.length ? ` · ${it.usedIn.slice(0, 3).join(", ")}${it.usedIn.length > 3 ? "…" : ""}` : ""}
                      {it.note ? ` · ${it.note}` : ""}
                    </div>
                  </div>
                  <button aria-label={`Edit ${it.name}`} onClick={() => setEditing(it)} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-white/5">
                    <Pencil size={13} />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {covered.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="text-[10px] uppercase tracking-wider text-faint">Already have (from leftovers)</div>
          <p className="serif text-[12.5px] text-muted">{covered.map((c) => `${c.name}${c.note ? ` — ${c.note.toLowerCase()}` : ""}`).join("; ")}.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add item
        </Button>
        {!shopped ? (
          <Button
            size="sm"
            variant="gold"
            disabled={pending || !anyActual}
            onClick={() =>
              start(async () => {
                const r = await finishShoppingAction(weekId);
                notify(r);
                toast(`${live.filter((i) => i.purchased).length} items added to your pantry`, "quest");
                router.refresh();
              })
            }
          >
            <ShoppingBasket size={13} /> Done shopping → pantry
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await reopenShoppingAction(weekId); router.refresh(); })}>
            <Undo2 size={13} /> Reopen shopping
          </Button>
        )}
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.name}` : ""}>
        {editing && <EditItem it={editing} onDone={() => { setEditing(null); router.refresh(); }} />}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add item">
        <AddItem weekId={weekId} onDone={() => { setAdding(false); router.refresh(); }} />
      </Sheet>
    </section>
  );
}

function EditItem({ it, onDone }: { it: ItemVM; onDone: () => void }) {
  const [f, setF] = useState({ qty: String(it.qty), unit: it.unit, estPrice: it.estPrice != null ? String(it.estPrice) : "", actualQty: it.actualQty != null ? String(it.actualQty) : String(it.qty), actualPrice: it.actualPrice != null ? String(it.actualPrice) : "" });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 pb-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Planned qty">
          <input type="number" step="0.5" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className={cx(inputClass, "text-center")} />
        </Field>
        <Field label="Unit">
          <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Est. price $">
          <input type="number" step="0.01" value={f.estPrice} onChange={(e) => setF({ ...f, estPrice: e.target.value })} className={cx(inputClass, "text-center")} />
        </Field>
      </div>
      <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-gold">Actual (after shopping)</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Actual qty">
            <input type="number" step="0.1" value={f.actualQty} onChange={(e) => setF({ ...f, actualQty: e.target.value })} className={cx(inputClass, "text-center")} />
          </Field>
          <Field label="Actual price $">
            <input type="number" step="0.01" value={f.actualPrice} onChange={(e) => setF({ ...f, actualPrice: e.target.value })} className={cx(inputClass, "text-center")} autoFocus />
          </Field>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          full
          variant="gold"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await updateGroceryItemAction(it.id, { qty: Number(f.qty) || it.qty, unit: f.unit || it.unit, estPrice: f.estPrice === "" ? null : Number(f.estPrice), actualQty: f.actualQty === "" ? null : Number(f.actualQty), actualPrice: f.actualPrice === "" ? null : Number(f.actualPrice), purchased: f.actualPrice !== "" ? true : undefined });
              onDone();
            })
          }
        >
          Save
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await updateGroceryItemAction(it.id, { skipped: !it.skipped }); onDone(); })}>
          {it.skipped ? "Un-skip" : "Skip"}
        </Button>
        <Button variant="danger" disabled={pending} onClick={() => { if (window.confirm("Remove this item from the list?")) start(async () => { await deleteGroceryItemAction(it.id); onDone(); }); }}>
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}

function AddItem({ weekId, onDone }: { weekId: number; onDone: () => void }) {
  const [f, setF] = useState({ name: "", qty: "1", unit: "", estPrice: "" });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 pb-2">
      <Field label="Item">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. hot sauce" className={inputClass} autoFocus />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Qty">
          <input type="number" step="0.5" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className={cx(inputClass, "text-center")} />
        </Field>
        <Field label="Unit">
          <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="auto" className={inputClass} />
        </Field>
        <Field label="Est. $">
          <input type="number" step="0.01" value={f.estPrice} onChange={(e) => setF({ ...f, estPrice: e.target.value })} placeholder="auto" className={cx(inputClass, "text-center")} />
        </Field>
      </div>
      <Button full variant="gold" disabled={pending || !f.name.trim()} onClick={() => start(async () => { await addGroceryItemAction(weekId, { name: f.name, qty: Number(f.qty) || 1, unit: f.unit || undefined, estPrice: f.estPrice === "" ? undefined : Number(f.estPrice) }); onDone(); })}>
        Add to list
      </Button>
    </div>
  );
}
