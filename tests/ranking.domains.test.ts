import { describe, expect, it } from "vitest";
import { addDays, lastNDays } from "@/lib/dates";
import { assessFitness, type WorkoutInput } from "@/ranking/domains/fitness";
import { assessSleep, type SleepInput } from "@/ranking/domains/sleep";
import { assessCooking, type MealInput } from "@/ranking/domains/cooking";
import { assessWealth, netWorthPercentile } from "@/ranking/domains/wealth";
import { assessSkincare } from "@/ranking/domains/skincare";
import { assessSobriety } from "@/ranking/domains/sobriety";
import { assessHabits, computeHabitStats } from "@/ranking/domains/habits";
import { assessCharacter } from "@/ranking/engine";
import { rankIndex } from "@/ranking/ranks";

const TODAY = "2026-10-13";

function workoutsPattern(days: number, perWeekDays: number[], type: (i: number) => string, durationMin = 50): WorkoutInput[] {
  const out: WorkoutInput[] = [];
  const list = lastNDays(TODAY, days);
  list.forEach((d, i) => {
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (perWeekDays.includes(wd)) out.push({ date: d, type: type(i), durationMin, intensity: 2 });
  });
  return out;
}

describe("fitness", () => {
  it("scores a beginner with no data as E / none", () => {
    const a = assessFitness({ asOf: TODAY, workouts: [], activity: [] });
    expect(a.rank).toBe("E");
    expect(a.sufficiency).toBe("none");
  });
  it("uses baseline while data is sparse, capped at D", () => {
    const a = assessFitness({
      asOf: TODAY,
      workouts: [],
      activity: [],
      baseline: { workoutsPerWeek: 5, exerciseTypes: ["strength", "cardio"] },
      startedOn: TODAY,
    });
    expect(a.rank).toBe("D");
    expect(a.rankCap).toBe("D");
    expect(a.rawScore).toBeGreaterThan(50);
  });
  it("rewards sustained 5x/week (60 min) strength+cardio over 150 days with A or S", () => {
    const ws = workoutsPattern(150, [1, 2, 3, 5, 6], (i) => (i % 2 ? "strength" : "cardio"), 60);
    const steps = lastNDays(TODAY, 150).map((d) => ({ date: d, steps: 11000 }));
    const a = assessFitness({ asOf: TODAY, workouts: ws, activity: steps, startedOn: addDays(TODAY, -149) });
    expect(rankIndex(a.rank)).toBeGreaterThanOrEqual(rankIndex("A"));
    expect(a.rankCap).toBeNull();
    expect(a.trend.delta30).not.toBeNull();
  });
  it("does not give S for one great week", () => {
    const ws = workoutsPattern(7, [0, 1, 2, 3, 4, 5, 6], () => "strength");
    const a = assessFitness({ asOf: TODAY, workouts: ws, activity: [], startedOn: addDays(TODAY, -6) });
    expect(rankIndex(a.rank)).toBeLessThanOrEqual(rankIndex("D"));
  });
  it("ranks 1-2 sessions/week sustained as D-ish, 3-4 with strength as C/B", () => {
    const low = assessFitness({ asOf: TODAY, workouts: workoutsPattern(120, [3], () => "cardio"), activity: [], startedOn: addDays(TODAY, -119) });
    expect(["D", "E"]).toContain(low.rank);
    const mid = assessFitness({
      asOf: TODAY,
      workouts: workoutsPattern(120, [1, 3, 5], (i) => (i % 3 === 0 ? "cardio" : "strength")),
      activity: [],
      startedOn: addDays(TODAY, -119),
    });
    expect(["C", "B"]).toContain(mid.rank);
  });
  it("penalizes zero rest days in recovery substat", () => {
    const ws = workoutsPattern(60, [0, 1, 2, 3, 4, 5, 6], () => "strength").map((w) => ({ ...w, intensity: 3 }));
    const a = assessFitness({ asOf: TODAY, workouts: ws, activity: [], startedOn: addDays(TODAY, -59) });
    const rec = a.substats.find((s) => s.key === "recovery")!;
    expect(rec.score).toBeLessThan(60);
  });
});

