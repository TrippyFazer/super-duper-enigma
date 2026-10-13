"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Check } from "lucide-react";
import { generateMealsAction, logNutritionAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, cx, inputClass } from "@/components/ui/primitives";

interface MealVM {
  index: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  recipeId?: number | null;
  notes?: string;
  eaten: boolean;
}

export function MealPlanView({ plan, aiEnabled }: { plan: { source: string; calorieTarget: number; proteinTarget: number; meals: MealVM[] } | null; aiEnabled: boolean }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [onHand, setOnHand] = useState("");
  const [request, setRequest] = useState("");
  const [showOpts, setShowOpts] = useState(false);
  const [eating, setEating] = useState<MealVM | null>(null);

  const generate = (opts: { force?: boolean } = {}) =>
    start(async () => {
      const r = await generateMealsAction({ force: opts.force, onHand: onHand.split(",").map((s) => s.trim()).filter(Boolean), request: request || undefined });
      if (r.error) toast(`AI unavailable — used templates (${r.error.slice(0, 60)})`, "error");
      else toast(r.source === "ai" ? "Meal plan built by AI" : "Meal plan built from your recipes", "quest");
      setShowOpts(false);
      router.refresh();
    });

  const totals = plan ? plan.meals.reduce((a, m) => ({ c: a.c + m.calories, p: a.p + m.protein, cb: a.cb + m.carbs, f: a.f + m.fat }), { c: 0, p: 0, cb: 0, f: 0 }) : null;

  return (
    <>
      {!plan ? (
        <section className="plate p-5 text-center">
          <Sparkles size={26} className="mx-auto text-gold" />
          <div className="display mt-3 text-lg font-semibold">Generate today&apos;s meals</div>
          <p className="serif mt-1 text-[14px] text-muted">{aiEnabled ? "Built around your targets, preferences and what you have." : "Assembled from your recipe catalog to hit your calorie and protein targets."}</p>
          <div className="mt-4 space-y-2">
            <input value={onHand} onChange={(e) => setOnHand(e.target.value)} placeholder="Ingredients on hand (optional): chicken, rice, eggs" className={inputClass} />
            <Button onClick={() => generate()} disabled={pending} full variant="gold">
              {pending ? "Building…" : "Generate today's meals"}
            </Button>
          </div>
        </section>
      ) : (
        <section className="plate overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="text-xs text-muted">
              {plan.source === "ai" ? "AI plan" : "Template plan"} · {totals!.c} kcal · {totals!.p} g protein · {totals!.cb} g carbs · {totals!.f} g fat
            </div>
          </div>
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {plan.meals.map((m) => (
              <li key={m.index} className={cx("flex items-center gap-3 px-4 py-3", m.eaten && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-faint">{m.mealType}</div>
                  <div className={cx("text-[15px] font-medium", m.eaten && "line-through decoration-faint")}>{m.name}</div>
                  <div className="serif text-[12.5px] text-muted">
                    {m.calories} kcal · {m.protein} g protein{m.ingredients.length ? ` · ${m.ingredients.slice(0, 4).join(", ")}` : ""}
                  </div>
                </div>
                {m.eaten ? (
                  <span className="flex h-9 items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-3 text-xs font-medium text-success">
                    <Check size={13} /> Ate this
                  </span>
                ) : (
                  <button onClick={() => setEating(m)} className="press h-9 shrink-0 rounded-sm bg-gradient-to-b from-gold-2 to-gold px-3 text-xs font-semibold text-[#1a1406]" style={{ clipPath: "polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)" }}>
                    Ate this
                  </button>
                )}
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
              const r = await logNutritionAction({ mealType: meal.mealType, name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, source: "plan", recipeId: meal.recipeId ?? null, planMealIndex: meal.index, cooked, portion });
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
