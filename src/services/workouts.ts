import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exerciseSets, personalRecords, sessionExercises, workoutPlans, workoutSessions, workouts, type ExerciseSet, type PersonalRecord, type SessionExercise, type WorkoutPlan, type WorkoutSession } from "@/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import { estimate1RM, findExercise, slugify, type MuscleGroup } from "@/planner/exercises";
import { focusMuscles, type GeneratedPlan, type PlanExercise, type RecentSessionSummary } from "@/planner/workoutTemplates";
import { PR_XP } from "@/ranking/xp";
import { recordEvent } from "./events";
import { awardXp, type XpAward } from "./xp";

// ---------------------------------------------------------------- plans ----
export function getPlanForDate(date: ISODate): (WorkoutPlan & { exercisesParsed: PlanExercise[]; bonusParsed: GeneratedPlan["bonus"] }) | null {
  const row = getDb().select().from(workoutPlans).where(eq(workoutPlans.date, date)).orderBy(desc(workoutPlans.id)).get();
  return row ? parsePlan(row) : null;
}

export function parsePlan(row: WorkoutPlan) {
  return { ...row, exercisesParsed: parseJson<PlanExercise[]>(row.exercises, []), bonusParsed: parseJson<GeneratedPlan["bonus"]>(row.bonus, null) };
}

export function savePlan(date: ISODate, plan: GeneratedPlan, source: "template" | "ai"): WorkoutPlan {
  const db = getDb();
  // Replace any un-started plan for the day.
  const existing = db.select().from(workoutPlans).where(eq(workoutPlans.date, date)).all();
  for (const e of existing) if (e.status === "planned" || e.status === "skipped") db.delete(workoutPlans).where(eq(workoutPlans.id, e.id)).run();
  return db
    .insert(workoutPlans)
    .values({
      date,
      name: plan.name,
      focus: plan.focus,
      goal: plan.goal,
      estimatedMinutes: plan.estimatedMinutes,
      source,
      exercises: toJson(plan.exercises),
      bonus: plan.bonus ? toJson(plan.bonus) : null,
      notes: plan.rationale,
      status: "planned",
    })
    .returning()
    .get();
}

export function skipPlan(id: number) {
  getDb().update(workoutPlans).set({ status: "skipped" }).where(eq(workoutPlans.id, id)).run();
}

// ------------------------------------------------------------- sessions ----
export interface SessionView extends WorkoutSession {
  exercises: (SessionExercise & { sets: ExerciseSet[]; previous: { weight: number | null; reps: number | null }[] | null; muscles: MuscleGroup[] })[];
}

export function getActiveSession(): SessionView | null {
  const row = getDb().select().from(workoutSessions).where(eq(workoutSessions.status, "active")).orderBy(desc(workoutSessions.id)).get();
  return row ? getSession(row.id) : null;
}

export function getSession(id: number): SessionView | null {
  const db = getDb();
  const row = db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get();
  if (!row) return null;
  const exs = db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, id)).orderBy(sessionExercises.orderIndex, sessionExercises.id).all();
  const exercises = exs.map((e) => ({
    ...e,
    sets: db.select().from(exerciseSets).where(eq(exerciseSets.sessionExerciseId, e.id)).orderBy(exerciseSets.setIndex).all(),
    previous: previousPerformance(e.slug, id),
    muscles: findExercise(e.slug)?.muscles ?? [],
  }));
  return { ...row, exercises };
}

/** Sets from the most recent completed session containing this exercise (excluding the current one). */
export function previousPerformance(slug: string, excludeSessionId?: number): { weight: number | null; reps: number | null }[] | null {
  const db = getDb();
  const candidates = db
    .select({ seId: sessionExercises.id, sessionId: sessionExercises.sessionId })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(and(eq(sessionExercises.slug, slug), eq(workoutSessions.status, "completed")))
    .orderBy(desc(workoutSessions.id))
    .all()
    .filter((c) => c.sessionId !== excludeSessionId);
  for (const c of candidates) {
    const sets = db.select().from(exerciseSets).where(and(eq(exerciseSets.sessionExerciseId, c.seId), eq(exerciseSets.completed, true))).orderBy(exerciseSets.setIndex).all();
    if (sets.length) return sets.map((s) => ({ weight: s.weight, reps: s.reps }));
  }
  return null;
}

