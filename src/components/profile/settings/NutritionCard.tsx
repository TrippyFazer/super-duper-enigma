"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Card, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import type { FoodRulePref, NutritionPrefs } from "@/services/preferences";
import { RULE_FAMILIES, RULE_TAGS, substituteOptionsFor } from "@/food/rules";
import { Chip } from "./TrainingCard";

const DIETS = ["vegetarian", "pescatarian", "vegan", "dairy-free", "gluten-free", "low-carb", "halal", "kosher"];

/** Form state keeps likes/dislikes as text; the parent splits them on save. */
export type NutritionForm = Omit<NutritionPrefs, "dislikes" | "likes"> & { dislikes: string; likes: string };

type Behavior = "avoid" | "substitute" | "none";
const KIND_LABEL: Record<FoodRulePref["kind"], string> = { allergy: "Allergy", intolerance: "Intolerance", religious: "Never", avoid: "Avoid", "prefer-substitute": "Prefer substitute", prefer: "Prefer", dislike: "Dislike" };

/**
 * DIET · RESTRICTIONS & INTOLERANCES · FOODS I DON'T LIKE · FOODS I LIKE.
 * Rules are structured (what, how strict, what to use instead) so no screen
 * ever depends on typing magic keywords.
 */
export function NutritionCard({ n, onChange, estimated, minCalories }: { n: NutritionForm; onChange: (next: NutritionForm) => void; estimated: { calories: number; protein: number }; minCalories: number }) {
  const num = (v: string) => (v ? Number(v) : null);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");
  const [behavior, setBehavior] = useState<Behavior>("substitute");
  const [strict, setStrict] = useState<"allergy" | "intolerance" | "religious" | "avoid">("avoid");
  const [substitute, setSubstitute] = useState("");
  const rules = n.foodRules ?? [];
  const options = target ? substituteOptionsFor(target.trim().toLowerCase()) : [];

  const addRule = () => {
    const t = target.trim().toLowerCase();
    if (!t) return;
    const kind: FoodRulePref["kind"] = behavior === "substitute" ? "prefer-substitute" : behavior === "avoid" ? strict : "prefer";
    const rule: FoodRulePref = { id: `r${Date.now().toString(36)}`, kind, target: t, substitute: behavior === "substitute" ? substitute.trim().toLowerCase() || null : null };
    onChange({ ...n, foodRules: [...rules.filter((r) => r.target !== t), rule] });
    setTarget("");
    setSubstitute("");
    setAdding(false);
  };

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

      <Field label="Restrictions & intolerances" group hint="Applies to every plan, AI or not — you will never have to correct it again.">
        <ul className="space-y-1" data-testid="food-rules">
          {rules.filter((r) => r.kind !== "prefer" && r.kind !== "dislike").map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-black/20 px-3 py-1.5 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="capitalize">{r.target}</span>
                <span className="text-muted">
                  {" "}
                  · {KIND_LABEL[r.kind]}
                  {r.substitute ? ` → ${r.substitute}` : ""}
                </span>
              </span>
              <button aria-label={`Remove rule ${r.target}`} onClick={() => onChange({ ...n, foodRules: rules.filter((x) => x.id !== r.id) })} className="press flex h-9 w-9 items-center justify-center rounded-full text-faint hover:text-danger">
                <X size={13} />
              </button>
            </li>
          ))}
          {rules.filter((r) => r.kind !== "prefer" && r.kind !== "dislike").length === 0 && <li className="serif text-[12.5px] text-muted">None yet. Example: avoid regular milk, prefer lactose-free milk.</li>}
        </ul>
        {!adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} className="mt-2" data-testid="add-food-rule">
            <Plus size={13} /> Add
          </Button>
        ) : (
          <div className="mt-2 space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3">
            <Field label="Ingredient or group">
              <input list="food-rule-targets" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="milk, pork, shellfish, peanuts, gluten…" className={inputClass} autoFocus />
              <datalist id="food-rule-targets">
                {RULE_TAGS.map((t) => (
                  <option key={t.tag} value={t.tag}>
                    {t.label}
                  </option>
                ))}
                {RULE_FAMILIES.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Behavior" group>
              <Segmented value={behavior} onChange={setBehavior} options={[{ value: "avoid", label: "Avoid completely" }, { value: "substitute", label: "Prefer substitute" }, { value: "none", label: "No preference" }]} />
            </Field>
            {behavior === "avoid" && (
              <Field label="Why" group>
                <Segmented value={strict} onChange={setStrict} options={[{ value: "avoid", label: "Avoid" }, { value: "intolerance", label: "Intolerance" }, { value: "allergy", label: "Allergy" }, { value: "religious", label: "Never" }]} />
              </Field>
            )}
            {behavior === "substitute" && (
              <Field label="Preferred substitute">
                {options.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {options.map((o) => (
                      <button key={o} type="button" onClick={() => setSubstitute(o)} className={cx("press rounded-full border px-2.5 py-1 text-[12px] capitalize", substitute === o ? "border-gold bg-gold/15 text-gold" : "border-border text-text-2")}>
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                <input value={substitute} onChange={(e) => setSubstitute(e.target.value)} placeholder="lactose-free milk" className={inputClass} />
              </Field>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="gold" disabled={!target.trim() || (behavior === "substitute" && !substitute.trim())} onClick={addRule} data-testid="save-food-rule">
                Add rule
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Field>

      <Field label="Foods I don't like" hint="Comma separated · ranked down, never a hard rule">
        <input value={n.dislikes} onChange={(e) => onChange({ ...n, dislikes: e.target.value })} placeholder="mushrooms, cilantro" className={inputClass} />
      </Field>
      <Field label="Foods I like" hint="Comma separated">
        <input value={n.likes} onChange={(e) => onChange({ ...n, likes: e.target.value })} placeholder="chicken, rice, eggs" className={inputClass} />
      </Field>
    </Card>
  );
}
