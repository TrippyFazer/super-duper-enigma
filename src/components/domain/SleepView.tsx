import Link from "next/link";
import { Watch } from "lucide-react";
import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadSleep } from "@/services/loaders";
import { getOuraStatus } from "@/integrations/oura/sync";
import { formatMinutes, formatShort, lastNDays, minutesToHhmm } from "@/lib/dates";
import { circularMeanMinutes, mean } from "@/ranking/scale";
import { QuickLog } from "@/components/log/QuickLog";
import { SleepChart, DayHeatmap } from "@/components/charts/Charts";
import { Card, SectionTitle, Stat } from "@/components/ui/primitives";
import { OuraSyncButton } from "./OuraSyncButton";

function clock(iso: string | null | undefined): number | null {
  const m = iso?.match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function SleepView({ profile, range }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const today = profile.today;
  const oura = getOuraStatus();
  const entries = loadSleep(today);
  const days = lastNDays(today, range);
  const inRange = entries.filter((e) => e.date >= days[0]);
  const avg = inRange.length ? mean(inRange.map((e) => e.totalSleepMin)) : null;
  const atTarget = inRange.filter((e) => e.totalSleepMin >= profile.targets.sleepTargetMin).length;
  const bedtimes = inRange.map((e) => clock(e.bedtimeStart)).filter((x): x is number => x != null);
  const wakes = inRange.map((e) => clock(e.bedtimeEnd)).filter((x): x is number => x != null);
  const hrv = inRange.map((e) => e.hrv).filter((x): x is number => x != null);
  const rhr = inRange.map((e) => e.restingHr).filter((x): x is number => x != null);

  const chart = days.map((d) => ({ date: d, hours: (entries.find((e) => e.date === d)?.totalSleepMin ?? 0) / 60 })).filter((x) => range <= 30 || x.hours > 0);
  const heat = lastNDays(today, 91).map((d) => {
    const e = entries.find((x) => x.date === d);
    return { date: d, value: e ? Math.min(1, e.totalSleepMin / 540) : null, label: e ? formatMinutes(e.totalSleepMin) : "no data" };
  });

  return (
    <div className="space-y-4">
      {oura.connected && oura.enabled ? (
        <div className="card flex items-center gap-3 px-4 py-3">
          <Watch size={18} className="text-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Oura connected</div>
            <div className="truncate text-xs text-muted">{oura.lastSyncAt ? `Last sync ${new Date(oura.lastSyncAt).toLocaleString()}` : "Not synced yet"}{oura.lastError ? ` · ${oura.lastError}` : ""}</div>
          </div>
          <OuraSyncButton />
        </div>
      ) : (
        <>
          <QuickLog today={today} activeDomains={["sleep"]} recipes={[]} stepsTarget={profile.targets.stepsTarget} bedtimeTarget={profile.targets.bedtimeTarget} hasOura={false} variant="buttons" only={["sleep"]} />
          <Link href="/profile/settings#oura" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs text-muted">
            <Watch size={14} className="text-gold" /> Have an Oura Ring? Connect it in settings to sync sleep, readiness and steps automatically.
          </Link>
        </>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Average" value={avg != null ? formatMinutes(Math.round(avg)) : "—"} sub={`${inRange.length} night${inRange.length === 1 ? "" : "s"}`} />
        <Stat label="At target" value={inRange.length ? `${Math.round((atTarget / inRange.length) * 100)}%` : "—"} sub={`≥ ${formatMinutes(profile.targets.sleepTargetMin)}`} />
        <Stat label="Bedtime" value={bedtimes.length ? minutesToHhmm(Math.round(circularMeanMinutes(bedtimes))) : "—"} sub={wakes.length ? `wake ${minutesToHhmm(Math.round(circularMeanMinutes(wakes)))}` : "typical"} />
      </div>
      {(hrv.length > 0 || rhr.length > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="HRV" value={hrv.length ? `${Math.round(mean(hrv))} ms` : "—"} sub="average (Oura)" />
          <Stat label="Resting HR" value={rhr.length ? `${Math.round(mean(rhr))} bpm` : "—"} sub="lowest nightly (Oura)" />
        </div>
      )}

      <Card>
        <SectionTitle className="mb-3 px-0">Hours per night</SectionTitle>
        <SleepChart data={chart} targetMin={profile.targets.sleepTargetMin} />
      </Card>

      <Card>
        <SectionTitle className="mb-3 px-0">Last 13 weeks</SectionTitle>
        <DayHeatmap days={heat} tone="accent" />
      </Card>

      <Card className="p-0">
        <div className="px-4 pt-3.5 pb-2 text-sm font-semibold">Recent nights</div>
        {inRange.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-muted">No nights logged in this range.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {[...inRange].reverse().slice(0, 14).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-14 shrink-0 text-xs text-muted">{formatShort(e.date)}</span>
                <span className="tabular w-16 font-medium">{formatMinutes(e.totalSleepMin)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {e.bedtimeStart && e.bedtimeEnd ? `${e.bedtimeStart.slice(11, 16)} → ${e.bedtimeEnd.slice(11, 16)}` : ""}
                  {e.sleepScore != null ? ` · score ${e.sleepScore}` : e.quality ? ` · felt ${["", "rough", "meh", "okay", "good", "great"][e.quality]}` : ""}
                  {e.efficiency != null ? ` · ${e.efficiency}% eff.` : ""}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-faint">{e.source}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
