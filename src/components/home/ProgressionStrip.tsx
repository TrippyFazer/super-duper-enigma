import Link from "next/link";
import { Dumbbell, Moon, UtensilsCrossed, Coins, Droplets, ShieldCheck, Flame } from "lucide-react";
import type { DomainAssessment, DomainId } from "@/ranking/types";
import { DOMAINS } from "@/ranking/domains";
import { RANK_VISUALS } from "@/ranking/rankVisuals";
import { ShieldBadge } from "@/components/ui/ShieldBadge";

export const DOMAIN_ICONS: Record<DomainId, typeof Dumbbell> = {
  fitness: Dumbbell,
  sleep: Moon,
  cooking: UtensilsCrossed,
  wealth: Coins,
  skincare: Droplets,
  sobriety: ShieldCheck,
  habits: Flame,
};

/** Compact, horizontally scrolling domain cards: "Fitness · B · 82". Detail lives on the domain page. */
export function ProgressionStrip({ domains }: { domains: DomainAssessment[] }) {
  return (
    <div className="scroll-x -mx-4 flex gap-2 px-4 pb-1" role="list" aria-label="Domain ranks">
      {domains.map((d) => {
        const Icon = DOMAIN_ICONS[d.domain];
        const v = RANK_VISUALS[d.rank];
        return (
          <Link key={d.domain} href={`/domains/${d.domain}`} role="listitem" className="plate press flex w-[7.4rem] shrink-0 flex-col items-center gap-1 px-2 py-2.5" style={d.rank === "S" ? { boxShadow: "0 0 0 1px rgba(232,196,106,0.35)" } : undefined}>
            <ShieldBadge rank={d.rank} size={34} />
            <span className="display mt-0.5 flex items-center gap-1 text-[12px] font-semibold">
              <Icon size={12} className="text-text-2" /> {DOMAINS[d.domain].name}
            </span>
            <span className="tabular text-[11px] text-muted">{d.sufficiency === "none" && d.score === 0 ? "no data" : Math.round(d.score)}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-black/40">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(2, d.score)}%`, background: v.bar }} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
