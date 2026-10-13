"use client";

import { Card, Field, inputClass } from "@/components/ui/primitives";
import type { NutritionPrefs } from "@/services/preferences";
import { Chip } from "./TrainingCard";

const DIETS = ["vegetarian", "pescatarian", "dairy-free", "gluten-free", "low-carb", "halal", "kosher"];

/** Form state keeps likes/dislikes as text; the parent splits them on save. */
export type NutritionForm = Omit<NutritionPrefs, "dislikes" | "likes"> & { dislikes: string; likes: string };

export function NutritionCard({ n, onChange, estimated, minCalories }: { n: NutritionForm; onChange: (next: NutritionForm) => void; estimated: { calories: number; protein: number }; minCalories: number }) {
  const num = (v: string) => (v ? Number(v) : null);
  return (
    <Card className="space-y-4">
      <div className="eyebrow">Nutrition</div>
      <p className="text-xs text-muted">
        Blank = estimated from your profile ({estimated.calories} kcal · {estimated.protein} g). Under {minCalories} kcal is never rewarded.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goal">
          <select value={n.goal} onChange={(e) => onChange({ ...n, goal: e.target.value as NutritionPrefs["goal"] })} className={inputClass}>
            {["maintain", "lose", "gain", "recomp"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Meals / day">
          <input type="number" inputMode="numeric" min={2} max={6} value={n.mealsPerDay} onChange={(e) => onChange({ ...n, mealsPerDay: Number(e.target.value) })} className={inputClass} />
        </Field>
        <Field label="Calories">
          <input type="number" inputMode="numeric" value={n.calorieTarget ?? ""} onChange={(e) => onChange({ ...n, calorieTarget: num(e.target.value) })} placeholder={String(estimated.calories)} className={inputClass} />
        </Field>
        <Field label="Protein (g)">
          <input type="number" inputMode="numeric" value={n.proteinTarget ?? ""} onChange={(e) => onChange({ ...n, proteinTarget: num(e.target.value) })} placeholder={String(estimated.protein)} className={inputClass} />
        </Field>
        <Field label="Carbs (g, optional)">
          <input type="number" inputMode="numeric" value={n.carbTarget ?? ""} onChange={(e) => onChange({ ...n, carbTarget: num(e.target.value) })} className={inputClass} />
        </Field>
        <Field label="Fat (g, optional)">
          <input type="number" inputMode="numeric" value={n.fatTarget ?? ""} onChange={(e) => onChange({ ...n, fatTarget: num(e.target.value) })} className={inputClass} />
        </Field>
        <Field label="Max prep (min)">
          <input type="number" inputMode="numeric" min={5} max={120} value={n.maxPrepMin} onChange={(e) => onChange({ ...n, maxPrepMin: Number(e.target.value) })} className={inputClass} />
        </Field>
        <Field label="Budget">
          <select value={n.budget} onChange={(e) => onChange({ ...n, budget: e.target.value as NutritionPrefs["budget"] })} className={inputClass}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </Field>
      </div>
      <Field label="Diet" group>
        <div className="flex flex-wrap gap-1.5">
          {DIETS.map((d) => (
            <Chip key={d} on={n.dietPrefs.includes(d)} onClick={() => onChange({ ...n, dietPrefs: n.dietPrefs.includes(d) ? n.dietPrefs.filter((x) => x !== d) : [...n.dietPrefs, d] })}>
              {d}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Dislikes" hint="Comma separated">
        <input value={n.dislikes} onChange={(e) => onChange({ ...n, dislikes: e.target.value })} placeholder="mushrooms, cilantro" className={inputClass} />
      </Field>
      <Field label="Likes" hint="Comma separated">
        <input value={n.likes} onChange={(e) => onChange({ ...n, likes: e.target.value })} placeholder="chicken, rice, eggs" className={inputClass} />
      </Field>
    </Card>
  );
}
