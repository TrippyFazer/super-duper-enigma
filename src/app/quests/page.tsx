import { redirect } from "next/navigation";
import { Scroll, Swords, CalendarDays, Crown, History } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getQuests, reconcile } from "@/services/progression";
import { refreshOffers } from "@/services/planner";
import { listOffers } from "@/services/questOffers";
import { PageHeader, SectionTitle, cx, EmptyHint } from "@/components/ui/primitives";
import { QuestRow } from "@/components/quests/QuestRow";
import { UndoOfferButton } from "@/components/quests/UndoOfferButton";
import { SpecialQuestCard } from "@/components/quests/SpecialQuestCard";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quest journal" };

const LINK: Record<string, string> = { fitness: "/planner/workout", sleep: "/domains/sleep", cooking: "/planner/meals", wealth: "/domains/wealth", skincare: "/domains/skincare", sobriety: "/domains/sobriety", habits: "/domains/habits" };

export default async function QuestsPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  reconcile();
  const open = await refreshOffers(profile);
  const q = getQuests(profile.today);
  const history = listOffers({ limit: 40 }).filter((o) => o.status !== "offered" && o.status !== "accepted");
  const dailyDone = q.daily.filter((x) => x.done).length;
  // ACTIVE = started and not finished. Each quest appears once: what is under
  // Active is not listed again under Daily / Weekly (it used to repeat every
  // unfinished weekly quest twice).
  const active = [...q.daily, ...q.weekly].filter((x) => !x.done && x.progress > 0);
  const activeIds = new Set(active.map((x) => x.id));
  const daily = q.daily.filter((x) => !activeIds.has(x.id));
  const weekly = q.weekly.filter((x) => !activeIds.has(x.id));

  const STATUS: Record<string, { label: string; cls: string }> = { completed: { label: "Completed", cls: "text-success" }, declined: { label: "Declined", cls: "text-muted" }, expired: { label: "Expired", cls: "text-faint" } };

  return (
    <div className="page space-y-5">
      <PageHeader title="Quest journal" subtitle={`${dailyDone}/${q.daily.length} daily complete · week of ${formatShort(q.weekly[0]?.periodStart ?? profile.today)}`} />

      {open && (
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Swords size={12} /> {open.status === "accepted" ? "Active special quest" : "Available"}
            </span>
          </SectionTitle>
          <SpecialQuestCard offer={{ id: open.id, title: open.title, description: open.description, domain: open.domain, difficulty: open.difficulty, kind: open.kind, estimatedMinutes: open.estimatedMinutes, xpReward: open.xpReward, status: open.status, expiresAt: open.expiresAt }} />
        </section>
      )}
      {!open && <p className="serif px-1 text-[13px] text-muted">No special quest right now.</p>}

      {active.length > 0 && (
        <section>
          <SectionTitle>Active</SectionTitle>
          <div className="plate divide-y divide-border/60 p-1">
            {active.map((x) => (
              <QuestRow key={x.id} title={x.title} subtitle={x.kind === "weekly" ? "Weekly quest" : x.description || undefined} domain={x.domain} progress={x.pct} progressLabel={`${Math.min(Math.round(x.progress), x.target)}/${x.target}`} rewardXp={x.rewardXp} href={LINK[x.domain] ?? "/"} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Scroll size={12} /> Daily
          </span>
        </SectionTitle>
        <div className="plate divide-y divide-border/60 p-1">
          {daily.length === 0 && q.daily.length === 0 && <EmptyHint text="No daily quests yet." action="Add a habit" href="/domains/habits" />}
          {daily.map((x) => (
            <QuestRow key={x.id} title={x.title} subtitle={x.description || undefined} domain={x.domain} done={x.done} progress={x.pct} progressLabel={x.target > 1 ? `${Math.min(Math.round(x.progress), x.target)}/${x.target}` : undefined} rewardXp={x.rewardXp} href={LINK[x.domain] ?? "/"} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={12} /> Weekly
          </span>
        </SectionTitle>
        <div className="plate divide-y divide-border/60 p-1">
          {q.weekly.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No weekly quests yet.</p>}
          {weekly.map((x) => (
            <QuestRow key={x.id} title={x.title} subtitle={x.description || undefined} domain={x.domain} done={x.done} progress={x.pct} progressLabel={`${Math.min(Math.round(x.progress), x.target)}/${x.target}`} rewardXp={x.rewardXp} href={LINK[x.domain] ?? "/"} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Crown size={12} /> Boss quests
          </span>
        </SectionTitle>
        <div className="plate divide-y divide-border/60 p-1">
          {q.long.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Boss quests appear once a domain has activity.</p>}
          {q.long.map((x) => (
            <QuestRow key={x.id} title={x.title} subtitle={x.description || undefined} domain={x.domain} done={x.done} progress={x.pct} progressLabel={`${Math.min(Math.round(x.progress), x.target)}/${x.target}`} rewardXp={x.rewardXp} href={LINK[x.domain] ?? "/"} tone="boss" />
          ))}
        </div>
        <p className="serif mt-2 px-1 text-[13px] text-muted">Boss quests take weeks and unlock titles you can equip.</p>
      </section>

      {history.length > 0 && (
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <History size={12} /> Special quest history
            </span>
          </SectionTitle>
          <div className="plate divide-y divide-border/60 p-0">
            {history.slice(0, 20).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className={cx("truncate", o.status === "completed" ? "" : "text-muted")}>{o.title}</div>
                  <div className="text-[11px] text-faint">{formatShort(o.date)} · +{o.xpReward} XP</div>
                </div>
                <span className={cx("text-[11px] uppercase tracking-wider", STATUS[o.status]?.cls)}>{STATUS[o.status]?.label ?? o.status}</span>
                {o.status === "completed" && o.date === profile.today && <UndoOfferButton id={o.id} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
