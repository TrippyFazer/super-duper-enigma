import { metricFreshness, ageLabel, type MetricFreshness } from "@/health/freshness";

/**
 * Pure interpretation of today's facts. RESOLVED ≠ SUCCESSFUL: a row can be
 * settled (nothing more to do) without the goal being met, and a goal can be
 * met while the day is still open (protein hit at noon is not "done eating").
 *
 * Tones: success (goal met) · resolved (settled, goal not met) · pending
 * (waiting on data) · attention (actionable and time-relevant) · neutral.
 */
export type RowTone = "success" | "resolved" | "pending" | "attention" | "neutral";

export interface NutritionFacts {
  calories: number;
  protein: number;
  calorieTarget: number;
  proteinTarget: number;
  /** explicit "done eating for today" */
  finished: boolean;
  plannedRemaining: number;
  localHour: number;
}
export interface NutritionState {
  tone: RowTone;
  proteinHit: boolean;
  /** the day is settled (explicit finish, or late with calories in range) */
  resolved: boolean;
  text: string;
  sub: string;
}

export function nutritionState(f: NutritionFacts): NutritionState {
  const proteinHit = f.proteinTarget > 0 && f.protein >= f.proteinTarget;
  const inRange = f.calorieTarget > 0 && f.calories >= f.calorieTarget * 0.85 && f.calories <= f.calorieTarget * 1.15;
  const late = f.localHour >= 21;
  const resolved = f.finished || (late && inRange);
  const kcal = `${f.calories.toLocaleString()} / ${f.calorieTarget.toLocaleString()} kcal`;
  // An explicit finish settles the day even with nothing logged (fasting, not tracking today).
  if (f.finished && f.calories === 0) return { tone: "resolved", proteinHit: false, resolved: true, text: "Not tracked today", sub: "Done for today" };
  if (f.calories === 0) {
    // Nothing logged: ordinary before lunch, noteworthy by the evening.
    const noteworthy = f.localHour >= 20;
    return { tone: noteworthy ? "attention" : "neutral", proteinHit: false, resolved: false, text: "Nothing logged yet", sub: noteworthy ? "Nothing logged today — log dinner or mark the day done" : `${f.calorieTarget.toLocaleString()} kcal · ${f.proteinTarget} g protein target` };
  }
  if (resolved) return { tone: proteinHit ? "success" : "resolved", proteinHit, resolved: true, text: proteinHit ? "Protein goal hit ✓" : `${f.protein} g protein`, sub: `${kcal} · done for today` };
  if (proteinHit) return { tone: "success", proteinHit: true, resolved: false, text: "Protein goal hit ✓", sub: `${kcal}${f.plannedRemaining ? ` · ${f.plannedRemaining} planned meal${f.plannedRemaining === 1 ? "" : "s"} left` : ""}` };
  const left = Math.max(0, f.proteinTarget - f.protein);
  const attention = f.localHour >= 19 && left >= 30;
  return { tone: attention ? "attention" : "neutral", proteinHit: false, resolved: false, text: `${f.calories.toLocaleString()} kcal · ${f.protein} g protein`, sub: `${left} g protein to go${f.plannedRemaining ? ` · ${f.plannedRemaining} planned left` : ""}` };
}

export interface SleepFacts {
  lastNightMin: number | null;
  targetMin: number;
  freshness: MetricFreshness;
  localHour: number;
}
export interface SleepState {
  tone: RowTone;
  resolved: boolean;
  success: boolean;
  deficitMin: number;
  text: string;
  sub: string;
  /** minutes earlier to start winding down tonight, when the deficit suggests it */
  windDownEarlierMin: number;
}
const fmtH = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

export function sleepState(f: SleepFacts): SleepState {
  if (f.lastNightMin == null) {
    const pendingText = f.freshness.state === "pending" ? "Sleep data pending" : "—";
    const sub = f.freshness.state === "pending" ? (f.freshness.stale ? `Last sync ${ageLabel(f.freshness.ageMin)}` : "Waiting for last night to upload") : "Log last night in + LOG";
    return { tone: f.freshness.state === "pending" ? "pending" : "neutral", resolved: false, success: false, deficitMin: 0, text: pendingText, sub, windDownEarlierMin: 0 };
  }
  const deficit = Math.max(0, f.targetMin - f.lastNightMin);
  const success = deficit === 0;
  const windDownEarlierMin = deficit >= 90 ? 45 : deficit >= 30 ? 30 : 0;
  // Last night cannot be changed: it is RESOLVED either way. The deficit informs tonight.
  return {
    tone: success ? "success" : "resolved",
    resolved: true,
    success,
    deficitMin: deficit,
    text: fmtH(f.lastNightMin),
    sub: success ? "At target ✓" : `${fmtH(deficit)} below target · resolved${windDownEarlierMin && f.localHour >= 15 ? ` · tonight: wind down ${windDownEarlierMin} min earlier` : ""}`,
    windDownEarlierMin,
  };
}

export interface StepsFacts {
  value: number | null;
  target: number;
  automatic: boolean;
  lastSyncAt: string | null;
  sourceLabel: string | null;
  now: Date;
}
export interface StepsState {
  tone: RowTone;
  freshness: MetricFreshness;
  success: boolean;
  text: string;
  sub: string;
}
export function stepsState(f: StepsFacts): StepsState {
  const fr = metricFreshness({ automatic: f.automatic, hasValueToday: f.value != null, value: f.value, lastSyncAt: f.lastSyncAt, now: f.now });
  if (fr.state === "pending") return { tone: "pending", freshness: fr, success: false, text: "Activity syncing…", sub: fr.stale ? `${f.sourceLabel ?? "Source"} last synced ${ageLabel(fr.ageMin)}` : "Activity refresh pending" };
  if (fr.state === "unavailable") return { tone: "neutral", freshness: fr, success: false, text: "—", sub: "Not tracked · log in + LOG › More" };
  const v = f.value ?? 0;
  const success = v >= f.target;
  const staleNote = fr.stale ? ` · ${f.sourceLabel ?? "source"} last synced ${ageLabel(fr.ageMin)}` : "";
  return { tone: success ? "success" : "neutral", freshness: fr, success, text: `${v.toLocaleString()} / ${f.target.toLocaleString()}`, sub: success ? `Target hit ✓${staleNote}` : `${(f.target - v).toLocaleString()} to go${staleNote}` };
}

export interface WorkoutFacts {
  planned: boolean;
  planName: string;
  exercises: number;
  minutes: number;
  activeSession: boolean;
  logged: { type: string; durationMin: number }[];
  restDay: boolean;
  localHour: number;
}
export function workoutState(f: WorkoutFacts): { tone: RowTone; text: string; sub: string; done: boolean } {
  if (f.activeSession) return { tone: "attention", text: "Session in progress", sub: "Tap to resume", done: false };
  if (f.logged.length) return { tone: "success", text: f.logged.map((x) => `${x.type} ${x.durationMin} min`).join(" · "), sub: "Done ✓", done: true };
  if (f.restDay) return { tone: "resolved", text: "Rest day", sub: "Marked as rest · nothing owed", done: false };
  const lateNote = f.localHour >= 20 ? " · still time for something short" : "";
  if (f.planned) return { tone: f.localHour >= 20 ? "attention" : "neutral", text: f.planName, sub: `${f.exercises} exercises · ~${f.minutes} min · tap to start${lateNote}`, done: false };
  return { tone: "neutral", text: "No workout planned", sub: f.localHour >= 20 ? "A walk still counts — log it in + LOG" : "Build one or log what you did", done: false };
}
