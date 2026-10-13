import { EXERCISES, EXERCISE_MAP, type Equipment, type ExerciseDef, type MuscleGroup } from "./exercises";
import type { FitnessPrefs } from "@/services/preferences";

/**
 * Template workout generator — the no-AI fallback and the validator's
 * reference for AI plans. Picks a focus from a rotation, respects equipment,
 * avoids muscle groups trained hard in the last 48 h, and scales volume to
 * the preferred length and to recovery signals.
 */
export type Focus = "upper" | "lower" | "full" | "push" | "pull" | "legs" | "conditioning" | "recovery";

export interface PlanExercise {
  slug: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes?: string;
  muscles?: MuscleGroup[];
}

export interface GeneratedPlan {
  name: string;
  focus: Focus;
  goal: string;
  estimatedMinutes: number;
  exercises: PlanExercise[];
  bonus?: { title: string; description: string; xp: number; minutes: number } | null;
  rationale: string;
}

export interface RecentSessionSummary {
  date: string;
  focus: string;
  muscles: MuscleGroup[];
  hard: boolean;
}

export interface GenerateInput {
  prefs: FitnessPrefs;
  recent: RecentSessionSummary[]; // last 7 days, newest first
  /** Oura readiness 0-100 or null */
  readiness: number | null;
  /** Hours since the last session (null if none) */
  hoursSinceLast: number | null;
  today: string;
  seed?: number;
}

const ROTATIONS: Record<number, Focus[]> = {
  1: ["full"],
  2: ["full", "full"],
  3: ["full", "full", "full"],
  4: ["upper", "lower", "upper", "lower"],
  5: ["push", "pull", "legs", "upper", "lower"],
  6: ["push", "pull", "legs", "push", "pull", "legs"],
  7: ["push", "pull", "legs", "push", "pull", "legs", "conditioning"],
};

const FOCUS_MUSCLES: Record<Focus, MuscleGroup[]> = {
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes", "calves", "core"],
  full: ["quads", "chest", "back", "shoulders", "hamstrings", "core"],
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps", "shoulders"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
  conditioning: ["cardio", "core"],
  recovery: ["full", "cardio"],
};

