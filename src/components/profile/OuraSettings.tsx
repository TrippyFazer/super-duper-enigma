"use client";

import { useState, useTransition } from "react";
import { Watch, Link2, Unplug } from "lucide-react";
import { disconnectOuraAction, saveOuraTokenAction, syncOuraAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Field, inputClass } from "@/components/ui/primitives";
import type { OuraStatus } from "@/integrations/oura/sync";

export function OuraSettings({ status, oauthAvailable, flash, autoSyncHours = 0 }: { status: OuraStatus; oauthAvailable: boolean; flash: string | null; autoSyncHours?: number }) {
  const { toast } = useFeedback();
  const [token, setToken] = useState("");
  const [pending, start] = useTransition();

  return (
    <Card id="oura" className="space-y-3">
      <div className="flex items-center gap-2">
        <Watch size={16} className="text-gold" />
        <div className="eyebrow">Oura Ring</div>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${status.connected ? "bg-success/15 text-success" : "bg-white/5 text-muted"}`}>{status.connected ? "Connected" : "Not connected"}</span>
      </div>
      {flash && <p className="text-xs text-gold">{flash}</p>}

      {status.connected ? (
        <>
          <p className="text-xs text-muted">
            Auth: {status.authType === "env" ? "token from environment" : status.authType === "oauth" ? "OAuth" : "personal token"}.{" "}
            {status.lastSyncAt ? `Last sync ${new Date(status.lastSyncAt).toLocaleString()} (${status.lastSyncStatus}).` : "Not synced yet."}
            {autoSyncHours > 0 && ` Syncs by itself every ${autoSyncHours} hours.`}
            {status.lastError ? ` Last error: ${status.lastError}` : ""}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await syncOuraAction(90);
                  toast(r.message, r.ok ? "quest" : "error");
                })
              }
            >
              Sync 90 days
            </Button>
            {status.authType !== "env" && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Disconnect Oura? Synced data stays.")) start(async () => disconnectOuraAction());
                }}
              >
                <Unplug size={14} /> Disconnect
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Sync sleep, readiness, HRV and steps automatically. Oura requires an active membership for API access (Gen3 / Ring 4).</p>
          {oauthAvailable ? (
            <a href="/api/oura/auth" className="press flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white">
              <Link2 size={15} /> Connect with Oura (OAuth)
            </a>
          ) : (
            <p className="rounded-xl border border-border bg-surface px-3 py-2 text-[11px] text-muted">
              OAuth not configured. Set <code className="font-mono">OURA_CLIENT_ID</code> and <code className="font-mono">OURA_CLIENT_SECRET</code> in <code className="font-mono">.env.local</code> (see docs/oura-integration.md), or paste a token below.
            </p>
          )}
          <Field label="Access token" hint="Paste an Oura API token. Stored only in your local database.">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" className={inputClass} autoComplete="off" />
          </Field>
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
            {pending ? "Connecting…" : "Save token & sync"}
          </Button>
        </>
      )}
    </Card>
  );
}
