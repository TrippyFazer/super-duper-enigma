"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Pencil, ShoppingBasket, Undo2, HelpCircle, RefreshCw } from "lucide-react";
import { addGroceryItemAction, deleteGroceryItemAction, dontRecommendAction, finishShoppingAction, pantryCheckAction, reconcileListAction, reopenShoppingAction, replaceGroceryItemAction, setCoverageOverrideAction, updateGroceryItemAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { CATEGORY_LABEL, CATEGORY_ORDER, type GroceryCategory } from "@/food/ingredients";
import { substituteOptionsFor } from "@/food/rules";

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
  /** full | partial | none | confirm | manual | stock-up | null (hand-added) */
  coverage?: string | null;
  requiredServings?: number | null;
  onHandServings?: number | null;
  substitutedFrom?: string | null;
  usedInCounts?: { name: string; count: number }[];
}

const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);
const usedInText = (it: ItemVM) => (it.usedInCounts?.length ? it.usedInCounts.slice(0, 3).map((u) => (u.count > 1 ? `${u.name} ×${u.count}` : u.name)).join(", ") + (it.usedInCounts.length > 3 ? "…" : "") : it.usedIn.slice(0, 3).join(", "));

/**
 * The list is WHAT THE PLAN NEEDS minus WHAT YOU HAVE. Sections:
 *   Check your pantry  – vague items ("Some") that matter: Yes / Low / Out
 *   Buy                – nothing (compatible) in the pantry
 *   Partial            – some on hand, buy the difference
 *   Already have       – covered, with the reason, and a "Buy anyway" escape
 * Every row says why it is there: used in, pantry have, buy.
 */
