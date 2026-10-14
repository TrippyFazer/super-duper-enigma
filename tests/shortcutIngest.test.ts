/**
 * The iOS Shortcut path: samples with type, value, start, end and source but no
 * UUID. Sending the same thing twice must never double count; a sample that
 * does carry a UUID keeps being keyed by it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-shortcut-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;
process.env.HEALTH_INGEST_TOKEN = "test-token";

const { getDb } = await import("@/db/client");
const { dailyActivity, healthSamples, sleepEntries } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const ah = await import("@/health/apple");
const n = await import("@/health/normalize");
const { POST } = await import("@/app/api/health/ingest/route");
const { eq } = await import("drizzle-orm");

const today = () => getProfile().today;
const at = (date: string, hhmmss: string, offset = "Z") => `${date}T${hhmmss}${offset}`;
const stepsOn = (d: string) => getDb().select().from(dailyActivity).where(eq(dailyActivity.date, d)).get()?.steps ?? null;
const sampleCount = () => getDb().select().from(healthSamples).all().length;
const clear = () => getDb().delete(healthSamples).run();

beforeAll(() => {
  getDb();
  updateProfile({ name: "Shortcut", timezone: "UTC", activeDomains: ["fitness", "sleep"], onboardingCompletedAt: new Date().toISOString(), targets: { stepsTarget: 8000, sleepTargetMin: 450 } });
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("reading what a Shortcut sends", () => {
  it("numbers arrive as numbers or text", () => {
    expect(n.numberFrom(3000)).toBe(3000);
    expect(n.numberFrom("3000")).toBe(3000);
    expect(n.numberFrom("3,000")).toBe(3000);
    expect(n.numberFrom("3000 count")).toBe(3000);
    expect(n.numberFrom("1,5")).toBe(1.5);
    expect(n.numberFrom("lots")).toBeNull();
  });

  it("dates must carry their own date, time and zone", () => {
    expect(n.dateFrom("2026-10-13T17:06:42-04:00")?.toISOString()).toBe("2026-10-13T21:06:42.000Z");
    expect(n.dateFrom("2026-10-13T21:06:42Z")?.toISOString()).toBe("2026-10-13T21:06:42.000Z");
    expect(n.dateFrom("2026-10-13T17:06:42-0400")?.toISOString()).toBe("2026-10-13T21:06:42.000Z");
    expect(n.dateFrom(1791925602)?.toISOString()).toBe("2026-10-13T21:06:42.000Z");
    // Shortcuts' default date text: no zone, so refused rather than guessed.
    expect(n.dateFrom("Oct 13, 2026 at 5:06 PM")).toBeNull();
  });

  it("types and sleep stages as people or Shortcuts write them", () => {
    expect(n.metricFor("steps")).toBe("steps");
    expect(n.metricFor("Steps")).toBe("steps");
    expect(n.metricFor("Resting Heart Rate")).toBe("resting_hr");
    expect(n.metricFor("Heart Rate Variability")).toBe("hrv");
    expect(n.metricFor("Sleep Analysis")).toBe("sleep");
    expect(n.metricFor("banana")).toBeNull();
    expect(n.stageFor("In Bed")).toBe("inBed");
    expect(n.stageFor("Core")).toBe("asleepCore");
    expect(n.stageFor("REM")).toBe("asleepREM");
    expect(n.stageFor("Awake")).toBe("awake");
    // HealthKit's own numbers, in case Shortcuts hands those over instead.
    expect(n.stageFor(0)).toBe("inBed");
    expect(n.stageFor("3")).toBe("asleepCore");
    expect(n.stageFor(5)).toBe("asleepREM");
  });

  it("miles, pounds and kilojoules become the app's km, kg and kcal", () => {
    expect(n.inAppUnits("distance", 1, "mi")).toBeCloseTo(1.609344);
    expect(n.inAppUnits("distance", 1500, "m")).toBeCloseTo(1.5);
    expect(n.inAppUnits("body_mass", 180, "lb")).toBeCloseTo(81.6466);
    expect(n.inAppUnits("active_energy", 1000, "kJ")).toBeCloseTo(239.0057);
    expect(n.inAppUnits("steps", 3000, "count")).toBe(3000);
    expect(n.inAppUnits("distance", 2, undefined)).toBe(2);
    const s = n.normalizeSample({ type: "distance", value: "3.1 mi", start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z", source: "iPhone" });
    expect(s.ok && s.sample.value).toBeCloseTo(4.98897);
  });

  it("a list that arrived as text, one dictionary per line, is still a list", () => {
    const text = '{"type":"steps","value":"5","start":"2026-10-13T10:00:00Z","end":"2026-10-13T10:01:00Z","source":"iPhone"}\n{"type":"steps","value":"6","start":"2026-10-13T10:01:00Z","end":"2026-10-13T10:02:00Z","source":"iPhone"}';
    expect(n.samplesIn({ samples: text })).toHaveLength(2);
  });
});

describe("no UUID: duplicates caught on the server", () => {
  it("sending the same payload twice does not double count", async () => {
    clear();
    const d = today();
    const payload = {
      samples: [
        { type: "steps", value: 1200, start: at(d, "08:00:00"), end: at(d, "08:10:00"), source: "Tripp's iPhone" },
        { type: "steps", value: 800, start: at(d, "12:00:00"), end: at(d, "12:07:30"), source: "Tripp's iPhone" },
      ],
    };
    const first = await ah.ingestAppleHealth(payload);
    expect(first).toMatchObject({ received: 2, stored: 2, duplicates: 0, rejectedCount: 0 });
    expect(stepsOn(d)).toBe(2000);

    const second = await ah.ingestAppleHealth(payload);
    expect(second).toMatchObject({ received: 2, stored: 0, updated: 0, duplicates: 2 });
    expect(stepsOn(d)).toBe(2000);
    expect(sampleCount()).toBe(2);
  });

  it("the same moment written with a different offset is still a duplicate", async () => {
    clear();
    const d = today();
    await ah.ingestAppleHealth({ samples: [{ type: "steps", value: 500, start: at(d, "14:00:00"), end: at(d, "14:05:00"), source: "iPhone" }] });
    // 14:00Z written as 10:00-04:00, value as text, type capitalised.
    const again = await ah.ingestAppleHealth({ samples: [{ type: "Steps", value: "500", start: at(d, "10:00:00", "-04:00"), end: at(d, "10:05:00", "-04:00"), source: "iPhone" }] });
    expect(again).toMatchObject({ stored: 0, duplicates: 1 });
    expect(sampleCount()).toBe(1);
  });

  it("a re-reported interval with a new value replaces the old one, never adds to it", async () => {
    clear();
    const d = today();
    const one = (value: number) => ({ samples: [{ type: "steps", value, start: at(d, "06:00:00"), end: at(d, "06:30:00"), source: "iPhone" }] });
    await ah.ingestAppleHealth(one(900));
    const r = await ah.ingestAppleHealth(one(950));
    expect(r).toMatchObject({ stored: 0, updated: 1, duplicates: 0 });
    expect(stepsOn(d)).toBe(950);
  });

  it("different sources over the same interval are separate samples", async () => {
    clear();
    const d = today();
    const r = await ah.ingestAppleHealth({
      samples: [
        { type: "steps", value: 1000, start: at(d, "09:00:00"), end: at(d, "09:30:00"), source: "iPhone" },
        { type: "steps", value: 1100, start: at(d, "09:00:00"), end: at(d, "09:30:00"), source: "Apple Watch" },
      ],
    });
    expect(r.stored).toBe(2);
    // Stored apart; aggregation then keeps one source for the overlap.
    expect(stepsOn(d)).toBe(1100);
  });

  it("sleep stages over identical hours are both kept; the word is the stage", async () => {
    clear();
    const d = today();
    const y = new Date(new Date(d + "T00:00:00Z").getTime() - 86400_000).toISOString().slice(0, 10);
    const r = await ah.ingestAppleHealth({
      samples: [
        { type: "sleep", value: "In Bed", start: at(y, "23:00:00"), end: at(d, "07:00:00"), source: "Oura" },
        { type: "sleep", value: "Core", start: at(y, "23:00:00"), end: at(d, "07:00:00"), source: "Oura" },
      ],
    });
    expect(r).toMatchObject({ stored: 2, rejectedCount: 0 });
    const stages = getDb().select().from(healthSamples).all().map((s) => JSON.parse(s.metadata).stage).sort();
    expect(stages).toEqual(["asleepCore", "inBed"]);
    expect(getDb().select().from(sleepEntries).where(eq(sleepEntries.date, d)).get()?.totalSleepMin).toBe(480);
    const again = await ah.ingestAppleHealth({
      samples: [{ type: "sleep", value: "Core", start: at(y, "23:00:00"), end: at(d, "07:00:00"), source: "Oura" }],
    });
    expect(again.duplicates).toBe(1);
  });

  it("a bad sample is reported with the reason and does not sink the rest", async () => {
    clear();
    const d = today();
    const r = await ah.ingestAppleHealth({
      samples: [
        { type: "steps", value: 300, start: "Oct 13, 2026 at 5:06 PM", end: "Oct 13, 2026 at 5:10 PM", source: "iPhone" },
        { type: "steps", value: 400, start: at(d, "15:00:00"), end: at(d, "15:05:00"), source: "iPhone" },
      ],
    });
    expect(r).toMatchObject({ received: 2, stored: 1, rejectedCount: 1 });
    expect(r.rejected[0]).toMatchObject({ index: 0 });
    expect(r.rejected[0].reason).toContain("ISO 8601");
  });
});

describe("with a UUID: unchanged", () => {
  it("is keyed by the UUID, so two samples alike in every other way are both kept", async () => {
    clear();
    const d = today();
    const s = (uuid: string) => ({ type: "steps", value: 100, start: at(d, "16:00:00"), end: at(d, "16:01:00"), source: "iPhone", uuid });
    const r1 = await ah.ingestAppleHealth({ samples: [s("A-1"), s("A-2")] });
    expect(r1.stored).toBe(2);
    const r2 = await ah.ingestAppleHealth({ samples: [s("A-1"), s("A-2")] });
    expect(r2).toMatchObject({ stored: 0, duplicates: 2 });
  });
});

describe("POST /api/health/ingest", () => {
  const post = (body: unknown, token: string | null = "test-token") =>
    POST(
      new Request("http://local/api/health/ingest", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }) as never,
    );

  it("refuses a missing token and says what header to add", async () => {
    const res = await post({ samples: [] }, null);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("Authorization");
  });

  it("takes the shapes a Shortcut produces: a bare list, samples as text, a single sample", async () => {
    clear();
    const d = today();
    const one = (hh: string) => ({ type: "steps", value: 10, start: at(d, `${hh}:00:00`), end: at(d, `${hh}:01:00`), source: "iPhone" });
    expect((await (await post([one("17")])).json()).stored).toBe(1);
    expect((await (await post({ samples: JSON.stringify([one("18")]) })).json()).stored).toBe(1);
    expect((await (await post(one("19"))).json()).stored).toBe(1);
    const again = await (await post({ samples: [one("17"), one("18"), one("19")] })).json();
    expect(again).toMatchObject({ ok: true, stored: 0, duplicates: 3 });
  });

  it("explains a body that is not JSON, and one where nothing could be used", async () => {
    expect((await post("not json")).status).toBe(400);
    const res = await post({ samples: [{ type: "steps", value: 1, start: "yesterday", end: "today", source: "iPhone" }] });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.rejected[0].reason).toContain("ISO 8601");
  });
});
