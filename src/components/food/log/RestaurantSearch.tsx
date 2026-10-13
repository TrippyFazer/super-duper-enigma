"use client";

import { useState } from "react";
import { RESTAURANT_BRANDS } from "@/food/restaurants";
import type { FoodHit } from "@/food/search";
import { FoodSearch } from "./FoodSearch";

/** Chain-menu search with brand chips so "Starbucks" is one tap away. */
export function RestaurantSearch({ onPick, pending }: { onPick: (h: FoodHit) => void; pending: boolean }) {
  const [q, setQ] = useState("");
  return (
    <FoodSearch restaurantOnly onPick={onPick} pending={pending} query={q} onQuery={setQ} placeholder="Chain or menu item">
      <div className="flex flex-wrap gap-1.5">
        {RESTAURANT_BRANDS.slice(0, 14).map((b) => (
          <button key={b} onClick={() => setQ(b)} className="press h-10 rounded-full border border-border bg-card-2 px-3 text-[12px] text-text-2">
            {b}
          </button>
        ))}
      </div>
    </FoodSearch>
  );
}
