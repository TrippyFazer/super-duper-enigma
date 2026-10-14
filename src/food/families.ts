import { findIngredient, type IngredientDef } from "./ingredients";

/**
 * Ingredient FAMILY / VARIANT model + the handful of unit conversions real
 * grocery shopping needs.
 *
 *  family   what a recipe usually asks for ("rice", "milk", "bread")
 *  variant  what is actually on the shelf ("jasmine rice", "lactose-free milk")
 *  tags     facts a food rule can key on (dairy, lactose, gluten, pork, …)
 *
 * Compatible variants satisfy a requirement (jasmine rice covers "rice").
 * Variants that matter for a rule never collapse: regular milk does NOT
 * cover "lactose-free milk".
 */
export type FoodTag = "dairy" | "lactose" | "gluten" | "meat" | "pork" | "beef" | "poultry" | "fish" | "shellfish" | "egg" | "soy" | "nuts" | "peanut" | "sesame" | "alcohol" | "sugar";

export interface Variant {
  name: string;
  tags: FoodTag[];
  aliases?: string[];
  /** macro delta per cup/serving versus the family default, when known (for substitution estimates) */
  macros?: { calories: number; protein: number; carbs: number; fat: number };
}
export interface Family {
  family: string;
  /** the plain requirement name recipes use */
  base: string;
  variants: Variant[];
  /**
   * false = the ingredient is the dish's identity (chicken, ground beef, eggs): a rule against it
   * excludes the recipe rather than quietly swapping in another variant. Explicit substitutes still apply.
   */
  swappable?: boolean;
}

const V = (name: string, tags: FoodTag[], aliases: string[] = [], macros?: Variant["macros"]): Variant => ({ name, tags, aliases, macros });

