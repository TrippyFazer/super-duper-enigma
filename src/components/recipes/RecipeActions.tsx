"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Bookmark, ChefHat } from "lucide-react";
import { toggleRecipeFlagAction } from "@/actions";
import { logContextAction, type LogContext } from "@/actions/log";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { FoodLogSheet } from "@/components/food/log/FoodLogSheet";
import { cx } from "@/components/ui/primitives";

/**
 * "I cooked this" opens the unified food logger pre-filled with this recipe
 * (cooked on), so one action updates nutrition AND cooking — never two logs.
 */
export function RecipeActions({ id, name, isFavorite, isSaved, timesCooked, nutrition }: { id: number; name: string; isFavorite: boolean; isSaved: boolean; today: string; timesCooked: number; nutrition: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null } }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [fav, setFav] = useState(isFavorite);
  const [saved, setSaved] = useState(isSaved);
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<LogContext | null>(null);
  const [, start] = useTransition();
  useEffect(() => {
    if (open && !ctx) logContextAction().then(setCtx).catch(() => {});
  }, [open, ctx]);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setOpen(true)} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-2 to-gold px-4 text-sm font-semibold text-[#1a1406]">
          <ChefHat size={16} /> I cooked this{timesCooked === 0 ? " · +35 XP" : " · +15 XP"}
        </button>
        <button aria-label="Favorite" aria-pressed={fav} onClick={() => { setFav(!fav); start(async () => toggleRecipeFlagAction(id, "isFavorite", !fav)); }} className={cx("press flex h-12 w-12 items-center justify-center rounded-xl border", fav ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card text-muted")}>
          <Star size={18} className={fav ? "fill-gold" : ""} />
        </button>
        <button aria-label="Save" aria-pressed={saved} onClick={() => { setSaved(!saved); start(async () => toggleRecipeFlagAction(id, "isSaved", !saved)); }} className={cx("press flex h-12 w-12 items-center justify-center rounded-xl border", saved ? "border-accent/60 bg-accent/12 text-accent-2" : "border-border bg-card text-muted")}>
          <Bookmark size={18} className={saved ? "fill-accent-2" : ""} />
        </button>
      </div>
      <p className="serif px-1 text-[12.5px] text-muted">{nutrition.calories != null ? "Logs calories, macros and the cooking in one go." : "No macros on this recipe — it still counts as cooked."}</p>
      {open && ctx && (
        <FoodLogSheet
          open
          onClose={() => setOpen(false)}
          recipes={ctx.recipes}
          plannedSlots={ctx.plannedSlots}
          recents={ctx.recents}
          initialDraft={{ name, brand: null, serving: null, calories: nutrition.calories, protein: nutrition.protein ?? 0, carbs: nutrition.carbs ?? 0, fat: nutrition.fat ?? 0, isEstimate: false, source: "recipe", recipeId: id, cooked: true }}
          onLogged={(fb) => {
            notify(fb);
            if (fb.ok) {
              setOpen(false);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
