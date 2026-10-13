import type { DomainId, DomainMeta } from "./types";

export const DOMAINS: Record<DomainId, DomainMeta> = {
  fitness: {
    id: "fitness",
    name: "Fitness",
    shortName: "Fitness",
    statName: "Vitality",
    description: "Training frequency, activity, strength & cardio balance, consistency and recovery.",
    weight: 1.25,
    basis: "percentile",
  },
  sleep: {
    id: "sleep",
    name: "Sleep",
    shortName: "Sleep",
    statName: "Recovery",
    description: "Duration, regularity and quality over rolling 7/30/90-day windows.",
    weight: 1.0,
    basis: "mixed",
  },
  cooking: {
    id: "cooking",
    name: "Cooking",
    shortName: "Cooking",
    statName: "Nutrition",
    description: "Meals cooked at home, cooking days, and recipe range.",
    weight: 0.9,
    basis: "percentile",
  },
  wealth: {
    id: "wealth",
    name: "Wealth",
    shortName: "Wealth",
    statName: "Wealth",
    description: "Financial resilience: emergency fund, savings rate, debt, age-adjusted net worth.",
    weight: 1.0,
    basis: "mixed",
  },
  skincare: {
    id: "skincare",
    name: "Skincare",
    shortName: "Care",
    statName: "Presence",
    description: "Sustainable morning & evening routine adherence.",
    weight: 0.6,
    basis: "adherence",
  },
  sobriety: {
    id: "sobriety",
    name: "Sobriety",
    shortName: "Sobriety",
    statName: "Willpower",
    description: "Abstinence streaks for the behaviours you choose to track.",
    weight: 1.0,
    basis: "adherence",
  },
  habits: {
    id: "habits",
    name: "Discipline",
    shortName: "Habits",
    statName: "Discipline",
    description: "Custom habit adherence over 30 and 90 days.",
    weight: 1.0,
    basis: "adherence",
  },
};

export const DOMAIN_LIST: DomainMeta[] = Object.values(DOMAINS);

export function isDomainId(x: string): x is DomainId {
  return x in DOMAINS;
}
