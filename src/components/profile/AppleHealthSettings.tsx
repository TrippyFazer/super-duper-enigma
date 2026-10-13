"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, RefreshCw, Unplug, KeyRound, Check, Minus, Link2, X } from "lucide-react";
import { connectAppleHealthAction, disconnectAppleHealthAction, ignoreHealthWorkoutAction, linkHealthWorkoutAction, syncAppleHealthAction } from "@/actions/health";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, cx } from "@/components/ui/primitives";
import type { HealthProviderStatus } from "@/health/provider";

interface PendingMatch {
  id: number;
  activityType: string;
  startAt: string;
  durationMin: number;
  sourceName: string;
  suggested: { id: number; type: string; durationMin: number; date: string; notes: string | null } | null;
}

/**
 * Settings → Connected Services → Apple Health. Honest about what exists: each
 * metric shows ✓ only when samples have actually arrived; otherwise "—".
 */
export function AppleHealthSettings({ status, appUrl, pending: pendingMatches, sampleCount }: { status: HealthProviderStatus; appUrl: string; pending: PendingMatch[]; sampleCount: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const relevant = status.metrics.filter((m) => ["steps", "sleep", "workout", "hrv", "resting_hr", "active_energy", "exercise_minutes", "distance", "body_mass"].includes(m.metric));

  return (
    <Card id="apple-health" className="space-y-3">
      <div className="flex items-center gap-2">
        <HeartPulse size={16} className="text-gold" />
        <div className="eyebrow">Apple Health</div>
        <span className={cx("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", status.connected ? "bg-success/15 text-success" : "bg-white/5 text-muted")}>{status.connected ? "Connected" : "Not connected"}</span>
      </div>
      <p className="text-xs text-muted">
        Preferred data flow on iPhone: <span className="text-text-2">Oura → Apple Health → Ascend</span>. Health data reaches this app through a small iOS bridge (a Shortcut automation, or the native HealthKit bridge in <code className="font-mono">native/ios</code>). This web app never reads HealthKit directly and never pretends to.
      </p>

      {status.connected && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-card-2 px-3 py-2 text-xs">
            <div className="text-muted">Bridge</div>
            <div className="text-right">{status.bridge === "native" ? "Native HealthKit" : status.bridge === "shortcut" ? "iOS Shortcut" : "Waiting for first sync"}</div>
            <div className="text-muted">Background updates</div>
            <div className="text-right">{status.backgroundDelivery == null ? "—" : status.backgroundDelivery ? "On (observer query)" : "Off — manual / automation"}</div>
            <div className="text-muted">Last sync</div>
            <div className="text-right">{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}</div>
            <div className="text-muted">Samples stored</div>
            <div className="text-right tabular">{sampleCount.toLocaleString()}</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-faint">Data available</div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {relevant.map((m) => (
                <li key={m.metric} className="flex items-center justify-between gap-2 py-0.5">
                  <span className={m.available ? "text-text" : "text-muted"}>{m.label}</span>
                  <span className={cx("flex items-center gap-1 tabular", m.available ? "text-success" : "text-faint")} title={m.sources.join(", ")}>
                    {m.available ? <Check size={12} /> : <Minus size={12} />}
                    {m.available ? (m.sources[0] ?? "") : m.permission === "denied" ? "denied" : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-faint">A metric shows ✓ only when real samples have arrived. Missing ones are not assumed; manual logging keeps working for them.</p>
          </div>
          {pendingMatches.length > 0 && (
            <div className="space-y-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2">
              <div className="text-xs font-medium">Apple Health found workouts matching sessions you logged</div>
              {pendingMatches.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {p.activityType} · {p.durationMin} min · {p.sourceName}
                    </div>
                    <div className="text-muted">
                      {new Date(p.startAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ≈ your {p.suggested?.type} ({p.suggested?.durationMin} min)
                    </div>
                  </div>
                  <button disabled={busy} onClick={() => start(async () => { await linkHealthWorkoutAction(p.id, p.suggested?.id ?? null); router.refresh(); })} className="press flex items-center gap-1 rounded-full border border-success/40 px-2 py-1 text-success">
                    <Link2 size={11} /> Same
                  </button>
                  <button disabled={busy} onClick={() => start(async () => { await linkHealthWorkoutAction(p.id, null); router.refresh(); })} className="press rounded-full border border-border px-2 py-1 text-text-2">
                    Different
                  </button>
                  <button aria-label="Ignore" disabled={busy} onClick={() => start(async () => { await ignoreHealthWorkoutAction(p.id); router.refresh(); })} className="press flex h-7 w-7 items-center justify-center rounded-full text-faint">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-muted">Linking avoids counting the same workout twice. Linked workouts contribute to stats without extra XP.</p>
            </div>
          )}
        </>
      )}

      {token && (
        <div className="space-y-2 rounded-lg border border-gold/40 bg-gold/5 px-3 py-2">
          <div className="text-xs font-medium">Your ingest token (shown once — copy it now)</div>
          <code className="block break-all rounded bg-black/40 px-2 py-1.5 font-mono text-[11px] text-gold">{token}</code>
          <div className="text-[11px] text-muted">
            Endpoint: <code className="font-mono">{appUrl}/api/health/ingest</code>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!status.connected ? (
          <Button variant="gold" disabled={busy} onClick={() => start(async () => { const r = await connectAppleHealthAction(); setToken(r.token); setShowSetup(true); router.refresh(); })}>
            <KeyRound size={14} /> Connect Apple Health
          </Button>
        ) : (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => start(async () => { const r = await syncAppleHealthAction(30); toast(r.message, r.ok ? "quest" : "error"); router.refresh(); })}>
              <RefreshCw size={14} /> Sync now
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setShowSetup((v) => !v)}>
              Manage permissions
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await connectAppleHealthAction(); setToken(r.token); toast("Token rotated — update your Shortcut / bridge", "quest"); })}>
              Rotate token
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                const wipe = window.confirm("Disconnect Apple Health. Also delete the stored samples? (OK = delete samples too, Cancel = keep them)");
                start(async () => {
                  await disconnectAppleHealthAction(wipe);
                  toast("Apple Health disconnected", "quest");
                  router.refresh();
                });
              }}
            >
              <Unplug size={14} /> Disconnect
            </Button>
          </>
        )}
      </div>

      {showSetup && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-card-2 px-3 py-3 text-xs text-text-2">
          <div className="font-medium text-text">Set up or change permissions</div>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              <span className="text-text">No-code bridge (works today):</span> on your iPhone open Shortcuts → create the “Ascend Health Sync” shortcut described in <code className="font-mono">docs/apple-health.md</code>. It uses <em>Find Health Samples</em> for Steps, Sleep Analysis, Workouts, HRV and Resting Heart Rate, then <em>Get Contents of URL</em> (POST, JSON) to the endpoint above with header <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. Add an Automation (e.g. 7:30 AM and 9:00 PM daily) so it runs on its own.
            </li>
            <li>
              <span className="text-text">Native bridge (background delivery):</span> the Swift package in <code className="font-mono">native/ios</code> requests read-only HealthKit permissions, registers observer queries with background delivery for steps, sleep, workouts, HRV and resting HR, and posts new samples here. Permissions are managed in iOS Settings → Health → Data Access &amp; Devices → Ascend.
            </li>
            <li>Only read permissions are requested, only for the metrics listed above. Revoking a permission simply stops new samples for that metric; the app shows “—” and manual logging takes over.</li>
            <li>Manual refresh always works: “Sync now” re-applies everything already received.</li>
          </ol>
        </div>
      )}
    </Card>
  );
}
