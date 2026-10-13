import { appleHealthStatus } from "@/health/apple";
import { getOuraStatus } from "@/integrations/oura/sync";

/**
 * The single place that decides where sleep / steps / workouts come from and
 * which manual logging UI should be visible.
 *
 * Rules:
 *  - Apple Health is the primary automatic source. A metric counts as
 *    "automatic" only when Apple Health has actually delivered samples for it
 *    (never because a permission was granted or a ring is paired).
 *  - Direct Oura sync is a legacy path. It still counts as an automatic source
 *    when connected, so the two never double-prompt for manual entry.
 *  - Manual logging is always allowed; it is only *hidden* from the default
 *    quick paths when an automatic source already covers the metric.
 */
export interface HealthSources {
  apple: { connected: boolean; sleep: boolean; steps: boolean; workouts: boolean; lastSyncAt: string | null };
  oura: { connected: boolean };
  /** An automatic source currently supplies sleep. */
  sleepAutomatic: boolean;
  /** An automatic source currently supplies steps. */
  stepsAutomatic: boolean;
  /** Show manual sleep entry in quick-log paths. */
  showManualSleep: boolean;
  /** Show manual steps entry in quick-log paths. */
  showManualSteps: boolean;
  /** Short label for the source of a metric, for "—" vs value display. */
  sleepSourceLabel: string | null;
  stepsSourceLabel: string | null;
  /** Whether any automatic source is connected at all (drives "connect" nudges). */
  anyConnected: boolean;
}

export function resolveHealthSources(input: { appleConnected: boolean; appleMetrics: { metric: string; available: boolean }[]; appleLastSyncAt: string | null; ouraConnected: boolean }): HealthSources {
  const has = (m: string) => input.appleConnected && input.appleMetrics.some((x) => x.metric === m && x.available);
  const apple = { connected: input.appleConnected, sleep: has("sleep"), steps: has("steps"), workouts: has("workout"), lastSyncAt: input.appleLastSyncAt };
  const oura = { connected: input.ouraConnected };
  const sleepAutomatic = apple.sleep || oura.connected;
  const stepsAutomatic = apple.steps || oura.connected;
  return {
    apple,
    oura,
    sleepAutomatic,
    stepsAutomatic,
    showManualSleep: !sleepAutomatic,
    showManualSteps: !stepsAutomatic,
    sleepSourceLabel: apple.sleep ? "Apple Health" : oura.connected ? "Oura" : null,
    stepsSourceLabel: apple.steps ? "Apple Health" : oura.connected ? "Oura" : null,
    anyConnected: apple.connected || oura.connected,
  };
}

/** DB-backed resolution for server components and actions. */
export function healthSources(): HealthSources {
  const a = appleHealthStatus();
  const o = getOuraStatus();
  return resolveHealthSources({ appleConnected: a.connected, appleMetrics: a.metrics, appleLastSyncAt: a.lastSyncAt, ouraConnected: o.enabled && o.connected });
}
