"use client";

import { useEffect } from "react";

/**
 * Shows OS-level notifications for new in-app notifications while the app is
 * open (opt-in in Settings). Polls lightly; no push service required.
 */
export function BrowserNotifier({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    let lastId = Number(localStorage.getItem("ascend:lastNotifId") ?? "0");
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications?since=${lastId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: { id: number; title: string; body: string; href: string | null }[] };
        for (const n of data.items) {
          if (n.id <= lastId) continue;
          const note = new Notification(n.title, { body: n.body, icon: "/icons/icon-192.png", tag: `ascend-${n.id}` });
          note.onclick = () => {
            window.focus();
            if (n.href) window.location.href = n.href;
          };
          lastId = Math.max(lastId, n.id);
        }
        localStorage.setItem("ascend:lastNotifId", String(lastId));
      } catch {
        /* offline */
      }
    };
    poll();
    const t = setInterval(() => !stop && poll(), 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [enabled]);
  return null;
}
