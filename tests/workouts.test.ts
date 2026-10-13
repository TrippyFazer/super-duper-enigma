/**
 * Workout planner + session tracker: template generation (recovery-aware),
 * session persistence, set logging, finish → fitness log row + XP, PRs,
 * previous-performance lookups, plan caching.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-workouts-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { workouts, aiCache } = await import("@/db/schema");
const { updateProfile, getProfile } = await import("@/services/profile");
const { totalXp } = await import("@/services/xp");
const w = await import("@/services/workouts");
const { generateTemplatePlan, muscleFatigue, chooseFocus } = await import("@/planner/workoutTemplates");
const { DEFAULT_PREFERENCES } = await import("@/services/preferences");
const { generateWorkout } = await import("@/ai/generate");
const { buildAiContext } = await import("@/ai/context");
const { reconcile } = await import("@/services/progression");
const { WorkoutPlanSchema, MealPlanSchema, QuestCandidateSchema } = await import("@/ai/schemas");
const { mockProvider } = await import("@/ai/provider");

const prefs = { ...DEFAULT_PREFERENCES.fitness, daysPerWeek: 4, equipment: ["barbell", "dumbbell", "bodyweight"] as never, workoutLengthMin: 45 };

beforeAll(() => {
  getDb();
  updateProfile({ name: "Lifter", timezone: "UTC", activeDomains: ["fitness", "cooking"], onboardingCompletedAt: new Date().toISOString() });
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("template workout generator", () => {
  it("produces a structured plan that respects equipment and length", () => {
    const plan = generateTemplatePlan({ prefs, recent: [], readiness: 80, hoursSinceLast: null, today: "2026-04-01", seed: 1 });
    expect(plan.exercises.length).toBeGreaterThanOrEqual(3);
    expect(plan.exercises.length).toBeLessThanOrEqual(8);
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(60);
    for (const e of plan.exercises) {
      expect(e.sets).toBeGreaterThanOrEqual(1);
      expect(e.reps).toBeTruthy();
      expect(e.restSeconds).toBeGreaterThanOrEqual(0);
    }
    expect(plan.bonus == null || plan.bonus.xp <= 40).toBe(true);
  });

  it("avoids muscles trained hard in the last 40 hours", () => {
    const recent = [{ date: "2026-04-01", focus: "legs", muscles: ["quads", "hamstrings", "glutes"] as never, hard: true }];
    const fatigued = muscleFatigue(recent, "2026-04-02");
    expect(fatigued.has("quads" as never)).toBe(true);
    const focus = chooseFocus({ prefs, recent, readiness: 85, hoursSinceLast: 20, today: "2026-04-02" });
    expect(["upper", "push", "pull"]).toContain(focus);
    const plan = generateTemplatePlan({ prefs, recent, readiness: 85, hoursSinceLast: 20, today: "2026-04-02", seed: 2 });
    expect(plan.focus).not.toBe("legs");
    expect(plan.focus).not.toBe("lower");
  });

  it("switches to recovery when readiness is low", () => {
    const focus = chooseFocus({ prefs, recent: [], readiness: 45, hoursSinceLast: 30, today: "2026-04-03" });
    expect(focus).toBe("recovery");
    const plan = generateTemplatePlan({ prefs, recent: [], readiness: 45, hoursSinceLast: 30, today: "2026-04-03", seed: 3 });
    expect(plan.focus).toBe("recovery");
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(40);
    expect(plan.exercises.every((e) => !/bench|squat|deadlift|press/i.test(e.name))).toBe(true);
  });

  it("bodyweight-only users still get a full plan", () => {
    const plan = generateTemplatePlan({ prefs: { ...prefs, equipment: ["bodyweight"] as never }, recent: [], readiness: null, hoursSinceLast: null, today: "2026-04-04", seed: 4 });
    expect(plan.exercises.length).toBeGreaterThanOrEqual(3);
  });
});

describe("AI contracts", () => {
  it("rejects malformed workout plans and accepts well-formed ones", async () => {
    const good = { name: "Upper A", focus: "upper", goal: "muscle", estimatedMinutes: 45, rationale: "", exercises: [{ name: "Bench Press", sets: 3, repRange: "8-10", restSeconds: 90 }, { name: "Barbell Row", sets: 3, repRange: "8-10", restSeconds: 90 }], bonusQuest: null };
    await expect(mockProvider([good]).generateJSON({ system: "", user: "" }, WorkoutPlanSchema)).resolves.toMatchObject({ name: "Upper A" });
    const bad = { ...good, exercises: [{ name: "Bench", sets: 99, repRange: "1", restSeconds: 60 }] };
    await expect(mockProvider([bad]).generateJSON({ system: "", user: "" }, WorkoutPlanSchema)).rejects.toThrow();
    await expect(mockProvider(["not json"]).generateJSON({ system: "", user: "" }, WorkoutPlanSchema)).rejects.toThrow();
  });

  it("meal plan + quest candidate schemas enforce bounds", () => {
    const meal = { mealType: "dinner", name: "Chicken rice", calories: 650, protein: 45, carbs: 70, fat: 14, ingredients: ["chicken", "rice"] };
    expect(MealPlanSchema.safeParse({ calorieTarget: 2400, proteinTarget: 150, meals: [meal, { ...meal, mealType: "lunch" }] }).success).toBe(true);
    expect(MealPlanSchema.safeParse({ calorieTarget: 2400, proteinTarget: 150, meals: [{ ...meal, calories: -5 }, meal] }).success).toBe(false);
    expect(MealPlanSchema.safeParse({ calorieTarget: 600, proteinTarget: 150, meals: [meal, meal] }).success).toBe(false); // starvation targets rejected
    expect(QuestCandidateSchema.safeParse({ title: "Walk 20 minutes after lunch", description: "Fresh air.", domain: "fitness", difficulty: "common", kind: "side", estimatedMinutes: 20, xpReward: 25 }).success).toBe(true);
    expect(QuestCandidateSchema.safeParse({ title: "Walk 20 minutes", description: "", domain: "fitness", difficulty: "legendary", kind: "side", estimatedMinutes: 20, xpReward: 25 }).success).toBe(false);
    expect(QuestCandidateSchema.safeParse({ title: "Walk 20 minutes", description: "", domain: "fitness", difficulty: "common", kind: "side", estimatedMinutes: 20, xpReward: 500 }).success).toBe(false);
  });

  it("generateWorkout falls back to templates without a key and caches the result", async () => {
    const profile = getProfile();
    const { assessment } = reconcile();
    const ctx = buildAiContext(profile, profile.preferences, assessment);
    const input = { prefs, recent: [], readiness: null, hoursSinceLast: null, today: profile.today };
    const r1 = await generateWorkout(ctx, input);
    expect(r1.source).toBe("template");
    expect(r1.cached).toBe(false);
    const r2 = await generateWorkout(ctx, input);
    expect(r2.cached).toBe(true);
    expect(r2.plan.name).toBe(r1.plan.name);
    expect(getDb().select().from(aiCache).all().length).toBeGreaterThanOrEqual(1);
    const r3 = await generateWorkout(ctx, input, { force: true });
    expect(r3.cached).toBe(false);
  });
});

describe("workout sessions", () => {
  const today = () => getProfile().today;

  it("saves a plan, starts a session with prefilled sets, logs sets, finishes with XP and a fitness log row", () => {
    const plan = generateTemplatePlan({ prefs, recent: [], readiness: 90, hoursSinceLast: null, today: today(), seed: 11 });
    const saved = w.savePlan(today(), plan, "template");
    expect(w.getPlanForDate(today())!.id).toBe(saved.id);

    const s = w.startSession({ date: today(), planId: saved.id, name: plan.name, focus: plan.focus, exercises: plan.exercises });
    expect(s.status).toBe("active");
    expect(w.getActiveSession()!.id).toBe(s.id);
    expect(s.exercises.length).toBe(plan.exercises.length);
    expect(s.exercises[0].sets.length).toBe(plan.exercises[0].sets);

    const before = totalXp();
    const ex = s.exercises[0];
    for (const set of ex.sets) w.logSet({ sessionExerciseId: ex.id, setIndex: set.setIndex, weight: 60, reps: 8, completed: true });
    const extra = w.addSet(ex.id);
    expect(extra.setIndex).toBe(ex.sets.length);
    w.logSet({ sessionExerciseId: ex.id, setIndex: extra.setIndex, weight: 60, reps: 6, completed: true });

    const fin = w.finishSession(s.id)!;
    expect(fin.session.status).toBe("completed");
    expect(fin.completedSets).toBe(ex.sets.length + 1);
    expect(fin.xp.some((x) => x.key.startsWith("workout:"))).toBe(true);
    expect(fin.xp.some((x) => x.key.startsWith("workout_session:"))).toBe(true);
    expect(totalXp()).toBeGreaterThan(before);
    // The first record for a lift is a baseline, not a PR.
    expect(fin.prs.length).toBe(0);
    expect(w.listPersonalRecords().some((p) => p.exerciseSlug === ex.slug && p.kind === "weight" && p.value === 60)).toBe(true);
    const log = getDb().select().from(workouts).all();
    expect(log.length).toBe(1);
    expect(log[0].source).toBe("session");
    expect(w.getPlanForDate(today())!.status).toBe("completed");
    expect(w.getActiveSession()).toBeNull();
  });

  it("surfaces previous performance and awards PR XP when a lift improves", () => {
    const first = w.listSessions(1)[0];
    const prevEx = w.getSession(first.id)!.exercises[0];
    const prev = w.previousPerformance(prevEx.slug);
    expect(prev).not.toBeNull();
    expect(prev![0].weight).toBe(60);

    const s = w.startSession({ date: today(), name: "Manual", focus: "upper", exercises: [{ slug: prevEx.slug, name: prevEx.name, sets: 2, reps: "5", restSeconds: 120, muscles: [] }] });
    const ex = s.exercises[0];
    expect(ex.previous).not.toBeNull();
    // Sets come prefilled from last time
    expect(ex.sets[0].weight).toBe(60);
    const before = totalXp();
    w.logSet({ sessionExerciseId: ex.id, setIndex: 0, weight: 70, reps: 5, completed: true });
    w.logSet({ sessionExerciseId: ex.id, setIndex: 1, weight: 70, reps: 5, completed: true });
    const fin = w.finishSession(s.id)!;
    expect(fin.prs.some((p) => p.kind === "weight" && p.value === 70)).toBe(true);
    expect(fin.prs.some((p) => p.kind === "e1rm")).toBe(true);
    expect(fin.xp.filter((x) => x.key.startsWith("personal_record:")).length).toBe(2);
    expect(totalXp()).toBeGreaterThan(before + 50);
    expect(w.listPersonalRecords().find((p) => p.exerciseSlug === ex.slug && p.kind === "weight")!.value).toBe(70);
  });

  it("supports skip / replace / remove / add and abandons a session with no completed sets", () => {
    const s = w.startSession({ date: today(), name: "Edit test", focus: "full", exercises: [{ slug: "goblet-squat", name: "Goblet Squat", sets: 3, reps: "10", restSeconds: 60, muscles: [] }, { slug: "push-up", name: "Push-Up", sets: 3, reps: "12", restSeconds: 60, muscles: [] }] });
    const [a, b] = s.exercises;
    w.skipExercise(a.id);
    expect(w.getSession(s.id)!.exercises[0].status).toBe("skipped");
    const replaced = w.replaceExercise(b.id, "dumbbell bench press");
    expect(replaced).not.toBeNull();
    expect(w.getSession(s.id)!.exercises.find((e) => e.id === b.id)!.slug).not.toBe("push-up");
    const added = w.addExerciseToSession(s.id, { name: "Plank" });
    expect(w.getSession(s.id)!.exercises.some((e) => e.id === added.id)).toBe(true);
    w.removeExercise(added.id);
    expect(w.getSession(s.id)!.exercises.some((e) => e.id === added.id)).toBe(false);
    const before = totalXp();
    const fin = w.finishSession(s.id)!;
    expect(fin.session.status).toBe("cancelled");
    expect(fin.xp.length).toBe(0);
    expect(totalXp()).toBe(before);
    expect(getDb().select().from(workouts).all().length).toBe(2);
  });

  it("strength progress feeds the ranking input", () => {
    const sp = w.strengthProgress(today());
    expect(sp.trackedLifts).toBeGreaterThanOrEqual(1);
    expect(sp.prs60).toBeGreaterThanOrEqual(1);
  });

  it("history lists sessions with volume", () => {
    const hist = w.listSessions(10);
    expect(hist.length).toBe(3);
    const done = hist.filter((h) => h.status === "completed");
    expect(done.every((h) => h.volume > 0 && h.setCount > 0)).toBe(true);
  });
});
