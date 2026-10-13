/**
 * Shared types for the ranking engine. Everything in `src/ranking` is pure:
 * plain inputs in, plain assessments out. No database access.
 */

export const RANKS = ["E", "D", "C", "B", "A", "S"] as const;
export type Rank = (typeof RANKS)[number];

export const DOMAIN_IDS = [
  "fitness",
  "sleep",
  "cooking",
  "wealth",
  "skincare",
  "sobriety",
  "habits",
] as const;
export type DomainId = (typeof DOMAIN_IDS)[number];

export interface DomainMeta {
  id: DomainId;
  name: string;
  shortName: string;
  /** The RPG stat this domain feeds on the character sheet. */
  statName: string;
  description: string;
  /** Weight in the overall score (relative; normalized across active domains). */
  weight: number;
  /** Whether rank is primarily percentile-based or adherence-based. */
  basis: "percentile" | "adherence" | "mixed";
}

export type DataSufficiency = "none" | "low" | "ok";

export interface Substat {
  key: string;
  name: string;
  /** 0-100 */
  score: number;
  /** Human-readable current value, e.g. "3.2 sessions/wk" */
  value: string;
  /** Short note on how this was derived or what moves it. */
  note?: string;
}

export interface NextRankInfo {
  rank: Rank | null;
  /** 0-1 progress from current rank floor to next rank floor. */
  progress: number;
  /** Concrete requirements remaining, in priority order. */
  requirements: string[];
}

export interface DomainAssessment {
  domain: DomainId;
  /** 0-100 composite score (before duration gating). */
  rawScore: number;
  /** 0-100 score after gating/caps; this is the one shown. */
  score: number;
  rank: Rank;
  /** Approximate population percentile when the domain is percentile-based. */
  percentile?: number;
  substats: Substat[];
  next: NextRankInfo;
  /** Score deltas vs. 7 and 30 days ago (null if unknown). */
  trend: { delta7: number | null; delta30: number | null };
  sufficiency: DataSufficiency;
  /** Days of history the engine considered. */
  tenureDays: number;
  /** The maximum rank attainable right now given tenure (null = no cap). */
  rankCap: Rank | null;
  /** Explanations shown in the UI ("why am I this rank?"). */
  explanation: string[];
  /** A single best next action for the dashboard. */
  suggestedAction?: string;
}

export interface CharacterAssessment {
  overall: {
    score: number;
    rank: Rank;
    next: NextRankInfo;
  };
  domains: DomainAssessment[];
  /** Stats shown on the character sheet, 0-100 each. */
  stats: { name: string; value: number; domain: DomainId }[];
  level: { level: number; totalXp: number; xpIntoLevel: number; xpForNextLevel: number; progress: number };
}
