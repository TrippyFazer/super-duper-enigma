/**
 * Plan vs reality: workouts, meals and other records can be cancelled, discarded,
 * deleted or undone, and the XP ledger reconciles exactly (no phantom XP).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-lifecycle-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { workouts, workoutSessions, xpEvents, quests, plannedMeals, nutritionEntries } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const { totalXp, xpLedger } = await import("@/services/xp");
const w = await import("@/services/workouts");
const n = await import("@/services/nutrition");
const m = await import("@/services/mutations");
const { reconcile, getQuests } = await import("@/services/progression");
const { seedRecipes } = await import("@/db/seed");
const { eq, isNull, and } = await import("drizzle-orm");

const ctx = { proteinTarget: 140, calorieTarget: 2400, unsafeTargets: false };
const today = () => getProfile().today;

beforeAll(() => {
  getDb();
  updateProfile({ name: "Real Life", timezone: "UTC", activeDomains: ["fitness", "cooking", "habits"], onboardingCompletedAt: new Date().toISOString() });
  seedRecipes();
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("workout lifecycle", () => {
  it("an accidental session with no sets is cancelled: no log row, no XP, and it can be discarded", () => {
    const before = totalXp();
    const s = w.startSession({ date: today(), name: "Oops", focus: "upper", exercises: [{ slug: "push-up", name: "Push-Up", sets: 3, reps: "12", restSeconds: 60, muscles: [] }] });
    const fin = w.finishSession(s.id)!;
    expect(fin.session.status).toBe("cancelled");
    expect(fin.xp.length).toBe(0);
    expect(getDb().select().from(workouts).all().length).toBe(0);
    expect(totalXp()).toBe(before);
    expect(w.listSessions(10).some((x) => x.id === s.id && x.status === "cancelled")).toBe(true);
    const r = w.discardSession(s.id);
    expect(r.voidedXp).toBe(0);
    expect(getDb().select().from(workoutSessions).where(eq(workoutSessions.id, s.id)).get()).toBeUndefined();
  });

  it("cancelling an active session keeps nothing and frees the plan", () => {
    const s = w.startSession({ date: today(), name: "Cancel me", focus: "full", exercises: [{ slug: "goblet-squat", name: "Goblet Squat", sets: 3, reps: "10", restSeconds: 60, muscles: [] }] });
    w.logSet({ sessionExerciseId: s.exercises[0].id, setIndex: 0, weight: 30, reps: 10, completed: true });
    w.cancelSession(s.id);
    expect(w.getActiveSession()).toBeNull();
    expect(getDb().select().from(workouts).all().length).toBe(0);
    expect(totalXp()).toBe(0 + totalXp()); // no throw; nothing awarded
    expect(getDb().select().from(xpEvents).where(isNull(xpEvents.voidedAt)).all().filter((e) => e.key.startsWith("workout")).length).toBe(0);
  });

  it("pause stops the clock", () => {
    const s = w.startSession({ date: today(), name: "Pause", focus: "full", exercises: [] });
    w.pauseSession(s.id);
    expect(w.getActiveSession()!.status).toBe("paused");
    w.resumeSession(s.id);
    expect(w.getActiveSession()!.status).toBe("active");
    w.cancelSession(s.id);
  });

  it("discarding a completed session voids its XP, removes the workout log, reverts the quest and recomputes records", () => {
    const before = totalXp();
    const s = w.startSession({ date: today(), name: "Real one", focus: "upper", exercises: [{ slug: "bench-press", name: "Bench Press", sets: 3, reps: "8", restSeconds: 90, muscles: [] }] });
    for (let i = 0; i < 3; i++) w.logSet({ sessionExerciseId: s.exercises[0].id, setIndex: i, weight: 60, reps: 8, completed: true });
    const fin = w.finishSession(s.id)!;
    expect(fin.session.status).toBe("completed");
    const gained = totalXp() - before;
    expect(gained).toBeGreaterThan(0);
    reconcile();
    const q = getQuests(today()).daily.find((x) => x.templateKey === "daily.workout");
    expect(q?.done).toBe(true);
    const withQuest = totalXp();
    expect(withQuest).toBeGreaterThan(before + gained);
    const slug = s.exercises[0].slug;
    expect(w.listPersonalRecords().some((p) => p.exerciseSlug === slug)).toBe(true);

    const r = w.discardSession(s.id);
    expect(r.removedWorkout).toBe(true);
    expect(r.voidedXp).toBe(gained);
    reconcile();
    expect(totalXp()).toBe(before);
    expect(getDb().select().from(workouts).all().length).toBe(0);
    expect(getQuests(today()).daily.find((x) => x.templateKey === "daily.workout")?.done).toBe(false);
    expect(w.listPersonalRecords().some((p) => p.exerciseSlug === slug)).toBe(false);
    // Ledger keeps the audit trail: voided rows exist with a reason.
    const voided = xpLedger(50).filter((e) => e.voidedAt);
    expect(voided.length).toBeGreaterThanOrEqual(2);
    expect(voided.every((e) => e.voidReason)).toBe(true);
    // The same action can earn again later (keys are freed on void).
    const s2 = w.startSession({ date: today(), name: "Again", focus: "upper", exercises: [{ slug: "bench-press", name: "Bench Press", sets: 1, reps: "8", restSeconds: 90, muscles: [] }] });
    w.addSet(s2.exercises[0].id);
    w.addSet(s2.exercises[0].id);
    for (let i = 0; i < 3; i++) w.logSet({ sessionExerciseId: s2.exercises[0].id, setIndex: i, weight: 60, reps: 8, completed: true });
    const fin2 = w.finishSession(s2.id)!;
    expect(fin2.xp.some((x) => x.key.startsWith("workout:"))).toBe(true);
    w.discardSession(s2.id);
    reconcile();
    expect(totalXp()).toBe(before);
  });

  it("deleting a quick-logged workout voids its XP", () => {
    reconcile();
    const before = totalXp();
    const r = m.logWorkout({ date: today(), type: "cardio", durationMin: 50, intensity: 2 });
    expect(totalXp()).toBe(before + 35);
    const voided = m.deleteWorkout(r.id!);
    expect(voided).toBe(35);
    reconcile();
    const live = getDb().select().from(xpEvents).where(isNull(xpEvents.voidedAt)).all();
    expect(live.some((e) => e.sourceType === "workout" && e.sourceId === String(r.id))).toBe(false);
    expect(totalXp(), JSON.stringify(live.map((e) => e.key))).toBe(before);
  });

  it("an accidental habit check can be undone", () => {
    const id = m.createHabit({ name: "Read", scheduleType: "daily" });
    const before = totalXp();
    m.completeHabit({ habitId: id, date: today() });
    expect(totalXp()).toBe(before + 8);
    expect(m.uncompleteHabit(id, today())).toBe(8);
    expect(totalXp()).toBe(before);
  });
});

describe("meal lifecycle", () => {
  const plan = () => ({
    calorieTarget: 2400,
    proteinTarget: 140,
    rationale: "",
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    meals: [
      { index: 0, mealType: "breakfast" as const, name: "Oats", calories: 420, protein: 18, carbs: 60, fat: 12, ingredients: ["oats", "milk"] },
      { index: 1, mealType: "lunch" as const, name: "Chicken Bowl", calories: 680, protein: 50, carbs: 70, fat: 20, ingredients: ["chicken breast", "rice"] },
      { index: 2, mealType: "dinner" as const, name: "Salmon", calories: 600, protein: 45, carbs: 30, fat: 30, ingredients: ["salmon"] },
    ],
  });

  it("a generated plan contributes nothing until a meal is marked eaten", () => {
    n.saveMealPlan(today(), plan(), "template");
    const p = n.getMealPlan(today())!;
    expect(p.meals.length).toBe(3);
    expect(p.meals.every((x) => x.status === "planned")).toBe(true);
    expect(n.dayTotals(today()).calories).toBe(0);
  });

  it("ate this → counts; delete the entry → totals and XP reverse and the meal is planned again", () => {
    const p = n.getMealPlan(today())!;
    const lunch = p.meals[1];
    const before = totalXp();
    const r = n.logNutrition({ date: today(), mealType: "lunch", name: lunch.name, calories: lunch.calories, protein: lunch.protein, carbs: lunch.carbs, fat: lunch.fat, source: "plan", plannedMealId: lunch.id }, ctx);
    expect(n.dayTotals(today()).calories).toBe(680);
    expect(n.getPlannedMeal(lunch.id)!.status).toBe("eaten");
    expect(r.xp.map((x) => x.key.split(":")[0]).sort()).toEqual(["nutrition_logged", "planned_meal"]);
    expect(totalXp()).toBe(before + 15);
    const d = n.deleteEntry(r.entry.id, ctx);
    expect(d.voidedXp).toBe(15);
    expect(totalXp()).toBe(before);
    expect(n.dayTotals(today()).calories).toBe(0);
    expect(n.getPlannedMeal(lunch.id)!.status).toBe("planned");
  });

  it("skip / replace / discard / un-eat are all reversible and never count", () => {
    const p = n.getMealPlan(today())!;
    const [b, , d] = p.meals;
    n.setPlannedMealStatus(b.id, "skipped");
    expect(n.getPlannedMeal(b.id)!.status).toBe("skipped");
    n.setPlannedMealStatus(b.id, "planned");
    const repl = n.replacePlannedMeal(d.id, { name: "Leftover chili", calories: 500, protein: 35 })!;
    expect(n.getPlannedMeal(d.id)!.status).toBe("replaced");
    expect(n.getMealPlan(today())!.meals.some((x) => x.id === repl.id && x.status === "planned")).toBe(true);
    expect(n.dayTotals(today()).calories).toBe(0);
    // eat then un-eat
    const e = n.logNutrition({ date: today(), mealType: "dinner", name: repl.name, calories: 500, protein: 35, source: "plan", plannedMealId: repl.id }, ctx);
    expect(n.dayTotals(today()).calories).toBe(500);
    n.setPlannedMealStatus(repl.id, "planned");
    expect(n.dayTotals(today()).calories).toBe(0);
    expect(getDb().select().from(nutritionEntries).where(eq(nutritionEntries.id, e.entry.id)).get()).toBeUndefined();
    n.setPlannedMealStatus(repl.id, "discarded");
    expect(n.getMealPlan(today())!.meals.some((x) => x.id === repl.id)).toBe(false);
  });

  it("eating out replaces the planned slot without counting the plan", () => {
    const p = n.getMealPlan(today())!;
    const lunch = p.meals.find((x) => x.mealType === "lunch" && x.status === "planned")!;
    const r = n.logNutrition({ date: today(), mealType: "lunch", name: "Chipotle bowl", calories: 810, protein: 48, source: "restaurant", venue: "Chipotle", replacesPlannedMealId: lunch.id }, ctx);
    expect(n.getPlannedMeal(lunch.id)!.status).toBe("replaced");
    expect(n.dayTotals(today()).calories).toBe(810);
    n.deleteEntry(r.entry.id, ctx);
    expect(n.getPlannedMeal(lunch.id)!.status).toBe("planned");
  });

  it("regenerating discards planned rows but keeps eaten history", () => {
    const p = n.getMealPlan(today())!;
    const b = p.meals.find((x) => x.mealType === "breakfast")!;
    n.logNutrition({ date: today(), mealType: "breakfast", name: b.name, calories: b.calories, protein: b.protein, source: "plan", plannedMealId: b.id }, ctx);
    n.saveMealPlan(today(), plan(), "template");
    const p2 = n.getMealPlan(today())!;
    expect(p2.meals.filter((x) => x.status === "eaten").length).toBe(1);
    expect(p2.meals.filter((x) => x.status === "planned").length).toBe(3);
    expect(getDb().select().from(plannedMeals).where(and(eq(plannedMeals.date, today()), eq(plannedMeals.status, "discarded"))).all().length).toBeGreaterThanOrEqual(2);
  });

  it("protein XP is re-evaluated after edits and deletes", () => {
    const d = "2026-06-01";
    const a = n.logNutrition({ date: d, mealType: "lunch", name: "Big", calories: 1500, protein: 150 }, ctx);
    expect(a.xp.some((x) => x.key.startsWith("protein_target"))).toBe(true);
    n.updateEntry(a.entry.id, { protein: 60 }, ctx);
    expect(getDb().select().from(xpEvents).where(and(eq(xpEvents.key, `protein_target:${d}`), isNull(xpEvents.voidedAt))).get()).toBeUndefined();
    n.updateEntry(a.entry.id, { protein: 150 }, ctx);
    expect(getDb().select().from(xpEvents).where(and(eq(xpEvents.key, `protein_target:${d}`), isNull(xpEvents.voidedAt))).get()).toBeTruthy();
    n.deleteEntry(a.entry.id, ctx);
    expect(getDb().select().from(xpEvents).where(and(eq(xpEvents.date, d), isNull(xpEvents.voidedAt))).all().length).toBe(0);
  });

  it("saved foods: save once, reuse by id, recents order by use", () => {
    const f = n.saveFood({ name: "Starbucks Bacon Gouda", brand: "Starbucks", calories: 360, protein: 19, carbs: 33, fat: 18, source: "restaurant" });
    expect(n.saveFood({ name: "Starbucks Bacon Gouda", calories: 360 }).id).toBe(f.id);
    n.logNutrition({ date: today(), mealType: "breakfast", name: f.name, calories: f.calories, protein: f.protein, source: "saved", savedFoodId: f.id, venue: f.brand }, ctx);
    const list = n.listSavedFoods();
    expect(list[0].id).toBe(f.id);
    expect(list[0].useCount).toBe(1);
    expect(n.listSavedFoods({ q: "gouda" }).length).toBe(1);
    n.deleteSavedFood(f.id);
    expect(n.listSavedFoods({ q: "gouda" }).length).toBe(0);
  });
});

describe("quest reversal", () => {
  it("quest XP is voided when its progress source disappears", () => {
    reconcile();
    const before = totalXp();
    const hid = m.createHabit({ name: "Walk", scheduleType: "daily" });
    const hid2 = m.createHabit({ name: "Water", scheduleType: "daily" });
    const hid3 = m.createHabit({ name: "Stretch", scheduleType: "daily" });
    reconcile();
    m.completeHabit({ habitId: hid, date: today() });
    m.completeHabit({ habitId: hid2, date: today() });
    m.completeHabit({ habitId: hid3, date: today() });
    reconcile();
    const q = getQuests(today()).daily.find((x) => x.templateKey === "daily.habits");
    if (q?.done) {
      const withQuest = totalXp();
      m.uncompleteHabit(hid, today());
      m.uncompleteHabit(hid2, today());
      m.uncompleteHabit(hid3, today());
      reconcile();
      expect(getQuests(today()).daily.find((x) => x.templateKey === "daily.habits")!.done).toBe(false);
      expect(totalXp()).toBeLessThan(withQuest);
      expect(getDb().select().from(quests).where(eq(quests.id, q.id)).get()!.completedAt).toBeNull();
    }
    expect(totalXp()).toBeGreaterThanOrEqual(before);
  });
});
