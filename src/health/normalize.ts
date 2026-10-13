/**
 * Turning whatever an iOS Shortcut sends into clean samples.
 *
 * WHY THIS EXISTS. "Find Health Samples" in Shortcuts gives each sample a Type,
 * Value, Start Date, End Date and Source, but NO UUID. And a Shortcut's
 * dictionary is loose: a number can arrive as the text "3000", a date as
 * "2026-10-13T17:06:42-04:00" one day and "...T21:06:42Z" another, and a
 * forgotten Date Format as "Oct 13, 2026 at 5:06 PM". The native bridge sends
 * tidy JSON with UUIDs; this makes the Shortcut path just as safe.
 *
 * DUPLICATES WITHOUT A UUID. The server makes its own key from what identifies
 * a HealthKit sample when the UUID is missing:
 *
 *     type | start (to the second, UTC) | end (to the second, UTC) | source | stage
 *
 * - Dates are compared as INSTANTS, so the same moment written with a -04:00
 *   offset or as Z is the same key.
 * - The value is NOT in the key: the same source reporting the same interval
 *   again is the same sample, and if its value changed the newer value replaces
 *   the old one instead of being added to it.
 * - The sleep stage IS in the key, because one source can write "in bed" and
 *   "asleep" over exactly the same hours, and those are two different samples.
 *
 * A sample that DOES carry a uuid keeps using it, exactly as before.
 */
import { createHash } from "node:crypto";
import type { HealthMetric, HealthSampleInput } from "./provider";

/** What a person might type, or what Shortcuts calls the type, → metric id. */
const TYPE_ALIASES: Record<string, HealthMetric> = {
  steps: "steps",
  step: "steps",
  step_count: "steps",
  active_energy: "active_energy",
  active_energy_burned: "active_energy",
  active_calories: "active_energy",
  distance: "distance",
  walking_running_distance: "distance",
  walking_and_running_distance: "distance",
  walking_running: "distance",
  exercise_minutes: "exercise_minutes",
  exercise_time: "exercise_minutes",
  exercise: "exercise_minutes",
  apple_exercise_time: "exercise_minutes",
  stand_hours: "stand_hours",
  stand_hour: "stand_hours",
  sleep: "sleep",
  sleep_analysis: "sleep",
  resting_hr: "resting_hr",
  resting_heart_rate: "resting_hr",
  heart_rate: "heart_rate",
  hr: "heart_rate",
  hrv: "hrv",
  heart_rate_variability: "hrv",
  heart_rate_variability_sdnn: "hrv",
  body_mass: "body_mass",
  weight: "body_mass",
  vo2max: "vo2max",
  vo2_max: "vo2max",
  cardio_fitness: "vo2max",
  respiratory_rate: "respiratory_rate",
  wrist_temperature: "wrist_temperature",
  sleeping_wrist_temperature: "wrist_temperature",
};

/** Sleep stage words, however they arrive, → the stage names aggregation uses. */
const STAGE_ALIASES: Record<string, string> = {
  inbed: "inBed",
  in_bed: "inBed",
  asleep: "asleep",
  asleepunspecified: "asleep",
  asleep_unspecified: "asleep",
  unspecified: "asleep",
  core: "asleepCore",
  asleepcore: "asleepCore",
  asleep_core: "asleepCore",
  core_sleep: "asleepCore",
  deep: "asleepDeep",
  asleepdeep: "asleepDeep",
  asleep_deep: "asleepDeep",
  deep_sleep: "asleepDeep",
  rem: "asleepREM",
  asleeprem: "asleepREM",
  asleep_rem: "asleepREM",
  rem_sleep: "asleepREM",
  awake: "awake",
};

function key(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function metricFor(raw: unknown): HealthMetric | null {
  if (typeof raw !== "string") return null;
  return TYPE_ALIASES[key(raw)] ?? null;
}

/** HealthKit's own numbering of sleep categories (HKCategoryValueSleepAnalysis). */
const STAGE_CODES = ["inBed", "asleep", "awake", "asleepCore", "asleepDeep", "asleepREM"];

export function stageFor(raw: unknown): string | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? (STAGE_CODES[raw] ?? null) : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (/^[0-5]$/.test(raw.trim())) return STAGE_CODES[Number(raw.trim())];
  const k = key(raw);
  return STAGE_ALIASES[k] ?? STAGE_ALIASES[k.replace(/_/g, "")] ?? null;
}

/** 3000, "3000", "3,000", "3000 count", "1,5" (a comma decimal) → a number. */
export function numberFrom(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let t = raw.trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?/.test(t)) t = t.replace(/,/g, ""); // thousands separators
  else if (/^-?\d+,\d+/.test(t) && !t.includes(".")) t = t.replace(",", "."); // comma decimal
  const m = t.match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** An ISO string, epoch seconds or epoch milliseconds → a Date, or null. */
export function dateFrom(raw: unknown): Date | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return new Date(raw < 1e12 ? raw * 1000 : raw);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = raw.trim();
  if (/^\d{9,13}$/.test(t)) return dateFrom(Number(t));
  // Only formats that carry their own date and time; "Oct 13, 2026 at 5:06 PM"
  // is refused rather than guessed, because it has no time zone.
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Values in the units the app stores (provider.ts): km, kg, kcal. A US iPhone
 * hands Shortcuts miles and pounds; the unit sent with the sample says which.
 * No unit, or one not listed here: taken as already in the app's unit.
 */
