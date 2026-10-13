/**
 * Character level from total XP.
 *
 * Total XP required to *reach* level L: 60 · L^1.7 (level 1 = 0 XP).
 *   L10 ≈ 3,000   L18 ≈ 8,200   L30 ≈ 19,500   L50 ≈ 46,500
 * With a realistic 600–900 XP/week of honest logging this gives roughly a
 * level a week early on, slowing to one every few weeks past level 30.
 */
export const MAX_LEVEL = 99;

export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(60 * Math.pow(level, 1.7));
}

export function levelFromXp(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
  xpToNext: number;
} {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= totalXpForLevel(level + 1)) level++;
  const floor = totalXpForLevel(level);
  const ceil = level >= MAX_LEVEL ? floor : totalXpForLevel(level + 1);
  const span = Math.max(1, ceil - floor);
  const xpIntoLevel = totalXp - floor;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: span,
    progress: Math.min(1, xpIntoLevel / span),
    xpToNext: Math.max(0, ceil - totalXp),
  };
}
