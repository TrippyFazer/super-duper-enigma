import { redirect } from "next/navigation";
import { getProfile } from "@/services/profile";
import { getOuraStatus } from "@/integrations/oura/sync";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "@/components/profile/SettingsForm";
import { SleepSettings } from "@/components/profile/SleepSettings";
import { MotivationEditor } from "@/components/profile/MotivationEditor";
import { listReasons } from "@/services/motivation";
import Link from "next/link";
import { HeartPulse, ChevronRight } from "lucide-react";
import { appleHealthStatus } from "@/health/apple";
import { PlannerSettings } from "@/components/profile/PlannerSettings";
import { aiStatus } from "@/ai/config";
import { estimateTargets, SAFE_MIN_CALORIES } from "@/services/preferences";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ oura?: string; error?: string }> }) {
  const profile = getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const oura = getOuraStatus();
  const health = appleHealthStatus();

  return (
    <div className="page space-y-5">
      <PageHeader title="Settings" back="/profile" />
      <SettingsForm
        profile={{ name: profile.name, age: profile.age, timezone: profile.timezone, activeDomains: profile.activeDomains, targets: profile.targets, goals: profile.goals }}
      />
      <div id="sleep">
        <SleepSettings initial={{ wakeTarget: profile.preferences.sleep.wakeTarget, sleepTargetMin: profile.targets.sleepTargetMin, windDownMin: profile.preferences.sleep.windDownMin, fallAsleepMin: profile.preferences.sleep.fallAsleepMin, bedtimeTarget: profile.targets.bedtimeTarget }} />
      </div>
      <MotivationEditor reasons={listReasons(true).map((r) => ({ id: r.id, text: r.text, active: r.active }))} />
      <PlannerSettings prefs={profile.preferences} ai={aiStatus()} estimated={(() => { const e = estimateTargets({ ...profile, goal: profile.preferences.nutrition.goal }); return { calories: e.calories, protein: e.protein }; })()} minCalories={SAFE_MIN_CALORIES(profile.sex)} />
      <Link href="/profile/settings/services" className="plate press flex items-center gap-3 px-4 py-3">
        <HeartPulse size={18} className="text-gold" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Connected services</div>
          <div className="serif text-[13px] text-muted">Apple Health {health.connected ? "connected" : "not connected"}{oura.connected ? " · Oura connected" : ""}. Steps, sleep, workouts, HRV.</div>
        </div>
        <ChevronRight size={16} className="text-faint" />
      </Link>
      {sp.oura && <p className="text-xs text-gold">{sp.oura === "connected" ? "Oura connected." : sp.error ? `Oura error: ${sp.error}` : ""}</p>}
      <div className="card p-4 text-xs text-muted">
        <div className="mb-1 font-medium text-text-2">Your data</div>
        All data lives in a single SQLite file on the server you run this app on (<code className="font-mono">data/ascend.db</code>). Back it up by copying that file. Nothing is sent anywhere unless you connect Oura.
      </div>
    </div>
  );
}
