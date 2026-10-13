"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/actions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Field, cx, inputClass } from "@/components/ui/primitives";
import { DOMAINS } from "@/ranking/domains";
import type { DomainId } from "@/ranking/types";
import type { Targets } from "@/services/profile";

export function SettingsForm({ profile }: { profile: { name: string; age: number | null; timezone: string; activeDomains: DomainId[]; targets: Targets; goals: string | null } }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [domains, setDomains] = useState<DomainId[]>(profile.activeDomains);
  const [t, setT] = useState({
    stepsTarget: String(profile.targets.stepsTarget),
    workoutsPerWeekTarget: String(profile.targets.workoutsPerWeekTarget),
    mealsPerWeekTarget: String(profile.targets.mealsPerWeekTarget),
  });
  const [goals, setGoals] = useState(profile.goals ?? "");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      try {
        await updateProfileAction({
          name,
          age: age ? Number(age) : null,
          timezone,
          activeDomains: domains,
          targets: {
            stepsTarget: Number(t.stepsTarget) || 7500,
            workoutsPerWeekTarget: Number(t.workoutsPerWeekTarget) || 3,
            mealsPerWeekTarget: Number(t.mealsPerWeekTarget) || 7,
          },
          goals: goals || null,
        });
        toast("Settings saved", "quest");
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="eyebrow">Character</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={40} />
          </Field>
          <Field label="Age">
            <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Timezone" hint="Determines what 'today' means for logging.">
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} list="tz" />
          <datalist id="tz">
            {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney", "UTC"].map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
        <Field label="Goals (optional)">
          <textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2} className={inputClass} maxLength={500} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <div className="eyebrow">Active domains</div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(DOMAINS) as DomainId[]).map((d) => {
            const on = domains.includes(d);
            return (
              <button key={d} type="button" onClick={() => setDomains((xs) => (on ? xs.filter((x) => x !== d) : [...xs, d]))} className={cx("press rounded-xl border px-3 py-2.5 text-left text-sm", on ? "border-gold/50 bg-gold/10 text-gold" : "border-border bg-card-2 text-text-2")}>
                {DOMAINS[d].name}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-faint">Disabled domains are excluded from your overall rank. Their data is kept.</p>
      </Card>

      <Card className="space-y-4">
        <div className="eyebrow">Targets</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Workouts / week">
            <input type="number" inputMode="numeric" min={1} max={7} value={t.workoutsPerWeekTarget} onChange={(e) => setT({ ...t, workoutsPerWeekTarget: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Meals cooked / week">
            <input type="number" inputMode="numeric" min={1} max={21} value={t.mealsPerWeekTarget} onChange={(e) => setT({ ...t, mealsPerWeekTarget: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Steps / day">
            <input type="number" inputMode="numeric" step={500} value={t.stepsTarget} onChange={(e) => setT({ ...t, stepsTarget: e.target.value })} className={inputClass} />
          </Field>
          <p className="col-span-2 text-[11px] text-muted">Sleep duration, wake time and bedtime live in the Sleep schedule section below.</p>
        </div>
      </Card>

      <Button onClick={save} disabled={pending || domains.length === 0 || !name.trim()} full size="lg" variant="gold">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
