import { autoSyncHours } from "@/services/autoSync";
import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { getOuraStatus } from "@/integrations/oura/sync";
import { oauthConfigured } from "@/integrations/oura/client";
import { appleHealthStatus, pendingWorkoutMatches, sampleCount } from "@/health/apple";
import { PageHeader } from "@/components/ui/primitives";
import { OuraSettings } from "@/components/profile/OuraSettings";
import { AppleHealthSettings } from "@/components/profile/AppleHealthSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connected services" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ oura?: string; error?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const oura = getOuraStatus();
  const health = appleHealthStatus();
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return (
    <div className="page space-y-5">
      <PageHeader title="Connected services" subtitle="Oura is the source and syncs by itself. Manual logging always works." back="/profile/settings" />
      <OuraSettings status={oura} oauthAvailable={oauthConfigured()} autoSyncHours={autoSyncHours()} flash={sp.oura === "connected" ? "Oura connected." : sp.error ? `Oura error: ${sp.error}` : null} />
      <details open={health.connected} className="group">
        <summary className="press flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-xs text-muted">
          <span className="eyebrow">Optional · Apple Health</span>
          <span className="ml-auto">{health.connected ? "connected" : "show"}</span>
        </summary>
        <div className="mt-2 space-y-2">
          <AppleHealthSettings status={health} appUrl={appUrl} sampleCount={sampleCount()} pending={pendingWorkoutMatches().map((p) => ({ id: p.id, activityType: p.activityType, startAt: p.startAt, durationMin: p.durationMin, sourceName: p.sourceName, suggested: p.suggested ? { id: p.suggested.id, type: p.suggested.type, durationMin: p.suggested.durationMin, date: p.suggested.date, notes: p.suggested.notes } : null }))} />
          <p className="serif px-1 text-[12.5px] text-muted">Oura is the source. If your ring also writes to Apple Health, leave this off so nothing is counted twice.</p>
        </div>
      </details>
    </div>
  );
}
