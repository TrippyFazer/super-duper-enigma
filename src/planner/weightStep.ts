import type { Equipment } from "./exercises";

/**
 * Equipment-aware weight increment (lb) for the −/+ steppers in the tracker.
 * null = no meaningful load to step (bodyweight, bands, cardio).
 */
export function weightStepFor(equipment: Equipment[] | undefined | null): number | null {
  if (!equipment || equipment.length === 0) return 5;
  const loaded = equipment.filter((e) => e !== "bodyweight" && e !== "band" && e !== "cardio-machine");
  if (loaded.length === 0) return null;
  if (loaded.includes("kettlebell") && loaded.length === 1) return 8;
  if (loaded.includes("machine") && loaded.length === 1) return 10;
  return 5;
}

/** Nudge a weight by a step, never below zero, rounding to the step grid when already on it. */
export function stepWeight(current: number | null, step: number, dir: 1 | -1): number {
  const base = current ?? 0;
  return Math.max(0, Math.round((base + dir * step) * 2) / 2);
}
