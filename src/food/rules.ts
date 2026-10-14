import { FAMILIES, familySwappable, ingredientInfo, variantsOf, type FoodTag } from "./families";
import type { NutritionPrefs } from "@/services/preferences";

/**
 * USER FOOD RULES. Not loose strings for the AI: deterministic constraints
 * with clear semantics, applied to every plan (AI or template) before it is
 * shown, and to every grocery list.
 *
 *  hard        never generate it (allergy, religious, strict diet)        → reject / repair
 *  avoid       don't use it; swap for the substitute when one exists       → substitute, else reject
 *  prefer-sub  not forbidden, but use the substitute whenever reasonable   → substitute
 *  prefer      rank up, never required                                     → scoring only
 *  dislike     rank down, not prohibited                                   → scoring (and recipe exclusion)
 */
export type RuleKind = "allergy" | "intolerance" | "religious" | "avoid" | "prefer-substitute" | "prefer" | "dislike";

export interface FoodRule {
  id: string;
  kind: RuleKind;
  /** ingredient, family or tag: "milk", "rice", "pork", "dairy", "gluten", "shellfish", "peanut" */
  target: string;
  /** replacement ingredient for avoid / prefer-substitute */
  substitute?: string | null;
  note?: string;
}

export interface FoodRules {
  /** tags / families / ingredients that must never appear */
  hard: { target: string; kind: RuleKind; substitute: string | null }[];
  /** avoid when possible, substitute known */
  avoid: { target: string; substitute: string | null; strictness: "avoid" | "prefer-substitute" }[];
  prefer: string[];
  dislikes: string[];
  likes: string[];
  /** original broad tags, kept for AI context and display */
  diets: string[];
}

const TAGS: FoodTag[] = ["dairy", "lactose", "gluten", "meat", "pork", "beef", "poultry", "fish", "shellfish", "egg", "soy", "nuts", "peanut", "sesame", "alcohol", "sugar"];
export const isTag = (s: string): s is FoodTag => (TAGS as string[]).includes(s);

/** Broad diet chips still work; they become hard tag rules. Rich rules live in prefs.foodRules. */
export function deriveRules(prefs: Pick<NutritionPrefs, "dietPrefs" | "dislikes" | "likes"> & { foodRules?: FoodRule[] }): FoodRules {
  const hard: FoodRules["hard"] = [];
  const avoid: FoodRules["avoid"] = [];
  const prefer: string[] = [];
  const dislikes = [...(prefs.dislikes ?? [])].map((d) => d.trim().toLowerCase()).filter(Boolean);
  for (const d of prefs.dietPrefs ?? []) {
    const k = d.toLowerCase();
    if (k === "vegetarian") hard.push({ target: "meat", kind: "religious", substitute: null }, { target: "fish", kind: "religious", substitute: null });
    else if (k === "pescatarian") hard.push({ target: "meat", kind: "religious", substitute: null });
    else if (k === "vegan") hard.push({ target: "meat", kind: "religious", substitute: null }, { target: "fish", kind: "religious", substitute: null }, { target: "dairy", kind: "religious", substitute: null }, { target: "egg", kind: "religious", substitute: null });
    else if (k === "dairy-free") hard.push({ target: "dairy", kind: "intolerance", substitute: null });
    else if (k === "gluten-free") hard.push({ target: "gluten", kind: "intolerance", substitute: null });
    else if (k === "halal" || k === "kosher" || k === "no-pork") hard.push({ target: "pork", kind: "religious", substitute: null });
    else if (k === "nut-free") hard.push({ target: "nuts", kind: "allergy", substitute: null });
    else if (k === "low-lactose" || k === "lactose-free" || k === "lactose-intolerant") avoid.push({ target: "lactose", substitute: null, strictness: "prefer-substitute" });
    // low-carb is a macro preference handled by the planners, not an ingredient rule
  }
  for (const r of prefs.foodRules ?? []) {
    const target = r.target.trim().toLowerCase();
    if (!target) continue;
    if (r.kind === "allergy" || r.kind === "intolerance" || r.kind === "religious") hard.push({ target, kind: r.kind, substitute: r.substitute?.trim().toLowerCase() || null });
    else if (r.kind === "avoid") avoid.push({ target, substitute: r.substitute?.trim().toLowerCase() || null, strictness: "avoid" });
    else if (r.kind === "prefer-substitute") avoid.push({ target, substitute: r.substitute?.trim().toLowerCase() || null, strictness: "prefer-substitute" });
    else if (r.kind === "prefer") prefer.push(target);
    else if (r.kind === "dislike") dislikes.push(target);
  }
  return { hard, avoid, prefer, dislikes: [...new Set(dislikes)], likes: (prefs.likes ?? []).map((l) => l.toLowerCase()), diets: prefs.dietPrefs ?? [] };
}

