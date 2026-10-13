import Link from "next/link";
import { redirect } from "next/navigation";
import { Scroll, Swords, CalendarDays, Crown } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getQuests, reconcile, type QuestView } from "@/services/progression";
import { Card, PageHeader, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quests" };

const LINK: Record<string, string> = {
  fitness: "/domains/fitness",
  sleep: "/domains/sleep",
  cooking: "/domains/cooking",
  wealth: "/domains/wealth",
  skincare: "/domains/skincare",
  sobriety: "/domains/sobriety",
  habits: "/domains/habits",
};

function QuestRow({ q, long }: { q: QuestView; long?: boolean }) {
  const href = LINK[q.domain] ?? "/";
  return (
    <Link href={href} className="press block px-4 py-3.5 hover:bg-white/[0.02]">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${q.done ? "border-success/50 bg-success/15 text-success" : "border-border-strong text-faint"}`}>{q.done ? "✓" : ""}</span>
        <div className="min-w-0 flex-1">
          <div className={`text-[15px] ${q.done ? "text-muted line-through" : "font-medium"}`}>{q.title}</div>
          {q.description && <div className="mt-0.5 text-xs text-muted">{q.description}</div>}
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={q.pct} tone={q.done ? "success" : long ? "violet" : "accent"} height="h-1.5" className="max-w-[220px]" />
            <span className="tabular shrink-0 text-xs text-muted">
              {Math.min(Math.round(q.progress), q.target)}/{q.target}
            </span>
          </div>
        </div>
        <span className="tabular shrink-0 text-xs font-semibold text-gold">+{q.rewardXp}</span>
      </div>
    </Link>
  );
}

export default async function QuestsPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  reconcile();
  const q = getQuests(profile.today);
  const dailyDone = q.daily.filter((x) => x.done).length;

  return (
    <div className="page space-y-5">
      <PageHeader title="Quest board" subtitle={`${dailyDone}/${q.daily.length} daily complete · week of ${formatShort(q.weekly[0]?.periodStart ?? profile.today)}`} />

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Scroll size={12} /> Daily
          </span>
        </SectionTitle>
        <Card className="divide-y divide-border/70 p-0">
          {q.daily.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No daily quests. Set up habits, routines or trackers to generate some.</p>}
          {q.daily.map((x) => (
            <QuestRow key={x.id} q={x} />
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={12} /> Weekly
          </span>
        </SectionTitle>
        <Card className="divide-y divide-border/70 p-0">
          {q.weekly.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No weekly quests yet.</p>}
          {q.weekly.map((x) => (
            <QuestRow key={x.id} q={x} />
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Swords size={12} /> Boss quests
          </span>
        </SectionTitle>
        <Card className="divide-y divide-border/70 p-0">
          {q.long.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Boss quests appear once a domain has activity.</p>}
          {q.long.map((x) => (
            <QuestRow key={x.id} q={x} long />
          ))}
        </Card>
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-faint">
          <Crown size={12} /> Boss quests take weeks. They unlock titles you can equip on your profile.
        </p>
      </section>
    </div>
  );
}
