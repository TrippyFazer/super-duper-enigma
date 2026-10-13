"use client";

import { useState, useTransition } from "react";
import { Sparkles, Unplug } from "lucide-react";
import { clearAiSettingsAction, saveAiSettingsAction, savePreferencesAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import type { Preferences } from "@/services/preferences";

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
const DIETS = ["vegetarian", "pescatarian", "dairy-free", "gluten-free", "low-carb", "halal", "kosher"];

export function PlannerSettings({ prefs, ai, estimated, minCalories }: { prefs: Preferences; ai: { enabled: boolean; provider: string | null; model: string | null; source: string | null }; estimated: { calories: number; protein: number }; minCalories: number }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [f, setF] = useState(prefs.fitness);
  const [n, setN] = useState({ ...prefs.nutrition, dislikes: prefs.nutrition.dislikes.join(", "), likes: prefs.nutrition.likes.join(", ") });
  const [qf, setQf] = useState(prefs.questFrequency);
  const [notif, setNotif] = useState(prefs.notifications);
  const [aiForm, setAiForm] = useState({ provider: "openai" as "openai" | "anthropic", apiKey: "", model: "", baseUrl: "" });

  const save = () =>
    start(async () => {
      try {
        await savePreferencesAction({
          fitness: f,
          nutrition: { ...n, calorieTarget: n.calorieTarget || null, proteinTarget: n.proteinTarget || null, carbTarget: n.carbTarget || null, fatTarget: n.fatTarget || null, dislikes: n.dislikes.split(",").map((s) => s.trim()).filter(Boolean), likes: n.likes.split(",").map((s) => s.trim()).filter(Boolean) },
          questFrequency: qf,
          notifications: notif,
        });
        toast("Planner settings saved", "quest");
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className={cx("press rounded-full border px-3 py-1.5 text-xs", on ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <Card id="ai" className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-gold" />
          <div className="eyebrow">AI provider</div>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${ai.enabled ? "bg-success/15 text-success" : "bg-white/5 text-muted"}`}>{ai.enabled ? `${ai.provider} · ${ai.model}` : "Off"}</span>
        </div>
        <p className="text-xs text-muted">Optional. Personalises workouts, meals, special quests and the coach. The app works fully without it. Keys are stored only in your local database (or set AI_PROVIDER / AI_API_KEY / AI_MODEL in .env.local).</p>
        {ai.enabled ? (
          ai.source === "settings" && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await clearAiSettingsAction(); toast("AI disconnected", "quest"); })}>
              <Unplug size={13} /> Disconnect
            </Button>
          )
        ) : (
          <div className="space-y-2">
            <Segmented
              value={aiForm.provider}
              onChange={(v) => setAiForm({ ...aiForm, provider: v })}
              options={[
                { value: "openai", label: "OpenAI-compatible" },
                { value: "anthropic", label: "Anthropic" },
              ]}
            />
            <input value={aiForm.apiKey} onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })} placeholder="API key" className={inputClass} autoComplete="off" />
            <div className="grid grid-cols-2 gap-2">
              <input value={aiForm.model} onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })} placeholder={aiForm.provider === "anthropic" ? "claude-haiku-5-5" : "gpt-4o-mini"} className={inputClass} />
              <input value={aiForm.baseUrl} onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })} placeholder={aiForm.provider === "anthropic" ? "Base URL (optional)" : "Base URL (Ollama, Groq…)"} className={inputClass} />
            </div>
            <Button
              disabled={pending || aiForm.apiKey.trim().length < 8}
              onClick={() =>
                start(async () => {
                  const r = await saveAiSettingsAction({ provider: aiForm.provider, apiKey: aiForm.apiKey.trim(), model: aiForm.model || null, baseUrl: aiForm.baseUrl || null });
                  toast(r.message, r.ok ? "quest" : "error");
                  if (r.ok) setAiForm({ ...aiForm, apiKey: "" });
                })
              }
            >
              {pending ? "Testing…" : "Connect & test"}
            </Button>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="eyebrow">Training profile</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Goal">
            <select value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value as typeof f.goal })} className={inputClass}>
              {["general", "strength", "muscle", "fat-loss", "conditioning", "athleticism", "hybrid"].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Experience">
            <select value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value as typeof f.experience })} className={inputClass}>
              {["beginner", "intermediate", "advanced"].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Days / week">
            <input type="number" min={1} max={7} value={f.daysPerWeek} onChange={(e) => setF({ ...f, daysPerWeek: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label="Session length (min)">
            <input type="number" min={15} max={120} step={5} value={f.workoutLengthMin} onChange={(e) => setF({ ...f, workoutLengthMin: Number(e.target.value) })} className={inputClass} />
          </Field>
        </div>
        <Field label="Equipment" group>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT.map(([v, l]) => (
              <Chip key={v} on={f.equipment.includes(v)} onClick={() => setF({ ...f, equipment: f.equipment.includes(v) ? f.equipment.filter((x) => x !== v) : [...f.equipment, v] })}>
                {l}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Injuries / restrictions (optional)">
          <input value={f.injuries} onChange={(e) => setF({ ...f, injuries: e.target.value })} placeholder="e.g. no overhead pressing, left knee" className={inputClass} maxLength={300} />
        </Field>
        <Field label="Preferences (optional)">
          <input value={f.preferences} onChange={(e) => setF({ ...f, preferences: e.target.value })} placeholder="e.g. love kettlebells, hate burpees" className={inputClass} maxLength={300} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <div className="eyebrow">Nutrition targets</div>
        <p className="text-xs text-muted">
          Leave blank to use estimates from your profile ({estimated.calories} kcal · {estimated.protein} g protein). Targets below {minCalories} kcal are never reinforced with XP.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Goal">
            <select value={n.goal} onChange={(e) => setN({ ...n, goal: e.target.value as typeof n.goal })} className={inputClass}>
              {["maintain", "lose", "gain", "recomp"].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meals / day">
            <input type="number" min={2} max={6} value={n.mealsPerDay} onChange={(e) => setN({ ...n, mealsPerDay: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label="Calories">
            <input type="number" value={n.calorieTarget ?? ""} onChange={(e) => setN({ ...n, calorieTarget: e.target.value ? Number(e.target.value) : null })} placeholder={String(estimated.calories)} className={inputClass} />
          </Field>
          <Field label="Protein (g)">
            <input type="number" value={n.proteinTarget ?? ""} onChange={(e) => setN({ ...n, proteinTarget: e.target.value ? Number(e.target.value) : null })} placeholder={String(estimated.protein)} className={inputClass} />
          </Field>
          <Field label="Carbs (g, optional)">
            <input type="number" value={n.carbTarget ?? ""} onChange={(e) => setN({ ...n, carbTarget: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
          </Field>
          <Field label="Fat (g, optional)">
            <input type="number" value={n.fatTarget ?? ""} onChange={(e) => setN({ ...n, fatTarget: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
          </Field>
          <Field label="Max prep (min)">
            <input type="number" min={5} max={120} value={n.maxPrepMin} onChange={(e) => setN({ ...n, maxPrepMin: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label="Budget">
            <select value={n.budget} onChange={(e) => setN({ ...n, budget: e.target.value as typeof n.budget })} className={inputClass}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
        </div>
        <Field label="Diet" group>
          <div className="flex flex-wrap gap-1.5">
            {DIETS.map((d) => (
              <Chip key={d} on={n.dietPrefs.includes(d)} onClick={() => setN({ ...n, dietPrefs: n.dietPrefs.includes(d) ? n.dietPrefs.filter((x) => x !== d) : [...n.dietPrefs, d] })}>
                {d}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Foods you dislike" hint="Comma separated">
          <input value={n.dislikes} onChange={(e) => setN({ ...n, dislikes: e.target.value })} placeholder="mushrooms, cilantro" className={inputClass} />
        </Field>
        <Field label="Foods you like" hint="Comma separated">
          <input value={n.likes} onChange={(e) => setN({ ...n, likes: e.target.value })} placeholder="chicken, rice, eggs" className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <div className="eyebrow">Special quests</div>
        <Segmented
          value={qf}
          onChange={setQf}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />
        <p className="text-[11px] text-muted">How often optional quests appear. Normal ≈ one most days, never more than two. Declining is always free.</p>
      </Card>

      <Card className="space-y-2">
        <div className="eyebrow">Notifications</div>
        {(
          [
            ["quest", "Special quests & expiring quests"],
            ["workout", "Workout ready"],
            ["meals", "Meal plan ready"],
            ["level", "Level up"],
            ["rank", "Rank up"],
            ["achievement", "Achievements"],
            ["sobriety", "Sobriety milestones"],
            ["review", "Weekly review"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center justify-between py-1 text-sm">
            <span>{l}</span>
            <input type="checkbox" checked={notif[k]} onChange={(e) => setNotif({ ...notif, [k]: e.target.checked })} className="h-5 w-5 accent-[var(--color-accent)]" />
          </label>
        ))}
        <p className="text-[11px] text-muted">Device notifications are enabled from the Notices screen.</p>
      </Card>

      <Button onClick={save} disabled={pending} full size="lg" variant="gold">
        {pending ? "Saving…" : "Save planner settings"}
      </Button>
    </div>
  );
}