export const FAMILIES: Family[] = [
  {
    family: "milk",
    base: "milk",
    variants: [
      V("milk", ["dairy", "lactose"], ["whole milk", "2% milk", "skim milk", "regular milk", "dairy milk", "1% milk"], { calories: 150, protein: 8, carbs: 12, fat: 8 }),
      V("lactose-free milk", ["dairy"], ["lactose free milk", "lactaid", "fairlife", "lactose-free 2%", "lactose-free whole milk"], { calories: 130, protein: 8, carbs: 12, fat: 5 }),
      V("oat milk", [], ["oatmilk", "oatly"], { calories: 120, protein: 3, carbs: 16, fat: 5 }),
      V("almond milk", ["nuts"], ["almondmilk"], { calories: 40, protein: 1, carbs: 2, fat: 3 }),
      V("soy milk", ["soy"], ["soymilk"], { calories: 100, protein: 7, carbs: 8, fat: 4 }),
    ],
  },
  {
    family: "yogurt",
    base: "greek yogurt",
    variants: [
      V("greek yogurt", ["dairy", "lactose"], ["yogurt", "yoghurt", "plain yogurt", "skyr"]),
      V("lactose-free yogurt", ["dairy"], ["lactose free yogurt", "lactose-free greek yogurt"]),
      V("coconut yogurt", [], ["dairy-free yogurt", "oat yogurt", "almond yogurt"]),
    ],
  },
  {
    family: "cheese",
    base: "cheese",
    variants: [V("cheese", ["dairy", "lactose"], ["cheddar", "mozzarella", "shredded cheese"]), V("lactose-free cheese", ["dairy"], ["lactose free cheese"]), V("vegan cheese", [], ["dairy-free cheese", "plant-based cheese"])],
  },
  { family: "cottage cheese", base: "cottage cheese", variants: [V("cottage cheese", ["dairy", "lactose"]), V("lactose-free cottage cheese", ["dairy"], ["lactose free cottage cheese"])] },
  { family: "butter", base: "butter", variants: [V("butter", ["dairy"]), V("plant butter", [], ["vegan butter", "margarine"])] },
  { family: "cream cheese", base: "cream cheese", variants: [V("cream cheese", ["dairy", "lactose"]), V("dairy-free cream cheese", [], ["vegan cream cheese"])] },
  { family: "feta", base: "feta", variants: [V("feta", ["dairy", "lactose"]), V("vegan feta", [])] },
  { family: "parmesan", base: "parmesan", variants: [V("parmesan", ["dairy"]), V("nutritional yeast", [])] },
  {
    family: "rice",
    base: "rice",
    variants: [V("rice", [], ["white rice", "long grain rice"]), V("jasmine rice", [], ["thai jasmine rice"]), V("basmati rice", []), V("brown rice", []), V("sushi rice", []), V("wild rice", [])],
  },
  {
    family: "bread",
    base: "bread",
    variants: [V("bread", ["gluten"], ["white bread", "sandwich bread", "sourdough"]), V("whole wheat bread", ["gluten"], ["wholemeal bread"]), V("gluten-free bread", [], ["gluten free bread", "gf bread"])],
  },
  { family: "tortilla", base: "tortilla", variants: [V("tortilla", ["gluten"], ["flour tortilla", "wraps", "tortillas"]), V("corn tortilla", [], ["corn tortillas"]), V("gluten-free tortilla", [], ["gluten free tortilla", "gf tortilla"])] },
  { family: "pasta", base: "pasta", variants: [V("pasta", ["gluten"], ["spaghetti", "penne", "fusilli"]), V("gluten-free pasta", [], ["gluten free pasta", "chickpea pasta", "lentil pasta", "rice noodles"])] },
  { family: "oats", base: "oats", variants: [V("oats", [], ["rolled oats", "oatmeal", "quick oats"]), V("gluten-free oats", [], ["gluten free oats", "certified gluten-free oats"])] },
  { family: "flour", base: "flour", variants: [V("flour", ["gluten"], ["all-purpose flour", "wheat flour"]), V("gluten-free flour", [], ["gluten free flour", "almond flour", "oat flour"])] },
  { family: "soy sauce", base: "soy sauce", variants: [V("soy sauce", ["gluten", "soy"]), V("tamari", ["soy"], ["gluten-free soy sauce"]), V("coconut aminos", [])] },
  { family: "chicken", base: "chicken breast", swappable: false, variants: [V("chicken breast", ["meat", "poultry"], ["chicken", "chicken breasts"]), V("chicken thighs", ["meat", "poultry"], ["chicken thigh", "boneless thighs"]), V("whole chicken", ["meat", "poultry"])] },
  { family: "ground meat", base: "ground beef", swappable: false, variants: [V("ground beef", ["meat", "beef"], ["beef", "mince"]), V("ground turkey", ["meat", "poultry"], ["turkey mince"]), V("plant-based ground", ["soy"], ["beyond meat", "impossible", "veggie crumbles"])] },
  { family: "peanut butter", base: "peanut butter", variants: [V("peanut butter", ["peanut", "nuts"]), V("almond butter", ["nuts"]), V("sunflower butter", [], ["sunbutter", "seed butter"])] },
  { family: "eggs", base: "eggs", swappable: false, variants: [V("eggs", ["egg"], ["egg", "large eggs"]), V("egg substitute", [], ["just egg", "egg replacer"])] },
  { family: "protein powder", base: "protein powder", variants: [V("protein powder", ["dairy"], ["whey", "whey protein"]), V("plant protein powder", ["soy"], ["pea protein", "vegan protein powder"]), V("egg white protein", ["egg"])] },
];

/** Tags implied by catalog names when no family covers them. */
const TAG_RULES: [RegExp, FoodTag[]][] = [
  [/\b(pork|bacon|ham|sausage|prosciutto|chorizo|pepperoni)\b/, ["meat", "pork"]],
  [/\b(beef|steak|sirloin|flank|brisket|lamb)\b/, ["meat", "beef"]],
  [/\b(chicken|turkey|duck)\b/, ["meat", "poultry"]],
  [/\b(shrimp|prawn|crab|lobster|clam|mussel|scallop|oyster)\b/, ["fish", "shellfish"]],
  [/\b(salmon|tuna|cod|tilapia|fish|anchov|sardine)\b/, ["fish"]],
  [/\b(cheese|yogurt|yoghurt|milk|butter|cream|feta|parmesan|ricotta|mozzarella|cottage|whey|ghee)\b/, ["dairy"]],
  [/\b(bread|pasta|noodle|tortilla|flour|bagel|couscous|bun|barley|seitan|granola|crouton|wrap)\b/, ["gluten"]],
  [/\b(egg|eggs)\b/, ["egg"]],
  [/\b(peanut)\b/, ["peanut", "nuts"]],
  [/\b(almond|walnut|pecan|cashew|pistachio|hazelnut|nuts)\b/, ["nuts"]],
  [/\b(tofu|tempeh|edamame|soy)\b/, ["soy"]],
  [/\b(sesame|tahini)\b/, ["sesame"]],
  [/\b(wine|beer|vodka|rum|bourbon)\b/, ["alcohol"]],
];

