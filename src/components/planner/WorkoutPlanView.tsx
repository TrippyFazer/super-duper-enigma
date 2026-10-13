"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Play, Clock, Zap, Info } from "lucide-react";
import { generateWorkoutAction, skipPlanAction, startSessionAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, cx, inputClass } from "@/components/ui/primitives";
import type { PlanExercise } from "@/planner/workoutTemplates";

export interface PlanViewModel {
  id: number;
  name: string;
  focus: string;
  estimatedMinutes: number;
  source: string;
  status: string;
  notes: string | null;
  exercises: PlanExercise[];
  bonus: { title: string; description: string; xp: number; minutes: number } | null;
}

export function WorkoutPlanView({ plan, aiEnabled }: { plan: PlanViewModel | null; aiEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [adjust, setAdjust] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);

  const generate = (opts: { force?: boolean; adjust?: string } = {}) =>
    start(async () => {
      const r = await generateWorkoutAction(opts);
      if (r.error) toast(`AI unavailable — used a template (${r.error.slice(0, 60)})`, "error");
      else toast(r.source === "ai" ? "Workout built by AI" : "Workout built from your rotation", "quest");
      setShowAdjust(false);
      setAdjust("");
      router.refresh();
    });
  const begin = () =>
    start(async () => {
      const r = await startSessionAction({ planId: plan?.id ?? null, name: plan?.name, focus: plan?.focus });
      router.push(`/planner/workout/session?id=${r.id}`);
    });

  if (!plan) {
    return (
      <section className="plate p-5 text-center">
        <Sparkles size={26} className="mx-auto text-gold" />
        <div className="display mt-3 text-lg font-semibold">Build today&apos;s workout</div>
        <p className="serif mt-1 text-[14px] text-muted">{aiEnabled ? "Personalised from your goal, equipment, recent sessions and recovery." : "From your rotation, equipment and what you trained recently. Add an AI key in Settings for personalisation."}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => generate()} disabled={pending} full variant="gold">
            {pending ? "Building…" : "Build today's workout"}
          </Button>
          <Button onClick={begin} disabled={pending} variant="secondary">
            Free session
          </Button>
        </div>
      </section>
    );
  }

  const done = plan.status === "completed";
  return (
    <section className="plate overflow-hidden">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow text-gold">{done ? "Completed" : plan.status === "skipped" ? "Skipped" : "Planned"} · {plan.source === "ai" ? "AI" : "template"}</div>
            <div className="display mt-0.5 text-xl font-semibold">{plan.name}</div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> ~{plan.estimatedMinutes} min
              </span>
              <span>{plan.exercises.length} exercises</span>
              <span className="capitalize">{plan.focus}</span>
            </div>
          </div>
          {!done && (
            <button onClick={begin} disabled={pending} className="press flex h-11 shrink-0 items-center gap-1.5 rounded-sm bg-gradient-to-b from-gold-2 to-gold px-4 text-sm font-semibold text-[#1a1406] disabled:opacity-60" style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}>
              <Play size={15} /> Start
            </button>
          )}
        </div>
        {plan.notes && (
          <p className="serif mt-2 flex items-start gap-1.5 text-[13.5px] text-text-2">
            <Info size={13} className="mt-0.5 shrink-0 text-muted" /> {plan.notes}
          </p>
        )}
      </div>
      <div className="gold-rule mx-4" />
      <ol className="divide-y divide-border/60">
        {plan.exercises.map((e, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <span className="display w-5 text-sm text-gold">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px]">{e.name}</div>
              {e.notes && <div className="serif text-[12.5px] text-muted">{e.notes}</div>}
            </div>
            <div className="tabular text-right text-sm text-text-2">
              {e.sets} × {e.reps}
              <div className="text-[10px] text-faint">rest {e.restSeconds}s</div>
            </div>
          </li>
        ))}
      </ol>
      {plan.bonus && (
        <div className="mx-4 my-3 flex items-start gap-2 rounded-sm border border-gold/30 bg-gold/8 px-3 py-2.5 text-sm">
          <Zap size={14} className="mt-0.5 shrink-0 text-gold" />
          <div>
            <div className="font-medium">Optional: {plan.bonus.title}</div>
            <div className="serif text-[12.5px] text-muted">{plan.bonus.description} · +{plan.bonus.xp} XP when logged as a walk after the session.</div>
          </div>
        </div>
      )}
      {!done && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => generate({ force: true })}>
            <RefreshCw size={13} /> Regenerate
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setShowAdjust((v) => !v)}>
            Adjust…
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await skipPlanAction(plan.id); router.refresh(); })}>
            Skip today
          </Button>
        </div>
      )}
      {showAdjust && (
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {["I'm tired — make it lighter", "Only 30 minutes today", "No barbell today", "Skip legs, they're sore", "Add more cardio"].map((s) => (
              <button key={s} onClick={() => setAdjust(s)} className={cx("press rounded-full border px-3 py-1.5 text-xs", adjust === s ? "border-gold/60 bg-gold/12 text-gold" : "border-border bg-card-2 text-text-2")}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={adjust} onChange={(e) => setAdjust(e.target.value)} placeholder="Or describe the change" className={inputClass} maxLength={300} />
            <Button disabled={pending || !adjust.trim()} onClick={() => generate({ adjust })}>
              Rebuild
            </Button>
          </div>
          {!aiEnabled && <p className="text-[11px] text-faint">Without AI, adjustments map to template options (lighter / shorter / no barbell / skip legs / cardio).</p>}
        </div>
      )}
    </section>
  );
}
