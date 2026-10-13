import type { Rank } from "@/ranking/types";
import { RANK_VISUALS } from "@/ranking/rankVisuals";

/** Heraldic shield with the rank letter. Pure SVG, colored per rank. */
export function ShieldBadge({ rank, size = 40, className, glow }: { rank: Rank; size?: number; className?: string; glow?: boolean }) {
  const v = RANK_VISUALS[rank];
  const id = `sh-${rank}-${size}`;
  const dark = rank === "E" || rank === "D";
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" className={className} aria-label={`Rank ${rank}`} style={glow || rank === "S" ? { filter: `drop-shadow(0 0 ${size / 5}px ${v.accentSoft})` } : undefined}>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dark ? "#1b2030" : v.cloth} />
          <stop offset="1" stopColor="#0b0d12" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={v.accent} />
          <stop offset="1" stopColor={rank === "S" ? "#a8853d" : v.metal} />
        </linearGradient>
      </defs>
      <path d="M4 4 H36 V22 C36 32 28 39 20 43 C12 39 4 32 4 22 Z" fill={`url(#${id}-f)`} stroke={`url(#${id}-s)`} strokeWidth="2" />
      <path d="M8 8 H32 V21 C32 29 26 34 20 37.5 C14 34 8 29 8 21 Z" fill="none" stroke={v.accent} strokeWidth=".6" opacity=".5" />
      <text x="20" y="28" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="19" fill={v.accent}>
        {rank}
      </text>
    </svg>
  );
}
