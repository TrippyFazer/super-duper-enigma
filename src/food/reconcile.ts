import { describeServings, ingredientInfo, pantryCovers, servingsToPurchaseUnits, storageName, toServings } from "./families";
import { CATEGORY_ORDER, findIngredient, type GroceryCategory } from "./ingredients";
import { resolveIngredientForUser, type FoodRules } from "./rules";

/**
 * THE PIPELINE
 *   USER FOOD RULES → PLANNED MEALS → NORMALIZED INGREDIENT REQUIREMENTS
 *   → PANTRY AVAILABILITY → QUANTITY DIFFERENCE → SHOPPING LIST
 *
 * Pure functions. The shopping list is "ingredients still required after
 * pantry coverage", never a copy of the recipes. Services call this after
 * generation and again whenever the pantry changes, without touching meals.
 */
export type IngredientRef = string | { name: string; qty?: number | null; unit?: string | null };
export interface MealReq {
  name: string;
  ingredients: IngredientRef[];
  leftover?: boolean;
  /** multiplier (a double batch needs double) */
  servings?: number;
}
export interface Requirement {
  /** storage / display name (exact variant when known) */
  name: string;
  canonical: string;
  category: GroceryCategory;
  servings: number;
  usedIn: { name: string; count: number }[];
  substitutedFrom: string | null;
  staple: boolean;
}

const QTY_RE = /^(\d+(?:[.,/]\d+)?)\s*([a-z][a-z ]*?)?\s+(?:of\s+)?([a-z][a-z \-%]+)$/;
const UNIT_WORDS = /^(lb|lbs|oz|g|kg|cups?|tbsp|tsp|ml|l|each|dozen|half dozen|slices?|pieces?|cans?|servings?|bag|bags|loaf|loaves|pack|packs|tub|tubs|carton|cartons|block|blocks|pint|quart|gallon|half gallon)$/;

/** "2 cups rice" / "1 lb chicken breast" / "3 eggs" → {name, qty, unit}. Plain names are one serving. */
export function parseIngredientRef(ref: IngredientRef): { name: string; qty: number | null; unit: string | null } {
  if (typeof ref !== "string") return { name: ref.name, qty: ref.qty ?? null, unit: ref.unit ?? null };
  const t = ref.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const m = QTY_RE.exec(t);
  if (!m) return { name: ref, qty: null, unit: null };
  const n = m[1].includes("/") ? Number(m[1].split("/")[0]) / Number(m[1].split("/")[1]) : Number(m[1].replace(",", "."));
  const unit = m[2]?.trim();
  if (unit && !UNIT_WORDS.test(unit)) return { name: ref, qty: null, unit: null };
  return { name: m[3].trim(), qty: n, unit: unit || "each" };
}

/** Servings one ingredient reference asks for. Unknown quantities count as one serving. */
export function refServings(ref: IngredientRef): { name: string; servings: number } {
  const p = parseIngredientRef(ref);
  if (p.qty == null) return { name: p.name, servings: 1 };
  const s = toServings(p.qty, p.unit ?? "each", p.name);
  return { name: p.name, servings: s != null && s > 0 ? s : 1 };
}

/** Planned meals → normalized requirements (rules applied so a swapped ingredient is what gets bought). */
export function requirementsFromMeals(meals: MealReq[], rules?: FoodRules | null): Requirement[] {
  const map = new Map<string, Requirement & { uses: Map<string, number> }>();
  for (const m of meals) {
    if (m.leftover || /^leftover /i.test(m.name)) continue;
    const mult = m.servings ?? 1;
    for (const ref of m.ingredients) {
      const { name: raw, servings } = refServings(ref);
      let name = raw;
      let substitutedFrom: string | null = null;
      if (rules) {
        const r = resolveIngredientForUser(raw, rules);
        if (r.status === "substituted") {
          name = r.name;
          substitutedFrom = raw;
        }
      }
      const key = storageName(name);
      // a planner may have swapped the ingredient before the meal was stored: still say why it is on the list
      if (!substitutedFrom && rules) {
        const rule = rules.avoid.find((a) => a.substitute && storageName(a.substitute) === key) ?? rules.hard.find((h) => h.substitute && storageName(h.substitute) === key);
        if (rule) substitutedFrom = rule.target;
      }
      const def = findIngredient(name);
      const cur = map.get(key) ?? { name: key, canonical: ingredientInfo(name).canonical, category: def?.category ?? "other", servings: 0, usedIn: [], substitutedFrom, staple: !!def?.staple, uses: new Map<string, number>() };
      cur.servings += servings * mult;
      cur.uses.set(m.name, (cur.uses.get(m.name) ?? 0) + mult);
      if (substitutedFrom && !cur.substitutedFrom) cur.substitutedFrom = substitutedFrom;
      map.set(key, cur);
    }
  }
  return [...map.values()].map(({ uses, ...r }) => ({ ...r, servings: Math.round(r.servings * 10) / 10, usedIn: [...uses].map(([name, count]) => ({ name, count })) }));
}

