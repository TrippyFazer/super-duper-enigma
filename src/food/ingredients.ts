/**
 * Ingredient catalog used for grocery estimates, pantry matching and reuse
 * scoring. Prices are rough US supermarket estimates (2026) per purchase unit
 * and are always labelled as estimates in the UI; actual prices entered after
 * shopping override them.
 */
export type GroceryCategory = "produce" | "protein" | "dairy" | "grains" | "frozen" | "pantry" | "other";

export interface IngredientDef {
  /** canonical lowercase name */
  name: string;
  aliases?: string[];
  category: GroceryCategory;
  /** purchase unit, e.g. "lb", "dozen", "bag", "jar" */
  unit: string;
  /** estimated price per purchase unit (USD) */
  price: number;
  /** how many meal-servings one purchase unit covers */
  servingsPerUnit: number;
  /** typical shelf life in days once bought */
  shelfDays: number;
  /** staple = usually already in the pantry (not re-bought every week) */
  staple?: boolean;
}

const d = (name: string, category: GroceryCategory, unit: string, price: number, servingsPerUnit: number, shelfDays: number, aliases: string[] = [], staple = false): IngredientDef => ({ name, category, unit, price, servingsPerUnit, shelfDays, aliases, staple });

export const INGREDIENTS: IngredientDef[] = [
  // protein
  d("chicken breast", "protein", "lb", 4.0, 2.5, 3, ["chicken", "chicken breasts"]),
  d("chicken thighs", "protein", "lb", 2.8, 2.5, 3, ["chicken thigh", "boneless thighs"]),
  d("whole chicken", "protein", "each", 9.0, 6, 3),
  d("ground beef", "protein", "lb", 5.5, 3, 2, ["beef", "mince"]),
  d("ground turkey", "protein", "lb", 4.5, 3, 2, ["turkey mince"]),
  d("steak", "protein", "lb", 11.0, 2, 3, ["sirloin", "flank steak"]),
  d("pork chops", "protein", "lb", 4.5, 2, 3, ["pork"]),
  d("salmon", "protein", "lb", 11.0, 2.5, 2, ["salmon fillet", "salmon fillets"]),
  d("shrimp", "protein", "lb", 9.0, 3, 2, ["prawns"]),
  d("tuna", "pantry", "can", 1.5, 1, 365, ["canned tuna"]),
  d("tofu", "protein", "block", 2.5, 3, 7),
  d("eggs", "dairy", "dozen", 3.5, 6, 21, ["egg"]),
  d("turkey", "protein", "lb", 7.0, 4, 5, ["deli turkey", "sliced turkey"]),
  d("bacon", "protein", "pack", 6.0, 6, 7),
  d("sausage", "protein", "lb", 5.0, 3, 5),
  d("protein powder", "pantry", "tub", 30.0, 25, 180, [], true),
  // dairy
  d("greek yogurt", "dairy", "tub", 5.0, 5, 14, ["yogurt"]),
  d("cottage cheese", "dairy", "tub", 4.0, 4, 10),
  d("milk", "dairy", "half gallon", 2.5, 8, 10),
  d("cheese", "dairy", "block", 4.0, 8, 21, ["cheddar", "shredded cheese", "mozzarella"]),
  d("parmesan", "dairy", "wedge", 5.0, 10, 45),
  d("feta", "dairy", "tub", 4.0, 6, 21),
  d("butter", "dairy", "pack", 4.0, 16, 60, [], true),
  d("cream cheese", "dairy", "pack", 2.5, 6, 21),
  // produce
  d("spinach", "produce", "bag", 3.0, 4, 5, ["baby spinach"]),
  d("lettuce", "produce", "head", 2.0, 4, 6, ["romaine", "mixed greens"]),
  d("kale", "produce", "bunch", 2.5, 4, 6),
  d("broccoli", "produce", "head", 2.0, 3, 6),
  d("bell pepper", "produce", "each", 1.2, 1.5, 7, ["bell peppers", "peppers", "red pepper"]),
  d("onion", "produce", "each", 0.8, 3, 21, ["onions", "yellow onion"]),
  d("red onion", "produce", "each", 1.0, 3, 21),
  d("green onion", "produce", "bunch", 1.0, 4, 7, ["scallions", "spring onion"]),
  d("garlic", "produce", "head", 0.8, 8, 30, [], true),
  d("ginger", "produce", "piece", 1.0, 6, 21, [], true),
  d("tomato", "produce", "each", 0.9, 1.5, 6, ["tomatoes"]),
  d("cherry tomatoes", "produce", "pint", 3.0, 3, 6),
  d("cucumber", "produce", "each", 1.0, 2, 7),
  d("avocado", "produce", "each", 1.5, 1.5, 4, ["avocados"]),
  d("potatoes", "produce", "bag", 4.0, 8, 21, ["potato", "russet potatoes"]),
  d("sweet potato", "produce", "each", 1.2, 1.5, 14, ["sweet potatoes"]),
  d("carrot", "produce", "bag", 1.8, 8, 21, ["carrots"]),
  d("celery", "produce", "bunch", 2.0, 6, 14),
  d("zucchini", "produce", "each", 1.0, 1.5, 7, ["courgette"]),
  d("mushrooms", "produce", "pack", 3.0, 3, 5, ["mushroom"]),
  d("banana", "produce", "bunch", 1.5, 6, 5, ["bananas"]),
  d("apple", "produce", "bag", 4.0, 8, 21, ["apples"]),
  d("berries", "produce", "pint", 4.0, 3, 4, ["blueberries", "strawberries", "mixed berries"]),
  d("lemon", "produce", "each", 0.6, 2, 14, ["lemons"]),
  d("lime", "produce", "each", 0.5, 2, 14, ["limes"]),
  d("cilantro", "produce", "bunch", 1.0, 6, 5, ["coriander"]),
  d("parsley", "produce", "bunch", 1.0, 6, 5),
  d("corn", "produce", "each", 0.8, 1, 5, ["corn on the cob"]),
  d("cabbage", "produce", "head", 2.0, 6, 21),
  d("asparagus", "produce", "bunch", 3.5, 2, 4),
  d("green beans", "produce", "bag", 2.5, 3, 6),
  d("fruit", "produce", "bag", 4.0, 6, 7),
  // grains / bread
  d("rice", "grains", "bag", 3.0, 10, 365, ["white rice", "brown rice", "jasmine rice"]),
  d("quinoa", "grains", "bag", 5.0, 8, 365),
  d("pasta", "grains", "box", 1.5, 4, 365, ["spaghetti", "penne"]),
  d("oats", "grains", "canister", 4.0, 12, 365, ["rolled oats", "oatmeal"]),
  d("bread", "grains", "loaf", 3.0, 8, 5, ["sourdough", "whole wheat bread"]),
  d("tortilla", "grains", "pack", 3.0, 8, 14, ["tortillas", "wraps"]),
  d("bagel", "grains", "pack", 3.5, 6, 6, ["bagels"]),
  d("granola", "grains", "bag", 4.5, 8, 90),
  d("flour", "pantry", "bag", 3.0, 20, 180, [], true),
  d("couscous", "grains", "box", 2.5, 5, 365),
  // frozen
  d("frozen vegetables", "frozen", "bag", 2.5, 4, 180, ["frozen veg", "frozen broccoli", "frozen peas", "peas"]),
  d("frozen berries", "frozen", "bag", 4.0, 6, 180),
  d("frozen shrimp", "frozen", "bag", 9.0, 4, 180),
  // pantry
  d("olive oil", "pantry", "bottle", 9.0, 40, 365, ["oil", "vegetable oil"], true),
  d("sesame oil", "pantry", "bottle", 5.0, 30, 365, [], true),
  d("soy sauce", "pantry", "bottle", 3.0, 30, 365, [], true),
  d("hot sauce", "pantry", "bottle", 3.0, 30, 365, ["sriracha"], true),
  d("salsa", "pantry", "jar", 3.0, 5, 21),
  d("peanut butter", "pantry", "jar", 3.5, 15, 120, [], true),
  d("honey", "pantry", "jar", 5.0, 30, 365, [], true),
  d("canned tomatoes", "pantry", "can", 1.5, 3, 365, ["crushed tomatoes", "diced tomatoes"]),
  d("tomato paste", "pantry", "can", 1.0, 4, 365, [], true),
  d("black beans", "pantry", "can", 1.2, 2, 365, ["beans"]),
  d("chickpeas", "pantry", "can", 1.2, 2, 365, ["garbanzo beans"]),
  d("white beans", "pantry", "can", 1.2, 2, 365, ["cannellini beans"]),
  d("lentils", "pantry", "bag", 2.5, 8, 365),
  d("vegetable stock", "pantry", "carton", 2.5, 3, 365, ["chicken stock", "broth", "stock"]),
  d("coconut milk", "pantry", "can", 2.0, 3, 365),
  d("nuts", "pantry", "bag", 7.0, 10, 90, ["almonds", "walnuts", "pecans"]),
  d("chia seeds", "pantry", "bag", 6.0, 20, 365, [], true),
  d("salt", "pantry", "box", 1.0, 100, 999, [], true),
  d("pepper", "pantry", "jar", 3.0, 100, 999, ["black pepper"], true),
  d("cumin", "pantry", "jar", 3.0, 40, 999, [], true),
  d("paprika", "pantry", "jar", 3.0, 40, 999, ["smoked paprika"], true),
  d("chili powder", "pantry", "jar", 3.0, 40, 999, ["chili flakes", "red pepper flakes"], true),
  d("oregano", "pantry", "jar", 2.5, 40, 999, ["italian seasoning", "thyme", "rosemary"], true),
  d("cinnamon", "pantry", "jar", 3.0, 40, 999, [], true),
  d("curry powder", "pantry", "jar", 3.5, 20, 999, ["curry paste", "garam masala"], true),
  d("mustard", "pantry", "jar", 2.0, 30, 365, ["dijon mustard"], true),
  d("mayonnaise", "pantry", "jar", 4.0, 30, 90, ["mayo"], true),
  d("vinegar", "pantry", "bottle", 3.0, 40, 999, ["balsamic vinegar", "rice vinegar", "apple cider vinegar"], true),
  d("cornstarch", "pantry", "box", 2.0, 40, 999, [], true),
  d("sugar", "pantry", "bag", 3.0, 60, 999, ["brown sugar", "maple syrup"], true),
  d("baking powder", "pantry", "can", 2.5, 40, 365, ["baking soda"], true),
  d("white wine", "pantry", "bottle", 8.0, 8, 14),
  d("dark chocolate", "pantry", "bar", 3.0, 6, 180),
  d("protein bar", "pantry", "box", 12.0, 6, 180, ["protein bars"]),
];

