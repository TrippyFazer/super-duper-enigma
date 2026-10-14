import { and, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { localEvents, type LocalEvent } from "@/db/schema";
import type { EventResult, EventSource } from "./types";
import { distanceMi } from "./geo";

export interface SearchOutcome {
  events: LocalEvent[];
  /** per-source failures (never fabricated results) */
  errors: { source: string; error: string }[];
  fetched: boolean;
  sourcesTried: string[];
}

/**
 * Pull events from every configured source for the home area, upsert them into
 * the cache, and return what is cached for the window. Sources that fail are
 * reported, never papered over.
 */
export async function fetchAndCacheEvents(input: { lat: number; lng: number; radiusMi: number; from: Date; to: Date; sources: EventSource[]; timeoutMs?: number }): Promise<SearchOutcome> {
  const errors: { source: string; error: string }[] = [];
  const tried: string[] = [];
  for (const src of input.sources) {
    tried.push(src.id);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 8000);
    try {
      const results = await src.search({ lat: input.lat, lng: input.lng, radiusMi: input.radiusMi, from: input.from, to: input.to, signal: ctrl.signal });
      upsertEvents(results);
    } catch (e) {
      errors.push({ source: src.id, error: (e as Error).message.slice(0, 120) });
    } finally {
      clearTimeout(t);
    }
  }
  return { events: cachedEvents(input.from, input.to), errors, fetched: tried.length > 0, sourcesTried: tried };
}

export function upsertEvents(results: EventResult[]): number {
  const db = getDb();
  const now = new Date().toISOString();
  let n = 0;
  for (const r of results) {
    const values = { ...r, fetchedAt: now };
    db.insert(localEvents).values(values).onConflictDoUpdate({ target: [localEvents.provider, localEvents.externalId], set: values }).run();
    n++;
  }
  return n;
}

export function cachedEvents(from: Date, to: Date): LocalEvent[] {
  return getDb().select().from(localEvents).where(and(gte(localEvents.startAt, from.toISOString()), lte(localEvents.startAt, to.toISOString()))).orderBy(localEvents.startAt).all();
}

export function eventById(id: number): LocalEvent | null {
  return getDb().select().from(localEvents).all().find((e) => e.id === id) ?? null;
}

export function withDistance<T extends { lat: number | null; lng: number | null }>(events: T[], home: { lat: number; lng: number }): (T & { distanceMi: number | null })[] {
  return events.map((e) => ({ ...e, distanceMi: e.lat != null && e.lng != null ? distanceMi(home, { lat: e.lat, lng: e.lng }) : null }));
}
