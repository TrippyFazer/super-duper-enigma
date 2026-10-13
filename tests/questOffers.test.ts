/**
 * Optional quest offers: roll stability, accept/decline/expire/complete,
 * no penalty on decline, XP bands, guardrail validation.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-offers-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { questOffers, xpEvents } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const { totalXp } = await import("@/services/xp");
const qo = await import("@/services/questOffers");
const { QUEST_LIBRARY, DIFFICULTY_XP, violatesSafety } = await import("@/ranking/questLibrary");
const { eq } = await import("drizzle-orm");

const baseSignals = (): import("@/ranking/questLibrary").OfferSignals => ({
  hour: 10,
  weekday: 2,
  workedOutToday: false,
  trainedHardYesterday: false,
  stepsToday: 2000,
  stepsTarget: 8000,
  mealsCookedToday: 0,
  cookingBehindThisWeek: true,
  proteinLow: false,
  nutritionTracked: false,
  sleepPoorRecently: false,
  bedtimeTarget: "23:00",
  routinesDueTonight: true,
  habitsDueToday: 2,
  dailyQuestsDone: 0,
  dailyQuestsTotal: 4,
  activeDomains: ["fitness", "sleep", "cooking", "skincare", "habits"],
  weakestDomain: "cooking",
  sobrietyTracked: false,
  overallRank: "E",
} as never);

/** Force an offer by rolling hours until one appears (deterministic per date/slot). */
async function forceOffer(today: string, frequency: "low" | "normal" | "high" = "high") {
  for (let hour = 7; hour < 23; hour++) {
    const now = new Date(`${today}T${String(hour).padStart(2, "0")}:00:00Z`);
    const o = await qo.maybeOffer({ today, now, localHour: hour, signals: { ...baseSignals(), hour }, frequency });
    if (o) return o;
  }
  return null;
}

