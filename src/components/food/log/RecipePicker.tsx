"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { inputClass } from "@/components/ui/primitives";
import type { RecipeOpt } from "./types";

/** Pick a recipe → draft with "I cooked this" on by default. Recipes without macros can still be logged as cooked. */
export function RecipePicker({ recipes, onPick, pending }: { recipes: RecipeOpt[]; onPick: (r: RecipeOpt) => void; pending: boolean }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => recipes.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)).slice(0, 20), [recipes, q]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your recipes" className={inputClass} autoFocus aria-label="Search your recipes" />
      <ul className="max-h-[46dvh] divide-y divide-border/60 overflow-y-auto">
        {list.map((r) => (
          <li key={r.id}>
            <button disabled={pending} onClick={() => onPick(r)} className="press flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                {r.isFavorite && <Star size={12} className="shrink-0 fill-gold text-gold" />}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-muted">{r.calories != null ? `${r.calories} kcal · ${r.protein ?? 0} g` : "no macros"}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="serif py-3 text-center text-[13px] text-muted">No recipes match.</li>}
      </ul>
    </div>
  );
}
