"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, ChevronLeft, CalendarCheck, Leaf, Coins, Sparkles, ShoppingBasket, ChefHat, Dumbbell, Swords, Flag, RefreshCw, Undo2 } from "lucide-react";
import { completePrepAction, generateWeekAction, leftoverReviewAction, saveTrainingDaysAction, skipPrepAction, uncompletePrepAction, upsertWeekAction } from "@/actions/food";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { ShoppingList, type ItemVM } from "./ShoppingList";
import { WeekFeedbackCard } from "./WeekFeedbackCard";
import type { WeekFeedback } from "@/services/foodWeek";

export interface WeekPlannerProps {
  today: string;
  weekStart: string;
  weekLabel: string;
  week: {
    id: number;
    status: string;
    source: string;
    budget: number;
    budgetMode: "budget" | "balanced" | "flexible";
    calorieTarget: number;
    proteinTarget: number;
    mealsNeeded: { breakfast: number; lunch: number; dinner: number; snacks: number; eatingOut: number };
    prefs: { quickWeekdays: boolean; mealPrep: boolean; highProtein: boolean; reuseIngredients: boolean; notes?: string };
    estimatedCost: number | null;
    actualCost: number | null;
    summary: { reusePct?: number; rationale?: string; distinctRecipes?: number; coveredByPantry?: number; staplesAssumed?: string[] };
    items: ItemVM[];
    prep: { id: number; status: string; estimatedMinutes: number; items: { name: string; servings: number; minutes: number; supports: string[] }[]; supports: string[] } | null;
    days: { date: string; label: string; meals: { id: number; mealType: string; name: string; calories: number; protein: number; status: string; prepMinutes: number | null }[] }[];
  } | null;
  defaults: { budget: number; budgetMode: "budget" | "balanced" | "flexible"; calorieTarget: number; proteinTarget: number; eatingOut: number; quickWeekdays: boolean; mealPrep: boolean; highProtein: boolean; reuseIngredients: boolean };
  pantry: { id: number; name: string; level: string | null; qty: number | null; unit: string }[];
  lastWeek: WeekFeedback | null;
  lastWeekReviewed: boolean;
  weeklyQuests: { id: number; title: string; rewardXp: number; done: boolean; progress: number; target: number }[];
  trainingDays: number[];
  aiEnabled: boolean;
}

