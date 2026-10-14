/** Home's one context card: urgency, not a rigid ladder. */
import { describe, expect, it } from "vitest";
import { hhmmToMin, pickContext, questScore, windDownScore } from "@/services/contextCard";

const sleep = { windDownMin: hhmmToMin("21:30"), inBedMin: hhmmToMin("22:30") };

describe("context card priority", () => {
  it("an imminent wind-down beats a low-value optional quest", () => {
    expect(pickContext({ nowMin: hhmmToMin("21:00"), quest: { difficulty: "common", accepted: false, msLeft: 5 * 3600_000 }, sleep })).toBe("winddown");
    expect(pickContext({ nowMin: hhmmToMin("21:45"), quest: { difficulty: "uncommon", accepted: false, msLeft: null }, sleep })).toBe("winddown");
  });

  it("a quest you accepted that is about to expire still wins", () => {
    expect(pickContext({ nowMin: hhmmToMin("21:00"), quest: { difficulty: "rare", accepted: true, msLeft: 60 * 60_000 }, sleep })).toBe("quest");
  });

  it("in the afternoon the wind-down is not a candidate yet", () => {
    expect(windDownScore(hhmmToMin("15:00"), sleep)).toBe(0);
    expect(pickContext({ nowMin: hhmmToMin("15:00"), quest: { difficulty: "common", accepted: false, msLeft: null }, sleep })).toBe("quest");
  });

  it("works across midnight", () => {
    const late = { windDownMin: hhmmToMin("23:30"), inBedMin: hhmmToMin("00:15") };
    expect(windDownScore(hhmmToMin("00:05"), late)).toBe(90);
    expect(windDownScore(hhmmToMin("23:00"), late)).toBe(80);
  });

  it("Sunday reset outranks an ordinary quest, not a rare one", () => {
    expect(pickContext({ nowMin: hhmmToMin("10:00"), quest: { difficulty: "uncommon", accepted: false, msLeft: null }, sunday: true })).toBe("sunday");
    expect(pickContext({ nowMin: hhmmToMin("10:00"), quest: { difficulty: "rare", accepted: false, msLeft: null }, sunday: true })).toBe("quest");
  });

  it("one card or none", () => {
    expect(pickContext({ nowMin: hhmmToMin("14:00") })).toBeNull();
    expect(pickContext({ nowMin: hhmmToMin("09:00"), morning: true, review: true })).toBe("morning");
    expect(questScore({ difficulty: "legendary", accepted: true, msLeft: 1000 })).toBe(115);
  });
});
