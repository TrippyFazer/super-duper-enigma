import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CharacterAssessment, DomainId } from "@/ranking/types";
import { RANK_VISUALS } from "@/ranking/rankVisuals";
import { RANK_FLOORS } from "@/ranking/ranks";
import { DOMAINS } from "@/ranking/domains";
import { ShieldBadge } from "@/components/ui/ShieldBadge";

/**
 * NEXT RANK: what is stopping me. One NEED per domain below the next floor,
 * biggest weighted gap first, each linking to the domain that owns it.
 */
export function NextRankCard({ assessment }: { assessment: CharacterAssessment }) {
  const { overall } = assessment;
  const next = overall.next.rank;
  const v = RANK_VISUALS[next ?? "S"];
  const floor = next ? RANK_FLOORS[next] : null;
  const needs = next
    ? assessment.domains
        .filter((d) => d.score < floor!)
        .map((d) => ({ d, gap: (floor! - d.score) * DOMAINS[d.domain].weight }))
        .sort((a, b) => b.gap - a.gap)
        .map(({ d }) => ({ domain: d.domain as DomainId, name: DOMAINS[d.domain].name, need: d.sufficiency === "none" && d.suggestedAction ? d.suggestedAction : (d.next.requirements[0] ?? `Reach ${Math.round(floor!)}`), score: Math.round(d.score), floor: Math.round(floor!) }))
    : [];
  const gate = overall.next.requirements.find((r) => !assessment.domains.some((d) => r.startsWith(`${DOMAINS[d.domain].name}:`)));

  return (
    <section className="plate relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={v.backdrop} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-30" loading="lazy" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/95 to-card/60" />
      <div className="relative">
        <Link href="/progress" className="press flex items-center gap-3 px-4 pt-3 pb-2">
          <ShieldBadge rank={next ?? "S"} size={44} glow />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-text-2">{next ? "Next rank" : "Maintain S rank"}</span>
              <span className="display text-[11px] font-bold tracking-widest" style={{ color: v.accent }}>
                {overall.rank} → {next ?? "S"}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, overall.next.progress * 100)}%`, background: v.bar }} />
            </div>
            <div className="tabular mt-1 text-[11px] text-muted">{Math.round(overall.next.progress * 100)}% there</div>
          </div>
          <ChevronRight size={16} className="text-faint" />
        </Link>
        {(needs.length > 0 || gate) && (
          <ul className="divide-y divide-border/50 border-t border-border/60">
            {gate && <li className="serif px-4 py-2 text-[13px] text-text-2">{gate}</li>}
            {needs.map((n) => (
              <li key={n.domain}>
                <Link href={`/domains/${n.domain}`} className="press flex min-h-11 items-center gap-3 px-4 py-1.5">
                  <span className="display w-[5.75rem] shrink-0 truncate text-[11px] font-semibold uppercase tracking-wide text-gold">{n.name}</span>
                  <span className="serif min-w-0 flex-1 truncate text-[13.5px] text-text">{n.need}</span>
                  <span className="tabular shrink-0 text-[11px] text-muted">
                    {n.score}
                    <span className="text-faint">/{n.floor}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {next && needs.length === 0 && !gate && <p className="serif border-t border-border/60 px-4 py-2 text-[13px] text-muted">Every domain clears the bar. Keep logging and time does the rest.</p>}
      </div>
    </section>
  );
}
