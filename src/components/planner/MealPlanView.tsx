"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Check, MoreHorizontal, SkipForward, Replace, Pencil, Trash2, Undo2, ChefHat } from "lucide-react";
import { discardMealPlanAction, generateMealsAction, logNutritionAction, replacePlannedMealAction, setPlannedMealStatusAction, updatePlannedMealAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";

export interface MealVM {
  id: number;
  index: number;
  mealType: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  recipeId?: number | null;
  notes?: string | null;
  /** planned | prepared | eaten | skipped | replaced | discarded */
  status: string;
  source: string;
}

const STATUS_LABEL: Record<string, string> = { planned: "", prepared: "Prepped", eaten: "Eaten", skipped: "Skipped", replaced: "Replaced" };

/**
 * Today's plan with a real lifecycle. Generated ≠ eaten: only "Ate this" writes
 * calories. Skip / replace / edit / discard are all one tap, all reversible.
 */
export function MealPlanView({ plan, aiEnabled, onAdjustOffer, hideDone }: { plan: { source: string; calorieTarget: number; proteinTarget: number; meals: MealVM[] } | null; aiEnabled: boolean; onAdjustOffer?: (unplanned: string) => void; /** Show only what is still to come (eaten/skipped hidden). */ hideDone?: boolean }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [onHand, setOnHand] = useState("");
  const [request, setRequest] = useState("");
  const [showOpts, setShowOpts] = useState(false);
  const [eating, setEating] = useState<MealVM | null>(null);
  const [menu, setMenu] = useState<MealVM | null>(null);
  const [editing, setEditing] = useState<MealVM | null>(null);
  const [replacing, setReplacing] = useState<MealVM | null>(null);

  const generate = (opts: { force?: boolean } = {}) =>
    start(async () => {
      const r = await generateMealsAction({ force: opts.force, onHand: onHand.split(",").map((s) => s.trim()).filter(Boolean), request: request || undefined });
      if (r.error) toast(`AI unavailable — used templates (${r.error.slice(0, 60)})`, "error");
      else toast(r.source === "ai" ? "Meal plan built by AI" : "Meal plan built from your recipes", "quest");
      setShowOpts(false);
      router.refresh();
    });

  const all = plan ? plan.meals.filter((m) => m.status !== "replaced" && m.status !== "discarded") : [];
  const visible = hideDone ? all.filter((m) => m.status === "planned" || m.status === "prepared") : all;
  const live = all.filter((m) => m.status !== "skipped");
  const totals = live.reduce((a, m) => ({ c: a.c + m.calories, p: a.p + m.protein }), { c: 0, p: 0 });
  const eatenTotals = visible.filter((m) => m.status === "eaten").reduce((a, m) => ({ c: a.c + m.calories, p: a.p + m.protein }), { c: 0, p: 0 });

  return (
    <>
      {plan && all.length > 0 && visible.length === 0 ? (
        <section className="plate px-4 py-4 text-center">
          <p className="serif text-[14px] text-muted">Nothing left on today&apos;s plan.</p>
          <div className="mt-2 flex justify-center gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => generate({ force: true })}>
              <RefreshCw size={13} /> New plan
            </Button>
          </div>
        </section>
      ) : !plan || visible.length === 0 ? (
        <section className="plate p-5 text-center">
          <Sparkles size={26} className="mx-auto text-gold" />
          <div className="display mt-3 text-lg font-semibold">Generate today&apos;s meals</div>
          <p className="serif mt-1 text-[14px] text-muted">{aiEnabled ? "Built around your targets, preferences and what you have." : "Assembled from your recipe catalog to hit your calorie and protein targets."} A plan is a suggestion — nothing counts until you mark it eaten.</p>
          <div className="mt-4 space-y-2">
            <input value={onHand} onChange={(e) => setOnHand(e.target.value)} placeholder="Ingredients on hand (optional): chicken, rice, eggs" className={inputClass} />
            <Button onClick={() => generate({ force: !!plan })} disabled={pending} full variant="gold">
              {pending ? "Building…" : "Generate today's meals"}
            </Button>
          </div>
        </section>
      ) : (
        <section className="plate overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="text-xs text-muted">
              {plan.source === "ai" ? "AI plan" : "Template plan"} · {totals.c} kcal · {totals.p} g protein planned
              {eatenTotals.c > 0 && <span className="text-success"> · {eatenTotals.c} kcal eaten</span>}
            </div>
          </div>
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {visible.map((m) => (
              <li key={m.id} className={cx("flex items-center gap-2 px-4 py-3", (m.status === "eaten" || m.status === "skipped") && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-faint">
                    {m.mealType}
                    {STATUS_LABEL[m.status] && <span className={cx("rounded-full px-1.5 py-0.5 text-[9px]", m.status === "eaten" ? "bg-success/15 text-success" : m.status === "prepared" ? "bg-accent/15 text-accent-2" : "bg-white/5 text-muted")}>{STATUS_LABEL[m.status]}</span>}
                    {m.source === "adjust" && <span className="rounded-full bg-gold/10 px-1.5 py-0.5 text-[9px] text-gold">Adjusted</span>}
                  </div>
                  <div className={cx("text-[15px] font-medium", m.status === "skipped" && "line-through decoration-faint")}>{m.name}</div>
                  <div className="serif text-[12.5px] text-muted">
                    {m.calories} kcal · {m.protein} g protein{m.ingredients.length ? ` · ${m.ingredients.slice(0, 4).join(", ")}` : ""}
                  </div>
                </div>
                {m.status === "eaten" ? (
                  <span className="flex h-9 items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-3 text-xs font-medium text-success">
                    <Check size={13} /> Ate this
                  </span>
                ) : m.status === "skipped" ? (
                  <button disabled={pending} onClick={() => start(async () => { await setPlannedMealStatusAction(m.id, "planned"); router.refresh(); })} className="press flex h-9 items-center gap-1 rounded-sm border border-border px-3 text-xs text-text-2">
                    <Undo2 size={13} /> Undo
                  </button>
                ) : (
                  <button onClick={() => setEating(m)} className="press h-9 shrink-0 rounded-sm bg-gradient-to-b from-gold-2 to-gold px-3 text-xs font-semibold text-[#1a1406]" style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}>
                    Ate this
                  </button>
                )}
                <button aria-label={`Options for ${m.name}`} onClick={() => setMenu(m)} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint hover:bg-white/5">
                  <MoreHorizontal size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => generate({ force: true })}>
              <RefreshCw size={13} /> Regenerate
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setShowOpts((v) => !v)}>
              With options…
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm("Discard the remaining planned meals for today? Eaten meals stay logged.")) start(async () => { await discardMealPlanAction(); router.refresh(); }); }}>
              <Trash2 size={13} /> Discard plan
            </Button>
          </div>
          {showOpts && (
            <div className="space-y-2 border-t border-border/60 px-4 py-3">
              <input value={onHand} onChange={(e) => setOnHand(e.target.value)} placeholder="Ingredients on hand: chicken, rice, avocado" className={inputClass} />
              <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder={aiEnabled ? "Request: dinner under 700 kcal with 45g protein" : "Requests need AI; on-hand ingredients work without it"} className={inputClass} maxLength={300} />
              <Button size="sm" disabled={pending} onClick={() => generate({ force: true })}>
                Rebuild plan
              </Button>
            </div>
          )}
        </section>
      )}

      <EatSheet meal={eating} onClose={() => setEating(null)} onLogged={(fb) => { notify(fb); setEating(null); router.refresh(); }} />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <div className="space-y-2 pb-2">
            {menu.status !== "prepared" && (
              <Button full variant="secondary" disabled={pending} onClick={() => start(async () => { await setPlannedMealStatusAction(menu.id, "prepared"); setMenu(null); router.refresh(); })}>
                <ChefHat size={14} /> Mark as prepped
              </Button>
            )}
            <Button full variant="secondary" disabled={pending} onClick={() => { setEditing(menu); setMenu(null); }}>
              <Pencil size={14} /> Edit calories / name
            </Button>
            <Button full variant="secondary" disabled={pending} onClick={() => { setReplacing(menu); setMenu(null); }}>
              <Replace size={14} /> Replace with something else
            </Button>
            <Button full variant="secondary" disabled={pending} onClick={() => start(async () => { await setPlannedMealStatusAction(menu.id, "skipped"); setMenu(null); router.refresh(); })}>
              <SkipForward size={14} /> Skip this meal
            </Button>
            {menu.status === "eaten" && (
              <Button full variant="secondary" disabled={pending} onClick={() => start(async () => { await setPlannedMealStatusAction(menu.id, "planned"); setMenu(null); toast("Un-eaten: calories and XP reversed", "quest"); router.refresh(); })}>
                <Undo2 size={14} /> I didn&apos;t actually eat this
              </Button>
            )}
            <Button full variant="danger" disabled={pending} onClick={() => start(async () => { await setPlannedMealStatusAction(menu.id, "discarded"); setMenu(null); router.refresh(); })}>
              <Trash2 size={14} /> Remove from plan
            </Button>
            <p className="serif px-1 text-center text-[12px] text-muted">Skipping or replacing never costs anything. Plans serve you, not the other way around.</p>
          </div>
        )}
      </Sheet>

      <EditMealSheet meal={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
      <ReplaceMealSheet meal={replacing} onClose={() => setReplacing(null)} onSaved={() => { setReplacing(null); router.refresh(); }} onLogInstead={(m) => { setReplacing(null); onAdjustOffer?.(m.name); }} />
    </>
  );
}

