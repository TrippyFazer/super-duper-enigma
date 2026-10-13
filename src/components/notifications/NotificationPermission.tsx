"use client";

import { useEffect, useState, useTransition } from "react";
import { savePreferencesAction } from "@/actions/planner";
import { Button } from "@/components/ui/primitives";

export function NotificationPermission({ enabled }: { enabled: boolean }) {
  const [perm, setPerm] = useState<string>("unsupported");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPerm(Notification.permission);
  }, []);
  if (perm === "unsupported") return null;
  const on = enabled && perm === "granted";
  return (
    <div className="card flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">Device notifications</div>
        <div className="text-xs text-muted">{on ? "On while the app is open. Level-ups, quests and plans." : perm === "denied" ? "Blocked in your browser settings." : "Get notices on this device while the app is open."}</div>
      </div>
      {perm !== "denied" && (
        <Button
          size="sm"
          variant={on ? "secondary" : "primary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (!on) {
                const p = await Notification.requestPermission();
                setPerm(p);
                if (p === "granted") await savePreferencesAction({ notifications: { browser: true } });
              } else {
                await savePreferencesAction({ notifications: { browser: false } });
              }
            })
          }
        >
          {on ? "Turn off" : "Enable"}
        </Button>
      )}
    </div>
  );
}
