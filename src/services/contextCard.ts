/**
 * Which ONE context card Home shows.
 *
 * It used to be a strict ladder (special quest > Sunday reset > morning >
 * wind-down > review), so any optional quest — even a 25 XP one — hid a
 * wind-down that was starting right now. Each candidate now gets an urgency
 * score and the highest wins. Still exactly one card.
 *
 *   wind-down    90 from wind-down until 30 min past bedtime · 80 within the hour · 45 within 3 h
 *   quest        35 common … 85 legendary · +15 accepted (you committed) · +15 under 2 h left
 *   Sunday reset 60 (on the day)
 *   morning note 40 (before 11)
 *   weekly review 25
 */
export type ContextKind = "quest" | "sunday" | "morning" | "winddown" | "review";

const QUEST_BASE: Record<string, number> = { common: 35, uncommon: 50, rare: 65, epic: 75, legendary: 85 };

export interface ContextInput {
  /** Minutes since local midnight. */
  nowMin: number;
  quest?: { difficulty: string; accepted: boolean; msLeft: number | null } | null;
  sunday?: boolean;
  morning?: boolean;
  /** Wind-down and in-bed times as minutes since midnight. */
  sleep?: { windDownMin: number; inBedMin: number } | null;
  review?: boolean;
}

/** Signed minutes from now to a clock time, folded to the nearest occurrence (−720…720). */
function until(nowMin: number, atMin: number): number {
  let d = atMin - nowMin;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

export function windDownScore(nowMin: number, s: { windDownMin: number; inBedMin: number }): number {
  const toWind = until(nowMin, s.windDownMin);
  const toBed = until(nowMin, s.inBedMin);
  if (toWind <= 0 && toBed >= -30) return 90;
  if (toWind > 0 && toWind <= 60) return 80;
  if (toWind > 0 && toWind <= 180) return 45;
  return 0;
}

export function questScore(q: { difficulty: string; accepted: boolean; msLeft: number | null }): number {
  return (QUEST_BASE[q.difficulty] ?? 40) + (q.accepted ? 15 : 0) + (q.msLeft != null && q.msLeft > 0 && q.msLeft < 2 * 3600_000 ? 15 : 0);
}

export function pickContext(i: ContextInput): ContextKind | null {
  const scored: [ContextKind, number][] = [];
  if (i.quest) scored.push(["quest", questScore(i.quest)]);
  if (i.sleep) scored.push(["winddown", windDownScore(i.nowMin, i.sleep)]);
  if (i.sunday) scored.push(["sunday", 60]);
  if (i.morning) scored.push(["morning", 40]);
  if (i.review) scored.push(["review", 25]);
  const best = scored.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

export const hhmmToMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
