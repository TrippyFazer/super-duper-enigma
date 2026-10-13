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
      <PageHeader title="Connected services" subtitle="Where your health data comes from. Manual logging always works." back="/profile/settings" />
      <AppleHealthSettings status={health} appUrl={appUrl} sampleCount={sampleCount()} pending={pendingWorkoutMatches().map((p) => ({ id: p.id, activityType: p.activityType, startAt: p.startAt, durationMin: p.durationMin, sourceName: p.sourceName, suggested: p.suggested ? { id: p.suggested.id, type: p.suggested.type, durationMin: p.suggested.durationMin, date: p.suggested.date, notes: p.suggested.notes } : null }))} />
      <OuraSettings status={oura} oauthAvailable={oauthConfigured()} flash={sp.oura === "connected" ? "Oura connected." : sp.error ? `Oura error: ${sp.error}` : null} />
      <p className="serif px-1 text-[12.5px] text-muted">Oura direct sync is optional. If your ring already writes to Apple Health, connect Apple Health instead and leave this off to avoid double-counting.</p>
    </div>
  );
}
