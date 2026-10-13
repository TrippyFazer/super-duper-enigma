import type { DomainAssessment } from "@/ranking/types";
import type { ProfileView } from "@/services/profile";
import { loadSobriety } from "@/services/loaders";
import { trackerStats } from "@/ranking/domains/sobriety";
import { SOBRIETY_MILESTONES } from "@/ranking/xp";
import { TrackerList } from "./TrackerList";

export function SobrietyView({ profile }: { profile: ProfileView; assessment: DomainAssessment; range: 7 | 30 | 90 }) {
  const trackers = loadSobriety();
  const now = new Date();
  const stats = trackers
    .filter((t) => t.active)
    .map((t) => trackerStats({ id: t.id, name: t.name, category: t.category, active: t.active, runs: t.runs.map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt })) }, now, profile.today, profile.timezone));

  return (
    <div className="space-y-4">
      <TrackerList
        trackers={stats.map((s) => ({
          id: s.trackerId,
          name: s.name,
          category: s.category,
          currentRunStart: s.currentRunStart,
          currentDays: s.currentDays,
          longestDays: s.longestDays,
          totalCleanDays: s.totalCleanDays,
          cleanDays90: s.cleanDays90,
          resetsTotal: s.resetsTotal,
          nextMilestone: s.nextMilestone,
          lastMilestone: s.lastMilestone,
          score: s.score,
          runs: trackers.find((t) => t.id === s.trackerId)!.runs.map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt, note: r.note })),
        }))}
        milestones={SOBRIETY_MILESTONES}
      />
    </div>
  );
}
