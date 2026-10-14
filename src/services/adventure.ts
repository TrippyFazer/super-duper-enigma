import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { questOffers, type LocalEvent, type QuestOffer } from "@/db/schema";
import { addDays, type ISODate } from "@/lib/dates";
import { parseJson, toJson } from "@/lib/json";
import { buildAiContext } from "@/ai/context";
import { enhanceUserQuest, frameAdventures, readCache, writeCache } from "@/ai/generate";
import { isAiEnabled } from "@/ai/config";
import { configuredEventSources } from "@/events/sources";
import { cachedEvents, eventById, fetchAndCacheEvents, withDistance } from "@/events/search";
import { fetchForecast, outdoorSuitability, type Forecast } from "@/events/weather";
import { geocode } from "@/events/geo";
import { INTERESTS, priceLabel, type EventCategory, type EventSource } from "@/events/types";
import { applyFeedback, eventExpiry, eventXp, followUpFor, pickCandidates, templateFraming, windowRange, type AdventureContext, type AdventureEvent, type CostPref, type Window } from "@/quests/adventure";
import { QUEST_LIBRARY } from "@/ranking/questLibrary";
import { pushNotification } from "./notifications";
import { getProfile, updateProfile, type ProfileView } from "./profile";
import { getAssessment } from "./progression";
import { libraryCandidate, openOffer, type ValidatedCandidate } from "./questOffers";
import { awardXp } from "./xp";
import { upsertPantry } from "./pantry";

/**
 * Adventure (real-world) quests.
 *
 *   EVENT SEARCH (cached) → deterministic filter/score → AI frames the best
 *   2–4 (or templates) → validation → offer.
 *
 * The model never supplies a fact. If every source fails, the answer is
 * "Couldn't refresh nearby events." plus curated non-event quests.
 */
export interface AdventureCandidate {
  eventId: number;
  title: string;
  description: string;
  why: string;
  category: EventCategory;
  eventName: string;
  venue: string | null;
  startAt: string;
  endAt: string | null;
  distanceMi: number | null;
  price: string;
  isFree: boolean;
  url: string | null;
  sourceName: string;
  xp: number;
  difficulty: "uncommon" | "rare";
  expiresAt: string;
  framing: "ai" | "template";
  score: number;
}

export interface DiscoverResult {
  candidates: AdventureCandidate[];
  /** non-event fallbacks when nothing real is available */
  fallback: ValidatedCandidate[];
  error: string | null;
  fetched: boolean;
  reason?: string;
}

const DOMAIN_FOR: Record<EventCategory, string> = { music: "habits", sports: "fitness", food: "cooking", comedy: "habits", film: "habits", arts: "habits", outdoor: "fitness", market: "cooking", festival: "habits", community: "habits", class: "habits", nightlife: "habits", family: "habits", other: "habits" };

export function adventureReady(profile: ProfileView, env: Partial<NodeJS.ProcessEnv> = process.env): { ok: boolean; reason: string | null; sources: number } {
  const loc = profile.preferences.location;
  const sources = configuredEventSources(env).length;
  if (!profile.preferences.adventure.enabled) return { ok: false, reason: "Adventure quests are off in Settings.", sources };
  if (loc.lat == null || loc.lng == null) return { ok: false, reason: "Set your home area in Settings → Adventure to find real events nearby.", sources };
  if (!sources) return { ok: false, reason: "No event source configured (TICKETMASTER_API_KEY or EVENT_ICS_URLS).", sources };
  return { ok: true, reason: null, sources };
}

function toAdventureEvent(e: LocalEvent & { distanceMi: number | null }): AdventureEvent {
  return { id: e.id, name: e.name, description: e.description, category: e.category as EventCategory, startAt: e.startAt, endAt: e.endAt, venue: e.venue, distanceMi: e.distanceMi, priceMin: e.priceMin, priceMax: e.priceMax, isFree: e.isFree, url: e.url, sourceName: e.sourceName };
}

function offerHistory(today: ISODate) {
  const db = getDb();
  const rows = db.select().from(questOffers).where(and(gte(questOffers.date, addDays(today, -30)), isNotNull(questOffers.eventId))).all();
  const last3 = rows.filter((r) => r.date >= addDays(today, -3));
  const declined = rows.filter((r) => r.status === "declined" && r.date >= addDays(today, -14));
  return {
    recentVenues: rows.map((r) => r.venue).filter((x): x is string => !!x),
    recentEventNames: rows.map((r) => parseJson<{ eventName?: string }>(r.params, {}).eventName ?? r.title),
    recentCategories: last3.map((r) => r.category as EventCategory).filter(Boolean),
    declinedCategories: declined.map((r) => r.category as EventCategory).filter(Boolean),
  };
}