const FOCUS_NAMES: Record<Focus, string> = {
  upper: "Upper Body",
  lower: "Lower Body",
  full: "Full Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  conditioning: "Conditioning",
  recovery: "Recovery Session",
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function muscleFatigue(recent: RecentSessionSummary[], now: string): Set<MuscleGroup> {
  const tired = new Set<MuscleGroup>();
  const nowT = new Date(now + "T12:00:00Z").getTime();
  for (const s of recent) {
    const age = (nowT - new Date(s.date + "T12:00:00Z").getTime()) / 36e5;
    if (age < 40 && s.hard) for (const m of s.muscles) tired.add(m);
  }
  return tired;
}

/** Choose today's focus from the rotation, skipping focuses whose muscles are fatigued. */
export function chooseFocus(input: GenerateInput): Focus {
  const days = Math.min(7, Math.max(1, input.prefs.daysPerWeek || 3));
  const rotation = ROTATIONS[days] ?? ROTATIONS[3];
  const last = input.recent[0];
  if (input.readiness != null && input.readiness < 60) return "recovery";
  if (input.prefs.goal === "conditioning" && input.recent.filter((r) => r.focus === "conditioning").length === 0 && input.recent.length >= 2) return "conditioning";
  const tired = muscleFatigue(input.recent, input.today);
  const idx = last ? rotation.indexOf(last.focus as Focus) : -1;
  const order = [...rotation.slice(idx + 1), ...rotation.slice(0, idx + 1)];
  for (const f of order) {
    const overlap = FOCUS_MUSCLES[f].filter((m) => tired.has(m)).length;
    if (overlap <= 1) return f;
  }
  return "full";
}

function available(e: ExerciseDef, equipment: Equipment[]): boolean {
  if (equipment.length === 0) return e.equipment.includes("bodyweight");
  return e.equipment.some((eq) => equipment.includes(eq));
}

function pick(pool: ExerciseDef[], used: Set<string>, rand: () => number): ExerciseDef | null {
  const options = pool.filter((e) => !used.has(e.slug));
  if (!options.length) return null;
  const e = options[Math.floor(rand() * options.length)];
  used.add(e.slug);
  return e;
}

export function generateTemplatePlan(input: GenerateInput): GeneratedPlan {
  const rand = rng(input.seed ?? Number(input.today.replace(/-/g, "")));
  const focus = chooseFocus(input);
  const equipment: Equipment[] = input.prefs.equipment.length ? input.prefs.equipment : ["bodyweight"];
  const length = input.prefs.workoutLengthMin || 45;
  const strengthBias = input.prefs.goal === "strength";
  const used = new Set<string>();
  const out: PlanExercise[] = [];
  const minutesPer = (e: ExerciseDef, sets: number) => (e.type === "cardio" ? 15 : e.type === "mobility" ? 10 : sets * ((e.rest + 45) / 60));

  const add = (e: ExerciseDef | null, override?: Partial<PlanExercise>) => {
    if (!e) return;
    let sets = e.sets;
    let reps = e.reps;
    if (strengthBias && e.type === "compound") {
      sets = Math.max(sets, 4);
      reps = "4-6";
    }
    if (input.prefs.goal === "muscle" && e.type === "compound") reps = "8-12";
    if (input.prefs.experience === "beginner" && sets > 3) sets = 3;
    out.push({ slug: e.slug, name: e.name, sets, reps, restSeconds: e.rest, muscles: e.muscles, ...override });
  };

  const byMuscle = (m: MuscleGroup, type?: ExerciseDef["type"]) => EXERCISES.filter((e) => e.muscles[0] === m && (!type || e.type === type) && available(e, equipment));
  const tired = muscleFatigue(input.recent, input.today);

  if (focus === "recovery") {
    add(EXERCISE_MAP.get("brisk-walk") ?? null, { reps: "20-30 min", notes: "Easy pace. Conversation should be comfortable." });
    add(EXERCISE_MAP.get("mobility-flow") ?? null, { reps: "10 min" });
    add(EXERCISE_MAP.get("hip-mobility") ?? null);
    return {
      name: "Recovery Session",
      focus,
      goal: input.prefs.goal,
      estimatedMinutes: 40,
      exercises: out,
      bonus: null,
      rationale: input.readiness != null && input.readiness < 60 ? `Readiness is ${input.readiness} today, so this is a deliberately light day: walking and mobility, no heavy loading.` : "A light day to let the body catch up.",
    };
  }

  if (focus === "conditioning") {
    const cardio = EXERCISES.filter((e) => e.type === "cardio" && available(e, equipment));
    add(pick(cardio, used, rand), { notes: "Main conditioning block" });
    add(pick(EXERCISES.filter((e) => e.slug === "kettlebell-swing" && available(e, equipment)), used, rand));
    add(pick(byMuscle("core"), used, rand));
    add(pick(cardio, used, rand), { reps: "10 min easy", notes: "Cool-down" });
  } else {
    // Compound-first structure: 2-3 compounds, then 2-3 accessories, then core/cardio finisher.
    const plan: MuscleGroup[] = FOCUS_MUSCLES[focus].filter((m) => !tired.has(m));
    const compounds: MuscleGroup[] = plan.filter((m) => ["chest", "back", "quads", "hamstrings", "shoulders", "glutes"].includes(m)).slice(0, focus === "full" ? 3 : 3);
    for (const m of compounds) add(pick(byMuscle(m, "compound"), used, rand));
    const accessories = plan.filter((m) => !compounds.includes(m) || ["shoulders", "chest", "back"].includes(m));
    for (const m of accessories) {
      if (out.length >= 6) break;
      add(pick(byMuscle(m, "isolation").length ? byMuscle(m, "isolation") : byMuscle(m), used, rand));
    }
    if (!out.some((e) => e.muscles?.includes("core")) && out.length < 6) add(pick(byMuscle("core"), used, rand));
  }

  // Trim to the preferred length.
  let minutes = 8; // warm-up
  const trimmed: PlanExercise[] = [];
  for (const e of out) {
    const def = EXERCISE_MAP.get(e.slug)!;
    const m = minutesPer(def, e.sets);
    if (minutes + m > length + 6 && trimmed.length >= 3) break;
    minutes += m;
    trimmed.push(e);
  }

  const bonusMinutes = Math.max(0, Math.min(15, length - minutes));
  const bonus = bonusMinutes >= 8 && focus !== "conditioning" ? { title: `${bonusMinutes}-minute incline walk after training`, description: "Easy cardio finisher. Walk out the session.", xp: 30, minutes: bonusMinutes } : null;

  return {
    name: FOCUS_NAMES[focus],
    focus,
    goal: input.prefs.goal,
    estimatedMinutes: Math.round(minutes),
    exercises: trimmed,
    bonus,
    rationale:
      tired.size > 0
        ? `${FOCUS_NAMES[focus]} today — ${[...tired].slice(0, 3).join(", ")} trained hard recently, so they're left alone.`
        : `${FOCUS_NAMES[focus]} today, next in your ${input.prefs.daysPerWeek}-day rotation.`,
  };
}

export function focusMuscles(focus: string): MuscleGroup[] {
  return FOCUS_MUSCLES[focus as Focus] ?? FOCUS_MUSCLES.full;
}
