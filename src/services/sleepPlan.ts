import { hhmmToMinutes, minutesToHhmm, type ISODate } from "@/lib/dates";
import type { SleepPrefs } from "./preferences";
import type { Targets } from "./profile";

/**
 * Sleep planning from a target wake time. Adults generally do well on 7–9 hours;
 * the schedule is derived, editable, and never pretends there is one perfect bedtime.
 *
 *   wake 07:30, target 8h → asleep by 23:30 → in bed 23:15 (15 min to fall asleep)
 *   → wind-down 22:45 (30 min)
 */
export interface SleepSchedule {
  wake: string; // "07:30"
  asleep: string; // "23:30"
  inBed: string; // "23:15"
  windDown: string; // "22:45"
  targetMin: number;
  windDownMin: number;
  fallAsleepMin: number;
  /** true when derived from a wake target; false when only a legacy bedtime target exists */
  derived: boolean;
}

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

export function computeSleepSchedule(targets: Targets, sleep: SleepPrefs): SleepSchedule | null {
  const targetMin = targets.sleepTargetMin;
  if (sleep.wakeTarget) {
    const wake = hhmmToMinutes(sleep.wakeTarget);
    const asleep = wrap(wake - targetMin);
    const inBed = wrap(asleep - sleep.fallAsleepMin);
    const windDown = wrap(inBed - sleep.windDownMin);
    return { wake: sleep.wakeTarget, asleep: minutesToHhmm(asleep), inBed: minutesToHhmm(inBed), windDown: minutesToHhmm(windDown), targetMin, windDownMin: sleep.windDownMin, fallAsleepMin: sleep.fallAsleepMin, derived: true };
  }
  if (targets.bedtimeTarget) {
    const inBed = hhmmToMinutes(targets.bedtimeTarget);
    const asleep = wrap(inBed + sleep.fallAsleepMin);
    const wake = wrap(asleep + targetMin);
    const windDown = wrap(inBed - sleep.windDownMin);
    return { wake: minutesToHhmm(wake), asleep: minutesToHhmm(asleep), inBed: targets.bedtimeTarget, windDown: minutesToHhmm(windDown), targetMin, windDownMin: sleep.windDownMin, fallAsleepMin: sleep.fallAsleepMin, derived: false };
  }
  return null;
}

/** Minutes of difference (actual − planned), handling the midnight wrap. Positive = later than planned. */
export function clockDelta(actualHhmm: string, plannedHhmm: string): number {
  let a = hhmmToMinutes(actualHhmm);
  let p = hhmmToMinutes(plannedHhmm);
  if (a < 240) a += 1440;
  if (p < 240) p += 1440;
  return a - p;
}

export interface ActualVsPlan {
  date: ISODate;
  bedActual: string | null;
  wakeActual: string | null;
  bedDeltaMin: number | null;
  wakeDeltaMin: number | null;
  sleepMin: number;
  sleepDeltaMin: number;
  verdict: "On plan" | "Close" | "Off plan";
}

export function compareNight(entry: { date: ISODate; totalSleepMin: number; bedtimeStart: string | null; bedtimeEnd: string | null }, plan: SleepSchedule): ActualVsPlan {
  const clock = (iso: string | null) => iso?.match(/T(\d{2}):(\d{2})/)?.slice(1, 3).join(":") ?? null;
  const bedActual = clock(entry.bedtimeStart);
  const wakeActual = clock(entry.bedtimeEnd);
  const bedDeltaMin = bedActual ? clockDelta(bedActual, plan.asleep) : null;
  const wakeDeltaMin = wakeActual ? hhmmToMinutes(wakeActual) - hhmmToMinutes(plan.wake) : null;
  const sleepDeltaMin = entry.totalSleepMin - plan.targetMin;
  const worst = Math.max(Math.abs(bedDeltaMin ?? 0), Math.abs(wakeDeltaMin ?? 0), Math.max(0, -sleepDeltaMin));
  return { date: entry.date, bedActual, wakeActual, bedDeltaMin, wakeDeltaMin, sleepMin: entry.totalSleepMin, sleepDeltaMin, verdict: worst <= 20 ? "On plan" : worst <= 50 ? "Close" : "Off plan" };
}

export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
