import { redirect } from "next/navigation";
import { ArrowUp, ArrowDown, Trophy, Flag, Crown, Sparkles, BookOpen } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getCharacterEvents } from "@/services/progression";
import { Card, PageHeader } from "@/components/ui/primitives";
import { formatLong } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

const ICON: Record<string, { icon: typeof Trophy; cls: string }> = {
  rank_up: { icon: ArrowUp, cls: "text-success" },
  rank_down: { icon: ArrowDown, cls: "text-danger" },
  level_up: { icon: Sparkles, cls: "text-accent-2" },
  achievement: { icon: Trophy, cls: "text-gold" },
  milestone: { icon: Flag, cls: "text-violet" },
  title: { icon: Crown, cls: "text-gold" },
  system: { icon: BookOpen, cls: "text-muted" },
};

export default function HistoryPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const events = getCharacterEvents(300);
  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const d = e.occurredAt.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  return (
    <div className="page space-y-4">
      <PageHeader title="Chronicle" subtitle={`The story of ${profile.name} so far.`} back="/profile" />
      {events.length === 0 && <Card className="text-center text-sm text-muted">Nothing recorded yet. Rank-ups, level-ups, milestones and achievements will appear here.</Card>}
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day}>
          <div className="eyebrow mb-1.5 px-1">{formatLong(day)}</div>
          <Card className="divide-y divide-border/70 p-0">
            {list.map((e) => {
              const meta = ICON[e.type] ?? ICON.system;
              const Icon = meta.icon;
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${meta.cls}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{e.title}</div>
                    {e.description && <div className="text-xs text-muted">{e.description}</div>}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      ))}
    </div>
  );
}
