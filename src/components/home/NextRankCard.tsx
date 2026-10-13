import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CharacterAssessment } from "@/ranking/types";
import { RANK_VISUALS } from "@/ranking/rankVisuals";
import { ShieldBadge } from "@/components/ui/ShieldBadge";

export function NextRankCard({ assessment }: { assessment: CharacterAssessment }) {
  const { overall } = assessment;
  const next = overall.next.rank;
  const v = RANK_VISUALS[next ?? "S"];
  return (
    <Link href="/profile" className="plate press relative block overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={v.backdrop} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-40" loading="lazy" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/30" />
      <div className="relative px-4 pt-3 pb-3.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-text-2">{next ? "Next rank requirements" : "Maintain S rank"}</span>
          <span className="flex items-center gap-1 text-[11px]" style={{ color: v.accent }}>
            <span className="display font-bold tracking-widest">{next ?? "S"} RANK</span> <ChevronRight size={13} />
          </span>
        </div>
        <div className="gold-rule my-2.5" />
        <div className="flex items-center gap-4">
          <ShieldBadge rank={next ?? "S"} size={56} glow />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
              <span className="serif text-[13px]">{v.title}</span>
              <span className="tabular">{Math.round(overall.next.progress * 100)}% complete</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, overall.next.progress * 100)}%`, background: v.bar }} />
            </div>
            <ul className="mt-2 space-y-1">
              {overall.next.requirements.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-text-2">
                  <span className="ring-circle mt-[1px] h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{r}</span>
                </li>
              ))}
              {overall.next.requirements.length === 0 && <li className="text-[12.5px] text-text-2">Keep every domain above 80 and stay consistent.</li>}
            </ul>
          </div>
        </div>
      </div>
    </Link>
  );
}