const INDEX = new Map<string, IngredientDef>();
for (const i of INGREDIENTS) {
  INDEX.set(i.name, i);
  for (const a of i.aliases ?? []) INDEX.set(a, i);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b\d+([.,/]\d+)?\s*(lb|lbs|oz|g|kg|cups?|tbsp|tsp|cans?|cloves?)\b/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Map a free-text ingredient to a catalog entry (exact, alias, then substring). */
export function findIngredient(text: string): IngredientDef | null {
  const n = norm(text);
  if (!n) return null;
  if (INDEX.has(n)) return INDEX.get(n)!;
  const singular = n.endsWith("es") ? n.slice(0, -2) : n.endsWith("s") ? n.slice(0, -1) : n;
  if (INDEX.has(singular)) return INDEX.get(singular)!;
  // longest key contained in the text (so "boneless chicken breast" → chicken breast, not chicken)
  let best: IngredientDef | null = null;
  let bestLen = 0;
  for (const [k, v] of INDEX) {
    if (k.length > bestLen && (n.includes(k) || k.includes(n) && n.length >= 4)) {
      best = v;
      bestLen = k.length;
    }
  }
  return best;
}

export function canonicalName(text: string): string {
  return findIngredient(text)?.name ?? norm(text);
}

export function categoryFor(text: string): GroceryCategory {
  return findIngredient(text)?.category ?? "other";
}

/** Whether two ingredient strings refer to the same thing. */
export function sameIngredient(a: string, b: string): boolean {
  return canonicalName(a) === canonicalName(b);
}

export const CATEGORY_ORDER: GroceryCategory[] = ["produce", "protein", "dairy", "grains", "frozen", "pantry", "other"];
export const CATEGORY_LABEL: Record<GroceryCategory, string> = { produce: "Produce", protein: "Protein", dairy: "Dairy", grains: "Grains & bread", frozen: "Frozen", pantry: "Pantry", other: "Other" };
