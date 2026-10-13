/**
 * Health data abstraction.
 *
 * The app is a web/PWA codebase, so it cannot call HealthKit directly. Instead
 * a HealthProvider describes a *source of health samples* and the app owns the
 * normalisation, de-duplication and aggregation of whatever arrives. Today:
 *
 *   - ManualProvider    – the user's own logging (always available)
 *   - AppleHealthProvider – samples pushed by a native bridge / iOS Shortcut
 *                          into POST /api/health/ingest (see docs/apple-health.md)
 *   - (legacy) Oura direct API sync, kept for people without an iPhone
 *
 * Nothing here fakes HealthKit: availability is derived from samples that
 * actually arrived, and every metric that has none shows as "—".
 */
export type HealthMetric = "steps" | "active_energy" | "distance" | "exercise_minutes" | "stand_hours" | "sleep" | "resting_hr" | "heart_rate" | "hrv" | "body_mass" | "workout" | "vo2max" | "respiratory_rate" | "wrist_temperature";

export const HEALTH_METRICS: { id: HealthMetric; label: string; unit: string; hkType: string; relevant: boolean }[] = [
  { id: "steps", label: "Steps", unit: "count", hkType: "HKQuantityTypeIdentifierStepCount", relevant: true },
  { id: "active_energy", label: "Active energy", unit: "kcal", hkType: "HKQuantityTypeIdentifierActiveEnergyBurned", relevant: true },
  { id: "distance", label: "Walking + running distance", unit: "km", hkType: "HKQuantityTypeIdentifierDistanceWalkingRunning", relevant: true },
  { id: "exercise_minutes", label: "Exercise minutes", unit: "min", hkType: "HKQuantityTypeIdentifierAppleExerciseTime", relevant: true },
  { id: "stand_hours", label: "Stand hours", unit: "count", hkType: "HKCategoryTypeIdentifierAppleStandHour", relevant: false },
  { id: "sleep", label: "Sleep", unit: "min", hkType: "HKCategoryTypeIdentifierSleepAnalysis", relevant: true },
  { id: "resting_hr", label: "Resting heart rate", unit: "bpm", hkType: "HKQuantityTypeIdentifierRestingHeartRate", relevant: true },
  { id: "heart_rate", label: "Heart rate", unit: "bpm", hkType: "HKQuantityTypeIdentifierHeartRate", relevant: false },
  { id: "hrv", label: "HRV (SDNN)", unit: "ms", hkType: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", relevant: true },
  { id: "body_mass", label: "Body mass", unit: "kg", hkType: "HKQuantityTypeIdentifierBodyMass", relevant: true },
  { id: "workout", label: "Workouts", unit: "", hkType: "HKWorkoutType", relevant: true },
  { id: "vo2max", label: "VO₂ max", unit: "mL/kg·min", hkType: "HKQuantityTypeIdentifierVO2Max", relevant: false },
  { id: "respiratory_rate", label: "Respiratory rate", unit: "breaths/min", hkType: "HKQuantityTypeIdentifierRespiratoryRate", relevant: false },
  { id: "wrist_temperature", label: "Wrist temperature", unit: "°C", hkType: "HKQuantityTypeIdentifierAppleSleepingWristTemperature", relevant: false },
];

/** A normalised sample as the app stores it. */
export interface HealthSampleInput {
  type: HealthMetric;
  value: number;
  unit?: string;
  start: string; // ISO timestamp
  end: string; // ISO timestamp
  source?: string; // e.g. "Oura", "Apple Watch", "iPhone"
  sourceBundle?: string;
  device?: string;
  uuid?: string;
  metadata?: Record<string, unknown>; // sleep stage, workout activity type, etc.
}

export interface MetricAvailability {
  metric: HealthMetric;
  label: string;
  available: boolean;
  lastSampleAt: string | null;
  sources: string[];
  /** granted | denied | unknown — as reported by the bridge, when it reports */
  permission: "granted" | "denied" | "unknown";
}

export interface HealthProviderStatus {
  id: string;
  name: string;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  metrics: MetricAvailability[];
  backgroundDelivery: boolean | null;
  bridge: string | null; // "shortcut" | "native" | null
}

export interface HealthProvider {
  id: string;
  name: string;
  status(): HealthProviderStatus;
  /** Re-run aggregation from stored samples into the app's tables. */
  sync(opts?: { days?: number }): Promise<{ ok: boolean; message: string; applied: Record<string, number> }>;
}
