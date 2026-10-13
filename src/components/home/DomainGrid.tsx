import Link from "next/link";
import { Dumbbell, Moon, UtensilsCrossed, Coins, Droplets, ShieldCheck, Flame } from "lucide-react";
import type { DomainAssessment, DomainId } from "@/ranking/types";
import { DOMAINS } from "@/ranking/domains";
import { RANK_VISUALS } from "@/ranking/rankVisuals";
import { ShieldBadge } from "@/components/ui/ShieldBadge";
import { Trend } from "@/components/ui/primitives";

export const DOMAIN_ICONS: Record<DomainId, typeof Dumbbell> = {
  fitness: Dumbbell,
  sleep: Moon,
  cooking: UtensilsCrossed,
  wealth: Coins,
  skincare: Droplets,
  sobriety: ShieldCheck,
  habits: Flame,
};

const FLAVOR: Record<DomainId, Record<string, string>> = {
  fitness: { E: "Begin the forge.", D: "A body in motion.", C: "A stronger body.", B: "Built for the long road.", A: "Peak performance.", S: "A legendary body." },
  sleep: { E: "Rest is a skill.", D: "Rest more.", C: "Rest deeper.", B: "Rest with discipline.", A: "Rest fuels greatness.", S: "Rest of a paladin." },
  cooking: { E: "Learn to feed yourself.", D: "Fuel, imperfectly.", C: "Better fuel.", B: "Fuel for the climb.", A: "Nourish to conquer.", S: "Extraordinary fuel." },
  wealth: { E: "Count the coin.", D: "Build the vault.", C: "Build freedom.", B: "Build the kingdom.", A: "Built for a greater purpose.", S: "A treasury of legend." },
  skincare: { E: "Care for the vessel.", D: "Tend the vessel.", C: "A steady ritual.", B: "Discipline shows.", A: "Radiant discipline.", S: "A face of legend." },
  sobriety: { E: "The first clear day.", D: "A clearer mind.", C: "A clearer mind.", B: "Steady and sharp.", A: "A sharper, stronger mind.", S: "Unshakeable." },
  habits: { E: "Small beginnings.", D: "Show up.", C: "Showing up.", B: "A disciplined day.", A: "Discipline forged.", S: "Iron discipline." },
};

export function DomainGrid({ domains }: { domains: DomainAssessment[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {domains.map((d) => {
        const meta = DOMAINS[d.domain];
        const Icon = DOMAIN_ICONS[d.domain];
        const v = RANK_VISUALS[d.rank];
        const capped = d.rankCap && d.next.requirements[0]?.startsWith("Keep this up");
        return (
          <Link key={d.domain} href={`/domains/${d.domain}`} className="plate press flex items-stretch gap-2.5 p-2.5" style={d.rank === "S" ? { boxShadow: "0 0 0 1px rgba(232,196,106,0.35), 0 0 24px -8px rgba(232,196,106,0.5)" } : undefined}>
            <span className="plate-tile flex h-14 w-11 shrink-0 items-center justify-center">
              <Icon size={20} className="text-text-2" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
              <span className="flex items-start justify-between gap-1">
                <span className="display truncate text-[14px] font-semibold">{meta.name}</span>
                <span className="tabular shrink-0 text-[11px] text-muted">
                  <span className="text-text">{Math.round(d.score)}</span>
                  <span className="text-faint"> / 100</span>
                </span>
              </span>
              <span className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, d.score)}%`, background: v.bar }} />
              </span>
              <span className="mt-1 flex items-center justify-between gap-1 text-[11px] text-muted">
                <span className="serif truncate">{d.sufficiency === "none" ? (d.score > 0 ? "Baseline · log to confirm" : "No data yet") : FLAVOR[d.domain][d.rank]}</span>
                <span className="shrink-0">
                  <Trend delta={d.trend.delta7} />
                </span>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-center justify-center" title={d.next.rank ? (capped ? `${d.next.rank} unlocks with time` : `${Math.round(d.next.progress * 100)}% to ${d.next.rank}`) : "Max rank"}>
              <ShieldBadge rank={d.rank} size={30} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