/** Does a rule target (tag, family or ingredient) match an ingredient? */
export function targetMatches(target: string, ingredient: string): boolean {
  const info = ingredientInfo(ingredient);
  if (isTag(target)) return info.tags.includes(target);
  const t = ingredientInfo(target);
  if (t.family && info.family === t.family) {
    // An ingredient target names ONE variant: "milk" is regular milk, so lactose-free milk is not a violation
    // of "avoid milk". Whole families are targeted through tags ("dairy", "lactose", "gluten").
    return t.variant === info.variant;
  }
  return info.canonical === t.canonical || info.text === t.text || (t.text.length >= 4 && info.text.includes(t.text));
}

export type ResolveStatus = "ok" | "substituted" | "forbidden";
export interface Resolved {
  name: string;
  original: string;
  status: ResolveStatus;
  reason: string | null;
  /** macro delta per serving when the substitute's nutrition is known (null = unknown → estimate) */
  macroDelta: { calories: number; protein: number; carbs: number; fat: number } | null;
  macrosKnown: boolean;
}

function macroDelta(from: string, to: string): { delta: Resolved["macroDelta"]; known: boolean } {
  const f = ingredientInfo(from);
  const t = ingredientInfo(to);
  if (!f.family || f.family !== t.family) return { delta: null, known: false };
  const fv = variantsOf(f.family).find((v) => v.name === f.variant)?.macros;
  const tv = variantsOf(t.family!).find((v) => v.name === t.variant)?.macros;
  if (!fv || !tv) return { delta: null, known: false };
  return { delta: { calories: tv.calories - fv.calories, protein: tv.protein - fv.protein, carbs: tv.carbs - fv.carbs, fat: tv.fat - fv.fat }, known: true };
}

/** Best automatic substitute within the same family that violates no rule (for hard tags without an explicit substitute). */
function autoSubstitute(ingredient: string, rules: FoodRules): string | null {
  const info = ingredientInfo(ingredient);
  if (!info.family || !familySwappable(info.family)) return null;
  for (const v of variantsOf(info.family)) {
    if (v.name === info.variant) continue;
    if (!violation(v.name, rules)) return v.name;
  }
  return null;
}

/** First rule an ingredient violates (hard or avoid), or null. */
export function violation(ingredient: string, rules: FoodRules): { target: string; level: "hard" | "avoid"; substitute: string | null; strictness?: "avoid" | "prefer-substitute" } | null {
  for (const h of rules.hard) if (targetMatches(h.target, ingredient)) return { target: h.target, level: "hard", substitute: h.substitute };
  for (const a of rules.avoid) if (targetMatches(a.target, ingredient)) return { target: a.target, level: "avoid", substitute: a.substitute, strictness: a.strictness };
  return null;
}

/**
 * resolveIngredientForUser: deterministic. Known rules are enforced here,
 * never left to prompt compliance.
 */
export function resolveIngredientForUser(ingredient: string, rules: FoodRules): Resolved {
  const v = violation(ingredient, rules);
  if (!v) return { name: ingredient, original: ingredient, status: "ok", reason: null, macroDelta: null, macrosKnown: true };
  // An explicit substitute applies within its own family (milk → lactose-free milk); a tag rule's substitute never turns cheese into oat milk.
  const info = ingredientInfo(ingredient);
  const explicit = v.substitute && (!info.family || ingredientInfo(v.substitute).family === info.family) ? v.substitute : null;
  const candidate = explicit ?? autoSubstitute(ingredient, rules);
  if (candidate && !violation(candidate, rules)) {
    const m = macroDelta(ingredient, candidate);
    return { name: candidate, original: ingredient, status: "substituted", reason: `${v.target}: ${ingredient} → ${candidate}`, macroDelta: m.delta, macrosKnown: m.known };
  }
  if (v.level === "avoid" && v.strictness === "prefer-substitute") {
    // preferred substitute unavailable → allowed as-is (it is a preference, not a prohibition)
    return { name: ingredient, original: ingredient, status: "ok", reason: `no substitute for ${ingredient}; kept`, macroDelta: null, macrosKnown: true };
  }
  return { name: ingredient, original: ingredient, status: "forbidden", reason: `${v.target}: no acceptable substitute for ${ingredient}`, macroDelta: null, macrosKnown: true };
}

export interface MealLike {
  name: string;
  ingredients: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes?: string;
}
export interface ValidatedMeal<T extends MealLike> {
  meal: T;
  status: "ok" | "repaired" | "rejected";
  changes: { from: string; to: string }[];
  rejectedBecause: string | null;
  /** macros changed by an unknown amount → label as estimate */
  macrosEstimated: boolean;
}

/**
 * Validate (and repair) a generated meal against the rules. Hard violations
 * without a substitute reject the meal; substitutions adjust macros when the
 * substitute's nutrition is known and flag an estimate otherwise.
 */