function EatSheet({ meal, onClose, onLogged }: { meal: MealVM | null; onClose: () => void; onLogged: (fb: Awaited<ReturnType<typeof logNutritionAction>>) => void }) {
  const [portion, setPortion] = useState(1);
  const [cooked, setCooked] = useState(true);
  const [pending, start] = useTransition();
  if (!meal) return null;
  const est = (n: number) => Math.round(n * portion);
  return (
    <Sheet
      open
      onClose={onClose}
      title={meal.name}
      footer={
        <Button
          full
          variant="gold"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await logNutritionAction({ mealType: meal.mealType as "breakfast", name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, source: "plan", recipeId: meal.recipeId ?? null, plannedMealId: meal.id, cooked, portion });
              onLogged(r);
            })
          }
        >
          {pending ? "Logging…" : `Log ${est(meal.calories)} kcal · ${est(meal.protein)} g protein`}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Portion" group>
          <div className="flex gap-2">
            {[0.5, 0.75, 1, 1.25, 1.5].map((p) => (
              <button key={p} onClick={() => setPortion(p)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", p === portion ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                {p === 1 ? "As planned" : `${p}×`}
              </button>
            ))}
          </div>
        </Field>
        <div className="card-2 grid grid-cols-4 gap-2 px-3 py-2.5 text-center text-xs">
          {[
            ["kcal", est(meal.calories)],
            ["protein", est(meal.protein)],
            ["carbs", est(meal.carbs)],
            ["fat", est(meal.fat)],
          ].map(([l, v]) => (
            <div key={l as string}>
              <div className="tabular text-base font-semibold">{v as number}</div>
              <div className="text-muted">{l}</div>
            </div>
          ))}
        </div>
        <label className={cx("flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-3", cooked ? "border-accent/50 bg-accent/10" : "border-border bg-card-2")}>
          <div>
            <div className="text-sm font-medium">I cooked this myself</div>
            <div className="text-xs text-muted">Counts toward your cooking rank (+15 XP).</div>
          </div>
          <input type="checkbox" checked={cooked} onChange={(e) => setCooked(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
      </div>
    </Sheet>
  );
}

function EditMealSheet({ meal, onClose, onSaved }: { meal: MealVM | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (!meal) return null;
  const v = (k: "name" | "calories" | "protein" | "carbs" | "fat") => f[k] ?? String(meal[k]);
  return (
    <Sheet open onClose={onClose} title="Edit planned meal" footer={<Button full variant="gold" disabled={pending} onClick={() => start(async () => { await updatePlannedMealAction(meal.id, { name: v("name"), calories: Number(v("calories")), protein: Number(v("protein")), carbs: Number(v("carbs")), fat: Number(v("fat")) }); onSaved(); })}>Save</Button>}>
      <div className="space-y-3 pb-2">
        <Field label="Name">
          <input value={v("name")} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputClass} />
        </Field>
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

function ReplaceMealSheet({ meal, onClose, onSaved, onLogInstead }: { meal: MealVM | null; onClose: () => void; onSaved: () => void; onLogInstead: (m: MealVM) => void }) {
  const [f, setF] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [pending, start] = useTransition();
  if (!meal) return null;
  return (
    <Sheet open onClose={onClose} title={`Replace ${meal.mealType}`}>
      <div className="space-y-3 pb-2">
        <p className="serif text-[13.5px] text-muted">Planning something different for this slot? Enter it here. If you already ate something else, log it from “Log food” and mark it as replacing this meal.</p>
        <Field label="New planned meal">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Leftover chili" className={inputClass} />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <Field key={k} label={k === "calories" ? "kcal" : k}>
              <input type="number" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "px-2 text-center")} />
            </Field>
          ))}
        </div>
        <Button full variant="gold" disabled={pending || !f.name.trim() || !f.calories} onClick={() => start(async () => { await replacePlannedMealAction(meal.id, { name: f.name.trim(), calories: Number(f.calories), protein: Number(f.protein) || 0, carbs: Number(f.carbs) || 0, fat: Number(f.fat) || 0 }); onSaved(); })}>
          Replace in plan
        </Button>
        <Button full variant="secondary" onClick={() => onLogInstead(meal)}>
          I already ate something else — log it
        </Button>
      </div>
    </Sheet>
  );
}
