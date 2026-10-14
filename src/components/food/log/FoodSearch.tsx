"use client";

import { useEffect, useState } from "react";
import { searchFoodsAction } from "@/actions/planner";
import { inputClass } from "@/components/ui/primitives";
import type { FoodHit } from "@/food/search";

/** Debounced search across saved foods, chain menus, recipes and Open Food Facts. */
export function FoodSearch({ onPick, pending, restaurantOnly, query, onQuery, placeholder, children }: { onPick: (h: FoodHit) => void; pending: boolean; restaurantOnly?: boolean; query: string; onQuery: (q: string) => void; placeholder: string; children?: React.ReactNode }) {
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    let dead = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchFoodsAction(query);
        if (dead) return;
        setHits(restaurantOnly ? r.hits.filter((h) => h.source === "restaurant" || h.source === "saved") : r.hits);
        setLiveError(r.liveError);
      } finally {
        if (!dead) setBusy(false);
      }
    }, 300);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [query, restaurantOnly]);
  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} className={inputClass} autoFocus enterKeyHint="search" aria-label={placeholder} />
      {!query && children}
      {busy && <div className="animate-pulse-soft px-1 text-xs text-muted">Searching…</div>}
      <ul className="max-h-[46dvh] divide-y divide-border/60 overflow-y-auto">
        {hits.map((h) => (
          <li key={h.key}>
            <button disabled={pending} onClick={() => onPick(h)} className="press flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm">
              <span className="min-w-0">
                <span className="line-clamp-2">{h.name}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  <span className="tabular text-text-2">{h.calories} kcal · {h.protein} g</span>
                  {[h.brand, h.serving].filter(Boolean).map((x) => ` · ${x}`).join("")}
                </span>
              </span>
            </button>
          </li>
        ))}
        {query.length >= 2 && !busy && hits.length === 0 && <li className="serif py-3 text-center text-[13px] text-muted">No match. Try Quick or Estimate.</li>}
      </ul>
      {liveError && <p className="px-1 text-[11px] text-faint">Live product database unavailable — showing local results.</p>}
    </div>
  );
}
