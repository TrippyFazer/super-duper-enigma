"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile } from "@/services/profile";
import { reconcile } from "@/services/progression";
import { adventureReady, completeFollowUp, createAdventureOffer, createUserQuest, discoverAdventures, rateOffer, saveHomeArea, type AdventureCandidate } from "@/services/adventure";
import { completeOffer, declineOffer } from "@/services/questOffers";
import type { ActionFeedback } from "./index";

const windowSchema = z.enum(["now", "tonight", "weekend", "surprise"]);
const costSchema = z.enum(["free", "under20", "under50", "any"]);

/** FIND ME A QUEST: searches current events (cached) and returns 2–4 verified candidates, or an honest failure + curated fallbacks. */
export async function findQuestsAction(input: { window: "now" | "tonight" | "weekend" | "surprise"; cost?: "free" | "under20" | "under50" | "any"; radiusMi?: number }): Promise<{ candidates: AdventureCandidate[]; fallback: { title: string; description: string; xpReward: number; templateKey: string | null }[]; error: string | null; ready: boolean; reason: string | null }> {
  const s = z.object({ window: windowSchema, cost: costSchema.optional(), radiusMi: z.coerce.number().int().min(2).max(60).optional() }).parse(input);
  const p = getProfile();
  const ready = adventureReady(p);
  const r = await discoverAdventures({ profile: p, window: s.window, costPref: s.cost, radiusMi: s.radiusMi, limit: 4 });
  return { candidates: r.candidates, fallback: r.fallback.map((f) => ({ title: f.title, description: f.description, xpReward: f.xpReward, templateKey: f.templateKey })), error: r.error, ready: ready.ok, reason: ready.reason };
}

/** Accept a candidate: the offer is rebuilt from the cached event, never from client-supplied facts. */
export async function acceptAdventureAction(input: { eventId: number; title: string; description: string; why: string }): Promise<{ ok: boolean; id?: number; error?: string }> {
  const s = z.object({ eventId: z.number().int(), title: z.string().min(3).max(80), description: z.string().max(200), why: z.string().max(160) }).parse(input);
  const p = getProfile();
  const o = createAdventureOffer({ eventId: s.eventId, title: s.title, description: s.description, why: s.why, status: "accepted", today: p.today, profile: p });
  if (!o) return { ok: false, error: "That event is no longer in the cache. Search again." };
  revalidatePath("/", "layout");
  return { ok: true, id: o.id };
}

/** Accept a curated (non-event) fallback from FIND A QUEST. */
export async function acceptFallbackAction(templateKey: string): Promise<{ ok: boolean; error?: string }> {
  const { QUEST_LIBRARY } = await import("@/ranking/questLibrary");
  const { getDb } = await import("@/db/client");
  const { questOffers } = await import("@/db/schema");
  const q = QUEST_LIBRARY.find((x) => x.key === z.string().parse(templateKey));
  if (!q) return { ok: false, error: "Unknown quest" };
  const p = getProfile();
  const now = new Date();
  getDb().insert(questOffers).values({ templateKey: q.key, source: "library", title: q.title, description: q.description, domain: q.domain, difficulty: q.difficulty, kind: q.kind, estimatedMinutes: q.estimatedMinutes, xpReward: q.xp, status: "accepted", date: p.today, offeredAt: now.toISOString(), acceptedAt: now.toISOString(), expiresAt: new Date(now.getTime() + q.expiresInHours * 3600_000).toISOString(), params: "{}" }).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Did you go?" → yes completes (XP), no declines (nothing happens). */
export async function adventureOutcomeAction(id: number, went: boolean): Promise<ActionFeedback> {
  const p = getProfile();
  const oid = z.number().int().parse(id);
  if (!went) {
    declineOffer(oid);
    rateOffer(oid, "skipped", p);
    revalidatePath("/", "layout");
    return { ok: true, xpGained: 0, xpLines: [], levelUp: null, rankUps: [], achievements: [], questsCompleted: [] };
  }
  const r = completeOffer(oid, p.today);
  if (!r.offer) return { ok: false, error: "Quest not found", xpGained: 0, xpLines: [], levelUp: null, rankUps: [], achievements: [], questsCompleted: [] };
  if (r.offer.status === "expired") return { ok: false, error: "That one expired — no penalty. Another will come along.", xpGained: 0, xpLines: [], levelUp: null, rankUps: [], achievements: [], questsCompleted: [] };
  const rec = reconcile();
  revalidatePath("/", "layout");
  return { ok: true, xpGained: (r.xp?.awarded ? r.xp.amount : 0) + rec.xpGained, xpLines: r.xp?.awarded ? [`Adventure +${r.xp.amount}`] : [], levelUp: rec.levelUp, rankUps: rec.rankUps.map((x) => ({ domain: x.domain, from: x.from, to: x.to })), achievements: rec.newAchievements.map((a) => ({ key: a.key, name: a.name, title: a.title })), questsCompleted: rec.completedQuests.map((q) => ({ title: q.title, rewardXp: q.rewardXp })) };
}

export async function rateAdventureAction(id: number, rating: "loved" | "good" | "meh" | "not-for-me") {
  rateOffer(z.number().int().parse(id), z.enum(["loved", "good", "meh", "not-for-me"]).parse(rating));
  revalidatePath("/quests");
}

export async function followUpAction(id: number, input: { ingredient?: string }) {
  const p = getProfile();
  const r = completeFollowUp(z.number().int().parse(id), { ingredient: input.ingredient ? z.string().max(60).parse(input.ingredient) : undefined }, p.today);
  reconcile();
  revalidatePath("/", "layout");
  return r;
}

export async function createQuestAction(input: { title: string; enhance: boolean }): Promise<{ ok: boolean; title?: string; xp?: number; error?: string }> {
  try {
    const s = z.object({ title: z.string().trim().min(3).max(80), enhance: z.boolean() }).parse(input);
    const p = getProfile();
    const o = await createUserQuest({ title: s.title, enhance: s.enhance, today: p.today, profile: p });
    revalidatePath("/", "layout");
    return { ok: true, title: o.title, xp: o.xpReward };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveHomeAreaAction(input: { query: string; radiusMi: number }) {
  const s = z.object({ query: z.string().max(80), radiusMi: z.coerce.number().int().min(2).max(60) }).parse(input);
  const r = await saveHomeArea(s.query, s.radiusMi);
  revalidatePath("/", "layout");
  return r;
}
