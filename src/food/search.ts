import { loadRecipes } from "@/services/loaders";
import { listSavedFoods } from "@/services/nutrition";
import { searchRestaurantItems } from "./restaurants";

/**
 * Unified food search. Sources, in priority order:
 *   1. the user's saved foods,
 *   2. curated chain menu data,
 *   3. the user's recipes,
 *   4. Open Food Facts (live product database; optional, times out quietly).
 * AI estimation is deliberately NOT part of search — it is a separate, labelled fallback.
 */
export interface FoodHit {
  key: string;
  name: string;
  brand: string | null;
  serving: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** saved | restaurant | recipe | openfoodfacts */
  source: "saved" | "restaurant" | "recipe" | "openfoodfacts";
  isEstimate: boolean;
  savedFoodId?: number;
  recipeId?: number;
  meal?: string;
}

export async function searchFoods(query: string, opts: { live?: boolean; limit?: number } = {}): Promise<{ hits: FoodHit[]; liveError: string | null }> {
  const q = query.trim();
  const limit = opts.limit ?? 20;
  if (q.length < 2) return { hits: [], liveError: null };
  const ql = q.toLowerCase();
  const hits: FoodHit[] = [];

  for (const f of listSavedFoods({ q, limit: 8 })) {
    hits.push({ key: `saved:${f.id}`, name: f.name, brand: f.brand, serving: f.servingDesc, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, source: "saved", isEstimate: f.isEstimate, savedFoodId: f.id });
  }
  for (const it of searchRestaurantItems(q, 10)) {
    hits.push({ key: `rest:${it.brand}:${it.name}`, name: it.name, brand: it.brand, serving: it.serving, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat, source: "restaurant", isEstimate: false, meal: it.meal });
  }
  for (const r of loadRecipes().filter((r) => r.calories != null && r.name.toLowerCase().includes(ql)).slice(0, 6)) {
    hits.push({ key: `recipe:${r.id}`, name: r.name, brand: "Your recipe", serving: "1 serving", calories: r.calories ?? 0, protein: r.proteinG ?? 0, carbs: r.carbsG ?? 0, fat: r.fatG ?? 0, source: "recipe", isEstimate: false, recipeId: r.id, meal: r.mealType });
  }

  let liveError: string | null = null;
  if (opts.live !== false && hits.length < limit && process.env.FOOD_SEARCH_LIVE !== "off") {
    try {
      const off = await searchOpenFoodFacts(q, Math.min(10, limit - hits.length));
      hits.push(...off);
    } catch (e) {
      liveError = (e as Error).message;
    }
  }
  // De-dupe by name+calories, keep first (higher-priority) occurrence.
  const seen = new Set<string>();
  const out = hits.filter((h) => {
    const k = `${h.name.toLowerCase()}|${h.calories}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { hits: out.slice(0, limit), liveError };
}

interface OffProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

/** Open Food Facts: free, no key. Per-serving values preferred, else per 100 g. */
export async function searchOpenFoodFacts(query: string, limit = 10): Promise<FoodHit[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,brands,serving_size,nutriments`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Ascend/0.3 (self-hosted personal app)" } });
    if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
    const json = (await res.json()) as { products?: OffProduct[] };
    const out: FoodHit[] = [];
    for (const p of json.products ?? []) {
      const n = p.nutriments ?? {};
      const num = (k: string) => {
        const v = n[k];
        const x = typeof v === "string" ? Number(v) : v;
        return x != null && Number.isFinite(x) ? x : null;
      };
      const perServing = num("energy-kcal_serving");
      const per100 = num("energy-kcal_100g");
      const kcal = perServing ?? per100;
      if (!p.product_name || kcal == null || kcal <= 0) continue;
      const useServing = perServing != null;
      const g = (k: string) => Math.round((useServing ? num(`${k}_serving`) : num(`${k}_100g`)) ?? 0);
      out.push({
        key: `off:${p.product_name}:${p.brands ?? ""}:${Math.round(kcal)}`,
        name: p.product_name,
        brand: p.brands?.split(",")[0]?.trim() || "Open Food Facts",
        serving: useServing ? p.serving_size || "1 serving" : "per 100 g",
        calories: Math.round(kcal),
        protein: g("proteins"),
        carbs: g("carbohydrates"),
        fat: g("fat"),
        source: "openfoodfacts",
        isEstimate: false,
      });
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}