function nights(days: number, mins: number, bed = "23:00", wake = "07:00", jitter = 0): SleepInput[] {
  return lastNDays(TODAY, days).map((d, i) => {
    const j = jitter ? ((i * 37) % (jitter * 2)) - jitter : 0;
    const bh = Number(bed.slice(0, 2));
    const bm = Number(bed.slice(3)) + j;
    const bedtime = `${addDays(d, -1)}T${String((bh + Math.floor(bm / 60) + 24) % 24).padStart(2, "0")}:${String(((bm % 60) + 60) % 60).padStart(2, "0")}:00+00:00`;
    return { date: d, totalSleepMin: mins, bedtimeStart: bedtime, bedtimeEnd: `${d}T${wake}:00+00:00`, efficiency: 90 };
  });
}

describe("sleep", () => {
  it("gives E for 5.5h average", () => {
    const a = assessSleep({ asOf: TODAY, entries: nights(40, 330), startedOn: addDays(TODAY, -39) });
    expect(["E", "D"]).toContain(a.rank);
  });
  it("gives A/S for 7.8h regular sleep with 150 days of data", () => {
    const a = assessSleep({ asOf: TODAY, entries: nights(150, 470), startedOn: addDays(TODAY, -149) });
    expect(rankIndex(a.rank)).toBeGreaterThanOrEqual(rankIndex("A"));
  });
  it("penalizes irregular bedtimes", () => {
    const regular = assessSleep({ asOf: TODAY, entries: nights(60, 450), startedOn: addDays(TODAY, -59) });
    const irregular = assessSleep({ asOf: TODAY, entries: nights(60, 450, "23:00", "07:00", 120), startedOn: addDays(TODAY, -59) });
    expect(irregular.rawScore).toBeLessThan(regular.rawScore - 2);
    const reg = (a: typeof regular) => a.substats.find((s) => s.key === "regularity")!.score;
    expect(reg(irregular)).toBeLessThan(reg(regular) - 8);
  });
  it("short sleep caps the domain even with perfect regularity", () => {
    const a = assessSleep({ asOf: TODAY, entries: nights(130, 320), startedOn: addDays(TODAY, -129) });
    expect(a.rank).toBe("E");
  });
  it("caps rank by tenure", () => {
    const a = assessSleep({ asOf: TODAY, entries: nights(10, 480), startedOn: addDays(TODAY, -9) });
    expect(a.rankCap).toBe("D");
    expect(a.rank).toBe("D");
  });
});

describe("cooking", () => {
  const meals = (days: number, perDay: number): MealInput[] =>
    lastNDays(TODAY, days).flatMap((d) =>
      Array.from({ length: perDay }, (_, i) => ({ date: d, mealType: i === 0 ? "dinner" : "lunch", name: `dish ${(i + d.charCodeAt(9)) % 9}`, isNewRecipe: false })),
    );
  it("ranks 1 cooked meal most days (median) around C", () => {
    const a = assessCooking({ asOf: TODAY, meals: meals(130, 1), startedOn: addDays(TODAY, -129) });
    expect(["C", "B"]).toContain(a.rank);
  });
  it("caps meals at 3 per day to prevent farming", () => {
    const farmed = assessCooking({ asOf: TODAY, meals: meals(130, 10), startedOn: addDays(TODAY, -129) });
    const honest = assessCooking({ asOf: TODAY, meals: meals(130, 3), startedOn: addDays(TODAY, -129) });
    expect(farmed.rawScore).toBeCloseTo(honest.rawScore, 1);
  });
  it("no meals = E", () => {
    expect(assessCooking({ asOf: TODAY, meals: [] }).rank).toBe("E");
  });
});

