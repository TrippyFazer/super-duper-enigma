"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppleHealthProvider, connectAppleHealth, disconnectAppleHealth, ignoreHealthWorkout, linkHealthWorkout } from "@/health/apple";
import { reconcile } from "@/services/progression";

export async function connectAppleHealthAction(): Promise<{ token: string }> {
  const r = connectAppleHealth();
  revalidatePath("/profile/settings", "layout");
  return r;
}

export async function disconnectAppleHealthAction(deleteSamples: boolean) {
  disconnectAppleHealth({ deleteSamples });
  revalidatePath("/", "layout");
}

export async function syncAppleHealthAction(days = 30): Promise<{ ok: boolean; message: string }> {
  const r = await AppleHealthProvider.sync({ days: z.number().int().min(1).max(365).parse(days) });
  if (r.ok) reconcile();
  revalidatePath("/", "layout");
  return { ok: r.ok, message: r.message };
}

export async function linkHealthWorkoutAction(id: number, workoutId: number | null) {
  linkHealthWorkout(z.number().int().parse(id), workoutId == null ? null : z.number().int().parse(workoutId));
  reconcile();
  revalidatePath("/", "layout");
}

export async function ignoreHealthWorkoutAction(id: number) {
  ignoreHealthWorkout(z.number().int().parse(id));
  revalidatePath("/", "layout");
}
