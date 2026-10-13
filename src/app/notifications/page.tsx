import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, Swords, Dumbbell, UtensilsCrossed, ArrowUpRight, Sparkles, Trophy, ShieldCheck, CalendarCheck } from "lucide-react";
import { getProfile } from "@/services/profile";
import { listNotifications, markAllRead } from "@/services/notifications";
import { Card, PageHeader, cx } from "@/components/ui/primitives";
import { NotificationPermission } from "@/components/notifications/NotificationPermission";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const ICON: Record<string, typeof Bell> = { quest: Swords, workout: Dumbbell, meals: UtensilsCrossed, level: ArrowUpRight, rank: Sparkles, achievement: Trophy, sobriety: ShieldCheck, review: CalendarCheck, system: Bell };

export default function NotificationsPage() {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const items = listNotifications(60);
  const unread = items.filter((n) => !n.readAt).length;
  // Opening the page marks everything read (after rendering unread state).
  if (unread) markAllRead();

  return (
    <div className="page space-y-4">
      <PageHeader title="Notices" subtitle="Quests, plans, milestones and rank changes." back="/" />
      <NotificationPermission enabled={profile.preferences.notifications.browser} />
      {items.length === 0 && <Card className="text-center text-sm text-muted">Nothing yet. Notices appear here as you progress.</Card>}
      {items.length > 0 && (
        <Card className="divide-y divide-border/70 p-0">
          {items.map((n) => {
            const Icon = ICON[n.kind] ?? Bell;
            const inner = (
              <div className={cx("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-gold/[0.04]")}>
                <Icon size={16} className={cx("mt-0.5 shrink-0", n.readAt ? "text-muted" : "text-gold")} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="serif text-[13px] text-muted">{n.body}</div>}
                  <div className="mt-0.5 text-[10px] text-faint">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
              </div>
            );
            return n.href ? (
              <Link key={n.id} href={n.href} className="press block">
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </Card>
      )}
      <p className="px-1 text-[11px] text-faint">Categories can be turned off in Settings → Notifications.</p>
    </div>
  );
}