describe("wealth", () => {
  it("estimates age-adjusted net worth percentile", () => {
    expect(netWorthPercentile(39_000, 30)).toBeCloseTo(50, 0);
    expect(netWorthPercentile(0, 30)).toBeLessThan(25);
    expect(netWorthPercentile(2_000_000, 30)).toBeGreaterThan(95);
    expect(netWorthPercentile(135_600, 40)).toBeCloseTo(50, 0);
  });
  it("gives a resilient saver a high score and a high earner with debt a low one", () => {
    const strong = assessWealth({
      asOf: TODAY,
      age: 30,
      snapshots: [
        { date: addDays(TODAY, -100), liquidSavings: 30000, monthlyExpenses: 3000, monthlyIncome: 6000, savingsRatePct: 25, highInterestDebt: 0, netWorth: 150000, retirementBalance: 80000, investsMonthly: true },
        { date: TODAY, liquidSavings: 36000, monthlyExpenses: 3000, monthlyIncome: 6000, savingsRatePct: 25, highInterestDebt: 0, netWorth: 170000, retirementBalance: 90000, investsMonthly: true },
      ],
      startedOn: addDays(TODAY, -100),
    });
    expect(rankIndex(strong.rank)).toBeGreaterThanOrEqual(rankIndex("A"));

    const indebted = assessWealth({
      asOf: TODAY,
      age: 30,
      snapshots: [{ date: TODAY, liquidSavings: 1000, monthlyExpenses: 8000, monthlyIncome: 15000, savingsRatePct: 0, highInterestDebt: 40000, netWorth: -20000, retirementBalance: 0, investsMonthly: false }],
    });
    expect(rankIndex(indebted.rank)).toBeLessThanOrEqual(rankIndex("D"));
  });
  it("caps first snapshot at B", () => {
    const a = assessWealth({
      asOf: TODAY,
      age: 40,
      snapshots: [{ date: TODAY, liquidSavings: 100000, monthlyExpenses: 4000, monthlyIncome: 10000, savingsRatePct: 30, highInterestDebt: 0, netWorth: 1_000_000, retirementBalance: 500000, investsMonthly: true }],
    });
    expect(a.rankCap).toBe("B");
    expect(a.rank).toBe("B");
  });
});

describe("skincare", () => {
  const routines = [
    { id: 1, timeOfDay: "morning", steps: [{ id: "c", name: "Cleanser" }, { id: "s", name: "SPF 30" }], active: true },
    { id: 2, timeOfDay: "evening", steps: [{ id: "c", name: "Cleanser" }, { id: "m", name: "Moisturizer" }], active: true },
  ];
  it("scores 100% adherence over 130 days as S-eligible", () => {
    const completions = lastNDays(TODAY, 130).flatMap((d) => [1, 2].map((r) => ({ routineId: r, date: d, complete: true, stepsCompleted: [] })));
    const a = assessSkincare({ asOf: TODAY, routines, completions, startedOn: addDays(TODAY, -129) });
    expect(a.rank).toBe("S");
  });
  it("a single missed day does not collapse the score", () => {
    const full = lastNDays(TODAY, 60).flatMap((d) => [1, 2].map((r) => ({ routineId: r, date: d, complete: true, stepsCompleted: [] })));
    const missed = full.filter((c) => c.date !== addDays(TODAY, -3));
    const a = assessSkincare({ asOf: TODAY, routines, completions: full, startedOn: addDays(TODAY, -59) });
    const b = assessSkincare({ asOf: TODAY, routines, completions: missed, startedOn: addDays(TODAY, -59) });
    expect(a.rawScore - b.rawScore).toBeLessThan(8);
    expect(a.rank).toBe(b.rank);
  });
  it("50% adherence is D/C", () => {
    const completions = lastNDays(TODAY, 90).filter((_, i) => i % 2 === 0).flatMap((d) => [1, 2].map((r) => ({ routineId: r, date: d, complete: true, stepsCompleted: [] })));
    const a = assessSkincare({ asOf: TODAY, routines, completions, startedOn: addDays(TODAY, -89) });
    expect(["D", "C"]).toContain(a.rank);
  });
});

