import type { QuestOffer } from "@/db/schema";
import { parseJson } from "@/lib/json";

/** What the quest card needs. Event facts are passed through verbatim from the verified cache. */
export interface OfferView {
  id: number;
  title: string;
  description: string;
  domain: string;
  difficulty: string;
  kind: string;
  estimatedMinutes: number;
  xpReward: number;
  status: string;
  expiresAt: string | null;
  // adventure facts (optional)
  eventName?: string | null;
  category?: string | null;
  venue?: string | null;
  startAt?: string | null;
  priceLabel?: string | null;
  distanceMi?: number | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  why?: string | null;
  feedback?: string | null;
  followUp?: { kind: string; prompt: string; done?: boolean } | null;
}

export function offerView(o: QuestOffer): OfferView {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    domain: o.domain,
    difficulty: o.difficulty,
    kind: o.kind,
    estimatedMinutes: o.estimatedMinutes,
    xpReward: o.xpReward,
    status: o.status,
    expiresAt: o.expiresAt,
    eventName: parseJson<{ eventName?: string }>(o.params, {}).eventName ?? null,
    category: o.category,
    venue: o.venue,
    startAt: o.startAt,
    priceLabel: o.priceLabel,
    distanceMi: o.distanceMi,
    sourceName: o.sourceName,
    sourceUrl: o.sourceUrl,
    why: o.why,
    feedback: o.feedback,
    followUp: o.followUp ? parseJson<{ kind: string; prompt: string; done?: boolean }>(o.followUp, { kind: "none", prompt: "" }) : null,
  };
}
