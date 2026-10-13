import { describe, expect, it } from "vitest";
import { interpolate, circularStdMinutes, circularMeanMinutes, weightedMean } from "@/ranking/scale";
import { scoreToRank, progressWithinRank, applyRankCap, nextRank, RANK_FLOORS } from "@/ranking/ranks";
import { levelFromXp, totalXpForLevel } from "@/ranking/levels";
import { rankCapForTenure, daysUntilRankAllowed, applyGate } from "@/ranking/gating";
import { addDays, diffDays, startOfWeek, isoWeek, todayInTz, lastNDays } from "@/lib/dates";

describe("scale helpers", () => {
  it("interpolates piecewise-linearly and clamps", () => {
    const a: [number, number][] = [
      [0, 0],
      [1, 25],
      [3, 55],
      [5, 85],
    ];
    expect(interpolate(a, -1)).toBe(0);
    expect(interpolate(a, 0)).toBe(0);
    expect(interpolate(a, 2)).toBe(40);
    expect(interpolate(a, 4)).toBe(70);
    expect(interpolate(a, 99)).toBe(85);
  });
  it("circular std handles midnight wrap", () => {
    // 23:30 and 00:30 are 60 minutes apart, not 23 hours.
    const sd = circularStdMinutes([23 * 60 + 30, 30]);
    expect(sd).toBeGreaterThan(25);
    expect(sd).toBeLessThan(35);
    expect(circularStdMinutes([600, 600, 600])).toBe(0);
    const m = circularMeanMinutes([23 * 60 + 30, 30]);
    expect(Math.abs(m - 0) < 2 || Math.abs(m - 1440) < 2).toBe(true);
  });
  it("weighted mean normalizes weights", () => {
    expect(weightedMean([{ score: 100, weight: 1 }, { score: 0, weight: 3 }])).toBe(25);
  });
});

describe("ranks", () => {
  it("maps score to rank at floors", () => {
    expect(scoreToRank(0)).toBe("E");
    expect(scoreToRank(29.9)).toBe("E");
    expect(scoreToRank(30)).toBe("D");
    expect(scoreToRank(50)).toBe("C");
    expect(scoreToRank(70)).toBe("B");
    expect(scoreToRank(85)).toBe("A");
    expect(scoreToRank(95)).toBe("S");
    expect(scoreToRank(100)).toBe("S");
  });
  it("computes progress within rank", () => {
    const p = progressWithinRank(60);
    expect(p.rank).toBe("C");
    expect(p.next).toBe("B");
    expect(p.progress).toBeCloseTo(0.5);
    expect(progressWithinRank(97).next).toBeNull();
  });
  it("caps scores at a rank ceiling", () => {
    expect(scoreToRank(applyRankCap(92, "C"))).toBe("C");
    expect(applyRankCap(40, "C")).toBe(40);
    expect(nextRank("S")).toBeNull();
    expect(RANK_FLOORS.S).toBe(95);
  });
});

describe("levels", () => {
  it("is monotonic and starts at level 1", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(totalXpForLevel(10)).level).toBe(10);
    expect(levelFromXp(totalXpForLevel(10) - 1).level).toBe(9);
    let prev = 0;
    for (let l = 2; l < 60; l++) {
      const x = totalXpForLevel(l);
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });
  it("reports xp to next level", () => {
    const r = levelFromXp(100);
    expect(r.level).toBe(1);
    expect(r.xpToNext).toBe(totalXpForLevel(2) - 100);
  });
});

describe("gating", () => {
  it("caps rank by tenure", () => {
    expect(rankCapForTenure(0)).toBe("D");
    expect(rankCapForTenure(13)).toBe("D");
    expect(rankCapForTenure(14)).toBe("C");
    expect(rankCapForTenure(30)).toBe("B");
    expect(rankCapForTenure(60)).toBe("A");
    expect(rankCapForTenure(120)).toBeNull();
  });
  it("counts days until a rank is allowed", () => {
    expect(daysUntilRankAllowed(10, "C")).toBe(4);
    expect(daysUntilRankAllowed(10, "S")).toBe(110);
    expect(daysUntilRankAllowed(200, "S")).toBe(0);
  });
  it("applies the gate with an explanation", () => {
    const g = applyGate("S", 20);
    expect(g.rank).toBe("C");
    expect(g.capRequirement).toMatch(/10 more days/);
    expect(applyGate("D", 0).capRequirement).toBeNull();
  });
});

describe("dates", () => {
  it("does day arithmetic on ISO strings", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-01-01", "2026-01-31")).toBe(30);
    expect(startOfWeek("2026-10-13")).toBe("2026-10-12"); // Tuesday -> Monday
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // Sunday -> previous Monday
    expect(isoWeek("2026-01-01").week).toBe(1);
    expect(lastNDays("2026-10-13", 3)).toEqual(["2026-10-11", "2026-10-12", "2026-10-13"]);
  });
  it("computes today in a timezone", () => {
    const d = new Date("2026-10-13T03:00:00Z");
    expect(todayInTz("America/Los_Angeles", d)).toBe("2026-10-12");
    expect(todayInTz("Asia/Tokyo", d)).toBe("2026-10-13");
  });
});
