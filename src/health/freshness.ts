/**
 * Semantic states for automatic health data. "0 steps" and "no data yet" are
 * different facts; this is where the difference is decided.
 *
 *  available   a real value for today exists
 *  zero        an automatic source reported today and the value is genuinely 0
 *  pending     an automatic source is connected but has not delivered today
 *  unavailable nothing automatic is connected (manual entry is the path)
 */
export type MetricState = "available" | "zero" | "pending" | "unavailable";

export interface MetricFreshness {
  state: MetricState;
  /** minutes since the source last delivered anything (null when unknown) */
  ageMin: number | null;
  /** automatic source delivered, but long enough ago that the number may be behind reality */
  stale: boolean;
}

export const STALE_AFTER_MIN = 180;

export function metricFreshness(input: { automatic: boolean; hasValueToday: boolean; value: number | null; lastSyncAt: string | null; now: Date; staleAfterMin?: number }): MetricFreshness {
  const ageMin = input.lastSyncAt ? Math.max(0, Math.round((input.now.getTime() - new Date(input.lastSyncAt).getTime()) / 60_000)) : null;
  const stale = input.automatic && ageMin != null && ageMin >= (input.staleAfterMin ?? STALE_AFTER_MIN);
  if (!input.automatic) return { state: input.hasValueToday ? "available" : "unavailable", ageMin: null, stale: false };
  if (!input.hasValueToday) return { state: "pending", ageMin, stale };
  if ((input.value ?? 0) === 0) return { state: "zero", ageMin, stale };
  return { state: "available", ageMin, stale };
}

export function ageLabel(ageMin: number | null): string | null {
  if (ageMin == null) return null;
  if (ageMin < 60) return `${ageMin} min ago`;
  if (ageMin < 48 * 60) return `${Math.round(ageMin / 60)}h ago`;
  return `${Math.round(ageMin / 1440)}d ago`;
}
