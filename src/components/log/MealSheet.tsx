"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Star } from "lucide-react";
import { logMealAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";

export interface RecipeOption {
  id: number;
  name: string;
  isFavorite: boolean;
  mealType: string;
}

export function MealSheet({ open, onClose, date, recipes, preset }: { open: boolean; onClose: () => void; date: string; recipes: RecipeOption[]; preset?: { recipeId: number; name: string } | null }) {
  const { notify } = useFeedback();
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack">(defaultMealType());
  const [name, setName] = useState(preset?.name ?? "");
  const [recipeId, setRecipeId] = useState<number | null>(preset?.recipeId ?? null);
  const [query, setQuery] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [when, setWhen] = useState(date);
  const [pending, start] = useTransition();

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = recipes.filter((r) => (q ? r.name.toLowerCase().includes(q) : true));
    return list.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name)).slice(0, 6);
  }, [recipes, query]);

  const submit = () =>
    start(async () => {
      const r = await logMealAction({ date: when, mealType, name: name.trim() || (recipeId ? recipes.find((x) => x.id === recipeId)?.name ?? "Meal" : "Home-cooked meal"), recipeId, isNewRecipe: isNew });
      notify(r);
      if (r.ok) {
        setName("");
        setRecipeId(null);
        setQuery("");
        setIsNew(false);
        onClose();
      }
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a cooked meal"
      footer={
        <Button onClick={submit} disabled={pending} full size="lg" variant="gold">
          {pending ? "Saving…" : "Log meal · +15 XP"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={mealType}
          onChange={setMealType}
          options={[
            { value: "breakfast", label: "Breakfast" },
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
            { value: "snack", label: "Snack" },
          ]}
        />
        <Field label="What did you make?">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setQuery(e.target.value);
              setRecipeId(null);
            }}
            placeholder="e.g. Chicken rice bowl"
            className={inputClass}
            maxLength={120}
          />
        </Field>
        {!recipeId && suggestions.length > 0 && (
          <div className="-mt-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <Search size={12} /> From your recipes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRecipeId(r.id);
                    setName(r.name);
                  }}
                  className="press inline-flex items-center gap-1 rounded-full border border-border bg-card-2 px-3 py-1.5 text-xs text-text-2"
                >
                  {r.isFavorite && <Star size={11} className="text-gold" />}
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {recipeId && (
          <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
            Linked to recipe · counts toward your rotation{" "}
            <button className="ml-2 underline" onClick={() => setRecipeId(null)}>
              unlink
            </button>
          </div>
        )}
        <label className={cx("flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-3", isNew ? "border-accent/50 bg-accent/10" : "border-border bg-card-2")}>
          <div>
            <div className="text-sm font-medium">First time making this?</div>
            <div className="text-xs text-muted">New recipes earn +20 XP and grow your range.</div>
          </div>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <Field label="Date">
          <input type="date" value={when} max={date} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Sheet>
  );
}

function defaultMealType(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  return "dinner";
}
