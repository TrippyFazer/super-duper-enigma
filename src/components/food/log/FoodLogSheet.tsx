"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock, Search, Store, Zap, Sparkles, ChefHat, ChevronDown } from "lucide-react";
import { logNutritionAction, type LogFoodInput } from "@/actions/planner";
import { logMealAction } from "@/actions";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented, cx } from "@/components/ui/primitives";
import { inferMealType, mealTypeLabel, MEAL_TYPES, type MealType } from "@/food/mealType";
import { FoodDraft } from "./FoodDraft";
import { RecentFoods } from "./RecentFoods";
import { FoodSearch } from "./FoodSearch";
import { RestaurantSearch } from "./RestaurantSearch";
import { MacroQuickAdd } from "./MacroQuickAdd";
import { FoodEstimate } from "./FoodEstimate";
import { RecipePicker } from "./RecipePicker";
import type { Draft, FoodTab, LogResult, PlannedSlot, RecentFood, RecipeOpt } from "./types";

const TABS: { v: FoodTab; l: string; icon: typeof Search }[] = [
  { v: "recent", l: "Recent", icon: Clock },
  { v: "search", l: "Search", icon: Search },
  { v: "restaurant", l: "Restaurant", icon: Store },
  { v: "quick", l: "Quick", icon: Zap },
  { v: "estimate", l: "Estimate", icon: Sparkles },
  { v: "recipe", l: "Recipe", icon: ChefHat },
];

/**
 * THE food logger. Used from + LOG, the Meals screen, recipes and the cooking
 * domain. Meal type is inferred from the time and editable; it is never the
 * first decision. Recent → one tap to select, one tap to confirm.
 */