const CONVERT: Partial<Record<HealthMetric, Record<string, number>>> = {
  distance: { km: 1, m: 0.001, mi: 1.609344, mile: 1.609344, miles: 1.609344, ft: 0.0003048, yd: 0.0009144 },
  body_mass: { kg: 1, g: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, st: 6.35029318 },
  active_energy: { kcal: 1, cal: 1, kilocalorie: 1, kilocalories: 1, kj: 0.239005736 },
};

export function inAppUnits(type: HealthMetric, value: number, unit: string | undefined): number {
  const table = CONVERT[type];
  const factor = table && unit ? table[unit.trim().toLowerCase().replace(/\.$/, "")] : undefined;
  return factor === undefined ? value : Math.round(value * factor * 1e6) / 1e6;
}

export type Normalized = { ok: true; sample: HealthSampleInput & { dedupeKey: string; fallback: boolean } } | { ok: false; reason: string };

const show = (v: unknown) => (typeof v === "string" ? `"${v.slice(0, 40)}"` : JSON.stringify(v)?.slice(0, 40) ?? String(v));

export function normalizeSample(raw: unknown): Normalized {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "not a sample (expected an object with type, value, start, end)" };
  const r = raw as Record<string, unknown>;

  const type = metricFor(r.type);
  if (!type) return { ok: false, reason: `type ${show(r.type)} is not one the app tracks (try "steps")` };

  const start = dateFrom(r.start ?? r.startDate ?? r.start_date);
  if (!start) {
    return { ok: false, reason: `start ${show(r.start)} is not a date the server can read — set the Start Date's format to ISO 8601` };
  }
  const end = dateFrom(r.end ?? r.endDate ?? r.end_date) ?? (r.end == null ? start : null);
  if (!end) return { ok: false, reason: `end ${show(r.end)} is not a date the server can read — set the End Date's format to ISO 8601` };
  if (end.getTime() < start.getTime()) return { ok: false, reason: "end is before start" };

  const metadata: Record<string, unknown> = r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? { ...(r.metadata as Record<string, unknown>) } : {};
  let value = numberFrom(r.value);
  if (type === "sleep") {
    // Shortcuts gives a sleep sample's Value as its category ("Core", "In Bed"…),
    // not a number. That word IS the stage.
    // As a word ("Core") or as HealthKit's number for it (3) — either way a stage.
    const stage = stageFor(metadata.stage) ?? stageFor(r.stage) ?? stageFor(r.value);
    if (stage) metadata.stage = stage;
    else if (value === null && r.value != null) return { ok: false, reason: `sleep value ${show(r.value)} is not a sleep stage the app knows` };
    value = 1;
  }
  if (value === null) return { ok: false, reason: `value ${show(r.value)} is not a number` };
  // "3.1 mi" in the value itself counts as saying the unit.
  const unitSent = typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : typeof r.value === "string" ? r.value.replace(/^[\s\d.,-]+/, "").trim() || undefined : undefined;
  value = inAppUnits(type, value, unitSent);

  const source = typeof r.source === "string" && r.source.trim() ? r.source.trim() : "unknown";
  const uuid = typeof r.uuid === "string" && r.uuid.trim() ? r.uuid.trim() : undefined;
  const sec = (d: Date) => Math.floor(d.getTime() / 1000);
  const stagePart = type === "sleep" ? String(metadata.stage ?? "") : "";
  const dedupeKey = uuid ?? "fp1:" + createHash("sha1").update([type, sec(start), sec(end), source.toLowerCase(), stagePart].join("|")).digest("hex");

  return {
    ok: true,
    sample: {
      type,
      value,
      unit: undefined, // stored in the app's unit for the type (converted above)
      start: start.toISOString(),
      end: end.toISOString(),
      source,
      sourceBundle: typeof r.sourceBundle === "string" ? r.sourceBundle : undefined,
      device: typeof r.device === "string" ? r.device : undefined,
      uuid,
      metadata,
      dedupeKey,
      fallback: !uuid,
    },
  };
}

/** A list however it arrives: an array, JSON text of an array, or one object. */
function listFrom(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return listFrom(JSON.parse(raw));
    } catch {
      // A Shortcuts list turned into text: one dictionary per line.
      try {
        return listFrom(JSON.parse("[" + raw.trim().replace(/}\s*\n\s*{/g, "},{") + "]"));
      } catch {
        return [];
      }
    }
  }
  if (raw && typeof raw === "object") return [raw];
  return [];
}

/**
 * The request body in any shape a Shortcut produces: `{samples: [...]}`, a bare
 * array of samples, `{samples: "<json text>"}`, or a single sample on its own.
 */
export function samplesIn(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if ("samples" in b) return listFrom(b.samples);
    if ("type" in b && ("value" in b || "start" in b)) return [b];
  }
  return [];
}

export function workoutsIn(body: unknown): unknown[] {
  if (body && typeof body === "object" && !Array.isArray(body) && "workouts" in body) {
    return listFrom((body as Record<string, unknown>).workouts);
  }
  return [];
}
