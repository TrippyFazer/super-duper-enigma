"use client";

import { useEffect, useState, useTransition } from "react";
import { Watch, Check, RefreshCw } from "lucide-react";
import { disconnectOuraAction, saveOuraTokenAction, syncOuraAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, inputClass } from "@/components/ui/primitives";
import type { OuraStatus } from "@/integrations/oura/sync";
import { ago } from "@/lib/ago";

/**
 * Oura, as a person sees it: connected or not, when it last synced, and what
 * it brings in. No auth types or OAuth wording outside the connect step.
 */
export function OuraSettings({ status, oauthAvailable, flash, coverage = { sleep: false, steps: false } }: { status: OuraStatus; oauthAvailable: boolean; flash: string | null; autoSyncHours?: number; coverage?: { sleep: boolean; steps: boolean } }) {
  const { toast } = useFeedback();
  const [token, setToken] = useState("");
  const [pending, start] = useTransition();
  // Re-render the "42m ago" every minute while the page is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const failed = status.lastSyncStatus === "error";

  return (
    <Card id="oura" className="space-y-3">
      <div className="flex items-center gap-2">
        <Watch size={16} className="text-gold" />
        <div className="text-[15px] font-semibold">Oura</div>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${status.connected ? (failed ? "bg-gold/15 text-gold" : "bg-success/15 text-success") : "bg-white/5 text-muted"}`}>{status.connected ? (failed ? "Needs attention" : "Connected") : "Not connected"}</span>
      </div>
      {flash && <p className="text-xs text-gold">{flash}</p>}

      {status.connected ? (
        <>
          <div className="text-sm text-text-2">{failed ? "Last sync didn't go through. Try Sync now." : `Last synced ${ago(status.lastSyncAt)}`}</div>
          <div className="flex gap-4 text-sm">
            {(["sleep", "steps"] as const).map((k) => (
              <span key={k} className={coverage[k] ? "text-success" : "text-muted"}>
                {k === "sleep" ? "Sleep" : "Steps"} {coverage[k] ? <Check size={14} className="inline -mt-0.5" strokeWidth={3} /> : "—"}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await syncOuraAction(7);
                  toast(r.ok ? "Synced" : "Sync didn't go through", r.ok ? "quest" : "error", r.ok ? undefined : r.message);
                })
              }
            >
              <RefreshCw size={14} /> {pending ? "Syncing…" : "Sync now"}
            </Button>
            {status.authType !== "env" && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Disconnect Oura? What's already synced stays.")) start(async () => disconnectOuraAction());
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Sleep and steps fill in by themselves.</p>
          {oauthAvailable && (
            <a href="/api/oura/auth" className="press flex h-12 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white">
              Connect Oura
            </a>
          )}
          <details open={!oauthAvailable}>
            <summary className="press min-h-11 cursor-pointer list-none py-2 text-xs text-muted">{oauthAvailable ? "Have a token instead?" : "Paste your Oura token"}</summary>
            <div className="space-y-2">
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Oura token" className={inputClass} autoComplete="off" aria-label="Oura token" />
              <Button
                disabled={pending || token.trim().length < 10}
                onClick={() =>
                  start(async () => {
                    const r = await saveOuraTokenAction(token.trim());
                    toast(r.message, r.ok ? "quest" : "error");
                    if (r.ok) setToken("");
                  })
                }
                full
              >
                {pending ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}
