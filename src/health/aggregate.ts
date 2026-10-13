import type { HealthSample } from "@/db/schema";
import type { ISODate } from "@/lib/dates";

/**
 * Pure aggregation over raw HealthKit-style samples.
 *
 * HealthKit stores *overlapping* records from several sources (iPhone + Watch +
 * Oura all count steps). Summing everything double counts, so:
 *   - cumulative metrics (steps, energy, distance, exercise minutes): per day,
 *     samples from different sources that overlap in time are de-duplicated by
 *     keeping the interval from the higher-priority source; non-overlapping
 *     intervals are summed. This mirrors how Health.app merges sources.
 *   - sleep: one night = the union of "asleep" intervals from the best source
 *     for that night (Oura > Watch > other), measured on the morning it ends.
 *   - point metrics (resting HR, HRV, body mass): daily average/last value.
 */
export interface Interval {
  start: number;
  end: number;
  value: number;
  source: string;
}

const PRIORITY = ["oura", "apple watch", "watch", "whoop", "garmin", "fitbit", "iphone", "manual"];
export function sourceRank(source: string): number {
  const s = source.toLowerCase();
  const i = PRIORITY.findIndex((p) => s.includes(p));
  return i === -1 ? PRIORITY.length : i;
}

/** Day key in the given timezone for a timestamp. */
export function dayOf(ts: string, timezone: string): ISODate {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** De-duplicate overlapping intervals from different sources; returns the summed value. */
export function mergeCumulative(intervals: Interval[]): { total: number; sources: string[]; dominant: string | null } {
  if (!intervals.length) return { total: 0, sources: [], dominant: null };
  // Prefer: higher priority source first, then earlier start.
  const sorted = [...intervals].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.start - b.start);
  const accepted: Interval[] = [];
  for (const iv of sorted) {
    const overlapsOther = accepted.some((a) => a.source !== iv.source && a.start < iv.end && iv.start < a.end);
    if (!overlapsOther) accepted.push(iv);
  }
  const total = accepted.reduce((s, i) => s + i.value, 0);
  const bySource = new Map<string, number>();
  for (const a of accepted) bySource.set(a.source, (bySource.get(a.source) ?? 0) + a.value);
  const dominant = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { total: Math.round(total), sources: [...bySource.keys()], dominant };
}

/** Group cumulative samples of one type into per-day totals. */
export function dailyTotals(samples: HealthSample[], timezone: string): Map<ISODate, { total: number; sources: string[]; dominant: string | null }> {
  const byDay = new Map<ISODate, Interval[]>();
  for (const s of samples) {
    const day = dayOf(s.startAt, timezone);
    const list = byDay.get(day) ?? [];
    list.push({ start: new Date(s.startAt).getTime(), end: Math.max(new Date(s.endAt).getTime(), new Date(s.startAt).getTime() + 1), value: s.value, source: s.sourceName });
    byDay.set(day, list);
  }
  const out = new Map<ISODate, ReturnType<typeof mergeCumulative>>();
  for (const [day, list] of byDay) out.set(day, mergeCumulative(list));
  return out;
}

export interface NightSummary {
  date: ISODate; // morning the sleep ended on
  totalSleepMin: number;
  inBedMin: number | null;
  bedtimeStart: string;
  bedtimeEnd: string;
  efficiency: number | null;
  source: string;
  stages: { core: number; deep: number; rem: number; awake: number } | null;
}

const ASLEEP = new Set(["asleep", "asleepUnspecified", "asleepCore", "asleepDeep", "asleepREM", "core", "deep", "rem"]);

/**
 * Build nights from sleep analysis samples. A sample's metadata.stage is a
 * HealthKit sleep category (inBed, awake, asleepCore, …); when absent, it is
 * treated as "asleep". Samples ending before 6pm belong to the same morning;
 * a night is keyed by the day its longest asleep block ends on.
 */
