import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Settings, History, Trophy, Lock } from "lucide-react";
import { getProfile } from "@/services/profile";
import { getCharacterEvents, getUnlockedAchievements, getUnlockedTitles, reconcile } from "@/services/progression";
import { ACHIEVEMENTS } from "@/ranking/achievements";
import { DOMAINS } from "@/ranking/domains";
import { RANK_LABELS } from "@/ranking/ranks";
import { Card, PageHeader, ProgressBar, SectionTitle, cx } from "@/components/ui/primitives";
import { RankBadge, RANK_COLOR } from "@/components/ui/RankBadge";
import { TitlePicker } from "@/components/profile/TitlePicker";
import { formatShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default function ProfilePage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const { assessment } = reconcile();
  const unlocked = getUnlockedAchievements();
  const unlockedKeys = new Set(unlocked.map((u) => u.key));
  const titles = getUnlockedTitles();
  const events = getCharacterEvents(6);
  const { overall, level } = assessment;

  return (
    <div className="page space-y-5">
      <PageHeader
        title="Character"
        right={
          <Link href="/profile/settings" aria-label="Settings" className="press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-2">
            <Settings size={17} />
          </Link>
        }
      />

      {/* Character sheet */}
      <Card glow={overall.rank === "S" ? "gold" : null} className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          <RankBadge rank={overall.rank} size="xl" />
          <div className="display mt-4 text-3xl font-semibold uppercase tracking-wide">{profile.name}</div>
          <div className="mt-1 text-sm text-text-2">
            Level {level.level} · {overall.rank}-Rank {RANK_LABELS[overall.rank]}
          </div>
          <TitlePicker current={profile.equippedTitle} titles={titles} />
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-x-6 gap-y-2">
          {assessment.stats.map((s) => (
            <div key={s.domain} className="flex items-center justify-between text-sm">
              <span className="text-text-2">{s.name}</span>
              <span className="tabular display text-base font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
        <div className="hairline my-4" />
        <div className="relative space-y-1.5 text-sm">
          {assessment.domains.map((d) => (
            <div key={d.domain} className="flex items-center justify-between">
              <span className="text-text-2">{DOMAINS[d.domain].name}</span>
              <span className={cx("display font-semibold", RANK_COLOR[d.rank])}>{d.rank}</span>
            </div>
          ))}
        </div>
        <div className="hairline my-4" />
        <div className="relative">
          <div className="flex items-center justify-between text-xs">
            <span className="eyebrow">{overall.next.rank ? `Next overall rank: ${overall.next.rank}` : "Highest rank held"}</span>
            <span className="tabular text-text-2">{Math.round(overall.next.progress * 100)}% complete</span>
          </div>
          <ProgressBar value={overall.next.progress} tone="gold" className="mt-2" />
          {overall.next.requirements.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {overall.next.requirements.map((r, i) => (
                <li key={i}>› {r}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/profile/history" className="card press flex items-center gap-2.5 px-4 py-3 text-sm">
          <History size={16} className="text-gold" /> History <ChevronRight size={14} className="ml-auto text-faint" />
        </Link>
        <Link href="/profile/settings" className="card press flex items-center gap-2.5 px-4 py-3 text-sm">
          <Settings size={16} className="text-gold" /> Settings <ChevronRight size={14} className="ml-auto text-faint" />
        </Link>
      </div>

      <section id="achievements">
        <SectionTitle>
          Achievements · {unlocked.length}/{ACHIEVEMENTS.length}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.filter((a) => a.key !== "character_created").map((a) => {
            const got = unlockedKeys.has(a.key);
            const when = unlocked.find((u) => u.key === a.key)?.unlockedAt;
            return (
              <div key={a.key} className={cx("card flex items-start gap-2.5 p-3", !got && "opacity-55")}>
                <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", got ? "bg-gold/15 text-gold" : "bg-white/5 text-faint")}>{got ? <Trophy size={14} /> : <Lock size={13} />}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.secret && !got ? "???" : a.name}</div>
                  <div className="line-clamp-2 text-[11px] text-muted">{a.secret && !got ? "Hidden achievement" : a.description}</div>
                  <div className="mt-1 text-[10px] text-faint">
                    {got && when ? formatShort(when.slice(0, 10)) : a.xp ? `+${a.xp} XP` : ""}
                    {a.title ? ` · “${a.title}”` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {events.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/profile/history" className="flex items-center text-xs text-muted">
                Full history <ChevronRight size={14} />
              </Link>
            }
          >
            Recent chapters
          </SectionTitle>
          <Card className="divide-y divide-border/70 p-0">
            {events.map((e) => (
              <div key={e.id} className="px-4 py-2.5">
                <div className="text-sm">{e.title}</div>
                <div className="text-[11px] text-muted">{formatShort(e.occurredAt.slice(0, 10))}</div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
