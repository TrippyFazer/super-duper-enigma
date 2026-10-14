/**
 * Adventure quests: verified events → deterministic filter/score/XP → framing
 * → offer. No fabricated event may pass; failures fall back honestly.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = path.join(os.tmpdir(), `ascend-adv-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmp;

const { getDb } = await import("@/db/client");
const { updateProfile, getProfile } = await import("@/services/profile");
const adv = await import("@/services/adventure");
const qo = await import("@/services/questOffers");
const { applyFeedback, eventExpiry, eventXp, pickCandidates, rejectReason, scoreEvent, windowRange } = await import("@/quests/adventure");
type AdventureContext = import("@/quests/adventure").AdventureContext;
type AdventureEvent = import("@/quests/adventure").AdventureEvent;
const { parseIcs } = await import("@/events/sources/ics");
const { parseTicketmaster } = await import("@/events/sources/ticketmaster");
const { distanceMi } = await import("@/events/geo");
const { outdoorSuitability } = await import("@/events/weather");
const { eventById, upsertEvents } = await import("@/events/search");
const { localEvents } = await import("@/db/schema");
const clearEvents = () => getDb().delete(localEvents).run();
import type { EventResult, EventSource } from "@/events/types";

const NOW = new Date("2026-10-15T20:00:00Z"); // Thursday evening (UTC)
const home = { lat: 39.9612, lng: -82.9988 }; // Columbus, Ohio

const ev = (over: Partial<AdventureEvent> & { id: number }): AdventureEvent => ({ name: "Event", description: "", category: "music", startAt: new Date(NOW.getTime() + 2 * 3600_000).toISOString(), endAt: null, venue: "Venue", distanceMi: 4, priceMin: 10, priceMax: 20, isFree: false, url: "https://example.com", sourceName: "Ticketmaster", ...over });
const ctx = (over: Partial<AdventureContext> = {}): AdventureContext => ({ now: NOW, window: "tonight", radiusMi: 10, costPref: "any", interests: {}, learned: {}, recentVenues: [], recentEventNames: [], recentCategories: [], declinedCategories: [], localHour: 16, ...over });

beforeAll(() => {
  getDb();
  updateProfile({ name: "Knight", timezone: "UTC", activeDomains: ["fitness", "cooking", "habits"], onboardingCompletedAt: new Date().toISOString(), preferences: { location: { query: "Columbus, Ohio", city: "Columbus", region: "Ohio", lat: home.lat, lng: home.lng, radiusMi: 10 }, adventure: { enabled: true, costPref: "any", interests: { market: "love", music: "interested" }, learned: {} } } });
  return () => {
    for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(tmp + s)) fs.rmSync(tmp + s);
  };
});

describe("deterministic filters", () => {
  it("rejects an event starting in 20 minutes 45 miles away", () => {
    expect(rejectReason(ev({ id: 1, startAt: new Date(NOW.getTime() + 20 * 60_000).toISOString(), distanceMi: 45 }), ctx({ radiusMi: 60 }))).toMatch(/not enough time/);
  });
  it("radius filtering", () => {
    expect(rejectReason(ev({ id: 2, distanceMi: 14 }), ctx({ radiusMi: 10 }))).toBe("outside radius");
    expect(rejectReason(ev({ id: 3, distanceMi: 9 }), ctx({ radiusMi: 10 }))).toBeNull();
  });
  it("cost filtering honours FREE ONLY / UNDER $20 / UNDER $50", () => {
    const paid = ev({ id: 4, priceMin: 35, priceMax: 60 });
    expect(rejectReason(paid, ctx({ costPref: "free" }))).toBe("not free");
    expect(rejectReason(paid, ctx({ costPref: "under20" }))).toBe("over $20");
    expect(rejectReason(paid, ctx({ costPref: "under50" }))).toBeNull();
    expect(rejectReason(ev({ id: 5, isFree: true, priceMin: 0, priceMax: 0 }), ctx({ costPref: "free" }))).toBeNull();
  });
  it("window: 'now' is the next 4 hours; 'weekend' lands on Fri–Sun", () => {
    const { from, to } = windowRange("now", NOW);
    expect(to.getTime() - from.getTime()).toBeLessThanOrEqual(5 * 3600_000);
    const w = windowRange("weekend", NOW);
    expect(w.from.getUTCDay()).toBe(5);
    expect(rejectReason(ev({ id: 6, startAt: new Date(NOW.getTime() + 6 * 3600_000).toISOString() }), ctx({ window: "now" }))).toBe("outside window");
  });
  it("a repeated event is prevented; a 'not interested' category never shows", () => {
    expect(rejectReason(ev({ id: 7, name: "Same Show" }), ctx({ recentEventNames: ["same show"] }))).toBe("offered recently");
    expect(rejectReason(ev({ id: 8, category: "nightlife" }), ctx({ interests: { nightlife: "no" } }))).toBe("not interested");
  });
  it("bad weather excludes outdoor quests; indoor ones are unaffected", () => {
    const bad = () => "bad" as const;
    expect(rejectReason(ev({ id: 9, category: "outdoor" }), ctx({ weatherAt: bad }))).toMatch(/weather/);
    expect(rejectReason(ev({ id: 10, category: "film" }), ctx({ weatherAt: bad }))).toBeNull();
  });
});

describe("ranking learns from the user", () => {
  it("a liked outdoor market scores higher than a neutral event; a declined concert type scores lower", () => {
    const market = ev({ id: 11, category: "market" });
    const concert = ev({ id: 12, category: "music" });
    const base = ctx({ interests: {} });
    expect(scoreEvent(market, ctx({ interests: { market: "love" } }))).toBeGreaterThan(scoreEvent(market, base));
    const declined = applyFeedback({}, "music", "declined");
    expect(scoreEvent(concert, ctx({ learned: declined }))).toBeLessThan(scoreEvent(concert, base));
    expect(scoreEvent(concert, ctx({ declinedCategories: ["music"] }))).toBeLessThan(scoreEvent(concert, base));
  });
  it("feedback is bounded and cumulative", () => {
    let l = {};
    for (let i = 0; i < 10; i++) l = applyFeedback(l, "market", "loved");
    expect((l as Record<string, number>).market).toBe(2);
    expect(applyFeedback(l, "market", "not-for-me").market).toBe(1.4);
  });
  it("picks 2–4 diverse candidates, best first, max two per category", () => {
    const events = [ev({ id: 20, category: "music" }), ev({ id: 21, category: "music", name: "B" }), ev({ id: 22, category: "music", name: "C" }), ev({ id: 23, category: "market", name: "M", isFree: true }), ev({ id: 24, category: "film", name: "F" })];
    const picks = pickCandidates(events, ctx({ interests: { market: "love" } }));
    expect(picks.length).toBeLessThanOrEqual(4);
    expect(picks[0].event.category).toBe("market");
    expect(picks.filter((p) => p.event.category === "music").length).toBeLessThanOrEqual(2);
  });
});

describe("XP and expiry", () => {
  it("XP reflects novelty and activity, never ticket price", () => {
    const cheapHike = ev({ id: 30, category: "outdoor", isFree: true, priceMin: 0 });
    const bigConcert = ev({ id: 31, category: "music", priceMin: 180, priceMax: 350 });
    expect(eventXp(cheapHike, ctx()).xp).toBeGreaterThan(eventXp(bigConcert, ctx()).xp);
    expect(eventXp(bigConcert, ctx()).xp).toBeLessThanOrEqual(85);
    expect(eventXp(ev({ id: 32, category: "class" }), ctx()).xp).toBe(80);
  });
  it("expires at event start plus grace", () => {
    const e = ev({ id: 33, startAt: "2026-10-16T20:00:00Z" });
    expect(eventExpiry(e)).toBe("2026-10-16T22:00:00.000Z");
  });
});

describe("parsers only carry facts", () => {
  it("parses an ICS feed into events with categories and free flags", () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:abc", "SUMMARY:Farmers Market - Free admission", "DTSTART:20261018T150000Z", "DTEND:20261018T183000Z", "LOCATION:Town Square\\, Main St", "URL:https://city.example/market", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const out = parseIcs(ics, "city.example");
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("market");
    expect(out[0].isFree).toBe(true);
    expect(out[0].venue).toBe("Town Square");
    expect(out[0].startAt).toBe("2026-10-18T15:00:00.000Z");
  });
  it("parses Ticketmaster discovery JSON", () => {
    const out = parseTicketmaster({ _embedded: { events: [{ id: "tm1", name: "Night Market Live", url: "https://tm.example/e", dates: { start: { dateTime: "2026-10-17T23:00:00Z" } }, priceRanges: [{ min: 7, max: 25 }], classifications: [{ segment: { name: "Music" } }], _embedded: { venues: [{ name: "Understory", city: { name: "Columbus" }, location: { latitude: "39.96", longitude: "-83.0" } }] } }] } });
    expect(out[0]).toMatchObject({ provider: "ticketmaster", externalId: "tm1", category: "music", venue: "Understory", priceMin: 7, priceMax: 25, isFree: false });
  });
  it("geo and weather helpers", () => {
    expect(distanceMi(home, { lat: 40.0, lng: -83.0 })).toBeGreaterThan(2);
    expect(outdoorSuitability({ fetchedAt: "", hours: [{ time: "2026-10-15T20:00:00Z", tempC: 15, precipProb: 90, code: 63 }] }, "2026-10-15T20:30:00Z")).toBe("bad");
    expect(outdoorSuitability({ fetchedAt: "", hours: [{ time: "2026-10-15T20:00:00Z", tempC: 18, precipProb: 5, code: 1 }] }, "2026-10-15T20:30:00Z")).toBe("good");
    expect(outdoorSuitability(null, "2026-10-15T20:30:00Z")).toBe("unknown");
  });
});

const mockSource = (events: EventResult[] | Error, id = "mock"): EventSource => ({
  id,
  name: id,
  async search() {
    if (events instanceof Error) throw events;
    return events;
  },
});
const real = (over: Partial<EventResult> = {}): EventResult => ({ provider: "mock", externalId: `m${Math.random().toString(36).slice(2, 8)}`, name: "Pumpkins Aglow", description: "Lantern walk", category: "festival", startAt: new Date(NOW.getTime() + 3 * 3600_000).toISOString(), endAt: null, venue: "Franklin Park Conservatory", address: null, city: "Columbus", lat: 39.966, lng: -82.955, priceMin: 18, priceMax: 18, isFree: false, url: "https://example.org/aglow", sourceName: "MockSource", ...over });

describe("discovery pipeline (DB, injected sources, no AI)", () => {
  it("verified events become candidates with template framing and facts intact", async () => {
    const r = await adv.discoverAdventures({ profile: getProfile(), window: "tonight", sources: [mockSource([real(), real({ name: "Understory Live", category: "music", isFree: true, priceMin: 0, priceMax: 0, venue: "Understory" })])], now: NOW, force: true, weather: false });
    expect(r.error).toBeNull();
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
    const aglow = r.candidates.find((c) => c.eventName === "Pumpkins Aglow")!;
    expect(aglow.venue).toBe("Franklin Park Conservatory");
    expect(aglow.price).toBe("~$18");
    expect(aglow.distanceMi).toBeGreaterThan(0);
    expect(aglow.framing).toBe("template");
    expect(aglow.sourceName).toBe("MockSource");
    expect(aglow.url).toBe("https://example.org/aglow");
    expect(aglow.xp).toBeGreaterThanOrEqual(45);
  });
  it("search failure → honest message + curated non-event fallback, zero fabricated results", async () => {
    clearEvents();
    const r = await adv.discoverAdventures({ profile: getProfile(), window: "tonight", sources: [mockSource(new Error("503"), "down")], now: NOW, force: true, weather: false });
    expect(r.candidates).toHaveLength(0);
    expect(r.error).toBe("Couldn't refresh nearby events.");
    expect(r.fallback.length).toBeGreaterThan(0);
    expect(r.fallback.every((f) => f.source === "library")).toBe(true);
  });
  it("no events in the window → no candidates, no error", async () => {
    clearEvents();
    const r = await adv.discoverAdventures({ profile: getProfile(), window: "now", sources: [mockSource([])], now: NOW, force: true, weather: false });
    expect(r.candidates).toHaveLength(0);
    expect(r.error).toBeNull();
  });
  it("an offer is built from the cache, never from client-sent facts; unknown ids are refused", async () => {
    upsertEvents([real({ externalId: "fixed1", name: "Night Market", category: "market", venue: "Downtown Lot", priceMin: 0, priceMax: 0, isFree: true })]);
    const row = (await import("@/events/search")).cachedEvents(new Date(NOW.getTime() - 3600_000), new Date(NOW.getTime() + 10 * 3600_000)).find((x) => x.externalId === "fixed1")!;
    const o = adv.createAdventureOffer({ eventId: row.id, title: "Market run", description: "Pick one ingredient you've never cooked with.", why: "You love markets.", status: "accepted", today: "2026-10-15", now: NOW, profile: getProfile() });
    expect(o).not.toBeNull();
    expect(o!.venue).toBe("Downtown Lot");
    expect(o!.priceLabel).toBe("Free");
    expect(o!.kind).toBe("discovery");
    expect(o!.followUp).toMatch(/pantry/);
    expect(o!.expiresAt).toBe(eventExpiry({ ...row, distanceMi: null, category: "market" } as never));
    expect(adv.createAdventureOffer({ eventId: 999999, title: "Fake", description: "Made up", why: "", status: "offered", today: "2026-10-15", now: NOW, profile: getProfile() })).toBeNull();
    expect(eventById(row.id)?.name).toBe("Night Market");

    // Same event is not offered twice; the open offer blocks another
    expect(adv.createAdventureOffer({ eventId: row.id, title: "Again", description: "dup", why: "", status: "offered", today: "2026-10-15", now: NOW, profile: getProfile() })!.id).toBe(o!.id);

    // Rating teaches the ranker; completing pays XP once
    adv.rateOffer(o!.id, "loved", getProfile());
    expect(getProfile().preferences.adventure.learned.market).toBe(0.6);
    const done = qo.completeOffer(o!.id, "2026-10-15", NOW);
    expect(done.xp?.awarded).toBe(true);
    const fu = adv.completeFollowUp(o!.id, { ingredient: "delicata squash" }, "2026-10-15");
    expect(fu.ok).toBe(true);
    const { listPantry } = await import("@/services/pantry");
    expect(listPantry().some((p) => p.name.includes("delicata"))).toBe(true);
  });
  it("expired adventures are marked expired with no penalty, and the repeated event is excluded afterwards", async () => {
    const past = real({ externalId: "past1", name: "Yesterday Show", startAt: new Date(NOW.getTime() - 26 * 3600_000).toISOString() });
    upsertEvents([past]);
    const row = (await import("@/events/search")).cachedEvents(new Date(NOW.getTime() - 30 * 3600_000), NOW).find((x) => x.externalId === "past1")!;
    const o = adv.createAdventureOffer({ eventId: row.id, title: "Old", description: "Old show", why: "", status: "accepted", today: "2026-10-14", now: new Date(NOW.getTime() - 27 * 3600_000), profile: getProfile() })!;
    qo.expireOffers(NOW);
    expect(qo.listOffers({ statuses: ["expired"] }).some((x) => x.id === o.id)).toBe(true);
    const r = await adv.discoverAdventures({ profile: getProfile(), window: "surprise", sources: [mockSource([real({ name: "Night Market", category: "market", venue: "Downtown Lot" })])], now: NOW, force: true, weather: false });
    expect(r.candidates.some((c) => c.eventName === "Night Market")).toBe(false);
  });
  it("user-created quests are accepted immediately; a grocery one becomes a Supply run", async () => {
    const o = await adv.createUserQuest({ title: "Go grocery shopping today", enhance: false, today: "2026-10-15", now: NOW, profile: getProfile() });
    expect(o.status).toBe("accepted");
    expect(o.title).toBe("Supply run");
    expect(o.xpReward).toBeGreaterThanOrEqual(15);
    expect(o.xpReward).toBeLessThanOrEqual(60);
  });
  it("adventureReady explains exactly what is missing", () => {
    expect(adv.adventureReady(getProfile(), {}).ok).toBe(false);
    expect(adv.adventureReady(getProfile(), {}).reason).toMatch(/event source/);
    expect(adv.adventureReady(getProfile(), { TICKETMASTER_API_KEY: "k" }).ok).toBe(true);
  });
});
