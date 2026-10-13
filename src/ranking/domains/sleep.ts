import { addDays, diffDays, hhmmToMinutes, lastNDays, minutesToHhmm, type ISODate } from "@/lib/dates";
import { buildAssessment, sub } from "../assess";
import { circularMeanMinutes, circularStdMinutes, interpolate, mean, round } from "../scale";
import type { DomainAssessment } from "../types";

export interface SleepInput {
  date: ISODate;
  totalSleepMin: number;
  bedtimeStart?: string | null; // ISO
  bedtimeEnd?: string | null; // ISO
  efficiency?: number | null;
  sleepScore?: number | null;
  readinessScore?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  quality?: number | null; // 1-5 self-rated
}

export interface SleepBaseline {
  avgSleepHours?: number | null;
  consistentSchedule?: boolean | null;
}

export interface SleepDomainInput {
  asOf: ISODate;
  entries: SleepInput[];
  baseline?: SleepBaseline | null;
  startedOn?: ISODate | null;
  sleepTargetMin?: number | null;
  bedtimeTarget?: string | null; // "23:00"
}

/**
 * Anchors (docs/ranking-research.md → Sleep).
 * ~1/3 of US adults sleep <7h; the recommended range is 7–9h. Regularity is
 * scored with the circular SD of bedtime & wake time: <30 min is excellent,
 * >90 min is irregular ("social jet lag" territory).
 */
const AVG_SLEEP_MIN: [number, number][] = [
  [300, 3],
  [360, 22],
  [390, 38],
  [420, 58],
  [450, 76],
  [480, 88],
  [510, 93],
  [540, 90],
  [600, 65],
];
const PCT_NIGHTS_7H: [number, number][] = [
  [0, 5],
  [0.3, 25],
  [0.5, 45],
  [0.7, 65],
  [0.85, 82],
  [0.95, 94],
  [1, 98],
];
const REGULARITY_SD_MIN: [number, number][] = [
  [15, 98],
  [30, 92],
  [45, 80],
  [60, 66],
  [90, 46],
  [120, 28],
  [180, 8],
];
const EFFICIENCY: [number, number][] = [
  [70, 10],
  [80, 40],
  [85, 62],
  [90, 82],
  [95, 96],
];
const OURA_SCORE: [number, number][] = [
  [50, 10],
  [60, 30],
  [70, 50],
  [80, 72],
  [85, 85],
  [90, 95],
];
const SELF_QUALITY: [number, number][] = [
  [1, 10],
  [2, 32],
  [3, 55],
  [4, 78],
  [5, 95],
];
const LOGGING_COVERAGE: [number, number][] = [
  [0, 0],
  [0.4, 40],
  [0.7, 75],
  [0.9, 95],
  [1, 100],
];