// ------------------------------------------------------------ pantry ----
export interface PantryStock {
  id?: number;
  name: string;
  qty: number | null;
  unit: string;
  level: string | null;
  expiresAt?: string | null;
}
export type StockMode = "known" | "lot" | "some" | "none" | "unknown";

/** Assumed servings behind a coarse "a lot": adequate for a normal plan, questioned when demand is unusual. */
export function lotAssumedServings(name: string): number {
  const def = findIngredient(name);
  return Math.max(8, Math.round((def?.servingsPerUnit ?? 6) * 1.5));
}
export function someAssumedServings(name: string): number {
  const def = findIngredient(name);
  return def ? Math.max(1, Math.round(def.servingsPerUnit * 0.3)) : 2;
}

/** Servings a pantry row can supply for a requirement, with how sure we are. */
export function stockServings(p: PantryStock, forName = p.name): { servings: number | null; mode: StockMode } {
  if (p.level === "none") return { servings: 0, mode: "none" };
  if (p.qty != null) {
    if (p.qty <= 0) return { servings: 0, mode: "none" };
    const s = toServings(p.qty, p.unit, p.name) ?? toServings(p.qty, p.unit, forName);
    if (s != null) return { servings: s, mode: "known" };
    const def = findIngredient(p.name);
    if (def) return { servings: Math.round(p.qty * def.servingsPerUnit * 10) / 10, mode: "known" };
  }
  if (p.level === "lot") return { servings: lotAssumedServings(forName), mode: "lot" };
  if (p.level === "some") return { servings: someAssumedServings(forName), mode: "some" };
  return { servings: null, mode: "unknown" };
}

export type CoverageStatus = "full" | "partial" | "none" | "confirm";
export type CoverageOverride = "manual" | "stock-up" | null;
export interface Coverage extends Requirement {
  required: number;
  onHand: number;
  onHandMode: StockMode;
  toBuy: number;
  status: CoverageStatus;
  override: CoverageOverride;
  /** purchase units to buy and the unit */
  qty: number;
  unit: string;
  estPrice: number | null;
  /** matching pantry rows (compatible variants only) */
  pantry: PantryStock[];
  /** the explanation shown on the list */
  why: string;
  /** a question for the quick pantry check, when the pantry is vague and it matters */
  question: string | null;
}

const list = (u: { name: string; count: number }[]) => u.slice(0, 3).map((x) => (x.count > 1 ? `${x.name} ×${x.count}` : x.name)).join(", ") + (u.length > 3 ? "…" : "");