export function ShoppingList({ weekId, status, items, budget, embedded, reconciled }: { weekId: number; status: string; items: ItemVM[]; budget: number; embedded?: boolean; reconciled?: { at: string; note: string } | null }) {
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
  const confirm = live.filter((i) => i.coverage === "confirm" && !i.purchased);
  const partial = live.filter((i) => i.coverage === "partial" && !confirm.includes(i));
  const buy = live.filter((i) => !confirm.includes(i) && !partial.includes(i));
  const shopped = status === "shopped" || status === "reviewed";
  const fresh = reconciled && Date.now() - new Date(reconciled.at).getTime() < 36 * 3600 * 1000;

  const toggle = (it: ItemVM) => start(async () => { await updateGroceryItemAction(it.id, { purchased: !it.purchased }); router.refresh(); });
  const answer = (it: ItemVM, a: "yes" | "low" | "out") =>
    start(async () => {
      await pantryCheckAction(it.id, a);
      toast(a === "yes" ? `${cap(it.name)} marked as enough` : a === "low" ? `Buying the rest of the ${it.name}` : `Buying ${it.name}`, "quest");
      router.refresh();
    });

  const Row = ({ it, kind }: { it: ItemVM; kind: "buy" | "partial" }) => (
    <li className={cx("flex items-center gap-2 px-4 py-2", it.skipped && "opacity-50")}>
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
          {kind === "partial" && <span className="ml-1.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gold">partial</span>}
          {it.coverage === "stock-up" && it.onHandServings != null && it.onHandServings > 0 && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">buy anyway</span>}
        </div>
        <div className="truncate text-[11px] text-muted">
          {it.purchased && it.actualPrice != null ? <span className="text-text-2">{money(it.actualPrice)} paid</span> : <span>~{money(it.estPrice)}</span>}
          {usedInText(it) ? ` · for ${usedInText(it)}` : ""}
          {kind === "partial" && it.onHandServings != null ? ` · have ~${it.onHandServings} of ${it.requiredServings} servings` : ""}
          {it.substitutedFrom ? ` · instead of ${it.substitutedFrom}` : ""}
        </div>
      </div>
      <button aria-label={`Edit ${it.name}`} onClick={() => setEditing(it)} className="press flex h-11 w-11 items-center justify-center rounded-full text-faint hover:bg-white/5">
        <Pencil size={13} />
      </button>
    </li>
  );

  const grouped = (list: ItemVM[], kind: "buy" | "partial") =>
    CATEGORY_ORDER.filter((c) => list.some((i) => i.category === c)).map((cat) => (
      <div key={`${kind}-${cat}`}>
        <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-faint">{CATEGORY_LABEL[cat as GroceryCategory]}</div>
        <ul className="divide-y divide-border/60">
          {list.filter((i) => i.category === cat).map((it) => <Row key={it.id} it={it} kind={kind} />)}
        </ul>
      </div>
    ));

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
      {fresh && (
        <p className="flex items-center gap-1.5 border-b border-border/60 bg-gold/5 px-4 py-1.5 text-[11px] text-gold" data-testid="list-reconciled">
          <RefreshCw size={11} /> List updated from your pantry · {reconciled!.note}
        </p>
      )}
      <p className="px-4 pt-2 text-[11px] text-faint">The list is what the plan needs minus what you have. Tap an item to mark it bought; the pencil has quantities, prices and swaps.</p>

      {confirm.length > 0 && (
        <div data-testid="pantry-check">
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gold">
            <HelpCircle size={11} /> Check your pantry
          </div>
          <ul className="divide-y divide-border/60">
            {confirm.map((it) => (
              <li key={it.id} className="px-4 py-2">
                <div className="text-sm capitalize">{it.name}</div>
                <div className="text-[11.5px] text-muted">{it.note ?? `Need ~${it.requiredServings} servings.`} Enough?</div>
                <div className="mt-1.5 flex gap-1.5">
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => answer(it, "yes")}>Yes, enough</Button>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => answer(it, "low")}>Low</Button>
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => answer(it, "out")}>Out</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {buy.length > 0 && (
        <div data-testid="list-buy">
          <div className="px-4 pt-3 text-[10px] uppercase tracking-wider text-gold">Buy</div>
          {grouped(buy, "buy")}
        </div>
      )}
      {partial.length > 0 && (
        <div data-testid="list-partial">
          <div className="px-4 pt-3 text-[10px] uppercase tracking-wider text-gold">Partial · buy the difference</div>
          {grouped(partial, "partial")}
        </div>
      )}
      {buy.length === 0 && partial.length === 0 && confirm.length === 0 && <p className="serif px-4 py-3 text-[13px] text-muted">Nothing to buy — your pantry covers the plan.</p>}

      {covered.length > 0 && (
        <div className="px-4 pt-3 pb-1" data-testid="list-have">
          <div className="text-[10px] uppercase tracking-wider text-faint">Already have · {covered.length}</div>
          <ul className="mt-1 space-y-1">
            {covered.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  <span className="capitalize">{c.name}</span>
                  <span className="serif text-muted"> — {c.note ?? "in your pantry"}</span>
                </span>
                <button className="press shrink-0 text-[11px] text-gold underline decoration-dotted" disabled={pending} onClick={() => start(async () => { await setCoverageOverrideAction(c.id, "stock-up"); router.refresh(); })}>
                  Buy anyway
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add item
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await reconcileListAction(weekId); toast(r.changes.length ? `Updated: ${r.changes.slice(0, 2).join(" · ")}` : "List already matches your pantry", "quest"); router.refresh(); })}>
          <RefreshCw size={12} /> Re-check pantry
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function EditItem({ it, onDone }: { it: ItemVM; onDone: () => void }) {
  const { toast } = useFeedback();
  const [f, setF] = useState({ qty: String(it.qty), unit: it.unit, estPrice: it.estPrice != null ? String(it.estPrice) : "", actualQty: it.actualQty != null ? String(it.actualQty) : String(it.qty), actualPrice: it.actualPrice != null ? String(it.actualPrice) : "" });
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"edit" | "replace" | "dont">("edit");
  const [replacement, setReplacement] = useState("");
  const [dontMode, setDontMode] = useState<"avoid" | "substitute">("substitute");
  const [sub, setSub] = useState("");
  const options = substituteOptionsFor(it.name);
  const derived = it.coverage != null && it.coverage !== "stock-up" ? true : it.usedIn.length > 0;
  return (
    <div className="space-y-3 pb-2">
      {it.note && <p className="serif text-[12.5px] text-muted">{it.note}</p>}
      <Segmented value={mode} onChange={setMode} options={[{ value: "edit", label: "Quantity" }, { value: "replace", label: "Replace" }, { value: "dont", label: "Don't recommend" }]} />
      {mode === "edit" && (
        <>
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
          {derived && (
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              {!it.coveredByPantry && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await setCoverageOverrideAction(it.id, "manual"); toast(`${cap(it.name)} marked as on hand`, "quest"); onDone(); })}>
                  I already have this
                </Button>
              )}
              {it.coverage !== "stock-up" && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await setCoverageOverrideAction(it.id, "stock-up"); onDone(); })}>
                  Buy anyway
                </Button>
              )}
              {(it.coverage === "manual" || it.coverage === "stock-up") && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await setCoverageOverrideAction(it.id, null); onDone(); })}>
                  Back to automatic
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {mode === "replace" && (
        <div className="space-y-2">
          <p className="serif text-[12.5px] text-muted">Swap {it.name} for something else. The meals that use it are updated, and the substitute is what goes into your pantry.</p>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o} onClick={() => setReplacement(o)} className={cx("press rounded-full border px-2.5 py-1 text-[12px] capitalize", replacement === o ? "border-gold bg-gold/15 text-gold" : "border-border text-text-2")}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <Field label="Replace with">
            <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="e.g. lactose-free milk" className={inputClass} />
          </Field>
          <Button full variant="gold" disabled={pending || !replacement.trim()} onClick={() => start(async () => { const r = await replaceGroceryItemAction(it.id, replacement); if (!r.ok) toast(r.error ?? "Could not replace", "error"); else toast(`Replaced with ${r.name}`, "quest"); onDone(); })}>
            Replace item
          </Button>
        </div>
      )}
      {mode === "dont" && (
        <div className="space-y-2">
          <p className="serif text-[12.5px] text-muted">Never see {it.name} again? This becomes a food rule and applies to every plan, AI or not.</p>
          <Segmented value={dontMode} onChange={setDontMode} options={[{ value: "substitute", label: "Use a substitute" }, { value: "avoid", label: "Avoid entirely" }]} />
          {dontMode === "substitute" && (
            <>
              {options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((o) => (
                    <button key={o} onClick={() => setSub(o)} className={cx("press rounded-full border px-2.5 py-1 text-[12px] capitalize", sub === o ? "border-gold bg-gold/15 text-gold" : "border-border text-text-2")}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              <Field label="Preferred substitute">
                <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="e.g. oat milk" className={inputClass} />
              </Field>
            </>
          )}
          <Button
            full
            variant="gold"
            disabled={pending || (dontMode === "substitute" && !sub.trim())}
            onClick={() =>
              start(async () => {
                const r = await dontRecommendAction({ target: it.name, mode: dontMode, substitute: dontMode === "substitute" ? sub : null });
                toast(r.repaired ? `Rule saved · ${r.repaired} planned meal${r.repaired === 1 ? "" : "s"} adjusted` : "Rule saved", "quest");
                onDone();
              })
            }
          >
            Save rule
          </Button>
        </div>
      )}
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
