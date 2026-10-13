"use client";

import { Card, Field, cx, inputClass } from "@/components/ui/primitives";
import type { FitnessPrefs } from "@/services/preferences";

const EQUIPMENT = [
  ["barbell", "Barbell"],
  ["dumbbell", "Dumbbells"],
  ["cable", "Cables"],
  ["machine", "Machines"],
  ["kettlebell", "Kettlebell"],
  ["band", "Bands"],
  ["bodyweight", "Bodyweight"],
  ["cardio-machine", "Cardio machine"],
] as const;

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("press h-10 rounded-full border px-3 text-xs", on ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
      {children}
    </button>
  );
}

/** Training profile: goal, experience, days, length, equipment, restrictions. */
export function TrainingCard({ f, onChange }: { f: FitnessPrefs; onChange: (next: FitnessPrefs) => void }) {
  return (
    <Card className="space-y-4">
      <div className="eyebrow">Training</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goal">
          <select value={f.goal} onChange={(e) => onChange({ ...f, goal: e.target.value as FitnessPrefs["goal"] })} className={inputClass}>
            {["general", "strength", "muscle", "fat-loss", "conditioning", "athleticism", "hybrid"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Experience">
          <select value={f.experience} onChange={(e) => onChange({ ...f, experience: e.target.value as FitnessPrefs["experience"] })} className={inputClass}>
            {["beginner", "intermediate", "advanced"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Days / week">
          <input type="number" inputMode="numeric" min={1} max={7} value={f.daysPerWeek} onChange={(e) => onChange({ ...f, daysPerWeek: Number(e.target.value) })} className={inputClass} />
        </Field>
        <Field label="Session (min)">
          <input type="number" inputMode="numeric" min={15} max={120} step={5} value={f.workoutLengthMin} onChange={(e) => onChange({ ...f, workoutLengthMin: Number(e.target.value) })} className={inputClass} />
        </Field>
      </div>
      <Field label="Equipment" group>
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT.map(([v, l]) => (
            <Chip key={v} on={f.equipment.includes(v)} onClick={() => onChange({ ...f, equipment: f.equipment.includes(v) ? f.equipment.filter((x) => x !== v) : [...f.equipment, v] })}>
              {l}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Injuries / restrictions (optional)">
        <input value={f.injuries} onChange={(e) => onChange({ ...f, injuries: e.target.value })} placeholder="no overhead pressing, left knee" className={inputClass} maxLength={300} />
      </Field>
      <Field label="Preferences (optional)">
        <input value={f.preferences} onChange={(e) => onChange({ ...f, preferences: e.target.value })} placeholder="love kettlebells, hate burpees" className={inputClass} maxLength={300} />
      </Field>
    </Card>
  );
}
