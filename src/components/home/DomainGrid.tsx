import Link from "next/link";
import { Dumbbell, Moon, UtensilsCrossed, Coins, Droplets, ShieldCheck, Flame } from "lucide-react";
import type { DomainAssessment, DomainId } from "@/ranking/types";
import { DOMAINS } from "@/ranking/domains";
import { RankBadge } from "@/components/ui/RankBadge";
import { ProgressBar, Trend } from "@/components/ui/primitives";

export const DOMAIN_ICONS: Record<DomainId, typeof Dumbbell> = {
  fitness: Dumbbell,
  sleep: Moon,
  cooking: UtensilsCrossed,
  wealth: Coins,
  skincare: Droplets,
  sobriety: ShieldCheck,
  habits: Flame,
};

export function DomainGrid({ domains }: { domains: DomainAssessment[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {domains.map((d) => {
        const meta = DOMAINS[d.domain];
        const Icon = DOMAIN_ICONS[d.domain];
        const capped = d.rankCap && d.next.requirements[0]?.startsWith("Keep this up");
        return (
          <Link key={d.domain} href={`/domains/${d.domain}`} className={`card press flex flex-col p-3.5 ${d.rank === "S" ? "rank-glow-s" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                <Icon size={15} className="text-muted" />
                {meta.name}
              </span>
              <RankBadge rank={d.rank} size="sm" />
            </div>
            <div className="mt-2.5 flex items-end justify-between">
              <span className="tabular display text-2xl font-semibold leading-none">{Math.round(d.score)}</span>
              <Trend delta={d.trend.delta7} />
            </div>
            <ProgressBar value={d.next.progress} tone={d.rank === "S" ? "gold" : "accent"} className="mt-2.5" height="h-1.5" />
            <div className="mt-1.5 truncate text-[11px] text-muted">
              {d.sufficiency === "none" ? (d.score > 0 ? "Baseline · log to confirm" : "No data yet") : d.next.rank ? (capped ? `${d.next.rank} unlocks with time` : `${Math.round(d.next.progress * 100)}% to ${d.next.rank}`) : "Max rank"}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
