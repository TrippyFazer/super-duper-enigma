import type { EventCategory, InterestLevel } from "@/events/types";
import { INTERESTS, priceLabel } from "@/events/types";
import type { OutdoorSuitability } from "@/events/weather";

/**
 * Pure rules for real-world ("adventure") quests. No DB, no network, no AI —
 * so every rule is unit-testable and the AI can only decorate what passes.
 */
export type CostPref = "free" | "under20" | "under50" | "any";
export type Window = "now" | "tonight" | "weekend" | "surprise";

export interface AdventureEvent {
  id: number;
  name: string;
  description: string;
  category: EventCategory;
  startAt: string;
  endAt: string | null;
  venue: string | null;
  distanceMi: number | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
  url: string | null;
  sourceName: string;
}

export interface AdventureContext {
  now: Date;
  window: Window;
  radiusMi: number;
  costPref: CostPref;
  interests: Record<string, InterestLevel>;
  /** learned category affinity, roughly -2..2 */
  learned: Record<string, number>;
  /** venues / event names offered in the last 30 days */
  recentVenues: string[];
  recentEventNames: string[];
  /** categories offered in the last 3 days */
  recentCategories: EventCategory[];
  /** categories declined in the last 14 days */
  declinedCategories: EventCategory[];
  weatherAt?: (iso: string) => OutdoorSuitability;
  /** local hour now */
  localHour: number;
}

export const OUTDOOR: EventCategory[] = ["outdoor", "market", "festival"];

export function windowRange(window: Window, now: Date): { from: Date; to: Date } {
  const from = new Date(now.getTime() - 60 * 60_000); // ongoing events that started within the hour still count
  if (window === "now") return { from, to: new Date(now.getTime() + 4 * 3600_000) };
  if (window === "tonight") {
    const end = new Date(now);
    end.setUTCHours(end.getUTCHours() + 10);
    return { from, to: end };
  }
  if (window === "weekend") {
    const d = new Date(now);
    const day = d.getUTCDay();
    const toFri = (5 - day + 7) % 7;
    const fri = new Date(d.getTime() + toFri * 86_400_000);
    const sunEnd = new Date(fri.getTime() + 3 * 86_400_000);
    return { from: day >= 5 || day === 0 ? from : fri, to: sunEnd };
  }
  return { from, to: new Date(now.getTime() + 7 * 86_400_000) };
}

/** Why an event was rejected, for debugging and tests. */
export function rejectReason(e: AdventureEvent, ctx: AdventureContext): string | null {
  const start = new Date(e.startAt).getTime();
  const minsUntil = (start - ctx.now.getTime()) / 60_000;
  const { from, to } = windowRange(ctx.window, ctx.now);
  if (start < from.getTime() || start > to.getTime()) return "outside window";
  if (e.distanceMi != null && e.distanceMi > ctx.radiusMi) return "outside radius";
  // Transport feasibility: ~3 min per mile plus 20 min to get moving.
  if (minsUntil < (e.distanceMi ?? 5) * 3 + 20 && minsUntil > -60) return "not enough time to get there";
  if (ctx.costPref === "free" && !e.isFree) return "not free";
  const cost = e.priceMin ?? e.priceMax;
  if (ctx.costPref === "under20" && !e.isFree && cost != null && cost > 20) return "over $20";
  if (ctx.costPref === "under50" && !e.isFree && cost != null && cost > 50) return "over $50";
  if (ctx.recentEventNames.some((n) => n.toLowerCase() === e.name.toLowerCase())) return "offered recently";
  if (interestLevel(e.category, ctx.interests) === "no") return "not interested";
  if (OUTDOOR.includes(e.category) && ctx.weatherAt?.(e.startAt) === "bad") return "bad weather for an outdoor event";
  // Late-night starts are only offered when nightlife is welcome.
  const startHour = new Date(e.startAt).getUTCHours();
  if (e.category !== "nightlife" && minsUntil < 24 * 60 && ctx.localHour >= 22 && minsUntil < 120) return "too late tonight";
  void startHour;
  return null;
}

export function interestLevel(category: EventCategory, interests: Record<string, InterestLevel>): InterestLevel {
  const levels = INTERESTS.filter((i) => i.categories.includes(category)).map((i) => interests[i.key]).filter((x): x is InterestLevel => !!x);
  if (levels.includes("love")) return "love";
  if (levels.includes("interested")) return "interested";
  if (levels.length && levels.every((l) => l === "no")) return "no";
  return "neutral";
}

const LEVEL_SCORE: Record<InterestLevel, number> = { love: 30, interested: 18, neutral: 6, no: -100 };

export function scoreEvent(e: AdventureEvent, ctx: AdventureContext): number {
  let s = 50 + LEVEL_SCORE[interestLevel(e.category, ctx.interests)];
  s += Math.max(-25, Math.min(25, (ctx.learned[e.category] ?? 0) * 12));
  if (e.distanceMi != null) s -= Math.min(20, e.distanceMi * 1.2);
  if (e.isFree) s += 6;
  else if ((e.priceMin ?? 0) > 60) s -= 10;
  if (ctx.recentCategories.includes(e.category)) s *= 0.6;
  if (ctx.declinedCategories.includes(e.category)) s *= 0.75;
  if (e.venue && ctx.recentVenues.some((v) => v.toLowerCase() === e.venue!.toLowerCase())) s *= 0.5;
  const w = OUTDOOR.includes(e.category) ? ctx.weatherAt?.(e.startAt) : undefined;
  if (w === "good") s += 8;
  if (w === "iffy") s *= 0.7;
  if (!e.description && e.sourceName !== "Ticketmaster") s -= 4;
  return Math.round(s * 10) / 10;
}