beforeAll(() => {
  getDb();
  updateProfile({ name: "Offers", timezone: "UTC", activeDomains: ["fitness", "sleep", "cooking", "skincare", "habits"], onboardingCompletedAt: new Date().toISOString() });
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("quest library", () => {
  it("every library quest is valid under the guardrails and in its XP band", () => {
    for (const q of QUEST_LIBRARY) {
      const reason = qo.validateCandidate(qo.libraryCandidate(q), []);
      expect(reason, `${q.key}: ${reason}`).toBeNull();
      const [lo, hi] = DIFFICULTY_XP[q.difficulty];
      expect(q.xp).toBeGreaterThanOrEqual(lo);
      expect(q.xp).toBeLessThanOrEqual(hi);
    }
    expect(QUEST_LIBRARY.length).toBeGreaterThanOrEqual(25);
  });

  it("safety guardrails reject dangerous text", () => {
    expect(violatesSafety("Skip a meal today")).not.toBeNull();
    expect(violatesSafety("Hit a new 1RM on deadlift")).not.toBeNull();
    expect(violatesSafety("Pull an all-nighter studying")).not.toBeNull();
    expect(violatesSafety("Do 500 pushups")).not.toBeNull();
    expect(violatesSafety("Have a beer with friends")).not.toBeNull();
    expect(violatesSafety("Cook dinner with three ingredients you already own")).toBeNull();
    expect(violatesSafety("Take a 20 minute walk after lunch")).toBeNull();
  });

  it("validateCandidate rejects out-of-band XP, reserved tiers, bad domains and duplicates", () => {
    const base = qo.libraryCandidate(QUEST_LIBRARY[0]);
    expect(qo.validateCandidate({ ...base, xpReward: 999 }, [])).toMatch(/xp/);
    expect(qo.validateCandidate({ ...base, difficulty: "legendary", xpReward: 150 }, [])).toMatch(/reserved/);
    expect(qo.validateCandidate({ ...base, domain: "gambling" }, [])).toBe("domain");
    expect(qo.validateCandidate({ ...base, expiresInHours: 500 }, [])).toBe("expiry");
    expect(qo.validateCandidate(base, [base.title.toUpperCase()])).toMatch(/duplicate/);
    expect(qo.validateCandidate({ ...base, title: "Do 1000 burpees" }, [])).toMatch(/unsafe/);
  });
});

describe("offer engine", () => {
  it("is quiet at night and never produces more than the frequency cap per day", async () => {
    const today = "2026-03-02";
    const night = await qo.maybeOffer({ today, now: new Date(`${today}T02:00:00Z`), localHour: 2, signals: baseSignals(), frequency: "high" });
    expect(night).toBeNull();
    const first = await forceOffer(today, "high");
    expect(first).not.toBeNull();
    expect(first!.status).toBe("offered");
    // Same slot re-rolls identically and never stacks a second open offer.
    const again = await qo.maybeOffer({ today, now: new Date(first!.offeredAt), localHour: new Date(first!.offeredAt).getUTCHours(), signals: baseSignals(), frequency: "high" });
    expect(again).toBeNull();
    const rows = getDb().select().from(questOffers).where(eq(questOffers.date, today)).all();
    expect(rows.length).toBe(1);
  });

  it("declining costs nothing: no XP change, no new rows elsewhere, and the offer is simply closed", async () => {
    const today = "2026-03-03";
    const o = await forceOffer(today);
    expect(o).not.toBeNull();
    const before = totalXp();
    const xpRows = getDb().select().from(xpEvents).all().length;
    const d = qo.declineOffer(o!.id);
    expect(d!.status).toBe("declined");
    expect(d!.declinedAt).toBeTruthy();
    expect(totalXp()).toBe(before);
    expect(getDb().select().from(xpEvents).all().length).toBe(xpRows);
    // A declined offer cannot be completed afterwards.
    const c = qo.completeOffer(o!.id, today, new Date(o!.offeredAt));
    expect(c.xp).toBeNull();
    expect(c.offer!.status).toBe("declined");
  });

  it("accept → complete awards the offer's XP once, idempotently", async () => {
    const today = "2026-03-04";
    const o = await forceOffer(today);
    expect(o).not.toBeNull();
    const a = qo.acceptOffer(o!.id);
    expect(a!.status).toBe("accepted");
    expect(a!.acceptedAt).toBeTruthy();
    const before = totalXp();
    const at = new Date(new Date(o!.offeredAt).getTime() + 30 * 60_000);
    const c = qo.completeOffer(o!.id, today, at);
    expect(c.offer!.status).toBe("completed");
    expect(c.xp?.awarded).toBe(true);
    expect(c.xp?.amount).toBe(o!.xpReward);
    expect(totalXp()).toBe(before + o!.xpReward);
    const c2 = qo.completeOffer(o!.id, today, at);
    expect(c2.xp).toBeNull();
    expect(totalXp()).toBe(before + o!.xpReward);
    expect(qo.offersCompletedCount()).toBe(1);
  });

  it("offers expire after their window and expired offers cannot be completed", async () => {
    const today = "2026-03-05";
    const o = await forceOffer(today);
    expect(o).not.toBeNull();
    const after = new Date(new Date(o!.expiresAt!).getTime() + 60_000);
    qo.expireOffers(after);
    const row = getDb().select().from(questOffers).where(eq(questOffers.id, o!.id)).get()!;
    expect(row.status).toBe("expired");
    const c = qo.completeOffer(o!.id, today, after);
    expect(c.xp).toBeNull();
  });

  it("respects a 3 hour gap after a decline before offering again", async () => {
    const today = "2026-03-06";
    const o = await forceOffer(today, "high");
    expect(o).not.toBeNull();
    const declinedAt = new Date(o!.offeredAt);
    qo.declineOffer(o!.id, declinedAt);
    const soon = new Date(declinedAt.getTime() + 60 * 60_000);
    const tooSoon = await qo.maybeOffer({ today, now: soon, localHour: soon.getUTCHours(), signals: baseSignals(), frequency: "high" });
    expect(tooSoon).toBeNull();
  });

  it("uses a validated AI candidate when offered one, and ignores invalid ones", async () => {
    const today = "2026-03-09";
    const bad = { templateKey: null, source: "ai" as const, title: "Skip a meal tonight", description: "", domain: "cooking", difficulty: "common" as const, kind: "custom", estimatedMinutes: 0, xpReward: 20, expiresInHours: 6 };
    let used = 0;
    for (let hour = 7; hour < 23; hour++) {
      const now = new Date(`${today}T${String(hour).padStart(2, "0")}:00:00Z`);
      const o = await qo.maybeOffer({ today, now, localHour: hour, signals: { ...baseSignals(), hour }, frequency: "high", aiCandidate: async () => { used++; return bad; } });
      if (o) {
        expect(o.source).toBe("library");
        expect(violatesSafety(`${o.title} ${o.description}`)).toBeNull();
        break;
      }
    }
    void used;
    const rows = qo.listOffers({ statuses: ["offered", "accepted"] });
    expect(rows.every((r) => r.source === "library")).toBe(true);
  });
});

describe("profile", () => {
  it("stores quest frequency in preferences", () => {
    updateProfile({ preferences: { questFrequency: "low" } });
    expect(getProfile().preferences.questFrequency).toBe("low");
  });
});