const STEPS = [
  { key: "review", label: "Review", icon: CalendarCheck },
  { key: "leftovers", label: "Leftovers", icon: Leaf },
  { key: "budget", label: "Budget", icon: Coins },
  { key: "meals", label: "Meals", icon: Sparkles },
  { key: "shop", label: "Shopping", icon: ShoppingBasket },
  { key: "prep", label: "Prep", icon: ChefHat },
  { key: "training", label: "Training", icon: Dumbbell },
  { key: "quests", label: "Quests", icon: Swords },
  { key: "ready", label: "Ready", icon: Flag },
] as const;
type StepKey = (typeof STEPS)[number]["key"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The Sunday reset: one stepper that prepares the next chapter. Every step is skippable and revisitable. */
export function WeekPlanner(p: WeekPlannerProps) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const storageKey = `ascend:week:${p.weekStart}`;
  const initialStep = (): StepKey => {
    if (!p.week) return p.lastWeek && !p.lastWeekReviewed ? "review" : "budget";
    if (p.week.status === "planning") return "budget";
    if (p.week.status === "planned") return p.week.items.some((i) => i.purchased) ? "shop" : "meals";
    return "prep";
  };
  const [step, setStep] = useState<StepKey>(initialStep);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as StepKey | null;
      if (saved && STEPS.some((s) => s.key === saved)) setStep(saved);
    } catch {}
  }, [storageKey]);
  const go = (k: StepKey) => {
    setStep(k);
    try {
      localStorage.setItem(storageKey, k);
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idx = STEPS.findIndex((s) => s.key === step);
  const next = () => go(STEPS[Math.min(STEPS.length - 1, idx + 1)].key);
  const back = () => go(STEPS[Math.max(0, idx - 1)].key);

  // ---- budget form
  const w = p.week;
  const [f, setF] = useState({
    budget: String(w?.budget ?? p.defaults.budget),
    budgetMode: (w?.budgetMode ?? p.defaults.budgetMode) as "budget" | "balanced" | "flexible",
    calorieTarget: String(w?.calorieTarget ?? p.defaults.calorieTarget),
    proteinTarget: String(w?.proteinTarget ?? p.defaults.proteinTarget),
    breakfast: String(w?.mealsNeeded.breakfast ?? 7),
    lunch: String(w?.mealsNeeded.lunch ?? 5),
    dinner: String(w?.mealsNeeded.dinner ?? 7 - p.defaults.eatingOut),
    snacks: String(w?.mealsNeeded.snacks ?? 1),
    eatingOut: String(w?.mealsNeeded.eatingOut ?? p.defaults.eatingOut),
    quickWeekdays: w?.prefs.quickWeekdays ?? p.defaults.quickWeekdays,
    mealPrep: w?.prefs.mealPrep ?? p.defaults.mealPrep,
    highProtein: w?.prefs.highProtein ?? p.defaults.highProtein,
    reuseIngredients: w?.prefs.reuseIngredients ?? p.defaults.reuseIngredients,
    notes: w?.prefs.notes ?? "",
  });
  const saveBudget = (thenGenerate: boolean) =>
    start(async () => {
      const r = await upsertWeekAction({ weekStart: p.weekStart, budget: Number(f.budget) || 0, budgetMode: f.budgetMode, calorieTarget: Number(f.calorieTarget), proteinTarget: Number(f.proteinTarget), mealsNeeded: { breakfast: Number(f.breakfast), lunch: Number(f.lunch), dinner: Number(f.dinner), snacks: Number(f.snacks), eatingOut: Number(f.eatingOut) }, prefs: { quickWeekdays: f.quickWeekdays, mealPrep: f.mealPrep, highProtein: f.highProtein, reuseIngredients: f.reuseIngredients, notes: f.notes || undefined } });
      if (thenGenerate) {
        const g = await generateWeekAction(r.id, !!w && w.status !== "planning");
        if (!g.ok) toast(g.error ?? "Could not generate", "error");
        else toast(g.source === "ai" ? "Week planned by AI" : "Week planned from your recipes", "quest");
      }
      router.refresh();
      go("meals");
    });

  // ---- leftovers
  const [levels, setLevels] = useState<Record<number, "none" | "some" | "lot">>(() => Object.fromEntries(p.pantry.map((x) => [x.id, (x.level as "none" | "some" | "lot") ?? "some"])));

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className={cx("press rounded-full border px-3 py-1.5 text-xs", on ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="scroll-x -mx-4 flex gap-1.5 px-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < idx;
          return (
            <button key={s.key} onClick={() => go(s.key)} className={cx("press flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px]", s.key === step ? "border-gold/60 bg-gold/12 text-gold" : done ? "border-success/40 text-success" : "border-border bg-card text-muted")}>
              {done ? <Check size={11} /> : <Icon size={11} />} {s.label}
            </button>
          );
        })}
      </div>

      {step === "review" && (
        <section className="space-y-3">
          <Title eyebrow="Step 1" title="How did last week go?" body="A quick look back before planning forward. Nothing here is a judgement — it's information for next week's plan." />
          {p.lastWeek ? <WeekFeedbackCard fb={p.lastWeek} title="Last week" /> : <div className="plate serif px-4 py-4 text-[14px] text-muted">No food week recorded yet. This will fill in once you plan and shop a week.</div>}
          <Link href="/progress/review" className="plate press flex items-center gap-3 px-4 py-3">
            <CalendarCheck size={16} className="text-gold" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Weekly review</div>
              <div className="serif text-[13px] text-muted">What moved, what slipped, what to focus on across every domain.</div>
            </div>
            <ChevronRight size={16} className="text-faint" />
          </Link>
        </section>
      )}

      {step === "leftovers" && (
        <section className="space-y-3">
          <Title eyebrow="Step 2" title="What do you still have?" body="Tap a level for each item. Anything you still have is skipped or reduced on the new shopping list." />
          {p.pantry.length === 0 ? (
            <div className="plate serif px-4 py-4 text-[14px] text-muted">
              Your pantry is empty. Add items on the{" "}
              <Link href="/planner/pantry" className="text-gold underline">
                Pantry
              </Link>{" "}
              screen, or skip this — the first shopping trip fills it automatically.
            </div>
          ) : (
            <div className="plate divide-y divide-border/60 p-0">
              {p.pantry.map((it) => (
                <div key={it.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm capitalize">
                    {it.name}
                    {it.qty != null && (
                      <span className="text-muted">
                        {" "}
                        · {it.qty} {it.unit}
                      </span>
                    )}
                  </div>
                  <div className="flex rounded-lg border border-border bg-black/30 p-0.5">
                    {(["none", "some", "lot"] as const).map((l) => (
                      <button key={l} onClick={() => setLevels({ ...levels, [it.id]: l })} className={cx("press rounded-md px-2.5 py-1 text-[11px]", levels[it.id] === l ? "bg-card-2 text-text" : "text-muted")}>
                        {l === "lot" ? "A lot" : l[0].toUpperCase() + l.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            full
            variant="gold"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await leftoverReviewAction(p.lastWeek ? null : null, Object.entries(levels).map(([id, level]) => ({ pantryId: Number(id), level })));
                toast(`${r.carried} item${r.carried === 1 ? "" : "s"} carried into this week's plan`, "quest");
                router.refresh();
                next();
              })
            }
          >
            Save leftovers &amp; continue
          </Button>
        </section>
      )}

      {step === "budget" && (
        <section className="space-y-3">
          <Title eyebrow="Step 3" title="Budget, targets, meals" body={`Planning ${p.weekLabel}. Set the grocery budget and what you actually need — eating out is a plan too, not a failure.`} />
          <div className="plate space-y-4 px-4 py-4">
            <Field label="Weekly grocery budget $">
              <input type="number" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Mode" group hint="Budget trims hardest; flexible allows ~25% over for variety">
              <Segmented
                value={f.budgetMode}
                onChange={(v) => setF({ ...f, budgetMode: v })}
                options={[
                  { value: "budget", label: "Budget" },
                  { value: "balanced", label: "Balanced" },
                  { value: "flexible", label: "Flexible" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calories / day">
                <input type="number" inputMode="numeric" value={f.calorieTarget} onChange={(e) => setF({ ...f, calorieTarget: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Protein g / day">
                <input type="number" inputMode="numeric" value={f.proteinTarget} onChange={(e) => setF({ ...f, proteinTarget: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-text-2">Meals needed this week</div>
              <div className="grid grid-cols-5 gap-2">
                {(
                  [
                    ["breakfast", "Breakfast"],
                    ["lunch", "Lunch"],
                    ["dinner", "Dinner"],
                    ["snacks", "Snacks/day"],
                    ["eatingOut", "Eating out"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="text-center text-[10px] text-muted">
                    {l}
                    <input type="number" min={0} max={k === "snacks" ? 3 : 14} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cx(inputClass, "mt-1 px-1 text-center")} />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-text-2">Preferences</div>
              <div className="flex flex-wrap gap-1.5">
                <Chip on={f.quickWeekdays} onClick={() => setF({ ...f, quickWeekdays: !f.quickWeekdays })}>
                  Quick weekday meals
                </Chip>
                <Chip on={f.mealPrep} onClick={() => setF({ ...f, mealPrep: !f.mealPrep })}>
                  Meal prep okay
                </Chip>
                <Chip on={f.highProtein} onClick={() => setF({ ...f, highProtein: !f.highProtein })}>
                  High protein
                </Chip>
                <Chip on={f.reuseIngredients} onClick={() => setF({ ...f, reuseIngredients: !f.reuseIngredients })}>
                  Use overlapping ingredients
                </Chip>
              </div>
            </div>
            <Field label="Anything else? (optional)">
              <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={p.aiEnabled ? "e.g. two fish dinners, no pasta this week" : "Notes are used by AI planning; templates ignore them"} className={inputClass} maxLength={300} />
            </Field>
          </div>
          <Button full variant="gold" disabled={pending} onClick={() => saveBudget(true)}>
            {pending ? "Planning the week…" : w && w.status !== "planning" ? "Save & regenerate week" : "Generate week"}
          </Button>
          {w && w.status !== "planning" && (
            <Button full variant="ghost" disabled={pending} onClick={() => saveBudget(false)}>
              Save settings only (keep the current plan)
            </Button>
          )}
        </section>
      )}

      {step === "meals" && (
        <section className="space-y-3">
          <Title eyebrow="Step 4" title="The week's meals" body={w?.summary.rationale ?? "Generate the week from the Budget step first."} />
          {!w || w.status === "planning" ? (
            <Button full variant="gold" onClick={() => go("budget")}>
              Set up the week first
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Est. cost" value={w.estimatedCost != null ? `~$${w.estimatedCost.toFixed(0)}` : "—"} sub={`budget $${w.budget}`} tone={w.estimatedCost != null && w.estimatedCost > w.budget * 1.05 ? "warn" : "ok"} />
                <Stat label="Recipes" value={String(w.summary.distinctRecipes ?? "—")} sub="distinct" />
                <Stat label="Reuse" value={w.summary.reusePct != null ? `${w.summary.reusePct}%` : "—"} sub="ingredients shared" />
              </div>
              <div className="space-y-2">
                {w.days.map((d) => (
                  <div key={d.date} className="plate px-3.5 py-2.5">
                    <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-gold">
                      <span>{d.label}</span>
                      <span className="tabular text-faint">
                        {d.meals.filter((m) => m.status !== "replaced").reduce((a, m) => a + m.calories, 0)} kcal · {d.meals.filter((m) => m.status !== "replaced").reduce((a, m) => a + m.protein, 0)} g
                      </span>
                    </div>
                    {d.meals.length === 0 && <div className="serif text-[13px] text-muted">Eating out / free day</div>}
                    <ul className="space-y-0.5">
                      {d.meals
                        .filter((m) => m.status !== "replaced")
                        .map((m) => (
                          <li key={m.id} className="flex items-center gap-2 text-[13px]">
                            <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-faint">{m.mealType}</span>
                            <span className={cx("min-w-0 flex-1 truncate", m.status === "eaten" && "text-success", m.status === "skipped" && "line-through text-muted")}>{m.name}</span>
                            <span className="tabular text-[11px] text-muted">{m.calories}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="serif text-[12px] text-muted">Each day&apos;s meals are editable on the Meals screen as the week unfolds: skip, replace, eat something else — nothing counts until you log it.</p>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const g = await generateWeekAction(w.id, true); toast(g.ok ? "Regenerated" : (g.error ?? "Failed"), g.ok ? "quest" : "error"); router.refresh(); })}>
                  <RefreshCw size={13} /> Regenerate
                </Button>
                <Button full variant="gold" onClick={next}>
                  Shopping list <ChevronRight size={14} />
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {step === "shop" && (
        <section className="space-y-3">
          <Title eyebrow="Step 5" title="Shopping list" body="Grouped by aisle. After the trip, enter what you actually bought and paid — that becomes your pantry and your real weekly spend." />
          {!w || w.status === "planning" ? (
            <Button full variant="gold" onClick={() => go("budget")}>
              Set up the week first
            </Button>
          ) : (
            <>
              <ShoppingList weekId={w.id} status={w.status} items={w.items} budget={w.budget} />
              {w.summary.staplesAssumed && w.summary.staplesAssumed.length > 0 && <p className="serif px-1 text-[12px] text-faint">Assumed in your pantry: {w.summary.staplesAssumed.join(", ")}. Add any you&apos;re out of.</p>}
              <Button full variant="gold" onClick={next}>
                Meal prep plan <ChevronRight size={14} />
              </Button>
            </>
          )}
        </section>
      )}

      {step === "prep" && (
        <section className="space-y-3">
          <Title eyebrow="Step 6" title="Sunday prep" body="Batch the parts that repeat. Completing prep counts as cooking and pays the weekly prep quest." />
          {!w?.prep ? (
            <div className="plate serif px-4 py-4 text-[14px] text-muted">No prep plan for this week{w && w.status !== "planning" ? " — the chosen recipes don't share enough to batch. That's fine." : ". Generate the week first."}</div>
          ) : (
            <div className="plate overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div>
                  <div className="display text-[15px] font-semibold">Prepare</div>
                  <div className="text-[11px] text-muted">Estimated {w.prep.estimatedMinutes} minutes · {w.prep.status === "completed" ? "done" : w.prep.status}</div>
                </div>
                <span className={cx("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider", w.prep.status === "completed" ? "bg-success/15 text-success" : "bg-white/5 text-muted")}>{w.prep.status}</span>
              </div>
              <ul className="divide-y divide-border/60 border-t border-border/60">
                {w.prep.items.map((it) => (
                  <li key={it.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1">{it.name}</span>
                    <span className="tabular text-xs text-text-2">
                      {it.servings} servings · {it.minutes} min
                    </span>
                  </li>
                ))}
              </ul>
              {w.prep.supports.length > 0 && <p className="serif px-4 py-2 text-[12.5px] text-muted">Supports: {w.prep.supports.join(", ")}.</p>}
              <div className="flex gap-2 border-t border-border/60 px-4 py-3">
                {w.prep.status === "completed" ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await uncompletePrepAction(w.prep!.id); toast("Prep un-completed · XP reversed", "quest"); router.refresh(); })}>
                    <Undo2 size={13} /> Undo
                  </Button>
                ) : (
                  <>
                    <Button variant="gold" size="sm" disabled={pending} onClick={() => start(async () => { const r = await completePrepAction(w.prep!.id); notify(r); router.refresh(); })}>
                      <Check size={13} /> Prep done · +60 XP
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await skipPrepAction(w.prep!.id); router.refresh(); })}>
                      Skip this week
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          <Button full variant="gold" onClick={next}>
            Training days <ChevronRight size={14} />
          </Button>
        </section>
      )}

      {step === "training" && (
        <section className="space-y-3">
          <Title eyebrow="Step 7" title="Which days will you train?" body="Pick the days that are realistic. The workout reminder only fires on these; the generator sizes the week to match." />
          <TrainingDays initial={p.trainingDays} onSaved={next} />
        </section>
      )}

      {step === "quests" && (
        <section className="space-y-3">
          <Title eyebrow="Step 8" title="This week's quests" body="Set by the world from your targets and habits. Planning and shopping pay XP; spending less does not." />
          <div className="plate divide-y divide-border/60 p-0">
            {p.weeklyQuests.length === 0 && <p className="serif px-4 py-4 text-center text-[13.5px] text-muted">Weekly quests appear once the week starts.</p>}
            {p.weeklyQuests.map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", q.done ? "border-success bg-success text-[#071a10]" : "border-border-strong")}>{q.done && <Check size={13} strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1 truncate">{q.title}</span>
                <span className="tabular text-xs text-gold">+{q.rewardXp}</span>
              </div>
            ))}
          </div>
          <Button full variant="gold" onClick={next}>
            Finish <ChevronRight size={14} />
          </Button>
        </section>
      )}

      {step === "ready" && (
        <section className="space-y-3">
          <div className="plate px-5 py-6 text-center">
            <Flag size={28} className="mx-auto text-gold" />
            <div className="display mt-3 text-xl font-semibold">Next week ready</div>
            <p className="serif mt-1 text-[14.5px] text-muted">
              {w && w.status !== "planning" ? `${w.summary.distinctRecipes ?? "A few"} recipes, a ${w.items.filter((i) => !i.coveredByPantry).length}-item list${w.estimatedCost != null ? ` around $${w.estimatedCost.toFixed(0)}` : ""}${w.prep ? `, ${w.prep.estimatedMinutes} minutes of prep` : ""}.` : "Nothing generated yet — that's allowed. The week can start without a plan."}
              {" "}The next chapter begins Monday.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/" className="plate press px-4 py-3 text-center text-sm">
              Home
            </Link>
            <Link href="/planner/meals" className="plate press px-4 py-3 text-center text-sm">
              Today&apos;s meals
            </Link>
          </div>
        </section>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" disabled={idx === 0} onClick={back}>
          <ChevronLeft size={14} /> Back
        </Button>
        {idx < STEPS.length - 1 && (
          <Button variant="ghost" size="sm" onClick={next}>
            Skip <ChevronRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

function Title({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="px-1">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="display mt-0.5 text-[20px] font-semibold leading-tight">{title}</h2>
      <p className="serif mt-1 text-[13.5px] text-muted">{body}</p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="plate px-3 py-2.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("tabular display text-lg font-semibold", tone === "warn" && "text-warn")}>{value}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}

function TrainingDays({ initial, onSaved }: { initial: number[]; onSaved: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState<number[]>(initial);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} onClick={() => setDays((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]))} className={cx("press flex-1 rounded-lg border py-2.5 text-sm", days.includes(d) ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
            {DAYS[d]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{days.length ? `${days.length} training day${days.length === 1 ? "" : "s"} · rest on the others.` : "No fixed days — train when it fits."}</p>
      <Button full variant="gold" disabled={pending} onClick={() => start(async () => { await saveTrainingDaysAction(days); router.refresh(); onSaved(); })}>
        Save training days
      </Button>
    </div>
  );
}
