import Link from "next/link";
import { Bell } from "lucide-react";
import type { CharacterAssessment } from "@/ranking/types";
import { RANK_VISUALS } from "@/ranking/rankVisuals";

/**
 * The home-screen hero: rank backdrop art, crest, name, knight title, rank
 * plate, quote, level and XP. Art is static SVG under the real components.
 */
export function CharacterHero({ name, equippedTitle, assessment, unread }: { name: string; equippedTitle: string | null; assessment: CharacterAssessment; unread: number }) {
  const { overall, level } = assessment;
  const v = RANK_VISUALS[overall.rank];
  const xpToNext = level.xpForNextLevel - level.xpIntoLevel;
  const title = equippedTitle ?? v.title;
  return (
    <section className="relative -mx-4 -mt-3 overflow-hidden" style={{ paddingTop: "var(--safe-top)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={v.backdrop} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom opacity-90" loading="eager" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-bg" />
      <div className="relative px-4 pb-5 pt-3">
        <div className="flex items-start justify-between">
          <div className="eyebrow pt-1 text-text-2/80">TFHealth</div>
          <Link href="/notifications" aria-label={unread ? `${unread} unread notifications` : "Notifications"} className="press relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 text-text-2 backdrop-blur">
            <Bell size={17} />
            {unread > 0 && <span className="tabular absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-[#1a1406]">{unread > 9 ? "9+" : unread}</span>}
          </Link>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <Link href="/profile" className="press relative shrink-0" aria-label="Character profile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.crest} alt={v.description} width={132} height={144} className="h-36 w-auto drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]" loading="eager" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="display truncate text-[26px] font-bold uppercase leading-none tracking-[0.08em] text-gradient-gold">{name}</h1>
            <div className="serif mt-1 truncate text-[17px] text-text-2">{title}</div>
            <div className="mt-2 inline-flex items-center gap-2 border px-3 py-1" style={{ borderColor: v.accent, background: v.accentSoft, clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}>
              <span className="display text-[13px] font-bold tracking-[0.18em]" style={{ color: v.accent }}>
                {overall.rank} RANK
              </span>
            </div>
            <p className="serif mt-2 truncate text-[14px] italic text-text-2/85">“{v.quote}”</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="display text-[15px] font-semibold tracking-wide">Level {level.level}</span>
            <span className="tabular text-xs text-text-2">
              {level.xpIntoLevel.toLocaleString()} / {level.xpForNextLevel.toLocaleString()} XP
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm border border-white/10 bg-black/50 p-[2px]">
            <div className="h-full rounded-[2px] transition-[width] duration-700" style={{ width: `${Math.max(2, level.progress * 100)}%`, background: v.bar, boxShadow: `0 0 10px ${v.accentSoft}` }} />
          </div>
          <div className="mt-1 text-right text-[11px] text-muted">
            <span className="text-gold">{xpToNext.toLocaleString()} XP</span> to Level {level.level + 1}
          </div>
        </div>
      </div>
    </section>
  );
}