async function forecastFor(lat: number, lng: number, today: ISODate, fetchImpl?: typeof fetch): Promise<Forecast | null> {
  const key = `wx:${lat.toFixed(2)},${lng.toFixed(2)}:${today}`;
  const cached = readCache<Forecast>("weather", key);
  if (cached) return cached;
  const fc = await fetchForecast(lat, lng, { fetchImpl });
  if (fc) writeCache("weather", key, today, fc);
  return fc;
}

export async function discoverAdventures(opts: { profile?: ProfileView; window: Window; costPref?: CostPref; radiusMi?: number; limit?: number; force?: boolean; sources?: EventSource[]; now?: Date; fetchImpl?: typeof fetch; weather?: boolean }): Promise<DiscoverResult> {
  const profile = opts.profile ?? getProfile();
  const now = opts.now ?? new Date();
  const today = profile.today;
  const ready = adventureReady(profile);
  const sources = opts.sources ?? configuredEventSources();
  const fallback = curatedFallback(profile);
  if (!ready.ok && !opts.sources) return { candidates: [], fallback, error: ready.reason, fetched: false, reason: ready.reason ?? undefined };
  const loc = profile.preferences.location;
  const home = { lat: loc.lat!, lng: loc.lng! };
  const radius = opts.radiusMi ?? loc.radiusMi;
  const { from, to } = windowRange(opts.window, now);

  // Fetch at most every 6 hours per area; otherwise serve the cache (cost control).
  const areaKey = `fetch:${home.lat.toFixed(2)},${home.lng.toFixed(2)}`;
  const last = readCache<{ at: string; errors: { source: string; error: string }[] }>("events", areaKey);
  const fresh = last && now.getTime() - new Date(last.at).getTime() < 6 * 3600_000;
  let errors: { source: string; error: string }[] = last?.errors ?? [];
  let fetched = false;
  if (!fresh || opts.force) {
    const r = await fetchAndCacheEvents({ lat: home.lat, lng: home.lng, radiusMi: Math.max(radius, 25), from: new Date(now.getTime() - 3600_000), to: new Date(now.getTime() + 8 * 86_400_000), sources });
    errors = r.errors;
    fetched = r.fetched;
    writeCache("events", areaKey, today, { at: now.toISOString(), errors });
  }
  const events = withDistance(cachedEvents(from, to), home).map(toAdventureEvent);
  const allFailed = sources.length > 0 && errors.length >= sources.length && events.length === 0;
  const forecast = opts.weather === false ? null : await forecastFor(home.lat, home.lng, today, opts.fetchImpl);
  const hist = offerHistory(today);
  const ctx: AdventureContext = {
    now,
    window: opts.window,
    radiusMi: radius,
    costPref: opts.costPref ?? profile.preferences.adventure.costPref,
    interests: profile.preferences.adventure.interests,
    learned: profile.preferences.adventure.learned,
    ...hist,
    weatherAt: forecast ? (iso) => outdoorSuitability(forecast, iso) : undefined,
    localHour: Number(profile.localTime.slice(0, 2)),
  };
  const picks = pickCandidates(events, ctx, opts.limit ?? 4);
  if (!picks.length) return { candidates: [], fallback, error: allFailed ? "Couldn't refresh nearby events." : null, fetched };

  // AI frames only the shortlist; templates cover the rest.
  const interestsOn = Object.entries(profile.preferences.adventure.interests).filter(([, v]) => v === "love" || v === "interested").map(([k]) => INTERESTS.find((i) => i.key === k)?.label ?? k);
  const framed = isAiEnabled()
    ? await frameAdventures(buildAiContext(profile, profile.preferences, getAssessment(profile)), picks.map(({ event: e }) => ({ id: e.id, name: e.name, category: e.category, venue: e.venue, startAt: e.startAt, price: priceLabel(e), distanceMi: e.distanceMi, description: e.description.slice(0, 160) })), { interests: interestsOn, window: opts.window })
    : new Map();
  const candidates = picks.map(({ event: e, score }) => {
    const f = framed.get(e.id) ?? templateFraming(e, ctx);
    const { xp, difficulty } = eventXp(e, ctx);
    return { eventId: e.id, title: f.title, description: f.description, why: f.why, category: e.category, eventName: e.name, venue: e.venue, startAt: e.startAt, endAt: e.endAt, distanceMi: e.distanceMi, price: priceLabel(e), isFree: !!e.isFree, url: e.url, sourceName: e.sourceName, xp, difficulty, expiresAt: eventExpiry(e), framing: framed.has(e.id) ? ("ai" as const) : ("template" as const), score };
  });
  return { candidates, fallback: [], error: errors.length && !allFailed ? `Some sources failed (${errors.map((e) => e.source).join(", ")}).` : null, fetched };
}

