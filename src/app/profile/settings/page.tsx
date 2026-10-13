import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { getOuraStatus } from "@/integrations/oura/sync";
import { oauthConfigured } from "@/integrations/oura/client";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "@/components/profile/SettingsForm";
import { OuraSettings } from "@/components/profile/OuraSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ oura?: string; error?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const oura = getOuraStatus();

  return (
    <div className="page space-y-5">
      <PageHeader title="Settings" back="/profile" />
      <SettingsForm
        profile={{ name: profile.name, age: profile.age, timezone: profile.timezone, activeDomains: profile.activeDomains, targets: profile.targets, goals: profile.goals }}
      />
      <OuraSettings status={oura} oauthAvailable={oauthConfigured()} flash={sp.oura === "connected" ? "Oura connected." : sp.error ? `Oura error: ${sp.error}` : null} />
      <div className="card p-4 text-xs text-muted">
        <div className="mb-1 font-medium text-text-2">Your data</div>
        All data lives in a single SQLite file on the server you run this app on (<code className="font-mono">data/ascend.db</code>). Back it up by copying that file. Nothing is sent anywhere unless you connect Oura.
      </div>
    </div>
  );
}