function clockMinutes(iso: string): number | null {
  // Use the local time embedded in the ISO string if present (Oura preserves offsets).
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function assessSleep(input: SleepDomainInput): DomainAssessment {
  const compute = (asOf: ISODate) => computeScore(input, asOf).score;
  const has = (d: ISODate) => input.entries.some((e) => e.date <= d);
  const score7 = has(addDays(input.asOf, -7)) ? compute(addDays(input.asOf, -7)) : null;
  const score30 = has(addDays(input.asOf, -30)) ? compute(addDays(input.asOf, -30)) : null;
  return computeScore(input, input.asOf, { score7, score30 }).assessment;
}

function computeScore(
  input: SleepDomainInput,
  asOf: ISODate,
  previous?: { score7: number | null; score30: number | null },
): { score: number; assessment: DomainAssessment } {
  const entries = input.entries.filter((e) => e.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const first = entries[0]?.date;
  const startedOn = [input.startedOn, first].filter(Boolean).sort()[0] as ISODate | undefined;
  const tenureDays = startedOn ? Math.max(0, diffDays(startedOn, asOf) + 1) : 0;

  const w30 = lastNDays(asOf, 30);
  const w90 = lastNDays(asOf, 90);
  const e30 = entries.filter((e) => e.date >= w30[0]);
  const e90 = entries.filter((e) => e.date >= w90[0]);
  const e7 = entries.filter((e) => e.date >= lastNDays(asOf, 7)[0]);

  const avg30 = e30.length ? mean(e30.map((e) => e.totalSleepMin)) : null;
  const avg90 = e90.length ? mean(e90.map((e) => e.totalSleepMin)) : null;
  const avg7 = e7.length ? mean(e7.map((e) => e.totalSleepMin)) : null;
  const target = input.sleepTargetMin ?? 420;
  const avgBlend = avg30 == null ? null : tenureDays >= 60 && avg90 != null ? avg30 * 0.6 + avg90 * 0.4 : avg30;
  const pct7h = e30.length ? e30.filter((e) => e.totalSleepMin >= Math.min(target, 420)).length / e30.length : 0;
  const durationScore =
    avgBlend == null ? 0 : interpolate(AVG_SLEEP_MIN, avgBlend) * 0.65 + interpolate(PCT_NIGHTS_7H, pct7h) * 0.35;

  // Regularity: circular SD of bedtime and wake time over 30 days.
  const bedtimes = e30.map((e) => (e.bedtimeStart ? clockMinutes(e.bedtimeStart) : null)).filter((x): x is number => x != null);
  const waketimes = e30.map((e) => (e.bedtimeEnd ? clockMinutes(e.bedtimeEnd) : null)).filter((x): x is number => x != null);
  const bedSd = bedtimes.length >= 3 ? circularStdMinutes(bedtimes) : null;
  const wakeSd = waketimes.length >= 3 ? circularStdMinutes(waketimes) : null;
  const regularityAvailable = bedSd != null || wakeSd != null;
  const sdCombined = regularityAvailable ? mean([bedSd, wakeSd].filter((x): x is number => x != null)) : null;
  const regularityScore = sdCombined != null ? interpolate(REGULARITY_SD_MIN, sdCombined) : 0;

  // Quality: Oura sleep score > efficiency > self-rated.
  const scores = e30.map((e) => e.sleepScore).filter((x): x is number => x != null);
  const effs = e30.map((e) => e.efficiency).filter((x): x is number => x != null);
  const quals = e30.map((e) => e.quality).filter((x): x is number => x != null);
  let qualityScore: number | null = null;
  let qualityValue = "no quality data";
  if (scores.length >= 3) {
    qualityScore = interpolate(OURA_SCORE, mean(scores));
    qualityValue = `Oura sleep score ${Math.round(mean(scores))}`;
  } else if (effs.length >= 3) {
    qualityScore = interpolate(EFFICIENCY, mean(effs));
    qualityValue = `${Math.round(mean(effs))}% efficiency`;
  } else if (quals.length >= 1) {
    qualityScore = interpolate(SELF_QUALITY, mean(quals));
    qualityValue = `self-rated ${round(mean(quals), 1)}/5`;
  }

  // Readiness / recovery (Oura only).
  const readiness = e30.map((e) => e.readinessScore).filter((x): x is number => x != null);
  const readinessScore = readiness.length >= 3 ? interpolate(OURA_SCORE, mean(readiness)) : null;

  // Coverage: how many of the last 30 nights have data. Rewards the habit of tracking.
  const coverage = Math.min(1, e30.length / Math.min(30, Math.max(1, tenureDays)));
  const coverageScore = interpolate(LOGGING_COVERAGE, coverage);

  let baselineScore: number | null = null;
  if (input.baseline?.avgSleepHours != null) {
    const bDur = interpolate(AVG_SLEEP_MIN, input.baseline.avgSleepHours * 60);
    const bReg = input.baseline.consistentSchedule ? 70 : 40;
    baselineScore = bDur * 0.65 + bReg * 0.35;
  }

  const bedTargetMin = input.bedtimeTarget ? hhmmToMinutes(input.bedtimeTarget) : null;
  const meanBed = bedtimes.length ? circularMeanMinutes(bedtimes) : null;

  const substats = [
    sub("duration", "Duration", durationScore, avgBlend != null ? `${round(avgBlend / 60, 1)}h avg · ${Math.round(pct7h * 100)}% nights ≥ ${Math.round(Math.min(target, 420) / 60)}h` : "no data", 0.4, {
      note: "30-day average, 90-day blended in after 60 days",
      improve: `Average ${Math.round(target / 60)}+ hours and hit it on 85%+ of nights`,
    }),
    sub("regularity", "Regularity", regularityScore, sdCombined != null ? `±${Math.round(sdCombined)} min schedule drift` : "no bedtime data", 0.3, {
      available: regularityAvailable,
      note: "Spread of your bedtimes and wake times (30 days)",
      improve: "Keep bedtime and wake time within a 45-minute window, including weekends",
    }),
    sub("quality", "Quality", qualityScore ?? 0, qualityValue, 0.2, {
      available: qualityScore != null,
      improve: "Improve sleep quality: consistent wind-down, cool dark room, no late caffeine",
    }),
    sub("readiness", "Readiness", readinessScore ?? 0, readiness.length ? `Oura readiness ${Math.round(mean(readiness))}` : "n/a", 0.1, {
      available: readinessScore != null,
      improve: "Raise average readiness — recovery days matter",
    }),
    sub("coverage", "Tracking", coverageScore, `${e30.length}/${Math.min(30, Math.max(1, tenureDays))} nights logged`, 0.1, {
      improve: "Log (or sync) sleep every night",
    }),
  ];

  const explanation: string[] = [];
  if (avg30 != null) explanation.push(`30-day average ${round(avg30 / 60, 1)}h${avg7 != null ? `, last 7 days ${round(avg7 / 60, 1)}h` : ""}.`);
  if (meanBed != null) explanation.push(`Typical bedtime ${minutesToHhmm(Math.round(meanBed))}${sdCombined != null ? ` (±${Math.round(sdCombined)} min)` : ""}.`);
  explanation.push("About a third of adults sleep under 7 hours. Regular timing predicts health outcomes at least as strongly as duration, so it carries 30% of this score.");

  let suggestedAction: string | undefined;
  const loggedToday = entries.some((e) => e.date === asOf);
  if (!loggedToday) suggestedAction = "Log last night's sleep";
  else if (bedTargetMin != null) suggestedAction = `Lights out by ${input.bedtimeTarget} tonight`;

  // Duration is the gatekeeper: perfect regularity can't make short sleep a C.
  // Regularity is the second gate (a wildly irregular schedule caps at B-ish).
  let scoreCeiling: number | null = null;
  if (avgBlend != null) {
    scoreCeiling = durationScore + 20;
    if (regularityAvailable) scoreCeiling = Math.min(scoreCeiling, regularityScore + 35);
    if (avgBlend < 360) explanation.push("Averaging under 6 hours caps this domain at E/D regardless of other metrics.");
  }

  const assessment = buildAssessment({
    domain: "sleep",
    substats,
    tenureDays,
    dataPoints: entries.length,
    explanation,
    baselineScore,
    previous,
    suggestedAction,
    scoreCeiling,
  });
  return { score: assessment.score, assessment };
}
