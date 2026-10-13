"use client";

import { useState, useTransition } from "react";
import { savePreferencesAction } from "@/actions/planner";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button } from "@/components/ui/primitives";
import type { Preferences } from "@/services/preferences";
import { AiProviderCard, type AiStatusView } from "./settings/AiProviderCard";
import { TrainingCard } from "./settings/TrainingCard";
import { NutritionCard, type NutritionForm } from "./settings/NutritionCard";
import { RemindersCard } from "./settings/RemindersCard";

/** Orchestrates the planner settings cards; one save for everything below. */
export function PlannerSettings({ prefs, ai, estimated, minCalories }: { prefs: Preferences; ai: AiStatusView; estimated: { calories: number; protein: number }; minCalories: number }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [f, setF] = useState(prefs.fitness);
  const [n, setN] = useState<NutritionForm>({ ...prefs.nutrition, dislikes: prefs.nutrition.dislikes.join(", "), likes: prefs.nutrition.likes.join(", ") });
  const [qf, setQf] = useState(prefs.questFrequency);
  const [notif, setNotif] = useState(prefs.notifications);
  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = () =>
    start(async () => {
      try {
        await savePreferencesAction({
          fitness: f,
          nutrition: { ...n, calorieTarget: n.calorieTarget || null, proteinTarget: n.proteinTarget || null, carbTarget: n.carbTarget || null, fatTarget: n.fatTarget || null, dislikes: split(n.dislikes), likes: split(n.likes) },
          questFrequency: qf,
          notifications: notif,
        });
        toast("Saved", "quest");
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });

  return (
    <div className="space-y-4">
      <AiProviderCard ai={ai} />
      <TrainingCard f={f} onChange={setF} />
      <NutritionCard n={n} onChange={setN} estimated={estimated} minCalories={minCalories} />
      <RemindersCard qf={qf} onQf={setQf} notif={notif} onNotif={setNotif} />
      <Button onClick={save} disabled={pending} full size="lg" variant="gold">
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
