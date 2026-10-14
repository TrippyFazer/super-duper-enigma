import type { EventSource } from "../types";
import { icsSource } from "./ics";
import { ticketmasterSource } from "./ticketmaster";

/** Sources configured through environment variables. Empty = no event discovery (curated quests still work). */
export function configuredEventSources(env: Partial<NodeJS.ProcessEnv> = process.env): EventSource[] {
  const out: EventSource[] = [];
  if (env.TICKETMASTER_API_KEY) out.push(ticketmasterSource(env.TICKETMASTER_API_KEY));
  const ics = (env.EVENT_ICS_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
  if (ics.length) out.push(icsSource(ics));
  return out;
}