/** Curated non-event quests, used when events are unavailable. Never fabricated events. */
export function curatedFallback(profile: ProfileView): ValidatedCandidate[] {
  const hour = Number(profile.localTime.slice(0, 2));
  return QUEST_LIBRARY.filter((q) => !q.window || (hour >= q.window[0] && hour <= q.window[1]))
    .filter((q) => profile.activeDomains.includes(q.domain))
    .slice(0, 12)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 3)
    .map(libraryCandidate);
}

/** Rebuild a candidate from the cached event (never trusting client-sent facts) and store it as an offer. */
export function createAdventureOffer(input: { eventId: number; title: string; description: string; why: string; status: "offered" | "accepted"; today: ISODate; now?: Date; profile?: ProfileView }): QuestOffer | null {
  const db = getDb();
  const now = input.now ?? new Date();
  const profile = input.profile ?? getProfile();
  const raw = eventById(input.eventId);
  if (!raw) return null;
  const loc = profile.preferences.location;
  const e = toAdventureEvent(withDistance([raw], { lat: loc.lat ?? 0, lng: loc.lng ?? 0 })[0]);
  if (loc.lat == null) e.distanceMi = null;
  const existing = db.select().from(questOffers).where(and(eq(questOffers.eventId, e.id), inArray(questOffers.status, ["offered", "accepted"]))).get();
  if (existing) return existing;
  const { xp, difficulty } = eventXp(e, offerHistory(input.today));
  const fu = followUpFor(e.category);
  return db
    .insert(questOffers)
    .values({
      templateKey: `event:${e.category}`,
      source: "event",
      title: input.title.slice(0, 80),
      description: input.description.slice(0, 200),
      domain: DOMAIN_FOR[e.category],
      difficulty,
      kind: e.category === "community" || e.category === "nightlife" ? "social" : e.category === "market" || e.category === "class" ? "discovery" : "adventure",
      estimatedMinutes: 90,
      xpReward: xp,
      status: input.status,
      date: input.today,
      offeredAt: now.toISOString(),
      acceptedAt: input.status === "accepted" ? now.toISOString() : null,
      expiresAt: eventExpiry(e),
      params: toJson({ eventName: e.name, category: e.category }),
      eventId: e.id,
      category: e.category,
      venue: e.venue,
      startAt: e.startAt,
      endAt: e.endAt,
      priceLabel: priceLabel(e),
      distanceMi: e.distanceMi,
      sourceName: e.sourceName,
      sourceUrl: e.url,
      why: input.why.slice(0, 160),
      followUp: fu.kind === "none" ? null : toJson(fu),
    })
    .returning()
    .get();
}

/**
 * Occasional automatic discovery: Thu–Sat, or when the weekend is near, at most
 * once a day, never when another quest is open, and only with a home area set.
 */
export async function maybeDiscoverAdventure(profile: ProfileView, now = new Date()): Promise<QuestOffer | null> {
  const ready = adventureReady(profile);
  if (!ready.ok) return null;
  if (openOffer()) return null;
  const today = profile.today;
  const key = `auto:${today}`;
  if (readCache<{ ran: boolean }>("adventure", key)) return null;
  const hour = Number(profile.localTime.slice(0, 2));
  if (hour < 9 || hour >= 21) return null;
  const wd = new Date(today + "T00:00:00Z").getUTCDay();
  const weekendNear = wd >= 4 || wd === 0;
  const seed = Number(today.replace(/-/g, "")) % 100;
  if (!weekendNear && seed > 25) return null; // ~25% of other days
  writeCache("adventure", key, today, { ran: true });
  const r = await discoverAdventures({ profile, window: weekendNear ? "weekend" : "surprise", now, limit: 2 });
  const best = r.candidates[0];
  if (!best) return null;
  const offer = createAdventureOffer({ eventId: best.eventId, title: best.title, description: best.description, why: best.why, status: "offered", today, now, profile });
  if (offer) pushNotification(profile.preferences.notifications, { kind: "quest", title: "⚔ An adventure appeared", body: `${offer.title} · ${offer.venue ?? ""} · +${offer.xpReward} XP`, href: "/quests", key: `n:offer:${offer.id}` });
  return offer;
}

/** Feedback after an adventure: improves future ranking; never affects XP already earned. */
export function rateOffer(id: number, rating: "loved" | "good" | "meh" | "not-for-me" | "skipped" | "declined", profile: ProfileView = getProfile()): QuestOffer | null {
  const db = getDb();
  const o = db.select().from(questOffers).where(eq(questOffers.id, id)).get();
  if (!o) return null;
  if (rating !== "declined") db.update(questOffers).set({ feedback: rating }).where(eq(questOffers.id, id)).run();
  if (o.category) {
    const learned = applyFeedback(profile.preferences.adventure.learned, o.category as EventCategory, rating);
    updateProfile({ preferences: { adventure: { learned } } });
  }
  return db.select().from(questOffers).where(eq(questOffers.id, id)).get() ?? null;
}

