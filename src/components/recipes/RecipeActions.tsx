"use client";

import { useState, useTransition } from "react";
import { Star, Bookmark, ChefHat } from "lucide-react";
import { toggleRecipeFlagAction } from "@/actions";
import { MealSheet } from "@/components/log/MealSheet";
import { cx } from "@/components/ui/primitives";

export function RecipeActions({ id, name, isFavorite, isSaved, today, timesCooked }: { id: number; name: string; isFavorite: boolean; isSaved: boolean; today: string; timesCooked: number }) {
  const [fav, setFav] = useState(isFavorite);
  const [saved, setSaved] = useState(isSaved);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setOpen(true)} className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-2 to-gold px-4 py-3 text-sm font-semibold text-[#1a1406]">
          <ChefHat size={16} /> I cooked this{timesCooked === 0 ? " · +35 XP" : " · +15 XP"}
        </button>
        <button
          aria-label="Favorite"
          aria-pressed={fav}
          onClick={() => {
            setFav(!fav);
            start(async () => toggleRecipeFlagAction(id, "isFavorite", !fav));
          }}
          className={cx("press flex h-12 w-12 items-center justify-center rounded-xl border", fav ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card text-muted")}
        >
          <Star size={18} className={fav ? "fill-gold" : ""} />
        </button>
        <button
          aria-label="Save"
          aria-pressed={saved}
          onClick={() => {
            setSaved(!saved);
            start(async () => toggleRecipeFlagAction(id, "isSaved", !saved));
          }}
          className={cx("press flex h-12 w-12 items-center justify-center rounded-xl border", saved ? "border-accent/60 bg-accent/12 text-accent-2" : "border-border bg-card text-muted")}
        >
          <Bookmark size={18} className={saved ? "fill-accent-2" : ""} />
        </button>
      </div>
      <MealSheet open={open} onClose={() => setOpen(false)} date={today} recipes={[]} preset={{ recipeId: id, name }} />
    </>
  );
}
