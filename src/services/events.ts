import { getDb } from "@/db/client";
import { characterEvents } from "@/db/schema";
import type { DomainId } from "@/ranking/types";

/** Narrative character history entry. Idempotent by key. */
export function recordEvent(e: { type: string; key: string; title: string; description: string; domain?: DomainId | null; occurredAt?: string }) {
  getDb()
    .insert(characterEvents)
    .values({ type: e.type, key: e.key, title: e.title, description: e.description, domain: e.domain ?? null, occurredAt: e.occurredAt ?? new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}
