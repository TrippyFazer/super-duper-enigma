import Link from "next/link";
import type { CharacterAssessment } from "@/ranking/types";
import { RANK_LABELS } from "@/ranking/ranks";
import { RankBadge } from "@/components/ui/RankBadge";
import { ProgressBar } from "@/components/ui/primitives";

export function CharacterCard({ name, title, assessment }: { name: string; title: string | null; assessment: CharacterAssessment }) {
  const { overall, level } = assessment;
  const xpToNext = level.xpForNextLevel - level.xpIntoLevel;
  const isS = overall.rank === "S";
  return (
    <Link href="/profile" className={`card press relative block overflow-hidden p-5 ${isS ? "rank-glow-s" : ""}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-gold/10 blur-3xl" />
      <div className="relative flex items-center gap-4">
        <RankBadge rank={overall.rank} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[22px] font-semibold leading-tight">{name}</div>
          <div className="mt-0.5 truncate text-sm text-text-2">
            Level {level.level} · {overall.rank}-Rank {RANK_LABELS[overall.rank]}
          </div>
          {title && <div className="mt-1 inline-flex rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">“{title}”</div>}
        </div>
      </div>
      <div className="relative mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">XP</span>
          <span className="tabular text-text-2">
            <span className="font-semibold text-text">{level.xpIntoLevel.toLocaleString()}</span> / {level.xpForNextLevel.toLocaleString()} · <span className="text-gold">{xpToNext.toLocaleString()} to Level {level.level + 1}</span>
          </span>
        </div>
        <ProgressBar value={level.progress} tone="gold" />
      </div>
      <div className="relative mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">{overall.next.rank ? `Progress to ${overall.next.rank} rank` : "Highest rank held"}</span>
          <span className="tabular text-text-2">{Math.round(overall.next.progress * 100)}%</span>
        </div>
        <ProgressBar value={overall.next.progress} tone="accent" />
      </div>
    </Link>
  );
}
