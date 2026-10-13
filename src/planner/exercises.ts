/**
 * Exercise catalog used by the template workout generator and to normalise
 * AI-generated plans (slugs, muscle groups, equipment) so recovery logic and
 * personal records work regardless of who wrote the plan.
 */
export type MuscleGroup = "chest" | "back" | "shoulders" | "biceps" | "triceps" | "quads" | "hamstrings" | "glutes" | "calves" | "core" | "full" | "cardio";
export type Equipment = "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight" | "kettlebell" | "band" | "cardio-machine";
export type ExerciseType = "compound" | "isolation" | "cardio" | "mobility";

export interface ExerciseDef {
  slug: string;
  name: string;
  muscles: MuscleGroup[];
  equipment: Equipment[];
  type: ExerciseType;
  /** Default prescription */
  sets: number;
  reps: string;
  rest: number;
  /** Alternatives with the same movement pattern, for "replace exercise". */
  alternatives?: string[];
}

export const EXERCISES: ExerciseDef[] = [
  // Chest
  { slug: "barbell-bench-press", name: "Barbell Bench Press", muscles: ["chest", "triceps", "shoulders"], equipment: ["barbell"], type: "compound", sets: 4, reps: "5-8", rest: 150, alternatives: ["dumbbell-bench-press", "machine-chest-press", "push-up"] },
  { slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", muscles: ["chest", "triceps", "shoulders"], equipment: ["dumbbell"], type: "compound", sets: 3, reps: "8-12", rest: 120, alternatives: ["barbell-bench-press", "push-up", "machine-chest-press"] },
  { slug: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscles: ["chest", "shoulders", "triceps"], equipment: ["dumbbell"], type: "compound", sets: 3, reps: "8-10", rest: 120, alternatives: ["dumbbell-bench-press", "incline-push-up"] },
  { slug: "machine-chest-press", name: "Machine Chest Press", muscles: ["chest", "triceps"], equipment: ["machine"], type: "compound", sets: 3, reps: "10-12", rest: 90, alternatives: ["dumbbell-bench-press", "push-up"] },
  { slug: "push-up", name: "Push-Up", muscles: ["chest", "triceps", "core"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "10-20", rest: 75, alternatives: ["dumbbell-bench-press", "incline-push-up"] },
  { slug: "incline-push-up", name: "Incline Push-Up", muscles: ["chest", "triceps"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "12-20", rest: 60, alternatives: ["push-up"] },
  { slug: "cable-fly", name: "Cable Fly", muscles: ["chest"], equipment: ["cable"], type: "isolation", sets: 3, reps: "12-15", rest: 60, alternatives: ["dumbbell-fly", "push-up"] },
  { slug: "dumbbell-fly", name: "Dumbbell Fly", muscles: ["chest"], equipment: ["dumbbell"], type: "isolation", sets: 3, reps: "12-15", rest: 60, alternatives: ["cable-fly"] },
  // Back
  { slug: "deadlift", name: "Deadlift", muscles: ["back", "hamstrings", "glutes"], equipment: ["barbell"], type: "compound", sets: 3, reps: "3-6", rest: 180, alternatives: ["romanian-deadlift", "kettlebell-swing"] },
  { slug: "romanian-deadlift", name: "Romanian Deadlift", muscles: ["hamstrings", "glutes", "back"], equipment: ["barbell", "dumbbell"], type: "compound", sets: 3, reps: "8-10", rest: 120, alternatives: ["deadlift", "leg-curl", "kettlebell-swing"] },
  { slug: "pull-up", name: "Pull-Up", muscles: ["back", "biceps"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "5-10", rest: 120, alternatives: ["lat-pulldown", "inverted-row"] },
  { slug: "lat-pulldown", name: "Lat Pulldown", muscles: ["back", "biceps"], equipment: ["cable", "machine"], type: "compound", sets: 3, reps: "8-12", rest: 90, alternatives: ["pull-up", "band-pulldown"] },
  { slug: "barbell-row", name: "Barbell Row", muscles: ["back", "biceps"], equipment: ["barbell"], type: "compound", sets: 3, reps: "6-10", rest: 120, alternatives: ["dumbbell-row", "cable-row"] },
  { slug: "dumbbell-row", name: "Dumbbell Row", muscles: ["back", "biceps"], equipment: ["dumbbell"], type: "compound", sets: 3, reps: "8-12", rest: 90, alternatives: ["cable-row", "barbell-row", "inverted-row"] },
  { slug: "cable-row", name: "Seated Cable Row", muscles: ["back", "biceps"], equipment: ["cable", "machine"], type: "compound", sets: 3, reps: "10-12", rest: 90, alternatives: ["dumbbell-row", "inverted-row"] },
  { slug: "inverted-row", name: "Inverted Row", muscles: ["back", "biceps"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "8-15", rest: 75, alternatives: ["dumbbell-row", "band-row"] },
  { slug: "band-row", name: "Band Row", muscles: ["back", "biceps"], equipment: ["band"], type: "compound", sets: 3, reps: "12-20", rest: 60, alternatives: ["inverted-row"] },
  { slug: "band-pulldown", name: "Band Pulldown", muscles: ["back"], equipment: ["band"], type: "compound", sets: 3, reps: "12-20", rest: 60, alternatives: ["lat-pulldown"] },
  { slug: "face-pull", name: "Face Pull", muscles: ["shoulders", "back"], equipment: ["cable", "band"], type: "isolation", sets: 3, reps: "12-20", rest: 60, alternatives: ["rear-delt-fly"] },
  // Shoulders
  { slug: "overhead-press", name: "Overhead Press", muscles: ["shoulders", "triceps"], equipment: ["barbell"], type: "compound", sets: 3, reps: "5-8", rest: 150, alternatives: ["seated-dumbbell-press", "pike-push-up"] },
  { slug: "seated-dumbbell-press", name: "Seated Dumbbell Shoulder Press", muscles: ["shoulders", "triceps"], equipment: ["dumbbell"], type: "compound", sets: 3, reps: "8-10", rest: 120, alternatives: ["overhead-press", "machine-shoulder-press", "pike-push-up"] },
  { slug: "machine-shoulder-press", name: "Machine Shoulder Press", muscles: ["shoulders", "triceps"], equipment: ["machine"], type: "compound", sets: 3, reps: "10-12", rest: 90, alternatives: ["seated-dumbbell-press"] },
  { slug: "pike-push-up", name: "Pike Push-Up", muscles: ["shoulders", "triceps"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "8-15", rest: 75, alternatives: ["seated-dumbbell-press"] },
  { slug: "lateral-raise", name: "Lateral Raise", muscles: ["shoulders"], equipment: ["dumbbell", "cable", "band"], type: "isolation", sets: 3, reps: "12-15", rest: 60, alternatives: ["face-pull"] },
  { slug: "rear-delt-fly", name: "Rear Delt Fly", muscles: ["shoulders", "back"], equipment: ["dumbbell", "cable", "machine"], type: "isolation", sets: 3, reps: "12-15", rest: 60, alternatives: ["face-pull"] },
  // Arms
  { slug: "dumbbell-curl", name: "Dumbbell Curl", muscles: ["biceps"], equipment: ["dumbbell"], type: "isolation", sets: 3, reps: "10-12", rest: 60, alternatives: ["cable-curl", "band-curl"] },
  { slug: "cable-curl", name: "Cable Curl", muscles: ["biceps"], equipment: ["cable"], type: "isolation", sets: 3, reps: "10-15", rest: 60, alternatives: ["dumbbell-curl"] },
  { slug: "band-curl", name: "Band Curl", muscles: ["biceps"], equipment: ["band"], type: "isolation", sets: 3, reps: "15-20", rest: 45, alternatives: ["dumbbell-curl"] },
  { slug: "triceps-pushdown", name: "Triceps Pushdown", muscles: ["triceps"], equipment: ["cable", "band"], type: "isolation", sets: 3, reps: "10-15", rest: 60, alternatives: ["overhead-triceps-extension", "diamond-push-up"] },
  { slug: "overhead-triceps-extension", name: "Overhead Triceps Extension", muscles: ["triceps"], equipment: ["dumbbell", "cable"], type: "isolation", sets: 3, reps: "10-12", rest: 60, alternatives: ["triceps-pushdown"] },
  { slug: "diamond-push-up", name: "Diamond Push-Up", muscles: ["triceps", "chest"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "8-15", rest: 60, alternatives: ["triceps-pushdown"] },
  { slug: "dip", name: "Dip", muscles: ["triceps", "chest"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "6-12", rest: 90, alternatives: ["diamond-push-up", "triceps-pushdown"] },
  // Legs
  { slug: "back-squat", name: "Barbell Back Squat", muscles: ["quads", "glutes", "core"], equipment: ["barbell"], type: "compound", sets: 4, reps: "5-8", rest: 180, alternatives: ["goblet-squat", "leg-press", "bulgarian-split-squat"] },
  { slug: "goblet-squat", name: "Goblet Squat", muscles: ["quads", "glutes", "core"], equipment: ["dumbbell", "kettlebell"], type: "compound", sets: 3, reps: "10-12", rest: 90, alternatives: ["back-squat", "bodyweight-squat", "leg-press"] },
  { slug: "bodyweight-squat", name: "Bodyweight Squat", muscles: ["quads", "glutes"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "15-25", rest: 60, alternatives: ["goblet-squat"] },
  { slug: "leg-press", name: "Leg Press", muscles: ["quads", "glutes"], equipment: ["machine"], type: "compound", sets: 3, reps: "10-12", rest: 120, alternatives: ["back-squat", "goblet-squat"] },
  { slug: "bulgarian-split-squat", name: "Bulgarian Split Squat", muscles: ["quads", "glutes"], equipment: ["dumbbell", "bodyweight"], type: "compound", sets: 3, reps: "8-12", rest: 90, alternatives: ["walking-lunge", "goblet-squat"] },
  { slug: "walking-lunge", name: "Walking Lunge", muscles: ["quads", "glutes"], equipment: ["dumbbell", "bodyweight"], type: "compound", sets: 3, reps: "10-12", rest: 90, alternatives: ["bulgarian-split-squat"] },
  { slug: "hip-thrust", name: "Hip Thrust", muscles: ["glutes", "hamstrings"], equipment: ["barbell", "dumbbell", "bodyweight"], type: "compound", sets: 3, reps: "8-12", rest: 120, alternatives: ["glute-bridge", "romanian-deadlift"] },
  { slug: "glute-bridge", name: "Glute Bridge", muscles: ["glutes", "hamstrings"], equipment: ["bodyweight"], type: "compound", sets: 3, reps: "15-20", rest: 60, alternatives: ["hip-thrust"] },
  { slug: "leg-curl", name: "Leg Curl", muscles: ["hamstrings"], equipment: ["machine"], type: "isolation", sets: 3, reps: "10-15", rest: 75, alternatives: ["romanian-deadlift", "nordic-curl"] },
  { slug: "leg-extension", name: "Leg Extension", muscles: ["quads"], equipment: ["machine"], type: "isolation", sets: 3, reps: "12-15", rest: 60, alternatives: ["bodyweight-squat"] },
  { slug: "nordic-curl", name: "Nordic Hamstring Curl", muscles: ["hamstrings"], equipment: ["bodyweight"], type: "isolation", sets: 3, reps: "4-8", rest: 90, alternatives: ["leg-curl"] },
  { slug: "calf-raise", name: "Standing Calf Raise", muscles: ["calves"], equipment: ["machine", "dumbbell", "bodyweight"], type: "isolation", sets: 3, reps: "12-20", rest: 60 },
  { slug: "kettlebell-swing", name: "Kettlebell Swing", muscles: ["glutes", "hamstrings", "back", "cardio"], equipment: ["kettlebell"], type: "compound", sets: 4, reps: "15-20", rest: 75, alternatives: ["romanian-deadlift"] },
  // Core
  { slug: "plank", name: "Plank", muscles: ["core"], equipment: ["bodyweight"], type: "isolation", sets: 3, reps: "45-60s", rest: 60, alternatives: ["dead-bug"] },
  { slug: "dead-bug", name: "Dead Bug", muscles: ["core"], equipment: ["bodyweight"], type: "isolation", sets: 3, reps: "10-12", rest: 45, alternatives: ["plank"] },
  { slug: "hanging-knee-raise", name: "Hanging Knee Raise", muscles: ["core"], equipment: ["bodyweight"], type: "isolation", sets: 3, reps: "10-15", rest: 60, alternatives: ["dead-bug"] },
  { slug: "cable-crunch", name: "Cable Crunch", muscles: ["core"], equipment: ["cable"], type: "isolation", sets: 3, reps: "12-15", rest: 60, alternatives: ["plank"] },
  { slug: "pallof-press", name: "Pallof Press", muscles: ["core"], equipment: ["cable", "band"], type: "isolation", sets: 3, reps: "10-12", rest: 45, alternatives: ["plank"] },
  // Cardio / conditioning / mobility
  { slug: "incline-walk", name: "Incline Treadmill Walk", muscles: ["cardio"], equipment: ["cardio-machine"], type: "cardio", sets: 1, reps: "10-20 min", rest: 0 },
  { slug: "easy-run", name: "Easy Run", muscles: ["cardio"], equipment: ["bodyweight"], type: "cardio", sets: 1, reps: "20-40 min", rest: 0 },
  { slug: "bike-intervals", name: "Bike Intervals", muscles: ["cardio"], equipment: ["cardio-machine"], type: "cardio", sets: 8, reps: "30s hard / 90s easy", rest: 0 },
  { slug: "rower", name: "Rowing Machine", muscles: ["cardio", "back"], equipment: ["cardio-machine"], type: "cardio", sets: 1, reps: "15-25 min", rest: 0 },
  { slug: "brisk-walk", name: "Brisk Walk", muscles: ["cardio"], equipment: ["bodyweight"], type: "cardio", sets: 1, reps: "20-45 min", rest: 0 },
  { slug: "jump-rope", name: "Jump Rope", muscles: ["cardio", "calves"], equipment: ["bodyweight"], type: "cardio", sets: 5, reps: "2 min", rest: 60 },
  { slug: "mobility-flow", name: "Mobility Flow", muscles: ["full"], equipment: ["bodyweight"], type: "mobility", sets: 1, reps: "10-15 min", rest: 0 },
  { slug: "hip-mobility", name: "Hip Mobility Circuit", muscles: ["full"], equipment: ["bodyweight"], type: "mobility", sets: 2, reps: "8 each side", rest: 30 },
];

export const EXERCISE_MAP = new Map(EXERCISES.map((e) => [e.slug, e]));

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Find a catalog exercise by slug or fuzzy name; returns null for unknown movements. */
export function findExercise(nameOrSlug: string): ExerciseDef | null {
  const s = slugify(nameOrSlug);
  if (EXERCISE_MAP.has(s)) return EXERCISE_MAP.get(s)!;
  const aliases: Record<string, string> = {
    "bench-press": "barbell-bench-press",
    "db-bench-press": "dumbbell-bench-press",
    "incline-db-press": "incline-dumbbell-press",
    "incline-bench-press": "incline-dumbbell-press",
    "shoulder-press": "seated-dumbbell-press",
    "seated-shoulder-press": "seated-dumbbell-press",
    "military-press": "overhead-press",
    "squat": "back-squat",
    "barbell-squat": "back-squat",
    "rdl": "romanian-deadlift",
    "chin-up": "pull-up",
    "seated-row": "cable-row",
    "bent-over-row": "barbell-row",
    "bicep-curl": "dumbbell-curl",
    "biceps-curl": "dumbbell-curl",
    "tricep-pushdown": "triceps-pushdown",
    "lunges": "walking-lunge",
    "lunge": "walking-lunge",
    "treadmill-walk": "incline-walk",
    "walk": "brisk-walk",
    "run": "easy-run",
    "jog": "easy-run",
    "stretching": "mobility-flow",
    "stretch": "mobility-flow",
  };
  if (aliases[s]) return EXERCISE_MAP.get(aliases[s]) ?? null;
  const hit = EXERCISES.find((e) => s.includes(e.slug) || e.slug.includes(s));
  return hit ?? null;
}

/** Epley estimated one-rep max. Reps capped at 12 to avoid absurd estimates. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  const r = Math.min(12, reps);
  return Math.round(weight * (1 + r / 30) * 10) / 10;
}
