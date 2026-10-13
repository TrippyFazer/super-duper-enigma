export interface SetVM {
  id: number;
  setIndex: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
}
export interface ExVM {
  id: number;
  slug: string;
  name: string;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  status: string;
  notes: string | null;
  sets: SetVM[];
  previous: { weight: number | null; reps: number | null }[] | null;
}
export interface SessionVM {
  id: number;
  name: string;
  focus: string;
  startedAt: string;
  status: string;
  pausedAt: string | null;
  pausedSec: number;
  exercises: ExVM[];
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** DOM id for a set input, so "complete set" can move focus to the next field one-handed. */
export const setInputId = (exId: number, setIndex: number, field: "weight" | "reps") => `set-${exId}-${setIndex}-${field}`;