export function FoodLogSheet({
  open,
  onClose,
  recipes,
  plannedSlots,
  recents: recentsIn,
  onLogged,
  initialTab,
  initialDraft,
  date,
}: {
  open: boolean;
  onClose: () => void;
  recipes: RecipeOpt[];
  plannedSlots: PlannedSlot[];
  recents: RecentFood[];
  onLogged: (fb: LogResult) => void;
  initialTab?: FoodTab;
  initialDraft?: Draft | null;
  /** Log for a specific day (defaults to today). */
  date?: string;
}) {
  const [tab, setTab] = useState<FoodTab>(initialTab ?? (recentsIn.length ? "recent" : "search"));
  const [mealType, setMealType] = useState<MealType>(() => inferMealType(new Date().getHours() + new Date().getMinutes() / 60));
  const [editType, setEditType] = useState(false);
  const [replaces, setReplaces] = useState<number | null>(null);
  const [recents, setRecents] = useState<RecentFood[]>(recentsIn);
  const [draft, setDraft] = useState<Draft | null>(initialDraft ?? null);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => setRecents(recentsIn), [recentsIn]);
  useEffect(() => {
    if (open) {
      setDraft(initialDraft ?? null);
      setTab(initialTab ?? (recentsIn.length ? "recent" : "search"));
      setMealType(inferMealType(new Date().getHours() + new Date().getMinutes() / 60));
      setEditType(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const slot = plannedSlots.find((p) => p.mealType === mealType);
  useEffect(() => setReplaces(slot && draft?.source !== "recipe" ? slot.id : null), [slot, mealType, draft?.source]);

  const submit = (input: Omit<LogFoodInput, "mealType">, cookedOnly = false) =>
    start(async () => {
      if (cookedOnly) {
        const r = await logMealAction({ date: date ?? new Date().toISOString().slice(0, 10), mealType, name: input.name, recipeId: input.recipeId ?? null });
        onLogged({ ...r, adjustOffer: null });
      } else {
        const r = await logNutritionAction({ ...input, mealType, replacesPlannedMealId: replaces, date });
        onLogged(r);
      }
      setDraft(null);
    });

  const pickHit = (h: { name: string; brand: string | null; serving: string | null; calories: number; protein: number; carbs: number; fat: number; isEstimate: boolean; source: string; savedFoodId?: number; recipeId?: number }, sourceOverride?: string) =>
    setDraft({ name: h.name, brand: h.brand, serving: h.serving, calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat, isEstimate: h.isEstimate, source: sourceOverride ?? (h.source === "saved" ? "saved" : h.source), savedFoodId: h.savedFoodId, recipeId: h.recipeId, cooked: h.source === "recipe" });

  const typeChip = (
    <button onClick={() => setEditType((v) => !v)} aria-expanded={editType} className="press flex h-9 items-center gap-1 rounded-full border border-border bg-card-2 px-3 text-xs text-text-2">
      {mealTypeLabel(mealType)} <ChevronDown size={13} className={cx("transition-transform", editType && "rotate-180")} />
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={draft ? "Confirm" : "Log food"} headerRight={typeChip}>
      <div className="space-y-3 pb-2">
        {editType && <Segmented value={mealType} onChange={(v) => { setMealType(v); setEditType(false); }} options={MEAL_TYPES.map((m) => ({ value: m.value, label: m.label }))} />}
        {slot && !draft && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card-2 px-3 py-1.5 text-xs text-text-2">
            <input type="checkbox" checked={replaces === slot.id} onChange={(e) => setReplaces(e.target.checked ? slot.id : null)} className="h-4 w-4 accent-[var(--color-accent)]" />
            <span className="min-w-0">
              Replaces planned {mealTypeLabel(mealType).toLowerCase()}: <span className="font-medium text-text">{slot.name}</span>
            </span>
          </label>
        )}

        {draft ? (
          <FoodDraft
            draft={draft}
            pending={pending}
            onBack={() => setDraft(null)}
            onSubmit={(d) => {
              if (d.calories <= 0 && d.cooked) return submit({ name: d.name, calories: 0, recipeId: d.recipeId ?? null }, true);
              submit({ name: d.name, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat, source: d.source as LogFoodInput["source"], isEstimate: d.isEstimate, venue: d.brand, savedFoodId: d.savedFoodId ?? null, recipeId: d.recipeId ?? null, cooked: d.cooked, save: d.save });
            }}
          />
        ) : (
          <>
            <div className="scroll-x -mx-5 flex gap-1.5 px-5" role="tablist" aria-label="How to log">
              {TABS.map(({ v, l, icon: Icon }) => (
                <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cx("press flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs", tab === v ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                  <Icon size={12} /> {l}
                </button>
              ))}
            </div>
            {tab === "recent" && <RecentFoods recents={recents} pending={pending} onForget={(id) => setRecents((xs) => xs.filter((x) => x.id !== id))} onPick={(r) => pickHit({ name: r.name, brand: r.brand, serving: r.serving, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, isEstimate: r.isEstimate, source: "saved", savedFoodId: r.id })} />}
            {tab === "search" && <FoodSearch onPick={(h) => pickHit(h)} pending={pending} query={query} onQuery={setQuery} placeholder="Food, product, chain or recipe" />}
            {tab === "restaurant" && <RestaurantSearch onPick={(h) => pickHit(h, "restaurant")} pending={pending} />}
            {tab === "quick" && <MacroQuickAdd pending={pending} onSubmit={(d, save) => submit({ ...d, source: "quick", save })} />}
            {tab === "estimate" && <FoodEstimate onQuick={() => setTab("quick")} onEstimate={(d) => setDraft({ ...d, brand: null, serving: null, isEstimate: true, source: "estimate" })} />}
            {tab === "recipe" && <RecipePicker recipes={recipes} pending={pending} onPick={(r) => setDraft({ name: r.name, brand: null, serving: null, calories: r.calories, protein: r.protein ?? 0, carbs: r.carbs ?? 0, fat: r.fat ?? 0, isEstimate: false, source: "recipe", recipeId: r.id, cooked: true })} />}
          </>
        )}
      </div>
    </Sheet>
  );
}