/** XP reflects novelty, effort, activity and getting out into the world — never the ticket price. */
export function eventXp(e: AdventureEvent, ctx: Pick<AdventureContext, "recentVenues">): { xp: number; difficulty: "uncommon" | "rare" } {
  const base: Record<EventCategory, number> = { music: 60, sports: 55, food: 55, comedy: 55, film: 50, arts: 60, outdoor: 80, market: 55, festival: 70, community: 60, class: 75, nightlife: 50, family: 50, other: 50 };
  let xp = base[e.category];
  const newVenue = !e.venue || !ctx.recentVenues.some((v) => v.toLowerCase() === e.venue!.toLowerCase());
  if (newVenue) xp += 5;
  if (e.distanceMi != null && e.distanceMi > 15) xp += 5;
  xp = Math.max(45, Math.min(85, xp));
  return { xp, difficulty: xp >= 65 ? "rare" : "uncommon" };
}

/** An event quest expires at the event start plus a grace period (or end of the event when known). */
export function eventExpiry(e: AdventureEvent): string {
  const start = new Date(e.startAt).getTime();
  const end = e.endAt ? new Date(e.endAt).getTime() : start;
  return new Date(Math.max(start + 2 * 3600_000, end + 30 * 60_000)).toISOString();
}

/** Cross-domain hooks: what the quest connects to after completion. */
export function followUpFor(category: EventCategory): { kind: "pantry" | "workout" | "none"; prompt: string } {
  if (category === "market" || category === "food") return { kind: "pantry", prompt: "Pick up one ingredient you've never cooked with — add it to your pantry." };
  if (category === "outdoor") return { kind: "workout", prompt: "Log the walk or hike afterwards — it counts as training." };
  return { kind: "none", prompt: "" };
}

/** Deterministic framing when no AI is configured (or AI output fails validation). */
export function templateFraming(e: AdventureEvent, ctx: Pick<AdventureContext, "interests">): { title: string; description: string; why: string } {
  const lvl = interestLevel(e.category, ctx.interests);
  const why = lvl === "love" ? "You said you love this kind of thing." : lvl === "interested" ? "Matches an interest you set." : "Something different, close to home.";
  const T: Record<EventCategory, [string, string]> = {
    music: ["Live set", `Go hear ${e.name}${e.venue ? ` at ${e.venue}` : ""}. Stay for at least three songs.`],
    sports: ["Game day", `Watch ${e.name}${e.venue ? ` at ${e.venue}` : ""} in person.`],
    food: ["Taste test", `Go to ${e.name} and try one thing you can't name.`],
    comedy: ["Laugh track", `See ${e.name}. Sit somewhere other than the back.`],
    film: ["Screening", `Catch ${e.name} on a real screen.`],
    arts: ["Gallery night", `Visit ${e.name}. Find one piece you'd hang at home.`],
    outdoor: ["Fresh air", `Join ${e.name}. Move for at least 30 minutes.`],
    market: ["Market run", `Explore ${e.name} and pick one ingredient you've never cooked with.`],
    festival: ["Festival", `Spend an hour at ${e.name}. Talk to one stranger.`],
    community: ["Side quest", `Show up to ${e.name}. Say hello to someone.`],
    class: ["Learn something", `Take ${e.name}. Leave with one thing you didn't know.`],
    nightlife: ["Night out", `Go to ${e.name}. Be home before it stops being fun.`],
    family: ["Family outing", `Go to ${e.name} with someone.`],
    other: ["An adventure appeared", `Check out ${e.name}${e.venue ? ` at ${e.venue}` : ""}.`],
  };
  const [title, description] = T[e.category];
  return { title, description, why };
}

export function costText(e: AdventureEvent): string {
  return priceLabel(e);
}

/** Learned affinity update from explicit feedback. Bounded so one rating never dominates. */
export function applyFeedback(learned: Record<string, number>, category: EventCategory, rating: "loved" | "good" | "meh" | "not-for-me" | "declined" | "skipped"): Record<string, number> {
  const delta = { loved: 0.6, good: 0.3, meh: -0.2, "not-for-me": -0.6, declined: -0.25, skipped: -0.1 }[rating];
  const cur = learned[category] ?? 0;
  return { ...learned, [category]: Math.max(-2, Math.min(2, Math.round((cur + delta) * 100) / 100)) };
}

/** Pick 2–4 diverse candidates: best score first, at most two per category. */
export function pickCandidates(events: AdventureEvent[], ctx: AdventureContext, limit = 4): { event: AdventureEvent; score: number }[] {
  const scored = events
    .filter((e) => !rejectReason(e, ctx))
    .map((e) => ({ event: e, score: scoreEvent(e, ctx) }))
    .sort((a, b) => b.score - a.score);
  const out: { event: AdventureEvent; score: number }[] = [];
  const perCat = new Map<string, number>();
  for (const x of scored) {
    const n = perCat.get(x.event.category) ?? 0;
    if (n >= 2) continue;
    perCat.set(x.event.category, n + 1);
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}
