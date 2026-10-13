import { addDays, diffDays, lastNDays, startOfWeek, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { interpolate, round } from "../scale";
import type { DomainAssessment } from "../types";

export interface MealInput {
  date: ISODate;
  mealType: string;
  recipeId?: number | null;
  name: string;
  isNewRecipe: boolean;
}

export interface CookingBaseline {
  mealsCookedPerWeek?: number | null;
}

export interface CookingInput {
  asOf: ISODate;
  meals: MealInput[];
  baseline?: CookingBaseline | null;
  startedOn?: ISODate | null;
  mealsPerWeekTarget?: number | null;
}

/**
 * Anchors (docs/ranking-research.md → Cooking).
 * Cooking dinner most nights is roughly the median behaviour; cooking the
 * majority of all meals (10+/week) across most days with a varied repertoire
 * is uncommon. We count any home-cooked meal (max 3/day).
 */
const MEALS_PER_WEEK: [number, number][] = [
  [0, 3],
  [2, 20],
  [4, 36],
  [6, 50],
  [8, 62],
  [10, 73],
  [12, 82],
  [15, 92],
  [18, 97],
];
const COOK_DAYS_PER_WEEK: [number, number][] = [
  [0, 3],
  [1, 15],
  [2, 28],
  [3, 42],
  [4, 55],
  [5, 68],
  [6, 82],
  [7, 94],
];
const ACTIVE_WEEK_RATIO: [number, number][] = [
  [0, 5],
  [0.3, 28],
  [0.5, 45],
  [0.7, 62],
  [0.85, 78],
  [0.95, 90],
  [1, 97],
];
const DISTINCT_RECIPES_30D: [number, number][] = [
  [0, 5],
  [1, 18],
  [3, 38],
  [5, 55],
  [8, 72],
  [12, 88],
  [16, 96],
];
const NEW_RECIPES_90D: [number, number][] = [
  [0, 20],
  [1, 45],
  [3, 65],
  [6, 85],
  [10, 96],
];

function cappedPerDay(meals: MealInput[], cap = 3): Map<string, MealInput[]> {
  const byDay = new Map<string, MealInput[]>();
  for (const m of meals) {
    const list = byDay.get(m.date) ?? [];
    if (list.length < cap) list.push(m);
    byDay.set(m.date, list);
  }
  return byDay;
}

export function assessCooking(input: CookingInput): DomainAssessment {
  const compute = (asOf: ISODate) => computeScore(input, asOf).score;
  const has = (d: ISODate) => input.meals.some((e) => e.date <= d);
  const score7 = has(addDays(input.asOf, -7)) ? compute(addDays(input.asOf, -7)) : null;
  const score30 = has(addDays(input.asOf, -30)) ? compute(addDays(input.asOf, -30)) : null;
  return computeScore(input, input.asOf, { score7, score30 }).assessment;
}

function computeScore(
  input: CookingInput,
  asOf: ISODate,
  previous?: { score7: number | null; score30: number | null },
): { score: number; assessment: DomainAssessment } {
  const meals = input.meals.filter((m) => m.date <= asOf);
  const first = meals.map((m) => m.date).sort()[0];
  const startedOn = [input.startedOn, first].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, asOf) + 1) : 0;

  const w30 = lastNDays(asOf, 30);
  const w90 = lastNDays(asOf, 90);
  const days30 = Math.min(30, Math.max(7, tenureDays));
  const days90 = Math.min(90, Math.max(7, tenureDays));
  const m30 = cappedPerDay(meals.filter((m) => m.date >= w30[0]));
  const m90 = cappedPerDay(meals.filter((m) => m.date >= w90[0]));
  const count30 = [...m30.values()].reduce((a, b) => a + b.length, 0);
  const count90 = [...m90.values()].reduce((a, b) => a + b.length, 0);
  const mpw30 = (count30 / days30) * 7;
  const mpw90 = (count90 / days90) * 7;
  const mpw = tenureDays >= 60 ? mpw30 * 0.6 + mpw90 * 0.4 : mpw30;
  const cookDays = (m30.size / days30) * 7;

  const target = input.mealsPerWeekTarget ?? 7;
  const weeksAvailable = Math.max(1, Math.min(12, Math.ceil(tenureDays / 7)));
  let ws = startOfWeek(asOf);
  let activeWeeks = 0;
  let partial = 0;
  let thisWeekCount = 0;
  for (let i = 0; i < weeksAvailable; i++) {
    const end = addDays(ws, 6);
    const n = [...cappedPerDay(meals.filter((m) => m.date >= ws && m.date <= end)).values()].reduce((a, b) => a + b.length, 0);
    if (i === 0) {
      thisWeekCount = n;
      if (n >= 1) activeWeeks++;
    } else if (n >= Math.min(target, 5)) activeWeeks++;
    else if (n > 0) partial++;
    ws = addDays(ws, -7);
  }
  const activeRatio = (activeWeeks + partial * 0.4) / weeksAvailable;

  const distinct30 = new Set(
    [...m30.values()].flat().map((m) => (m.recipeId != null ? `r${m.recipeId}` : m.name.trim().toLowerCase())),
  ).size;
  const new90 = [...m90.values()].flat().filter((m) => m.isNewRecipe).length;
  const diversityScore = interpolate(DISTINCT_RECIPES_30D, distinct30) * 0.6 + interpolate(NEW_RECIPES_90D, new90) * 0.4;

  const baselineScore =
    input.baseline?.mealsCookedPerWeek != null
      ? interpolate(MEALS_PER_WEEK, input.baseline.mealsCookedPerWeek) * 0.6 +
        interpolate(COOK_DAYS_PER_WEEK, Math.min(7, input.baseline.mealsCookedPerWeek)) * 0.4
      : null;

  const substats = [
    sub("volume", "Meals cooked", interpolate(MEALS_PER_WEEK, mpw), `${round(mpw, 1)} meals/wk`, 0.35, {
      note: "Home-cooked meals per week (max 3/day), 30-day average",
      improve: `Cook ${Math.max(target, Math.ceil(mpw) + 2)}+ meals a week`,
    }),
    sub("days", "Cooking days", interpolate(COOK_DAYS_PER_WEEK, cookDays), `${round(cookDays, 1)} days/wk`, 0.25, {
      improve: "Cook something on 5+ days a week",
    }),
    sub("consistency", "Consistency", interpolate(ACTIVE_WEEK_RATIO, activeRatio), `${activeWeeks}/${weeksAvailable} active weeks`, 0.2, {
      note: `Weeks with ${Math.min(target, 5)}+ cooked meals`,
      improve: "Hit your weekly meal target more weeks in a row",
    }),
    sub("range", "Range", diversityScore, `${distinct30} recipes (30d) · ${new90} new (90d)`, 0.2, {
      improve: "Try a new recipe this month and rotate 5+ different dishes",
    }),
  ];

  const explanation: string[] = [];
  if (count30) explanation.push(`Last 30 days: ${count30} meals across ${m30.size} days, ${distinct30} different dishes.`);
  explanation.push("Cooking dinner most nights is about average; cooking the majority of your meals on most days with a varied rotation is uncommon.");

  const cookedToday = m30.has(asOf);
  const suggestedAction = !cookedToday
    ? thisWeekCount < target
      ? `Cook a meal — ${target - thisWeekCount} more to hit this week's target`
      : "Cook something today"
    : undefined;

  const assessment = buildAssessment({
    domain: "cooking",
    substats,
    tenureDays,
    dataPoints: meals.length,
    explanation,
    baselineScore,
    previous,
    suggestedAction,
  });
  return { score: assessment.score, assessment };
}