export function startSession(input: { date: ISODate; planId?: number | null; name?: string; focus?: string; exercises?: PlanExercise[] }): SessionView {
  const db = getDb();
  const active = getActiveSession();
  if (active) return active;
  let name = input.name ?? "Workout";
  let focus = input.focus ?? "full";
  let exercises = input.exercises ?? [];
  if (input.planId) {
    const plan = db.select().from(workoutPlans).where(eq(workoutPlans.id, input.planId)).get();
    if (plan) {
      name = plan.name;
      focus = plan.focus;
      exercises = parseJson<PlanExercise[]>(plan.exercises, []);
      db.update(workoutPlans).set({ status: "started" }).where(eq(workoutPlans.id, plan.id)).run();
    }
  }
  const s = db.insert(workoutSessions).values({ planId: input.planId ?? null, date: input.date, name, focus, status: "active" }).returning().get();
  exercises.forEach((e, i) => addExerciseToSession(s.id, e, i));
  return getSession(s.id)!;
}

export function addExerciseToSession(sessionId: number, e: Partial<PlanExercise> & { name: string }, orderIndex?: number): SessionExercise {
  const db = getDb();
  const def = findExercise(e.slug ?? e.name);
  const slug = def?.slug ?? slugify(e.name);
  const idx = orderIndex ?? (db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId)).all().length);
  const row = db
    .insert(sessionExercises)
    .values({ sessionId, slug, name: def?.name ?? e.name, orderIndex: idx, targetSets: e.sets ?? def?.sets ?? 3, targetReps: e.reps ?? def?.reps ?? "8-12", restSeconds: e.restSeconds ?? def?.rest ?? 90, notes: e.notes ?? null })
    .returning()
    .get();
  // Pre-create empty sets so the UI can show the grid immediately, prefilled from last time.
  const prev = previousPerformance(slug, sessionId);
  for (let i = 0; i < row.targetSets; i++) {
    db.insert(exerciseSets).values({ sessionExerciseId: row.id, setIndex: i, weight: prev?.[i]?.weight ?? prev?.[prev.length - 1]?.weight ?? null, reps: null, completed: false }).onConflictDoNothing().run();
  }
  return row;
}

export function replaceExercise(sessionExerciseId: number, newNameOrSlug: string): SessionExercise | null {
  const db = getDb();
  const cur = db.select().from(sessionExercises).where(eq(sessionExercises.id, sessionExerciseId)).get();
  if (!cur) return null;
  const def = findExercise(newNameOrSlug);
  const slug = def?.slug ?? slugify(newNameOrSlug);
  db.update(sessionExercises).set({ slug, name: def?.name ?? newNameOrSlug, status: "pending", targetReps: def?.reps ?? cur.targetReps, restSeconds: def?.rest ?? cur.restSeconds }).where(eq(sessionExercises.id, sessionExerciseId)).run();
  db.delete(exerciseSets).where(eq(exerciseSets.sessionExerciseId, sessionExerciseId)).run();
  const prev = previousPerformance(slug, cur.sessionId);
  for (let i = 0; i < cur.targetSets; i++) db.insert(exerciseSets).values({ sessionExerciseId, setIndex: i, weight: prev?.[i]?.weight ?? null, reps: null, completed: false }).run();
  return db.select().from(sessionExercises).where(eq(sessionExercises.id, sessionExerciseId)).get() ?? null;
}

export function skipExercise(sessionExerciseId: number, skipped = true) {
  getDb().update(sessionExercises).set({ status: skipped ? "skipped" : "pending" }).where(eq(sessionExercises.id, sessionExerciseId)).run();
}

export function removeExercise(sessionExerciseId: number) {
  getDb().delete(sessionExercises).where(eq(sessionExercises.id, sessionExerciseId)).run();
}

export function logSet(input: { sessionExerciseId: number; setIndex: number; weight?: number | null; reps?: number | null; durationSec?: number | null; completed: boolean }): ExerciseSet {
  const db = getDb();
  const values = { weight: input.weight ?? null, reps: input.reps ?? null, durationSec: input.durationSec ?? null, completed: input.completed, completedAt: input.completed ? new Date().toISOString() : null };
  db.insert(exerciseSets)
    .values({ sessionExerciseId: input.sessionExerciseId, setIndex: input.setIndex, ...values })
    .onConflictDoUpdate({ target: [exerciseSets.sessionExerciseId, exerciseSets.setIndex], set: values })
    .run();
  const ex = db.select().from(sessionExercises).where(eq(sessionExercises.id, input.sessionExerciseId)).get();
  if (ex) {
    const sets = db.select().from(exerciseSets).where(eq(exerciseSets.sessionExerciseId, ex.id)).all();
    const done = sets.filter((s) => s.completed).length;
    db.update(sessionExercises).set({ status: done >= ex.targetSets ? "done" : "pending" }).where(eq(sessionExercises.id, ex.id)).run();
  }
  return db.select().from(exerciseSets).where(and(eq(exerciseSets.sessionExerciseId, input.sessionExerciseId), eq(exerciseSets.setIndex, input.setIndex))).get()!;
}

