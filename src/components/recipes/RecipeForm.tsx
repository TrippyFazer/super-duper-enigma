"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecipeAction } from "@/actions";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { RECIPE_TAGS } from "@/lib/recipe-constants";

export function RecipeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack" | "any">("dinner");
  const [prep, setPrep] = useState("10");
  const [cook, setCook] = useState("20");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createRecipeAction({
        name,
        description,
        ingredients: ingredients.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        steps: steps.split(/\n/).map((s) => s.trim()).filter(Boolean),
        mealType,
        prepTimeMin: Number(prep) || 0,
        cookTimeMin: Number(cook) || 0,
        difficulty,
        tags,
      });
      if (!r.ok) return setError(r.error ?? "Could not save");
      router.push(`/recipes/${r.id}`);
    });

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grandma's lentil stew" className={inputClass} maxLength={120} />
      </Field>
      <Field label="Description (optional)">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One sentence" className={inputClass} maxLength={400} />
      </Field>
      <Field label="Ingredients" hint="One per line or comma separated. Simple names work best for search (e.g. chicken, rice).">
        <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={4} className={inputClass} placeholder={"chicken thighs\nrice\nbroccoli"} />
      </Field>
      <Field label="Steps" hint="One per line.">
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={5} className={inputClass} placeholder={"Sear the chicken.\nAdd rice and stock; simmer 18 minutes."} />
      </Field>
      <Segmented
        value={mealType}
        onChange={setMealType}
        options={[
          { value: "breakfast", label: "Bfast" },
          { value: "lunch", label: "Lunch" },
          { value: "dinner", label: "Dinner" },
          { value: "snack", label: "Snack" },
          { value: "any", label: "Any" },
        ]}
      />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Prep (min)">
          <input type="number" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Cook (min)">
          <input type="number" inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className={inputClass}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </Field>
      </div>
      <Field label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {RECIPE_TAGS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTags((xs) => (xs.includes(t.id) ? xs.filter((x) => x !== t.id) : [...xs, t.id]))} className={cx("press rounded-full border px-3 py-1.5 text-xs", tags.includes(t.id) ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card text-text-2")}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button onClick={submit} disabled={pending || !name.trim() || !ingredients.trim() || !steps.trim()} full size="lg" variant="gold">
        {pending ? "Saving…" : "Save recipe"}
      </Button>
    </div>
  );
}
