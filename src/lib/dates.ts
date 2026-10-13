/**
 * Date helpers. The app stores calendar days as "YYYY-MM-DD" strings in the
 * user's timezone. All arithmetic here is done on those strings so server and
 * client agree regardless of where the server runs.
 */

export type ISODate = string; // "YYYY-MM-DD"

export function isISODate(s: unknown): s is ISODate {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Today's calendar date in the given IANA timezone. */
export function todayInTz(timezone: string, now: Date = new Date()): ISODate {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now); // en-CA gives YYYY-MM-DD
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Current local time "HH:MM" in the given timezone. */
export function timeInTz(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

export function toDate(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fromDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = toDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromDate(dt);
}

/** Days from a to b (b - a). Positive if b is after a. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: ISODate): number {
  return toDate(d).getUTCDay();
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** The last `n` days ending at `end` (inclusive), oldest first. */
export function lastNDays(end: ISODate, n: number): ISODate[] {
  return dateRange(addDays(end, -(n - 1)), end);
}

/** Monday-start week containing d. */
export function startOfWeek(d: ISODate): ISODate {
  const wd = weekday(d); // 0 Sun
  const offset = wd === 0 ? 6 : wd - 1;
  return addDays(d, -offset);
}

export function endOfWeek(d: ISODate): ISODate {
  return addDays(startOfWeek(d), 6);
}

/** ISO week number & year, e.g. { year: 2026, week: 42 } */
export function isoWeek(d: ISODate): { year: number; week: number } {
  const date = toDate(d);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export function formatShort(d: ISODate): string {
  const dt = toDate(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatLong(d: ISODate): string {
  const dt = toDate(d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatWeekdayShort(d: ISODate): string {
  return toDate(d).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/** Convert a Date to a calendar date string in a timezone. */
export function dateInTz(date: Date, timezone: string): ISODate {
  return todayInTz(timezone, date);
}

/** Minutes since midnight for a "HH:MM" string. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Human-friendly duration, e.g. "7h 24m" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