/** User-created quest, optionally enhanced by AI. Always accepted immediately; expires end of tomorrow. */
export async function createUserQuest(input: { title: string; enhance: boolean; today: ISODate; now?: Date; profile?: ProfileView }): Promise<QuestOffer> {
  const db = getDb();
  const now = input.now ?? new Date();
  const profile = input.profile ?? getProfile();
  const title = input.title.trim().slice(0, 80);
  let framed: { title: string; description: string; domain: string; xpReward: number; estimatedMinutes: number } = { title, description: "", domain: "habits", xpReward: 30, estimatedMinutes: 30 };
  if (input.enhance && isAiEnabled()) {
    const e = await enhanceUserQuest(buildAiContext(profile, profile.preferences, getAssessment(profile)), title);
    if (e) framed = { title: e.title, description: e.description, domain: e.domain, xpReward: e.xpReward, estimatedMinutes: e.estimatedMinutes };
  } else if (/grocer|shopping|supply/i.test(title)) {
    framed = { title: "Supply run", description: `${title}. Keep it useful: plan a few days, stay near budget.`, domain: "cooking", xpReward: 40, estimatedMinutes: 60 };
  }
  const expires = new Date(now.getTime() + 36 * 3600_000).toISOString();
  return db
    .insert(questOffers)
    .values({ templateKey: null, source: "user", title: framed.title, description: framed.description, domain: framed.domain, difficulty: framed.xpReward > 30 ? "uncommon" : "common", kind: "custom", estimatedMinutes: framed.estimatedMinutes, xpReward: Math.max(15, Math.min(60, framed.xpReward)), status: "accepted", date: input.today, offeredAt: now.toISOString(), acceptedAt: now.toISOString(), expiresAt: expires, params: toJson({ original: title }) })
    .returning()
    .get();
}

/** Cross-domain follow-up: the market ingredient goes into the pantry. */
export function completeFollowUp(id: number, input: { ingredient?: string }, today: ISODate): { ok: boolean; message: string } {
  const db = getDb();
  const o = db.select().from(questOffers).where(eq(questOffers.id, id)).get();
  if (!o || !o.followUp) return { ok: false, message: "No follow-up for this quest" };
  const fu = parseJson<{ kind: string; prompt: string; done?: boolean }>(o.followUp, { kind: "none", prompt: "" });
  if (fu.kind === "pantry" && input.ingredient?.trim()) {
    upsertPantry({ name: input.ingredient.trim().slice(0, 60), level: "some", purchasedAt: today, source: "adventure" });
    awardXp("quest_special", today, { suffix: `ingredient${id}`, amount: 10, description: "New ingredient from an adventure", source: { type: "offer", id } });
    db.update(questOffers).set({ followUp: toJson({ ...fu, done: true, ingredient: input.ingredient.trim() }) }).where(eq(questOffers.id, id)).run();
    return { ok: true, message: `${input.ingredient.trim()} added to your pantry · +10 XP` };
  }
  db.update(questOffers).set({ followUp: toJson({ ...fu, done: true }) }).where(eq(questOffers.id, id)).run();
  return { ok: true, message: "Noted" };
}

/** Save a typed home area (city / ZIP / region) and resolve coordinates when possible. No GPS. */
export async function saveHomeArea(query: string, radiusMi: number, opts: { fetchImpl?: typeof fetch } = {}): Promise<{ ok: boolean; city: string | null; message: string }> {
  const q = query.trim().slice(0, 80);
  if (!q) {
    updateProfile({ preferences: { location: { query: null, city: null, region: null, lat: null, lng: null, radiusMi } } });
    return { ok: true, city: null, message: "Home area cleared" };
  }
  const g = await geocode(q, { fetchImpl: opts.fetchImpl });
  if (!g) {
    updateProfile({ preferences: { location: { query: q, radiusMi } } });
    return { ok: false, city: null, message: "Couldn't find that place — saved the text; try a city and state or a ZIP." };
  }
  updateProfile({ preferences: { location: { query: q, city: g.name, region: g.region, lat: g.lat, lng: g.lng, radiusMi } } });
  return { ok: true, city: `${g.name}${g.region ? `, ${g.region}` : ""}`, message: `Home area: ${g.name}${g.region ? `, ${g.region}` : ""} · ${radiusMi} mi` };
}

export function listAdventureHistory(limit = 20) {
  return getDb().select().from(questOffers).where(isNotNull(questOffers.eventId)).orderBy(desc(questOffers.id)).limit(limit).all();
}