/** Coverage of one requirement by the pantry, honouring a manual override. */
export function coverRequirement(req: Requirement, pantry: PantryStock[], override: CoverageOverride = null): Coverage {
  const def = findIngredient(req.name);
  const matches = pantry.filter((p) => p.level !== "none" && pantryCovers(req.name, p.name));
  let onHand = 0;
  let mode: StockMode = matches.length ? "known" : "none";
  let vague = false;
  for (const p of matches) {
    const s = stockServings(p, req.name);
    if (s.servings == null) {
      vague = true;
      continue;
    }
    onHand += s.servings;
    if (s.mode === "lot" || s.mode === "some") vague = true;
    if (s.mode !== "known") mode = s.mode;
  }
  const required = req.servings;
  let status: CoverageStatus;
  let toBuy: number;
  let question: string | null = null;
  const usedIn = `Used in ${list(req.usedIn)}`;
  const haveLabel = matches.length ? (mode === "known" ? `have ~${describeServings(onHand, req.name)}` : mode === "lot" ? "pantry: a lot" : mode === "some" ? "pantry: some" : "in pantry (amount unknown)") : "not in pantry";
  if (override === "manual") {
    status = "full";
    toBuy = 0;
  } else if (override === "stock-up") {
    // BUY ANYWAY: on the list regardless of what the pantry says
    status = "none";
    toBuy = required;
  } else if (!matches.length) {
    status = "none";
    toBuy = required;
  } else if (mode === "lot") {
    // A LOT: adequate unless the plan needs unusually much.
    if (required <= onHand) {
      status = "full";
      toBuy = 0;
    } else {
      status = "confirm";
      toBuy = Math.max(0, required - onHand);
      question = `${cap(req.name)} is marked A lot, but this plan needs ~${describeServings(required, req.name)}. Enough?`;
    }
  } else if (mode === "some" || (vague && onHand < required)) {
    status = "confirm";
    toBuy = Math.max(0, required - onHand);
    question = `${cap(req.name)} is marked Some. Need ~${describeServings(required, req.name)}. Enough?`;
  } else if (onHand >= required) {
    status = "full";
    toBuy = 0;
  } else if (onHand > 0) {
    status = "partial";
    toBuy = Math.max(0, required - onHand);
  } else {
    status = "none";
    toBuy = required;
  }
  toBuy = Math.round(toBuy * 10) / 10;
  const qty = toBuy > 0 ? servingsToPurchaseUnits(toBuy, req.name) : 0;
  const unit = def?.unit ?? "each";
  const estPrice = toBuy > 0 ? (def ? Math.round(qty * def.price * 100) / 100 : null) : 0;
  let why: string;
  if (override === "manual") why = `${usedIn} · you said you have it`;
  else if (override === "stock-up") why = `${usedIn} · ${haveLabel} · buying anyway`;
  else if (status === "full") why = `${usedIn} · ${haveLabel} · need ~${describeServings(required, req.name)} · nothing to buy`;
  else if (status === "none") why = `${usedIn} · not in pantry · buy ${describeServings(required, req.name)}`;
  else if (status === "partial") why = `${usedIn} · ${haveLabel} · need ~${describeServings(required, req.name)} · buy ${describeServings(toBuy, req.name)}`;
  else why = `${usedIn} · ${haveLabel} · need ~${describeServings(required, req.name)}`;
  if (req.substitutedFrom) why += ` · swapped in for ${req.substitutedFrom} by your food rules`;
  return { ...req, required, onHand: Math.round(onHand * 10) / 10, onHandMode: mode, toBuy, status, override, qty, unit, estPrice, pantry: matches, why, question };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface ReconcileResult {
  items: Coverage[];
  staples: string[];
  total: number;
  counts: { buy: number; partial: number; have: number; confirm: number };
}

/** Requirements vs pantry → the list. Staples (salt, oil, spices) are assumed and listed separately. */
export function reconcile(reqs: Requirement[], pantry: PantryStock[], opts: { ignorePantry?: boolean; overrides?: Record<string, CoverageOverride> } = {}): ReconcileResult {
  const items: Coverage[] = [];
  const staples: string[] = [];
  for (const r of reqs) {
    if (r.staple) {
      staples.push(r.name);
      continue;
    }
    items.push(coverRequirement(r, opts.ignorePantry ? [] : pantry, opts.overrides?.[r.name] ?? null));
  }
  items.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  const total = Math.round(items.reduce((a, i) => a + (i.estPrice ?? 0), 0) * 100) / 100;
  return { items, staples, total, counts: { buy: items.filter((i) => i.status === "none" || i.override === "stock-up").length, partial: items.filter((i) => i.status === "partial").length, have: items.filter((i) => i.status === "full").length, confirm: items.filter((i) => i.status === "confirm").length } };
}

/** One call for the common case. */
export function shoppingListFor(meals: MealReq[], pantry: PantryStock[], rules?: FoodRules | null, opts: Parameters<typeof reconcile>[2] = {}): ReconcileResult {
  return reconcile(requirementsFromMeals(meals, rules), pantry, opts);
}
