import Link from "next/link";
import { Info } from "lucide-react";
import type { DomainAssessment } from "@/ranking/types";
import { DOMAINS } from "@/ranking/domains";
import { RANK_DESCRIPTIONS, RANK_LABELS } from "@/ranking/ranks";
import { RankBadge } from "@/components/ui/RankBadge";
import { Card, ProgressBar, Trend, cx } from "@/components/ui/primitives";
import { ScoreHistoryChart } from "@/components/charts/Charts";

export function RangeTabs({ current, base }: { current: 7 | 30 | 90; base: string }) {
  return (
    <div className="flex rounded-lg border border-border bg-black/30 p-0.5 text-xs">
      {[7, 30, 90].map((n) => (
        <Link key={n} href={`${base}?range=${n}`} scroll={false} className={cx("press rounded-md px-2.5 py-1 font-medium", current === n ? "bg-card-2 text-text" : "text-muted")}>
          {n}d
        </Link>
      ))}
    </div>
  );
}

export function DomainHeader({ a, history }: { a: DomainAssessment; history: { date: string; score: number }[] }) {
  const meta = DOMAINS[a.domain];
  return (
    <div className="space-y-3">
      <Card glow={a.rank === "S" ? "gold" : null} className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <RankBadge rank={a.rank} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="display text-xl font-semibold">
              {a.rank}-Rank {RANK_LABELS[a.rank]}
            </div>
            <div className="text-xs text-muted">{RANK_DESCRIPTIONS[a.rank]}</div>
          </div>
          <div className="text-right">
            <div className="tabular display text-3xl font-semibold leading-none">{Math.round(a.score)}</div>
            <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-muted">
              <Trend delta={a.trend.delta7} /> 7d
            </div>
          </div>
        </div>
        <div className="relative mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted">{a.next.rank ? `Progress to ${a.next.rank}` : "Maximum rank"}</span>
            <span className="tabular text-text-2">{Math.round(a.next.progress * 100)}%</span>
          </div>
          <ProgressBar value={a.next.progress} tone={a.rank === "S" ? "gold" : "accent"} />
          {a.rankCap && a.next.rank && a.rankCap !== "S" && <div className="mt-1.5 text-[11px] text-faint">Rank currently capped at {a.rankCap} by tenure ({a.tenureDays} days tracked). Caps lift at 14 / 30 / 60 / 120 days.</div>}
        </div>
      </Card>

      {a.next.requirements.length > 0 && (
        <Card>
          <div className="eyebrow mb-2">{a.next.rank ? `To reach ${a.next.rank} rank` : "Holding S"}</div>
          <ul className="space-y-1.5">
            {a.next.requirements.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-2">
                <span className="text-gold">›</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="eyebrow mb-2">Substats</div>
        <ul className="space-y-3">
          {a.substats.map((s) => (
            <li key={s.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="tabular shrink-0 text-xs text-muted">{s.value}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <ProgressBar value={s.score / 100} tone={s.score >= 85 ? "gold" : s.score >= 50 ? "accent" : "muted"} height="h-1.5" />
                <span className="tabular w-7 text-right text-xs text-text-2">{Math.round(s.score)}</span>
              </div>
              {s.note && <div className="mt-1 text-[11px] text-faint">{s.note}</div>}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="eyebrow mb-2">Score history</div>
        <ScoreHistoryChart data={history} />
      </Card>

      <Card className="border-border/60 bg-surface">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-2">
          <Info size={13} /> Why this rank
        </div>
        <ul className="space-y-1 text-xs text-muted">
          {a.explanation.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
          <li className="pt-1 text-faint">{meta.basis === "percentile" ? "Percentile-based: scored against population data." : meta.basis === "adherence" ? "Adherence-based: scored against your own consistency." : "Mixed: guideline adherence plus population rarity."} See docs/ranking-methodology.md.</li>
        </ul>
      </Card>
    </div>
  );
}
