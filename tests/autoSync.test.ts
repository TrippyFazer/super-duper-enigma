/** Scheduled Oura sync: off when asked, never runs without a connection. */
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.DATABASE_PATH = path.join(os.tmpdir(), `ascend-autosync-${process.pid}-${Date.now()}.db`);
delete process.env.OURA_PERSONAL_ACCESS_TOKEN;

const { autoSyncHours, runAutoSync } = await import("@/services/autoSync");

describe("oura auto-sync", () => {
  it("every 3 hours unless told otherwise; 0 or nonsense turns it off", () => {
    delete process.env.OURA_AUTO_SYNC_HOURS;
    expect(autoSyncHours()).toBe(3);
    process.env.OURA_AUTO_SYNC_HOURS = "6";
    expect(autoSyncHours()).toBe(6);
    process.env.OURA_AUTO_SYNC_HOURS = "0";
    expect(autoSyncHours()).toBe(0);
    process.env.OURA_AUTO_SYNC_HOURS = "often";
    expect(autoSyncHours()).toBe(0);
    delete process.env.OURA_AUTO_SYNC_HOURS;
  });

  it("does nothing when Oura is not connected", async () => {
    expect(await runAutoSync()).toBe("skipped");
  });
});
