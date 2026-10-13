import { desc, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import type { NotificationPrefs } from "./preferences";

export type NotificationKind = keyof Omit<NotificationPrefs, "browser"> | "system";

/** Idempotent by key. Respects category preferences. */
export function pushNotification(prefs: NotificationPrefs, n: { kind: NotificationKind; title: string; body?: string; href?: string; key: string }) {
  if (n.kind !== "system" && prefs[n.kind] === false) return;
  getDb()
    .insert(notifications)
    .values({ kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? null, key: n.key })
    .onConflictDoNothing()
    .run();
}

export function listNotifications(limit = 30) {
  return getDb().select().from(notifications).orderBy(desc(notifications.id)).limit(limit).all();
}

export function unreadCount(): number {
  const r = getDb().select({ n: sql<number>`count(*)` }).from(notifications).where(isNull(notifications.readAt)).get();
  return r?.n ?? 0;
}

export function markAllRead() {
  getDb().update(notifications).set({ readAt: new Date().toISOString() }).where(isNull(notifications.readAt)).run();
}

export function unreadSince(sinceId: number) {
  return getDb().select().from(notifications).where(sql`${notifications.id} > ${sinceId} and ${notifications.readAt} is null`).orderBy(notifications.id).all();
}