export function addSet(sessionExerciseId: number): ExerciseSet {
  const db = getDb();
  const sets = db.select().from(exerciseSets).where(eq(exerciseSets.sessionExerciseId, sessionExerciseId)).orderBy(desc(exerciseSets.setIndex)).all();
  const next = (sets[0]?.setIndex ?? -1) + 1;
  db.update(sessionExercises).set({ targetSets: next + 1 }).where(eq(sessionExercises.id, sessionExerciseId)).run();
  return db.insert(exerciseSets).values({ sessionExerciseId, setIndex: next, weight: sets[0]?.weight ?? null, reps: null, completed: false }).returning().get();
}

export interface FinishResult {
  session: WorkoutSession;
  xp: XpAward[];
  prs: { exerciseName: string; kind: string; value: number; weight: number | null; reps: number | null; xp: number }[];
  completedSets: number;
}

/**
 * Finish the session: creates the fitness log row (so ranking sees it),
 * awards XP, detects PRs. Abandoned sessions with no completed sets log nothing.
 */
export function finishSession(id: number, opts: { notes?: string | null; intensity?: number } = {}): FinishResult | null {
  const db = getDb();
  const s = getSession(id);
  if (!s || s.status !== "active") return null;
  const completedSets = s.exercises.flatMap((e) => e.sets).filter((x) => x.completed).length;
  const now = new Date();
  const durationMin = Math.max(5, Math.min(240, Math.round((now.getTime() - new Date(s.startedAt).getTime()) / 60000)));

  if (completedSets === 0) {
    db.update(workoutSessions).set({ status: "abandoned", finishedAt: now.toISOString(), durationMin, notes: opts.notes ?? null }).where(eq(workoutSessions.id, id)).run();
    if (s.planId) db.update(workoutPlans).set({ status: "planned" }).where(eq(workoutPlans.id, s.planId)).run();
    return { session: { ...s, status: "abandoned" }, xp: [], prs: [], completedSets: 0 };
  }

  const isCardio = s.focus === "conditioning" || s.focus === "recovery";
  const w = db
    .insert(workouts)
    .values({ date: s.date, type: isCardio ? (s.focus === "recovery" ? "mobility" : "cardio") : "strength", durationMin, intensity: opts.intensity ?? (s.focus === "recovery" ? 1 : 2), notes: opts.notes ?? `${s.name} · ${completedSets} sets`, source: "session" })
    .returning({ id: workouts.id })
    .get();
  db.update(workoutSessions).set({ status: "completed", finishedAt: now.toISOString(), durationMin, notes: opts.notes ?? null, workoutId: w.id }).where(eq(workoutSessions.id, id)).run();
  if (s.planId) db.update(workoutPlans).set({ status: "completed" }).where(eq(workoutPlans.id, s.planId)).run();

  const xp: XpAward[] = [];
  const push = (a: XpAward) => a.awarded && xp.push(a);
  push(awardXp("workout", s.date, { suffix: `s${w.id}` }));
  if (durationMin >= 45) push(awardXp("workout_long", s.date));
  push(awardXp("workout_session", s.date));

  // Personal records (weight-based exercises only, reps 1–12 to avoid rewarding junk).
  const prs: FinishResult["prs"] = [];
  for (const ex of s.exercises) {
    const def = findExercise(ex.slug);
    if (def && (def.type === "cardio" || def.type === "mobility")) continue;
    for (const set of ex.sets) {
      if (!set.completed || !set.weight || !set.reps || set.reps < 1 || set.reps > 12) continue;
      for (const kind of ["weight", "e1rm"] as const) {
        const value = kind === "weight" ? set.weight : estimate1RM(set.weight, set.reps);
        const cur = db.select().from(personalRecords).where(and(eq(personalRecords.exerciseSlug, ex.slug), eq(personalRecords.kind, kind))).get();
        if (!cur || value > cur.value + 0.01) {
          const existedBefore = !!cur;
          db.insert(personalRecords)
            .values({ exerciseSlug: ex.slug, exerciseName: ex.name, kind, value, weight: set.weight, reps: set.reps, date: s.date, sessionId: id })
            .onConflictDoUpdate({ target: [personalRecords.exerciseSlug, personalRecords.kind], set: { value, weight: set.weight, reps: set.reps, date: s.date, sessionId: id, exerciseName: ex.name } })
            .run();
          // The first-ever record for a movement is a baseline, not a PR.
          if (existedBefore && !prs.some((p) => p.exerciseName === ex.name && p.kind === kind)) {
            const a = awardXp("personal_record", s.date, { suffix: `${ex.slug}:${kind}`, amount: PR_XP[kind] ?? 40, description: `PR: ${ex.name} ${kind === "weight" ? `${set.weight}×${set.reps}` : `e1RM ${value}`}` });
            prs.push({ exerciseName: ex.name, kind, value, weight: set.weight, reps: set.reps, xp: a.awarded ? a.amount : 0 });
            if (a.awarded) xp.push(a);
            recordEvent({ type: "milestone", key: `pr:${ex.slug}:${kind}:${s.date}`, title: `New personal record: ${ex.name}`, description: kind === "weight" ? `${set.weight} × ${set.reps}` : `Estimated 1RM ${value}`, domain: "fitness" });
          }
        }
      }
    }
  }
  return { session: db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get()!, xp, prs, completedSets };
}

