import { applyGate, sufficiencyFor, type TenureCap, DEFAULT_TENURE_CAPS } from "./gating";
import { RANK_FLOORS, applyRankCap, nextRank, progressWithinRank, scoreToRank, clamp } from "./ranks";
import { round, weightedMean } from "./scale";
import type { DomainAssessment, DomainId, Rank, Substat } from "./types";

export interface WeightedSubstat extends Substat {
  weight: number;
  /** Set false to drop a substat from the composite when no data exists for it. */
  available?: boolean;
  /** Suggested improvement text if this substat is holding the score down. */
  improve?: string;
}

export interface BuildArgs {
  domain: DomainId;
  substats: WeightedSubstat[];
  tenureDays: number;
  dataPoints: number;
  caps?: TenureCap[];
  explanation?: string[];
  percentile?: number;
  suggestedAction?: string;
  /** Extra requirements appended after the computed ones. */
  extraRequirements?: string[];
  /** Score computed for 7 and 30 days earlier, for the trend. */
  previous?: { score7?: number | null; score30?: number | null };
  /** Baseline (onboarding) score to blend in while data is sparse. */
  baselineScore?: number | null;
  /**
   * Hard ceiling on the composite (before gating). Lets a domain say "no
   * amount of regularity makes 5 hours of sleep a C".
   */
  scoreCeiling?: number | null;
}

/**
 * Turns weighted substats into a full DomainAssessment: composite score,
 * baseline blending for sparse data, tenure gating, next-rank requirements.
 */
export function buildAssessment(args: BuildArgs): DomainAssessment {
  const caps = args.caps ?? DEFAULT_TENURE_CAPS;
  const available = args.substats.filter((s) => s.available !== false);
  let observed = available.length ? weightedMean(available.map((s) => ({ score: s.score, weight: s.weight }))) : 0;

  // Blend in the onboarding baseline while we have < 14 days of evidence so a
  // new user isn't scored as a complete beginner on day one.
  const explanation = [...(args.explanation ?? [])];
  if (args.baselineScore != null && args.tenureDays < 14) {
    const wObs = args.dataPoints === 0 ? 0 : clamp(args.tenureDays / 14, 0.15, 1);
    observed = observed * wObs + args.baselineScore * (1 - wObs);
    explanation.push(
      `Early days: ${Math.round((1 - wObs) * 100)}% of this score still comes from your onboarding baseline. Logged behaviour takes over fully after 14 days.`,
    );
  }

  if (args.scoreCeiling != null && observed > args.scoreCeiling) {
    observed = args.scoreCeiling;
  }
  const rawScore = round(clamp(observed, 0, 100), 1);
  const naturalRank = scoreToRank(rawScore);
  const gate = applyGate(naturalRank, args.tenureDays, caps);
  const score = round(applyRankCap(rawScore, gate.cap), 1);
  const rank = scoreToRank(score);

  const requirements = nextRankRequirements({ substats: available, score: rawScore, rank });
  if (gate.capRequirement) requirements.unshift(gate.capRequirement);
  if (args.extraRequirements) requirements.push(...args.extraRequirements);

  const p = progressWithinRank(score);
  // If capped, progress within rank is "full" — surface the time requirement instead.
  const progress = gate.capRequirement ? 1 : p.progress;

  const sufficiency = sufficiencyFor(args.dataPoints, args.tenureDays);
  if (sufficiency === "none") {
    explanation.unshift("No data logged yet for this domain. Log something to start your rank.");
  }

  const delta = (prev?: number | null) => (prev == null ? null : round(score - prev, 1));

  return {
    domain: args.domain,
    rawScore,
    score,
    rank,
    percentile: args.percentile,
    substats: available.map(({ weight: _w, available: _a, improve: _i, ...s }) => ({ ...s, score: round(s.score) })),
    next: { rank: nextRank(rank), progress, requirements: requirements.slice(0, 4) },
    trend: { delta7: delta(args.previous?.score7), delta30: delta(args.previous?.score30) },
    sufficiency,
    tenureDays: args.tenureDays,
    rankCap: gate.cap,
    explanation,
    suggestedAction: args.suggestedAction,
  };
}

/**
 * Picks the substats that are furthest below the next rank's floor and turns
 * their `improve` hints into concrete requirements.
 */
function nextRankRequirements(args: { substats: WeightedSubstat[]; score: number; rank: Rank }): string[] {
  const next = nextRank(args.rank);
  if (!next) return ["You hold the highest rank. Sustain it."];
  const target = RANK_FLOORS[next];
  const gap = target - args.score;
  const laggards = args.substats
    .filter((s) => s.score < target && s.improve)
    .map((s) => ({ s, deficit: (target - s.score) * s.weight }))
    .sort((a, b) => b.deficit - a.deficit);

  const out: string[] = [];
  for (const { s } of laggards.slice(0, 3)) out.push(s.improve!);
  if (out.length === 0 && gap > 0) out.push(`Raise your composite score by ${round(gap, 1)} points`);
  return out;
}

/** Convenience for domain scorers: a substat line. */
export function sub(
  key: string,
  name: string,
  score: number,
  value: string,
  weight: number,
  opts: { note?: string; improve?: string; available?: boolean } = {},
): WeightedSubstat {
  return { key, name, score: clamp(score, 0, 100), value, weight, ...opts };
}
