"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Moon, UtensilsCrossed, Coins, Droplets, ShieldCheck, Flame, ChevronLeft, Check } from "lucide-react";
import { completeOnboardingAction, type OnboardingInput } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Field, Segmented, cx, inputClass } from "@/components/ui/primitives";
import { DOMAINS } from "@/ranking/domains";
import type { DomainId } from "@/ranking/types";

const ICONS: Record<DomainId, typeof Dumbbell> = { fitness: Dumbbell, sleep: Moon, cooking: UtensilsCrossed, wealth: Coins, skincare: Droplets, sobriety: ShieldCheck, habits: Flame };

const HABIT_SUGGESTIONS = ["Read 20 minutes", "Meditate", "Journal", "Stretch", "Take vitamins", "Walk", "Study", "Clean 15 minutes", "No-spend day", "Wake up on time", "Work on project"];
const AM_STEPS = ["Cleanser", "Moisturizer", "SPF"];
const PM_STEPS = ["Cleanser", "Treatment", "Moisturizer"];

type Step = "name" | "domains" | "fitness" | "training" | "sleep" | "cooking" | "nutrition" | "skincare" | "sobriety" | "habits" | "wealth" | "quests" | "why" | "done";
const WHY_SUGGESTIONS = ["I want to feel confident.", "I want more discipline.", "I want to look better.", "I want to have more energy.", "I want to become someone I am proud of."];

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
type Equip = (typeof EQUIPMENT)[number][0];
const DIETS = ["vegetarian", "pescatarian", "dairy-free", "gluten-free", "low-carb", "halal", "kosher"];
const DISLIKE_SUGGESTIONS = ["mushrooms", "cilantro", "fish", "tofu", "olives", "spicy food", "eggs", "dairy"];