const VARIANT_INDEX = new Map<string, { family: Family; variant: Variant }>();
for (const f of FAMILIES) for (const v of f.variants) for (const k of [v.name, ...(v.aliases ?? [])]) VARIANT_INDEX.set(k, { family: f, variant: v });
const esc = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
const VARIANT_RE = [...VARIANT_INDEX.keys()].map((k) => ({ k, re: new RegExp(`(^|\\s)${esc(k)}s?(\\s|$)`) })).sort((a, b) => b.k.length - a.k.length);

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b\d+([.,/]\d+)?\s*(lb|lbs|oz|g|kg|cups?|tbsp|tsp|ml|l|cans?|cloves?|slices?|pieces?)\b/g, "")
    .replace(/[^a-z %-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface IngredientInfo {
  /** text as given, cleaned */
  text: string;
  /** family id or null */
  family: string | null;
  /** exact variant name (defaults to the family base or the catalog canonical) */
  variant: string;
  /** catalog canonical name (for prices / categories) */
  canonical: string;
  tags: FoodTag[];
  def: IngredientDef | null;
  /** true when the text named a specific variant ("jasmine rice") rather than the family default ("rice") */
  specific: boolean;
}

const INFO_CACHE = new Map<string, IngredientInfo>();

/**
 * Normalise free text into family / variant / tags.
 * "lactose free milk", "Lactaid 2%" → milk family, lactose-free variant.
 * The catalog decides membership: "rice vinegar" maps to vinegar, so it is not rice.
 */
export function ingredientInfo(text: string): IngredientInfo {
  const hit = INFO_CACHE.get(text);
  if (hit) return hit;
  const t = clean(text);
  const def = findIngredient(text);
  // longest variant key found as a whole phrase in the text (so "lactose-free milk" wins over "milk")
  const fromText = VARIANT_RE.find((x) => x.re.test(t));
  const fromDef = def ? VARIANT_INDEX.get(def.name) : undefined;
  let match: { family: Family; variant: Variant } | undefined;
  if (fromText) {
    const m = VARIANT_INDEX.get(fromText.k)!;
    // The text may be more specific than the catalog ("jasmine rice" → rice family, jasmine variant), but the
    // catalog decides membership: "rice vinegar" is vinegar, "coconut milk" (the can) is not milk.
    if (!def || (fromDef && fromDef.family === m.family)) match = m;
    else if (def && !fromDef && (t === fromText.k || t === `${fromText.k}s`)) match = m;
    else if (fromDef) match = fromDef;
  } else if (fromDef) match = fromDef;
  let info: IngredientInfo;
  if (match) {
    info = { text: t, family: match.family.family, variant: match.variant.name, canonical: def?.name ?? match.variant.name, tags: match.variant.tags, def, specific: match.variant !== match.family.variants[0] };
  } else {
    const tags = new Set<FoodTag>();
    for (const [re, tg] of TAG_RULES) if (re.test(t) || (def && re.test(def.name))) tg.forEach((x) => tags.add(x));
    info = { text: t, family: null, variant: def?.name ?? t, canonical: def?.name ?? t, tags: [...tags], def, specific: false };
  }
  if (INFO_CACHE.size > 5000) INFO_CACHE.clear();
  INFO_CACHE.set(text, info);
  return info;
}

/** The name the pantry / shopping list stores: the exact variant when the family model knows it, else the catalog canonical. */
export function storageName(text: string): string {
  const i = ingredientInfo(text);
  return i.family ? i.variant : i.canonical || i.text;
}

export function variantsOf(family: string): Variant[] {
  return FAMILIES.find((f) => f.family === family)?.variants ?? [];
}
export function familySwappable(family: string): boolean {
  return FAMILIES.find((f) => f.family === family)?.swappable !== false;
}
export function familyOf(text: string): Family | null {
  const f = ingredientInfo(text).family;
  return f ? (FAMILIES.find((x) => x.family === f) ?? null) : null;
}

/**
 * Can a pantry item satisfy a requirement?
 *  - same catalog canonical or same family, and
 *  - the pantry variant must not carry a tag the requirement variant deliberately lacks
 *    (requirement "lactose-free milk" ← pantry "milk" is NOT ok; requirement "milk" ← "lactose-free milk" is ok;
 *     requirement "rice" ← "jasmine rice" is ok).
 */
export function pantryCovers(requirement: string, pantryName: string): boolean {
  const r = ingredientInfo(requirement);
  const p = ingredientInfo(pantryName);
  if (r.family && p.family) {
    if (r.family !== p.family) return false;
    if (r.variant === p.variant) return true;
    // Any variant of the family covers it, unless the pantry variant carries a tag the requirement
    // deliberately lacks: "milk" (lactose) never covers "lactose-free milk"; "bread" never covers "gluten-free bread".
    const rTags = new Set(r.tags);
    return p.tags.every((t) => rTags.has(t));
  }
  return !!r.canonical && r.canonical === p.canonical;
}

// ------------------------------------------------------------ units ----
export type BaseUnit = "g" | "ml" | "each";

const G: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6 };
const ML: Record<string, number> = { ml: 1, l: 1000, liter: 1000, litre: 1000, cup: 240, cups: 240, tbsp: 15, tablespoon: 15, tsp: 5, teaspoon: 5, pint: 473, quart: 946, "half gallon": 1893, gallon: 3785, "fl oz": 29.6 };
const EACH: Record<string, number> = { each: 1, count: 1, piece: 1, pieces: 1, dozen: 12, "half dozen": 6, slice: 1, slices: 1 };

/** Grams per cup for dry goods measured by volume in recipes. */
const DENSITY_G_PER_CUP: Record<string, number> = { rice: 185, "jasmine rice": 185, "basmati rice": 185, "brown rice": 190, "gluten-free pasta": 100, oats: 90, flour: 125, quinoa: 170, lentils: 190, pasta: 100, sugar: 200, "greek yogurt": 245, "cottage cheese": 225, cheese: 110, berries: 150, spinach: 30 };

/** Base quantity of one purchase unit for common catalog items (what "1 bag of rice" means). */
const PURCHASE_BASE: Record<string, { qty: number; unit: BaseUnit }> = {
  rice: { qty: 907, unit: "g" }, // 2 lb bag
  "jasmine rice": { qty: 907, unit: "g" },
  "basmati rice": { qty: 907, unit: "g" },
  "brown rice": { qty: 907, unit: "g" },
  quinoa: { qty: 454, unit: "g" },
  oats: { qty: 1020, unit: "g" },
  pasta: { qty: 454, unit: "g" },
  flour: { qty: 2268, unit: "g" },
  lentils: { qty: 454, unit: "g" },
  milk: { qty: 1893, unit: "ml" },
  "lactose-free milk": { qty: 1893, unit: "ml" },
  "oat milk": { qty: 1420, unit: "ml" },
  "almond milk": { qty: 1420, unit: "ml" },
  "soy milk": { qty: 1420, unit: "ml" },
  "lactose-free yogurt": { qty: 907, unit: "g" },
  "lactose-free cottage cheese": { qty: 454, unit: "g" },
  "lactose-free cheese": { qty: 227, unit: "g" },
  "greek yogurt": { qty: 907, unit: "g" },
  "cottage cheese": { qty: 454, unit: "g" },
  cheese: { qty: 227, unit: "g" },
  eggs: { qty: 12, unit: "each" },
  "chicken breast": { qty: 454, unit: "g" },
  "chicken thighs": { qty: 454, unit: "g" },
  "ground beef": { qty: 454, unit: "g" },
  "ground turkey": { qty: 454, unit: "g" },
  salmon: { qty: 454, unit: "g" },
  shrimp: { qty: 454, unit: "g" },
  spinach: { qty: 142, unit: "g" },
  bread: { qty: 20, unit: "each" }, // slices
  "whole wheat bread": { qty: 20, unit: "each" },
  "gluten-free bread": { qty: 16, unit: "each" },
  "gluten-free pasta": { qty: 340, unit: "g" },
  "corn tortilla": { qty: 12, unit: "each" },
  tortilla: { qty: 8, unit: "each" },
  banana: { qty: 6, unit: "each" },
  apple: { qty: 8, unit: "each" },
  potatoes: { qty: 2268, unit: "g" },
};

/** Base quantity per *serving* (what one recipe serving uses), derived from the catalog's servingsPerUnit when not listed. */
const SERVING_BASE: Record<string, number> = { rice: 90, "jasmine rice": 90, "basmati rice": 90, "brown rice": 90, "lactose-free milk": 240, "oat milk": 240, "almond milk": 240, "soy milk": 240, "lactose-free yogurt": 170, "lactose-free cottage cheese": 110, "lactose-free cheese": 30, "whole wheat bread": 2, "gluten-free bread": 2, "gluten-free pasta": 100, "corn tortilla": 2, quinoa: 60, oats: 80, pasta: 100, flour: 60, lentils: 60, milk: 240, "greek yogurt": 170, "cottage cheese": 110, cheese: 30, eggs: 2, "chicken breast": 170, "chicken thighs": 170, "ground beef": 150, "ground turkey": 150, salmon: 170, shrimp: 150, spinach: 40, bread: 2, tortilla: 1, banana: 1, apple: 1, potatoes: 250 };

export function baseUnitFor(name: string): BaseUnit | null {
  const c = ingredientInfo(name).canonical;
  return PURCHASE_BASE[c]?.unit ?? null;
}

/** Convert a quantity in any supported unit to the ingredient's base unit. Returns null when not convertible. */
export function toBase(qty: number, unit: string, name: string): number | null {
  const u = unit.trim().toLowerCase();
  const info = ingredientInfo(name);
  const c = info.canonical;
  const base = PURCHASE_BASE[c]?.unit;
  const def = info.def;
  // purchase unit of the catalog ("bag", "dozen", "half gallon", "loaf", "pack")
  if (def && (u === def.unit || u === `${def.unit}s`) && PURCHASE_BASE[c]) return qty * PURCHASE_BASE[c].qty;
  if (u === "serving" || u === "servings") return qty * (SERVING_BASE[c] ?? NaN) || null;
  if (base === "g") {
    if (G[u] != null) return qty * G[u];
    if (ML[u] != null) {
      const density = DENSITY_G_PER_CUP[c];
      return density ? (qty * ML[u] * density) / 240 : null;
    }
    return null;
  }
  if (base === "ml") {
    if (ML[u] != null) return qty * ML[u];
    if (G[u] != null) return qty * G[u]; // ≈ water density
    return null;
  }
  if (base === "each") {
    if (EACH[u] != null) return qty * EACH[u];
    return null;
  }
  return null;
}

/** Quantity in servings from a quantity in any unit. Falls back to the catalog's servingsPerUnit for purchase units. */
export function toServings(qty: number, unit: string, name: string): number | null {
  const info = ingredientInfo(name);
  const c = info.canonical;
  const u = unit.trim().toLowerCase();
  if (u === "serving" || u === "servings") return qty;
  // the catalog's purchase unit is authoritative ("1 bag of rice" = 10 servings)
  if (info.def && (u === info.def.unit || u === `${info.def.unit}s`)) return Math.round(qty * info.def.servingsPerUnit * 10) / 10;
  const b = toBase(qty, unit, name);
  if (b != null && SERVING_BASE[c]) return Math.round((b / SERVING_BASE[c]) * 10) / 10;
  return null;
}

/** Servings → purchase units to buy (rounded up to a sensible fraction). */
export function servingsToPurchaseUnits(servings: number, name: string): number {
  const def = ingredientInfo(name).def;
  if (!def) return Math.max(1, Math.ceil(servings));
  return Math.max(0.5, Math.ceil((servings / def.servingsPerUnit) * 2) / 2);
}

export function describeServings(servings: number, name: string): string {
  const c = ingredientInfo(name).canonical;
  const base = PURCHASE_BASE[c]?.unit;
  const per = SERVING_BASE[c];
  if (base === "each" && per) {
    const n = Math.round(servings * per);
    return c === "bread" ? `${n} slices` : `${n}`;
  }
  if (base === "ml" && per) return `${Math.round((servings * per) / 240 * 2) / 2} cups`;
  if (base === "g" && per && DENSITY_G_PER_CUP[c]) return `${Math.round(((servings * per) / DENSITY_G_PER_CUP[c]) * 2) / 2} cups`;
  if (base === "g" && per) return `${Math.round((servings * per) / 453.6 * 10) / 10} lb`;
  return `${Math.round(servings * 10) / 10} servings`;
}