export function abandonSession(id: number) {
  const db = getDb();
  const s = db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get();
  if (!s) return;
  db.update(workoutSessions).set({ status: "abandoned", finishedAt: new Date().toISOString() }).where(eq(workoutSessions.id, id)).run();
  if (s.planId) db.update(workoutPlans).set({ status: "planned" }).where(eq(workoutPlans.id, s.planId)).run();
}

// ------------------------------------------------------------- history ----
export function recentSessions(days = 7, today: ISODate): RecentSessionSummary[] {
  const db = getDb();
  const rows = db.select().from(workoutSessions).where(and(gte(workoutSessions.date, addDays(today, -days)), inArray(workoutSessions.status, ["completed"]))).orderBy(desc(workoutSessions.date), desc(workoutSessions.id)).all();
  return rows.map((r) => {
    const exs = db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, r.id)).all();
    const muscles = new Set<MuscleGroup>();
    for (const e of exs) for (const m of findExercise(e.slug)?.muscles ?? []) muscles.add(m);
    if (muscles.size === 0) for (const m of focusMuscles(r.focus)) muscles.add(m);
    const sets = exs.flatMap((e) => db.select().from(exerciseSets).where(and(eq(exerciseSets.sessionExerciseId, e.id), eq(exerciseSets.completed, true))).all());
    return { date: r.date, focus: r.focus, muscles: [...muscles], hard: sets.length >= 8 || r.focus === "legs" || r.focus === "lower" };
  });
}

export function listSessions(limit = 30): (WorkoutSession & { exerciseCount: number; setCount: number; volume: number })[] {
  const db = getDb();
  return db
    .select()
    .from(workoutSessions)
    .where(inArray(workoutSessions.status, ["completed", "abandoned"]))
    .orderBy(desc(workoutSessions.id))
    .limit(limit)
    .all()
    .map((r) => {
      const exs = db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, r.id)).all();
      const sets = exs.flatMap((e) => db.select().from(exerciseSets).where(and(eq(exerciseSets.sessionExerciseId, e.id), eq(exerciseSets.completed, true))).all());
      return { ...r, exerciseCount: exs.length, setCount: sets.length, volume: Math.round(sets.reduce((a, s) => a + (s.weight ?? 0) * (s.reps ?? 0), 0)) };
    });
}

export function listPersonalRecords(): PersonalRecord[] {
  return getDb().select().from(personalRecords).orderBy(desc(personalRecords.date)).all();
}

/** Strength progress signal for the fitness ranking: PRs in the last 60 days and e1RM trend. */
export function strengthProgress(today: ISODate): { prs60: number; trackedLifts: number; improvingLifts: number } {
  const db = getDb();
  const recs = db.select().from(personalRecords).where(eq(personalRecords.kind, "e1rm")).all();
  const prs60 = recs.filter((r) => r.date >= addDays(today, -60)).length;
  // Improving = e1RM record set in the last 60 days for a lift that also had sets 60+ days ago.
  let improving = 0;
  for (const r of recs) {
    const older = db
      .select({ id: sessionExercises.id })
      .from(sessionExercises)
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(and(eq(sessionExercises.slug, r.exerciseSlug), eq(workoutSessions.status, "completed")))
      .all();
    if (older.length >= 3 && r.date >= addDays(today, -60)) improving++;
  }
  return { prs60, trackedLifts: recs.length, improvingLifts: improving };
}