export function validateMeal<T extends MealLike>(meal: T, rules: FoodRules, opts: { servingsScale?: number } = {}): ValidatedMeal<T> {
  const changes: { from: string; to: string }[] = [];
  let rejected: string | null = null;
  let estimated = false;
  const delta = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const ingredients = meal.ingredients.map((ing) => {
    const r = resolveIngredientForUser(ing, rules);
    if (r.status === "forbidden") rejected = rejected ?? r.reason;
    if (r.status === "substituted") {
      changes.push({ from: ing, to: r.name });
      if (r.macroDelta) for (const k of ["calories", "protein", "carbs", "fat"] as const) delta[k] += r.macroDelta[k] * (opts.servingsScale ?? 1);
      else if (!r.macrosKnown) estimated = true;
      return r.name;
    }
    return ing;
  });
  // The dish name should not advertise what was swapped out (e.g. "... with milk").
  let name = meal.name;
  for (const c of changes) {
    const re = new RegExp(`\\b${c.from.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (re.test(name)) name = name.replace(re, c.to);
  }
  if (rejected) return { meal, status: "rejected", changes, rejectedBecause: rejected, macrosEstimated: false };
  if (!changes.length) return { meal, status: "ok", changes, rejectedBecause: null, macrosEstimated: false };
  const repaired = { ...meal, name, ingredients, calories: Math.max(0, Math.round(meal.calories + delta.calories)), protein: Math.max(0, Math.round(meal.protein + delta.protein)), carbs: Math.max(0, Math.round(meal.carbs + delta.carbs)), fat: Math.max(0, Math.round(meal.fat + delta.fat)), notes: [meal.notes, `Swapped ${changes.map((c) => `${c.from} → ${c.to}`).join(", ")}${estimated ? " (macros estimated)" : ""}`].filter(Boolean).join(" · ") };
  return { meal: repaired, status: "repaired", changes, rejectedBecause: null, macrosEstimated: estimated };
}

/** Recipe-level exclusion for the planners: hard violations with no substitute, or a disliked ingredient. */
export function recipeExcluded(r: { name: string; ingredients: string[] }, rules: FoodRules): string | null {
  const text = `${r.name} ${r.ingredients.join(" ")}`.toLowerCase();
  for (const d of rules.dislikes) if (d && text.includes(d)) return `dislike: ${d}`;
  for (const ing of r.ingredients) {
    const res = resolveIngredientForUser(ing, rules);
    if (res.status === "forbidden") return res.reason;
  }
  // name-level check for dishes whose name carries the restriction (e.g. "Pork chops") when ingredients are sparse
  for (const h of rules.hard) if (isTag(h.target) && ingredientInfo(r.name).tags.includes(h.target) && !r.ingredients.length) return `${h.target} in ${r.name}`;
  return null;
}

/** Scoring nudge for preferences/dislikes (never a prohibition). */
export function preferenceScore(r: { name: string; ingredients: string[] }, rules: FoodRules): number {
  const text = `${r.name} ${r.ingredients.join(" ")}`.toLowerCase();
  let s = 0;
  for (const l of rules.likes) if (l && text.includes(l)) s += 4;
  for (const p of rules.prefer) if (p && r.ingredients.some((i) => targetMatches(p, i))) s += 3;
  return s;
}

/** Structured rules for the AI prompt: it must know which are MUST and which are nice-to-have. */
export function rulesForAi(rules: FoodRules) {
  return {
    hardRestrictions: rules.hard.map((h) => `${h.target}${h.kind === "allergy" ? " (allergy)" : h.kind === "religious" ? " (never)" : ""}`),
    intolerances: rules.hard.filter((h) => h.kind === "intolerance").map((h) => h.target),
    ingredientSubstitutions: rules.avoid.map((a) => ({ never: a.strictness === "avoid", from: a.target, to: a.substitute ?? "a suitable alternative" })),
    preferences: rules.prefer,
    dislikes: rules.dislikes,
    likes: rules.likes,
    diets: rules.diets,
  };
}

/** Options shown in Settings for "preferred substitute". */
export function substituteOptionsFor(target: string): string[] {
  const info = ingredientInfo(target);
  if (info.family) return variantsOf(info.family).map((v) => v.name).filter((n) => n !== info.variant);
  if (target === "dairy" || target === "lactose") return ["lactose-free milk", "oat milk", "almond milk", "soy milk"];
  if (target === "gluten") return ["gluten-free bread", "gluten-free pasta", "corn tortilla"];
  return [];
}

export const RULE_FAMILIES = FAMILIES.map((f) => f.base);
export const RULE_TAGS: { tag: FoodTag; label: string }[] = [
  { tag: "dairy", label: "All dairy" },
  { tag: "lactose", label: "Lactose" },
  { tag: "gluten", label: "Gluten" },
  { tag: "pork", label: "Pork" },
  { tag: "beef", label: "Beef" },
  { tag: "meat", label: "All meat" },
  { tag: "fish", label: "Fish" },
  { tag: "shellfish", label: "Shellfish" },
  { tag: "egg", label: "Eggs" },
  { tag: "peanut", label: "Peanuts" },
  { tag: "nuts", label: "Tree nuts" },
  { tag: "soy", label: "Soy" },
  { tag: "sesame", label: "Sesame" },
];
