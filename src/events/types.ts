/**
 * Real-world event facts. Everything here comes from a verified source
 * (Ticketmaster Discovery, a public ICS calendar). The AI only ever frames
 * these; it never invents names, dates, times, prices or venues.
 */
export type EventCategory = "music" | "sports" | "food" | "comedy" | "film" | "arts" | "outdoor" | "market" | "festival" | "community" | "class" | "nightlife" | "family" | "other";

export const EVENT_CATEGORIES: EventCategory[] = ["music", "sports", "food", "comedy", "film", "arts", "outdoor", "market", "festival", "community", "class", "nightlife", "family", "other"];

/** What the user can say about a category. */
export type InterestLevel = "love" | "interested" | "neutral" | "no";

/** Interests shown in Settings (superset of categories; a few map onto several). */
export const INTERESTS: { key: string; label: string; categories: EventCategory[] }[] = [
  { key: "music", label: "Live music", categories: ["music"] },
  { key: "sports", label: "Sports", categories: ["sports"] },
  { key: "food", label: "Food", categories: ["food", "market"] },
  { key: "comedy", label: "Comedy", categories: ["comedy"] },
  { key: "film", label: "Movies", categories: ["film"] },
  { key: "gaming", label: "Gaming", categories: ["community"] },
  { key: "outdoor", label: "Outdoor", categories: ["outdoor"] },
  { key: "festival", label: "Festivals", categories: ["festival"] },
  { key: "arts", label: "Art", categories: ["arts"] },
  { key: "social", label: "Social events", categories: ["community", "nightlife"] },
  { key: "fitness", label: "Fitness", categories: ["outdoor", "sports"] },
  { key: "market", label: "Markets", categories: ["market"] },
  { key: "seasonal", label: "Seasonal events", categories: ["festival", "family"] },
  { key: "nightlife", label: "Nightlife", categories: ["nightlife"] },
  { key: "class", label: "Classes", categories: ["class"] },
  { key: "random", label: "Random adventure", categories: ["other", "community", "arts"] },
];

export interface EventResult {
  provider: string;
  externalId: string;
  name: string;
  description: string;
  category: EventCategory;
  /** ISO datetime (UTC) */
  startAt: string;
  endAt: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
  url: string | null;
  sourceName: string;
}

export interface EventSource {
  id: string;
  name: string;
  search(params: { lat: number; lng: number; radiusMi: number; from: Date; to: Date; signal?: AbortSignal }): Promise<EventResult[]>;
}

const KEYWORDS: [RegExp, EventCategory][] = [
  [/farmers?.?market|night market|flea|bazaar|swap meet/i, "market"],
  [/festival|fest\b|fair\b|carnival|parade|pumpkin|lantern|holiday lights|aglow/i, "festival"],
  [/hike|hiking|trail|park run|5k|10k|bike ride|paddle|kayak|climb|outdoor|nature walk|birding/i, "outdoor"],
  [/comedy|stand-?up|improv/i, "comedy"],
  [/film|movie|screening|cinema/i, "film"],
  [/concert|live music|band|dj\b|orchestra|symphony|jazz|open mic|acoustic|tour\b/i, "music"],
  [/museum|gallery|exhibit|art walk|theatre|theater|ballet|opera|poetry|sculpture/i, "arts"],
  [/food truck|tasting|brunch|dinner|chef|cook|culinary|wine|beer|brew|taco|pizza|bbq/i, "food"],
  [/workshop|class|lesson|lecture|seminar|course|learn/i, "class"],
  [/trivia|meetup|volunteer|clean-?up|community|library|book club|game night|board game/i, "community"],
  [/football|basketball|baseball|soccer|hockey|match|game vs|vs\.|race\b|tournament/i, "sports"],
  [/kids|family|children|storytime/i, "family"],
  [/club night|nightlife|bar crawl|karaoke|late night/i, "nightlife"],
];

/** Heuristic category from free text (used for ICS feeds; Ticketmaster has its own classification). */
export function categorize(text: string): EventCategory {
  for (const [re, c] of KEYWORDS) if (re.test(text)) return c;
  return "other";
}

export function priceLabel(e: { isFree: boolean | null; priceMin: number | null; priceMax: number | null }): string {
  if (e.isFree) return "Free";
  if (e.priceMin == null && e.priceMax == null) return "Price not listed";
  if (e.priceMin != null && e.priceMax != null && e.priceMax > e.priceMin) return `$${Math.round(e.priceMin)}–${Math.round(e.priceMax)}`;
  return `~$${Math.round(e.priceMin ?? e.priceMax ?? 0)}`;
}