export function buildNights(samples: HealthSample[], timezone: string): NightSummary[] {
  if (!samples.length) return [];
  // Group by source, then split into sessions separated by > 3h gaps.
  const bySource = new Map<string, HealthSample[]>();
  for (const s of samples) bySource.set(s.sourceName, [...(bySource.get(s.sourceName) ?? []), s]);
  const candidates: NightSummary[] = [];
  for (const [source, list] of bySource) {
    const sorted = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt));
    let session: HealthSample[] = [];
    const flush = () => {
      if (!session.length) return;
      const stage = (x: HealthSample) => String((JSON.parse(x.metadata || "{}") as { stage?: string }).stage ?? "asleep");
      const minutes = (x: HealthSample) => Math.max(0, (new Date(x.endAt).getTime() - new Date(x.startAt).getTime()) / 60000);
      const asleep = session.filter((x) => ASLEEP.has(stage(x)));
      const inBed = session.filter((x) => stage(x) === "inBed");
      const totalSleep = Math.round(asleep.reduce((a, x) => a + minutes(x), 0));
      if (totalSleep < 30) {
        session = [];
        return;
      }
      const first = session[0];
      const last = session[session.length - 1];
      const span = (new Date(last.endAt).getTime() - new Date(first.startAt).getTime()) / 60000;
      const inBedMin = inBed.length ? Math.round(inBed.reduce((a, x) => a + minutes(x), 0)) : Math.round(span);
      const st = { core: 0, deep: 0, rem: 0, awake: 0 };
      let staged = false;
      for (const x of session) {
        const sg = stage(x);
        if (sg === "asleepCore" || sg === "core") (st.core += minutes(x)), (staged = true);
        else if (sg === "asleepDeep" || sg === "deep") (st.deep += minutes(x)), (staged = true);
        else if (sg === "asleepREM" || sg === "rem") (st.rem += minutes(x)), (staged = true);
        else if (sg === "awake") st.awake += minutes(x);
      }
      candidates.push({
        date: dayOf(last.endAt, timezone),
        totalSleepMin: totalSleep,
        inBedMin,
        bedtimeStart: first.startAt,
        bedtimeEnd: last.endAt,
        efficiency: inBedMin ? Math.min(100, Math.round((totalSleep / inBedMin) * 100)) : null,
        source,
        stages: staged ? { core: Math.round(st.core), deep: Math.round(st.deep), rem: Math.round(st.rem), awake: Math.round(st.awake) } : null,
      });
      session = [];
    };
    for (const s of sorted) {
      const prev = session[session.length - 1];
      if (prev && new Date(s.startAt).getTime() - new Date(prev.endAt).getTime() > 3 * 3600_000) flush();
      session.push(s);
    }
    flush();
  }
  // One night per date: best source wins; ties → longer sleep.
  const byDate = new Map<ISODate, NightSummary>();
  for (const c of candidates) {
    const cur = byDate.get(c.date);
    if (!cur || sourceRank(c.source) < sourceRank(cur.source) || (sourceRank(c.source) === sourceRank(cur.source) && c.totalSleepMin > cur.totalSleepMin)) byDate.set(c.date, c);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Daily point metrics: mean per day (resting HR, HRV) or last value (body mass). */
export function dailyPoint(samples: HealthSample[], timezone: string, mode: "mean" | "last"): Map<ISODate, number> {
  const byDay = new Map<ISODate, HealthSample[]>();
  for (const s of samples) {
    const d = dayOf(s.startAt, timezone);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const out = new Map<ISODate, number>();
  for (const [d, list] of byDay) {
    if (mode === "last") out.set(d, [...list].sort((a, b) => a.startAt.localeCompare(b.startAt)).pop()!.value);
    else out.set(d, Math.round((list.reduce((a, x) => a + x.value, 0) / list.length) * 10) / 10);
  }
  return out;
}

/**
 * Does an external workout look like an app workout? Same day, overlapping or
 * near (≤ 30 min apart) time window, similar duration (within 40%) and a
 * compatible activity type.
 */
export function workoutsLikelySame(ext: { startAt: string; endAt: string; activityType: string }, app: { date: ISODate; startedAt: string | null; durationMin: number; type: string }, timezone: string): boolean {
  if (dayOf(ext.startAt, timezone) !== app.date) return false;
  const extStart = new Date(ext.startAt).getTime();
  const extEnd = new Date(ext.endAt).getTime();
  const extMin = (extEnd - extStart) / 60000;
  if (app.startedAt) {
    const appStart = new Date(app.startedAt).getTime();
    const appEnd = appStart + app.durationMin * 60000;
    const gap = Math.max(0, Math.max(appStart, extStart) - Math.min(appEnd, extEnd));
    if (gap > 30 * 60000) return false;
  }
  const ratio = extMin / Math.max(1, app.durationMin);
  if (ratio < 0.6 || ratio > 1.4) return false;
  const strength = /strength|functional|traditional|core|cross|hiit/i.test(ext.activityType);
  const cardio = /run|walk|cycl|bik|swim|row|hik|ellip|stair|cardio/i.test(ext.activityType);
  if (app.type === "strength" && cardio && !strength) return false;
  if ((app.type === "cardio" || app.type === "walk") && strength && !cardio) return false;
  return true;
}

export function mapActivityType(hk: string): "strength" | "cardio" | "mobility" | "sport" | "walk" | "other" {
  const s = hk.toLowerCase();
  if (/walk|hik/.test(s)) return "walk";
  if (/run|cycl|bik|swim|row|ellip|stair|cardio|hiit|jump|cross/.test(s)) return "cardio";
  if (/strength|functional|traditional|core/.test(s)) return "strength";
  if (/yoga|pilates|flexib|stretch|mobility|cooldown|mind/.test(s)) return "mobility";
  if (/soccer|basket|tennis|golf|climb|boxing|martial|football|baseball|hockey|volley|badminton|squash|skat|ski|surf/.test(s)) return "sport";
  return "other";
}
