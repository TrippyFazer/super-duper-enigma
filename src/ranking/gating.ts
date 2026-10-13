import { RANKS, type DataSufficiency, type Rank } from "./types";
import { minRank, nextRank, rankIndex } from "./ranks";

/**
 * Diminishing returns through time-gating.
 *
 * A rank is only *proven* by sustained behaviour, so each domain's attainable
 * rank is capped by how many days of history the engine has seen. E→D is
 * available immediately; S needs four months of evidence. Scores above the cap
 * are preserved internally (rawScore) but the displayed score is clamped.
 *
 * See docs/ranking-methodology.md → "Time gating".
 */
export interface TenureCap {
  minDays: number;
  cap: Rank | null;
}

export const DEFAULT_TENURE_CAPS: TenureCap[] = [
  { minDays: 0, cap: "D" },
  { minDays: 14, cap: "C" },
  { minDays: 30, cap: "B" },
  { minDays: 60, cap: "A" },
  { minDays: 120, cap: null },
];

/** Wealth changes slowly and is snapshot-based, so it gates by check-ins + time. */
export const WEALTH_TENURE_CAPS: TenureCap[] = [
  { minDays: 0, cap: "B" },
  { minDays: 30, cap: "A" },
  { minDays: 90, cap: null },
];

export function rankCapForTenure(tenureDays: number, caps: TenureCap[] = DEFAULT_TENURE_CAPS): Rank | null {
  let cap: Rank | null = "E";
  for (const c of caps) {
    if (tenureDays >= c.minDays) cap = c.cap;
  }
  return cap;
}

/** Days until the cap lifts to allow `target` rank; 0 if already allowed. */
export function daysUntilRankAllowed(
  tenureDays: number,
  target: Rank,
  caps: TenureCap[] = DEFAULT_TENURE_CAPS,
): number {
  for (const c of caps) {
    if (c.cap === null || rankIndex(c.cap) >= rankIndex(target)) {
      return Math.max(0, c.minDays - tenureDays);
    }
  }
  return 0;
}

export function sufficiencyFor(dataPoints: number, tenureDays: number): DataSufficiency {
  if (dataPoints === 0) return "none";
  if (dataPoints < 5 || tenureDays < 7) return "low";
  return "ok";
}

/**
 * Given a raw score's natural rank and the tenure cap, return the rank shown
 * plus the requirement text for lifting the cap (if the cap is what's holding
 * the rank down).
 */
export function applyGate(
  naturalRank: Rank,
  tenureDays: number,
  caps: TenureCap[] = DEFAULT_TENURE_CAPS,
): { rank: Rank; cap: Rank | null; capRequirement: string | null } {
  const cap = rankCapForTenure(tenureDays, caps);
  const rank = cap ? minRank(naturalRank, cap) : naturalRank;
  let capRequirement: string | null = null;
  if (cap && rankIndex(naturalRank) > rankIndex(cap)) {
    const n = nextRank(cap);
    if (n) {
      const days = daysUntilRankAllowed(tenureDays, n, caps);
      capRequirement = `Keep this up ${days} more day${days === 1 ? "" : "s"} to unlock ${n} rank eligibility`;
    }
  }
  return { rank, cap, capRequirement };
}

export const ALL_RANKS = RANKS;
