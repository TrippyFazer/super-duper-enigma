import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Sparkles } from "lucide-react";
import { getProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { getWeeklyReview } from "@/services/review";
import { DOMAINS } from "@/ranking/domains";
import { formatShort } from "@/lib/dates";
import { Card, PageHeader, Stat, Trend, cx } from "@/components/ui/primitives";
import { RankBadge } from "@/components/ui/RankBadge";
import type { Rank } from "@/ranking/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const offset = Math.max(0, Math.min(12, Number(sp.w ?? 1) || 0));
  const { assessment } = reconcile();
  const r = getWeeklyReview(offset, assessment);

  const Delta = ({ a, b }: { a: number; b: number }) => <Trend delta={b === 0 ? (a > 0 ? 100 : null) : ((a - b) / b) * 100} suffix="%" />;

  return (
    <div className="page space-y-5">
      <PageHeader
        title={`Week ${r.weekNumber}${r.complete ? " complete" : " in progress"}`}
        subtitle={`${formatShort(r.start)} – ${formatShort(r.end)}, ${r.year}`}
        back="/progress"
        right={
          <div className="flex gap-1 text-xs">
            <Link href={`/progress/review?w=${offset + 1}`} className="press rounded-lg border border-border px-2.5 py-1.5 text-muted">
              ‹
            </Link>
            <Link href={`/progress/review?w=${Math.max(0, offset - 1)}`} className={cx("press rounded-lg border border-border px-2.5 py-1.5 text-muted", offset === 0 && "pointer-events-none opacity-30")}>
              ›
            </Link>
          </div>
        }
      />

      <Card className="relative overflow-hidden text-center">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gold/10 to-transparent" />
        <div className="eyebrow relative">XP earned</div>
        <div className="tabular display relative mt-1 text-5xl font-semibold text-gradient-gold">{r.xp.toLocaleString()}</div>
        <div className="relative mt-1 text-xs text-muted">
          vs {r.xpPrevWeek.toLocaleString()} the week before <Delta a={r.xp} b={r.xpPrevWeek} />
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Workouts" value={r.counts.workouts} sub={<Delta a={r.counts.workouts} b={r.prevCounts.workouts} />} />
        <Stat label="Meals" value={r.counts.meals} sub={<Delta a={r.counts.meals} b={r.prevCounts.meals} />} />
        <Stat label="Habits" value={r.counts.habits} sub={<Delta a={r.counts.habits} b={r.prevCounts.habits} />} />
      </div>

      <Card className="divide-y divide-border/70 p-0">
        {r.domains.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3">
            <RankBadge rank={d.rank as Rank} size="sm" />
            <div className="flex-1 text-sm font-medium">{d.name}</div>
            <div className="tabular text-sm">{Math.round(d.score)}</div>
            <div className="w-14 text-right">
              <Trend delta={d.delta} />
            </div>
          </div>
        ))}
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        <Card>
          <div className="eyebrow">Strongest</div>
          <div className="mt-1 text-base font-semibold">{r.strongest ? DOMAINS[r.strongest].name : "—"}</div>
        </Card>
        <Card>
          <div className="eyebrow">Needs attention</div>
          <div className="mt-1 text-base font-semibold">{r.needsAttention ? DOMAINS[r.needsAttention].name : "—"}</div>
        </Card>
      </div>

      {r.achievements.length > 0 && (
        <Card>
          <div className="eyebrow mb-2">Achievements this week</div>
          <ul className="space-y-1.5">
            {r.achievements.map((a) => (
              <li key={a.key} className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-gold" /> {a.name}
                {a.title && <span className="text-xs text-muted">· “{a.title}”</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.suggestedQuest && (
        <Card glow="accent">
          <div className="flex items-start gap-3">
            <Sparkles size={16} className="mt-0.5 text-accent-2" />
            <div>
              <div className="eyebrow text-accent-2/80">Suggested focus for next week</div>
              <div className="mt-1 text-sm">{r.suggestedQuest}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