export function OnboardingWizard() {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "other" | "">("");
  const [domains, setDomains] = useState<DomainId[]>(["fitness", "sleep", "cooking", "skincare", "habits"]);
  const [workouts, setWorkouts] = useState("2");
  const [types, setTypes] = useState<string[]>(["strength"]);
  const [steps, setSteps] = useState("");
  const [sleepHours, setSleepHours] = useState("7");
  const [consistent, setConsistent] = useState<"yes" | "no">("no");
  const [bedtime, setBedtime] = useState("23:00");
  const [meals, setMeals] = useState("4");
  const [skinDays, setSkinDays] = useState("3");
  const [am, setAm] = useState<string[]>(AM_STEPS);
  const [pm, setPm] = useState<string[]>(PM_STEPS);
  const [trackers, setTrackers] = useState<{ name: string; category: "alcohol" | "cannabis" | "nicotine" | "custom"; startedAt: string }[]>([]);
  const [customTracker, setCustomTracker] = useState("");
  const [habits, setHabits] = useState<string[]>(["Read 20 minutes", "Meditate"]);
  const [customHabit, setCustomHabit] = useState("");
  const [goals, setGoals] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [fitGoal, setFitGoal] = useState<"general" | "strength" | "muscle" | "fat-loss" | "conditioning" | "athleticism" | "hybrid">("general");
  const [experience, setExperience] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [equipment, setEquipment] = useState<Equip[]>(["dumbbell", "bodyweight"]);
  const [lengthMin, setLengthMin] = useState("45");
  const [nutGoal, setNutGoal] = useState<"maintain" | "lose" | "gain" | "recomp">("maintain");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [diets, setDiets] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [customDislike, setCustomDislike] = useState("");
  const [questFreq, setQuestFreq] = useState<"low" | "normal" | "high">("normal");
  const [wakeTarget, setWakeTarget] = useState("07:30");
  const [reasons, setReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");

  const order: Step[] = [
    "name",
    "domains",
    ...(["fitness", "training", "sleep", "cooking", "nutrition", "skincare", "sobriety", "habits", "wealth"] as Step[]).filter((s) => {
      if (s === "training") return domains.includes("fitness");
      if (s === "nutrition") return domains.includes("cooking") || domains.includes("fitness");
      return domains.includes(s as DomainId);
    }),
    "quests",
    "why",
    "done",
  ];
  const [idx, setIdx] = useState(0);
  const step = order[Math.min(idx, order.length - 1)];
  const progress = (idx + 1) / order.length;

  const toggleDomain = (d: DomainId) => setDomains((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]));
  const toggleIn = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const next = () => {
    setError(null);
    if (step === "name" && !name.trim()) return setError("Give your character a name.");
    if (step === "domains" && domains.length === 0) return setError("Pick at least one domain.");
    setIdx((i) => Math.min(i + 1, order.length - 1));
  };
  const back = () => setIdx((i) => Math.max(0, i - 1));

  const submit = () =>
    start(async () => {
      const input: OnboardingInput = {
        name: name.trim(),
        age: age ? Number(age) : null,
        sex: sex || null,
        heightCm: heightCm ? Number(heightCm) : null,
        weightKg: weightKg ? Number(weightKg) : null,
        timezone: tz,
        activeDomains: domains,
        baseline: {
          workoutsPerWeek: domains.includes("fitness") ? Number(workouts) : null,
          exerciseTypes: domains.includes("fitness") ? types : null,
          stepsPerDay: steps ? Number(steps) : null,
          avgSleepHours: domains.includes("sleep") ? Number(sleepHours) : null,
          consistentSchedule: domains.includes("sleep") ? consistent === "yes" : null,
          mealsCookedPerWeek: domains.includes("cooking") ? Number(meals) : null,
          skincareDaysPerWeek: domains.includes("skincare") ? Number(skinDays) : null,
        },
        targets: {
          bedtimeTarget: domains.includes("sleep") ? bedtime : null,
          workoutsPerWeekTarget: Math.min(7, Math.max(2, Math.round(Number(workouts) || 0) + 1)),
          mealsPerWeekTarget: Math.min(21, Math.max(3, Math.round(Number(meals) || 0) + 2)),
        },
        goals: goals || null,
        routines: domains.includes("skincare") ? { morning: am, evening: pm } : undefined,
        sobriety: domains.includes("sobriety") ? trackers : undefined,
        habits: domains.includes("habits") ? habits : undefined,
        preferences: {
          fitness: domains.includes("fitness") ? { goal: fitGoal, experience, daysPerWeek: Number(daysPerWeek), equipment: equipment.length ? equipment : ["bodyweight"], workoutLengthMin: Number(lengthMin) } : undefined,
          nutrition: { goal: nutGoal, calorieTarget: calories ? Number(calories) : null, proteinTarget: protein ? Number(protein) : null, dietPrefs: diets, dislikes },
          questFrequency: questFreq,
          sleep: domains.includes("sleep") ? { wakeTarget } : undefined,
        },
        reasons,
      };
      const r = await completeOnboardingAction(input);
      if (!r.ok) {
        setError(r.error ?? "Something went wrong");
        return;
      }
      notify(r);
      router.replace("/");
      router.refresh();
    });

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className={cx("press rounded-full border px-3.5 py-2 text-sm", active ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
      {children}
    </button>
  );

  return (
    <div className="page flex min-h-dvh flex-col" style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={back} disabled={idx === 0} aria-label="Back" className="press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-2 disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className="h-full bg-gradient-to-r from-gold-dim to-gold transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="tabular text-xs text-muted">
          {idx + 1}/{order.length}
        </span>
      </div>

      <div className="animate-rise flex-1" key={step}>
        {step === "name" && (
          <>
            <Title eyebrow="New adventurer" title="Name your character" body="Your real life is the game. Everything you log here is only stored on your own server." />
            <div className="space-y-4">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tripp" className={inputClass} maxLength={40} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Age" hint="Used for age-adjusted wealth benchmarks">
                  <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="28" className={inputClass} />
                </Field>
                <Field label="Sex (optional)">
                  <select value={sex} onChange={(e) => setSex(e.target.value as typeof sex)} className={inputClass}>
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height cm (optional)" hint="For calorie estimates">
                  <input type="number" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="178" className={inputClass} />
                </Field>
                <Field label="Weight kg (optional)">
                  <input type="number" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="76" className={inputClass} />
                </Field>
              </div>
              <p className="text-xs text-muted">Timezone detected: {tz}</p>
            </div>
          </>
        )}

        {step === "domains" && (
          <>
            <Title eyebrow="Choose your path" title="Which domains do you want to level?" body="Skip anything you don't care about. You can change this later in settings." />
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(DOMAINS) as DomainId[]).map((d) => {
                const Icon = ICONS[d];
                const active = domains.includes(d);
                return (
                  <button key={d} type="button" onClick={() => toggleDomain(d)} className={cx("press flex items-center gap-3 rounded-xl border px-4 py-3 text-left", active ? "border-gold/50 bg-gold/10" : "border-border bg-card")}>
                    <Icon size={20} className={active ? "text-gold" : "text-muted"} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{DOMAINS[d].name}</div>
                      <div className="truncate text-xs text-muted">{DOMAINS[d].description}</div>
                    </div>
                    <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border", active ? "border-gold bg-gold text-[#1a1406]" : "border-border-strong")}>{active && <Check size={14} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "fitness" && (
          <>
            <Title eyebrow="Fitness" title="Where are you starting?" body="Honest answers set an honest baseline. Ranks above D must be earned by logging." />
            <div className="space-y-5">
              <Field label="Workouts per week right now" group>
                <div className="flex gap-2">
                  {["0", "1", "2", "3", "4", "5", "6"].map((n) => (
                    <button key={n} type="button" onClick={() => setWorkouts(n)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", workouts === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                      {n}
                      {n === "6" ? "+" : ""}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="What kind of training?" group>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["strength", "Strength / lifting"],
                    ["cardio", "Cardio / running"],
                    ["sport", "Sports"],
                    ["mobility", "Yoga / mobility"],
                  ].map(([v, l]) => (
                    <Chip key={v} active={types.includes(v)} onClick={() => toggleIn(types, setTypes, v)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Typical daily steps (optional)" hint="Oura can sync this automatically later">
                <input type="number" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="6,000" className={inputClass} />
              </Field>
            </div>
          </>
        )}

        {step === "training" && (
          <>
            <Title eyebrow="Training" title="How do you want to train?" body="This shapes your generated workouts. Everything can be changed later in Settings." />
            <div className="space-y-5">
              <Field label="Main goal" group>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["general", "General fitness"],
                      ["strength", "Get stronger"],
                      ["muscle", "Build muscle"],
                      ["fat-loss", "Lose fat"],
                      ["conditioning", "Conditioning"],
                      ["athleticism", "Athleticism"],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setFitGoal(v)} className={cx("press rounded-lg border px-3 py-2.5 text-left text-sm", fitGoal === v ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Experience" group>
                <Segmented
                  value={experience}
                  onChange={setExperience}
                  options={[
                    { value: "beginner", label: "Beginner" },
                    { value: "intermediate", label: "Intermediate" },
                    { value: "advanced", label: "Advanced" },
                  ]}
                />
              </Field>
              <Field label="Training days per week" group>
                <div className="flex gap-2">
                  {["2", "3", "4", "5", "6"].map((n) => (
                    <button key={n} type="button" onClick={() => setDaysPerWeek(n)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", daysPerWeek === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Session length" group>
                <div className="flex gap-2">
                  {["30", "45", "60", "75"].map((n) => (
                    <button key={n} type="button" onClick={() => setLengthMin(n)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", lengthMin === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                      {n} min
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Equipment you have" group>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT.map(([v, l]) => (
                    <Chip key={v} active={equipment.includes(v)} onClick={() => setEquipment((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]))}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
          </>
        )}

        {step === "sleep" && (
          <>
            <Title eyebrow="Sleep" title="How do you sleep?" body="Connect your Oura Ring in settings after setup — it replaces manual logging entirely." />
            <div className="space-y-5">
              <Field label="Average hours per night" group>
                <div className="flex gap-2">
                  {["5", "6", "6.5", "7", "7.5", "8", "9"].map((n) => (
                    <button key={n} type="button" onClick={() => setSleepHours(n)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", sleepHours === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Consistent bedtime and wake time?" group>
                <Segmented
                  value={consistent}
                  onChange={setConsistent}
                  options={[
                    { value: "yes", label: "Mostly, within an hour" },
                    { value: "no", label: "It varies" },
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target wake time" hint="Bedtime and wind-down are derived from it">
                  <input type="time" value={wakeTarget} onChange={(e) => setWakeTarget(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Target bedtime" hint="Adjusted automatically once saved">
                  <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className={inputClass} />
                </Field>
              </div>
            </div>
          </>
        )}

        {step === "cooking" && (
          <>
            <Title eyebrow="Cooking" title="How often do you cook?" body="Any meal you make yourself counts — eggs on toast included." />
            <Field label="Home-cooked meals per week" group>
              <div className="grid grid-cols-4 gap-2">
                {["0", "2", "4", "6", "8", "10", "14", "18"].map((n) => (
                  <button key={n} type="button" onClick={() => setMeals(n)} className={cx("press rounded-lg border py-2.5 text-sm tabular", meals === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                    {n}
                    {n === "18" ? "+" : ""}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === "nutrition" && (
          <>
            <Title eyebrow="Nutrition" title="Fuel, not punishment" body="Targets drive meal plans and protein XP. Leave calories blank to use an estimate from your profile. Eating less is never rewarded." />
            <div className="space-y-5">
              <Field label="Goal" group>
                <Segmented
                  value={nutGoal}
                  onChange={setNutGoal}
                  options={[
                    { value: "maintain", label: "Maintain" },
                    { value: "lose", label: "Lose fat" },
                    { value: "gain", label: "Gain" },
                    { value: "recomp", label: "Recomp" },
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Calories / day (optional)">
                  <input type="number" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Estimate" className={inputClass} />
                </Field>
                <Field label="Protein g / day (optional)">
                  <input type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Estimate" className={inputClass} />
                </Field>
              </div>
              <Field label="Diet" group>
                <div className="flex flex-wrap gap-2">
                  {DIETS.map((d) => (
                    <Chip key={d} active={diets.includes(d)} onClick={() => toggleIn(diets, setDiets, d)}>
                      {d}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Foods you dislike" group>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...DISLIKE_SUGGESTIONS, ...dislikes])).map((d) => (
                    <Chip key={d} active={dislikes.includes(d)} onClick={() => toggleIn(dislikes, setDislikes, d)}>
                      {d}
                    </Chip>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={customDislike} onChange={(e) => setCustomDislike(e.target.value)} placeholder="Add a food" className={cx(inputClass, "py-2")} maxLength={40} />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!customDislike.trim()) return;
                      setDislikes((xs) => [...xs, customDislike.trim().toLowerCase()]);
                      setCustomDislike("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </Field>
            </div>
          </>
        )}

        {step === "skincare" && (
          <>
            <Title eyebrow="Personal care" title="Set up your routines" body="Edit the steps to match what you actually do. Consistency beats product count." />
            <div className="space-y-5">
              <Field label="Days per week you currently do a routine" group>
                <div className="flex gap-2">
                  {["0", "1", "2", "3", "4", "5", "6", "7"].map((n) => (
                    <button key={n} type="button" onClick={() => setSkinDays(n)} className={cx("press flex-1 rounded-lg border py-2.5 text-sm tabular", skinDays === n ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
              <StepEditor label="Morning routine" steps={am} onChange={setAm} suggestions={["Cleanser", "Vitamin C", "Moisturizer", "SPF", "Eye cream"]} />
              <StepEditor label="Evening routine" steps={pm} onChange={setPm} suggestions={["Cleanser", "Treatment", "Retinoid", "Moisturizer", "Floss"]} />
            </div>
          </>
        )}

        {step === "sobriety" && (
          <>
            <Title eyebrow="Sobriety" title="What do you want to track?" body="Choose what matters to you. Start dates can be today or any day in the past. Resets never erase history." />
            <div className="space-y-3">
              {(
                [
                  ["alcohol", "Alcohol"],
                  ["cannabis", "Weed"],
                  ["nicotine", "Nicotine"],
                ] as const
              ).map(([cat, label]) => {
                const t = trackers.find((x) => x.category === cat && x.name === label);
                return (
                  <div key={cat} className={cx("rounded-xl border px-4 py-3", t ? "border-gold/50 bg-gold/10" : "border-border bg-card")}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <button
                        type="button"
                        onClick={() => setTrackers((xs) => (t ? xs.filter((x) => x !== t) : [...xs, { name: label, category: cat, startedAt: new Date().toISOString() }]))}
                        className={cx("press rounded-full border px-3 py-1 text-xs", t ? "border-gold/50 text-gold" : "border-border-strong text-text-2")}
                      >
                        {t ? "Tracking" : "Track"}
                      </button>
                    </div>
                    {t && (
                      <label className="mt-2 block text-xs text-muted">
                        Clean since
                        <input
                          type="date"
                          max={new Date().toISOString().slice(0, 10)}
                          value={t.startedAt.slice(0, 10)}
                          onChange={(e) => setTrackers((xs) => xs.map((x) => (x === t ? { ...x, startedAt: new Date(e.target.value + "T00:00:00").toISOString() } : x)))}
                          className={cx(inputClass, "mt-1 py-2")}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <input value={customTracker} onChange={(e) => setCustomTracker(e.target.value)} placeholder="Custom (e.g. Sugar, Gambling)" className={inputClass} maxLength={60} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!customTracker.trim()) return;
                    setTrackers((xs) => [...xs, { name: customTracker.trim(), category: "custom", startedAt: new Date().toISOString() }]);
                    setCustomTracker("");
                  }}
                >
                  Add
                </Button>
              </div>
              {trackers.filter((t) => t.category === "custom").map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm">
                  {t.name}
                  <button className="text-xs text-muted" onClick={() => setTrackers((xs) => xs.filter((x) => x !== t))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {step === "habits" && (
          <>
            <Title eyebrow="Discipline" title="Pick a few daily habits" body="Start small. Two or three you'll actually do beat ten you won't. Schedules can be changed later." />
            <div className="flex flex-wrap gap-2">
              {HABIT_SUGGESTIONS.map((h) => (
                <Chip key={h} active={habits.includes(h)} onClick={() => toggleIn(habits, setHabits, h)}>
                  {h}
                </Chip>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input value={customHabit} onChange={(e) => setCustomHabit(e.target.value)} placeholder="Custom habit" className={inputClass} maxLength={60} />
              <Button
                variant="secondary"
                onClick={() => {
                  if (!customHabit.trim()) return;
                  setHabits((xs) => [...xs, customHabit.trim()]);
                  setCustomHabit("");
                }}
              >
                Add
              </Button>
            </div>
            {habits.filter((h) => !HABIT_SUGGESTIONS.includes(h)).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {habits
                  .filter((h) => !HABIT_SUGGESTIONS.includes(h))
                  .map((h) => (
                    <Chip key={h} active onClick={() => setHabits((xs) => xs.filter((x) => x !== h))}>
                      {h} ×
                    </Chip>
                  ))}
              </div>
            )}
          </>
        )}

        {step === "wealth" && (
          <>
            <Title eyebrow="Wealth" title="Finances come later" body="Your first financial check-in happens from the Wealth page whenever you're ready — it takes about ten minutes and is entirely optional. Nothing here is financial advice." />
            <Field label="Anything you're working toward? (optional)">
              <textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={3} placeholder="Build a 3-month emergency fund, pay off the card…" className={inputClass} maxLength={500} />
            </Field>
          </>
        )}

        {step === "quests" && (
          <>
            <Title eyebrow="Special quests" title="How often should the world call on you?" body="Optional quests appear a few times a week with bonus XP. Declining one never costs anything." />
            <div className="space-y-2">
              {(
                [
                  ["low", "Low", "A few per week. Quiet."],
                  ["normal", "Normal", "About one most days, never more than two."],
                  ["high", "High", "Up to two a day. For people who like side quests."],
                ] as const
              ).map(([v, l, d]) => (
                <button key={v} type="button" onClick={() => setQuestFreq(v)} className={cx("press flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left", questFreq === v ? "border-gold/50 bg-gold/10" : "border-border bg-card")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{l}</div>
                    <div className="text-xs text-muted">{d}</div>
                  </div>
                  <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border", questFreq === v ? "border-gold bg-gold text-[#1a1406]" : "border-border-strong")}>{questFreq === v && <Check size={14} strokeWidth={3} />}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "why" && (
          <>
            <Title eyebrow="Your reason" title="Why are you doing this?" body="In your own words. Nobody else sees it. Some mornings the app will remind you of it — not with generic positivity, with your reason." />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...WHY_SUGGESTIONS, ...reasons])).map((r) => (
                  <Chip key={r} active={reasons.includes(r)} onClick={() => toggleIn(reasons, setReasons, r)}>
                    {r}
                  </Chip>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="I want to…" className={inputClass} maxLength={160} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!customReason.trim()) return;
                    setReasons((xs) => [...xs, customReason.trim()]);
                    setCustomReason("");
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted">Optional. You can add or change reasons any time from your Profile.</p>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <Title eyebrow="Ready" title={`Welcome, ${name.trim() || "Adventurer"}.`} body="You start at the bottom. Everyone does. Ranks above D are proven over weeks, not claimed — log honestly and the climb takes care of itself." />
            <div className="card space-y-2 p-4 text-sm text-text-2">
              <Row k="Domains" v={domains.map((d) => DOMAINS[d].name).join(", ")} />
              {domains.includes("fitness") && <Row k="Training" v={`${workouts}×/week now → ${daysPerWeek}×/week · ${fitGoal} · ${lengthMin} min`} />}
              <Row k="Nutrition" v={`${nutGoal}${calories ? ` · ${calories} kcal` : ""}${protein ? ` · ${protein} g protein` : ""}${diets.length ? ` · ${diets.join(", ")}` : ""}`} />
              <Row k="Quests" v={`${questFreq} frequency`} />
              {reasons.length > 0 && <Row k="Why" v={reasons.join(" ")} />}
              {domains.includes("sleep") && <Row k="Sleep" v={`${sleepHours}h · bed by ${bedtime}`} />}
              {domains.includes("cooking") && <Row k="Cooking" v={`${meals} meals/week`} />}
              {domains.includes("skincare") && <Row k="Routines" v={`AM ${am.length} steps · PM ${pm.length} steps`} />}
              {domains.includes("sobriety") && <Row k="Trackers" v={trackers.map((t) => t.name).join(", ") || "none yet"} />}
              {domains.includes("habits") && <Row k="Habits" v={habits.join(", ") || "none yet"} />}
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6">
        {step === "done" ? (
          <Button onClick={submit} disabled={pending} full size="lg" variant="gold">
            {pending ? "Creating character…" : "Begin the climb · +50 XP"}
          </Button>
        ) : (
          <Button onClick={next} full size="lg">
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function Title({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mb-6">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="display mt-1 text-[26px] font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-muted">{k}</span>
      <span className="min-w-0 flex-1 text-text">{v}</span>
    </div>
  );
}

export function StepEditor({ label, steps, onChange, suggestions }: { label: string; steps: string[]; onChange: (s: string[]) => void; suggestions: string[] }) {
  const [custom, setCustom] = useState("");
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-text-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {Array.from(new Set([...suggestions, ...steps])).map((s) => {
          const active = steps.includes(s);
          return (
            <button key={s} type="button" onClick={() => onChange(active ? steps.filter((x) => x !== s) : [...steps, s])} className={cx("press rounded-full border px-3 py-1.5 text-xs", active ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
              {s}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add a step" className={cx(inputClass, "py-2")} maxLength={60} />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (!custom.trim()) return;
            onChange([...steps, custom.trim()]);
            setCustom("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
