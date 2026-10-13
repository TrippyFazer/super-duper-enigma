import { RANKS, type Rank } from "./types";

/**
 * Score → rank mapping (centralized; see docs/ranking-methodology.md).
 *
 * Scores are built so that, for percentile-based domains, they track the
 * approximate population percentile of the behaviour. The thresholds below
 * therefore read as: C ≈ above the median, B ≈ top quartile, A ≈ top decile,
 * S ≈ top ~3%.
 */
export const RANK_FLOORS: Record<Rank, number> = {
  E: 0,
  D: 30,
  C: 50,
  B: 70,
  A: 85,
  S: 95,
};

export const RANK_LABELS: Record<Rank, string> = {
  E: "Novice",
  D: "Apprentice",
  C: "Journeyman",
  B: "Veteran",
  A: "Elite",
  S: "Legend",
};

export const RANK_DESCRIPTIONS: Record<Rank, string> = {
  E: "Starting out. Below-average habits — the fastest place to grow from.",
  D: "Building consistency. Showing up more often than not.",
  C: "Meaningfully above average. Most people never get here.",
  B: "Uncommon discipline — roughly the top quarter.",
  A: "Exceptional. Roughly the top 10%.",
  S: "Genuinely rare, sustained performance. The top few percent.",
};

export function scoreToRank(score: number): Rank {
  let result: Rank = "E";
  for (const r of RANKS) {
    if (score >= RANK_FLOORS[r]) result = r;
  }
  return result;
}

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function compareRanks(a: Rank, b: Rank): number {
  return rankIndex(a) - rankIndex(b);
}

export function minRank(a: Rank, b: Rank): Rank {
  return compareRanks(a, b) <= 0 ? a : b;
}

export function nextRank(rank: Rank): Rank | null {
  const i = rankIndex(rank);
  return i >= RANKS.length - 1 ? null : RANKS[i + 1];
}

export function prevRank(rank: Rank): Rank | null {
  const i = rankIndex(rank);
  return i <= 0 ? null : RANKS[i - 1];
}

/** Highest score attainable at a rank (just under the next floor; safe to round to 1 decimal). */
export function rankCeiling(rank: Rank): number {
  const n = nextRank(rank);
  return n ? RANK_FLOORS[n] - 0.1 : 100;
}

/**
 * Progress (0..1) from the floor of the current rank towards the next floor.
 * Returns 1 for S.
 */
export function progressWithinRank(score: number): { rank: Rank; next: Rank | null; progress: number } {
  const rank = scoreToRank(score);
  const next = nextRank(rank);
  if (!next) return { rank, next: null, progress: 1 };
  const floor = RANK_FLOORS[rank];
  const ceil = RANK_FLOORS[next];
  return { rank, next, progress: clamp01((score - floor) / (ceil - floor)) };
}

/** Cap a score so its rank cannot exceed `cap`. */
export function applyRankCap(score: number, cap: Rank | null): number {
  if (!cap) return score;
  return Math.min(score, rankCeiling(cap));
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
