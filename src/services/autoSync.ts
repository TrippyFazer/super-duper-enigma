/**
 * Oura, kept current without opening the app.
 *
 * Every OURA_AUTO_SYNC_HOURS (default 3; 0 turns it off) the server pulls the
 * last few days from Oura, exactly as "Sync" in Settings does, and re-scores.
 * A few days rather than one: Oura revises a night for a while after it
 * happens (late ring syncs, re-scored stages), and re-reading is idempotent.
 *
 * In-process, because this is one container serving one person: no cron, no
 * second service. Started once from instrumentation.ts when the server boots.
 */
import { getOuraStatus, syncOura } from "@/integrations/oura/sync";
import { reconcile } from "@/services/progression";

const DAYS = 3;
const FIRST_RUN_DELAY_MS = 2 * 60_000;

let started = false;
let running = false;

export function autoSyncHours(): number {
  const raw = process.env.OURA_AUTO_SYNC_HOURS;
  const n = raw === undefined || raw === "" ? 3 : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** One scheduled run. Exported for tests; skips when Oura is not connected. */
export async function runAutoSync(): Promise<"skipped" | "busy" | "ok" | "error"> {
  if (running) return "busy";
  if (!getOuraStatus().connected) return "skipped";
  running = true;
  try {
    const r = await syncOura(DAYS);
    if (r.ok) {
      reconcile();
      console.log(`[oura auto-sync] ${r.nights} nights, ${r.activityDays} activity days`);
      return "ok";
    }
    console.warn(`[oura auto-sync] failed: ${r.error}`);
    return "error";
  } catch (e) {
    console.warn(`[oura auto-sync] failed: ${(e as Error).message}`);
    return "error";
  } finally {
    running = false;
  }
}

export function startAutoSync(): void {
  const hours = autoSyncHours();
  if (started || hours === 0) return;
  started = true;
  console.log(`[oura auto-sync] every ${hours}h`);
  setTimeout(() => void runAutoSync(), FIRST_RUN_DELAY_MS).unref();
  setInterval(() => void runAutoSync(), hours * 3600_000).unref();
}