describe("sobriety", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("new tracker starts at E and climbs with days", () => {
    const fresh = assessSobriety({ asOf: TODAY, now, timezone: "UTC", trackers: [{ id: 1, name: "Alcohol", category: "alcohol", active: true, runs: [{ startedAt: "2026-10-13T00:00:00Z", endedAt: null }] }] });
    expect(fresh.rank).toBe("E");
    const d100 = assessSobriety({ asOf: TODAY, now, timezone: "UTC", trackers: [{ id: 1, name: "Alcohol", category: "alcohol", active: true, runs: [{ startedAt: "2026-07-05T00:00:00Z", endedAt: null }] }], startedOn: "2026-07-05" });
    expect(["B", "A"]).toContain(d100.rank);
    const d400 = assessSobriety({ asOf: TODAY, now, timezone: "UTC", trackers: [{ id: 1, name: "Alcohol", category: "alcohol", active: true, runs: [{ startedAt: "2025-09-01T00:00:00Z", endedAt: null }] }], startedOn: "2025-09-01" });
    expect(d400.rank).toBe("S");
  });
  it("a reset lowers but does not zero the score", () => {
    const a = assessSobriety({
      asOf: TODAY,
      now,
      timezone: "UTC",
      startedOn: "2026-06-01",
      trackers: [{ id: 1, name: "Weed", category: "cannabis", active: true, runs: [{ startedAt: "2026-06-01T00:00:00Z", endedAt: "2026-10-01T00:00:00Z" }, { startedAt: "2026-10-02T00:00:00Z", endedAt: null }] }],
    });
    expect(a.rawScore).toBeGreaterThan(25);
    expect(a.substats[0].value).toMatch(/best 122/);
  });
});

describe("habits", () => {
  const habits = [
    { id: 1, name: "Read", scheduleType: "daily", weekdays: [], timesPerWeek: 7, active: true, createdOn: addDays(TODAY, -100) },
    { id: 2, name: "Gym", scheduleType: "times_per_week", weekdays: [], timesPerWeek: 3, active: true, createdOn: addDays(TODAY, -100) },
    { id: 3, name: "Journal", scheduleType: "weekdays", weekdays: [1, 2, 3, 4, 5], timesPerWeek: 5, active: true, createdOn: addDays(TODAY, -100) },
  ];
  it("computes per-habit adherence and streaks", () => {
    const completions = lastNDays(TODAY, 100).flatMap((d) => [{ habitId: 1, date: d }]);
    const stats = computeHabitStats(habits as never, completions, TODAY);
    const read = stats.find((s) => s.habitId === 1)!;
    expect(read.adherence30).toBe(1);
    expect(read.streak).toBe(100);
    const gym = stats.find((s) => s.habitId === 2)!;
    expect(gym.adherence30).toBe(0);
  });
  it("perfect adherence over 120+ days is S; half is D/C", () => {
    const all = lastNDays(TODAY, 130).flatMap((d, i) => {
      const wd = new Date(d + "T00:00:00Z").getUTCDay();
      const rows = [{ habitId: 1, date: d }];
      if ([1, 3, 5].includes(wd)) rows.push({ habitId: 2, date: d });
      if (wd >= 1 && wd <= 5) rows.push({ habitId: 3, date: d });
      void i;
      return rows;
    });
    const h = habits.map((x) => ({ ...x, createdOn: addDays(TODAY, -129) }));
    const a = assessHabits({ asOf: TODAY, habits: h as never, completions: all, startedOn: addDays(TODAY, -129) });
    expect(a.rank).toBe("S");
    const half = all.filter((_, i) => i % 2 === 0);
    const b = assessHabits({ asOf: TODAY, habits: h as never, completions: half, startedOn: addDays(TODAY, -129) });
    expect(["D", "C"]).toContain(b.rank);
  });
});

describe("character", () => {
  it("balance-gates the overall rank", () => {
    const ws = workoutsPattern(150, [1, 2, 3, 5, 6], (i) => (i % 2 ? "strength" : "cardio"));
    const a = assessCharacter({
      activeDomains: ["fitness", "cooking"],
      totalXp: 5000,
      fitness: { asOf: TODAY, workouts: ws, activity: [], startedOn: addDays(TODAY, -149) },
      cooking: { asOf: TODAY, meals: [], startedOn: addDays(TODAY, -149) },
    });
    expect(rankIndex(a.overall.rank)).toBeLessThanOrEqual(rankIndex("C"));
    expect(a.level.level).toBeGreaterThan(5);
    expect(a.stats.length).toBe(2);
  });
});
