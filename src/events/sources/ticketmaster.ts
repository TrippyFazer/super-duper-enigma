import type { EventCategory, EventResult, EventSource } from "../types";

/**
 * Ticketmaster Discovery API v2 (free developer key: developer.ticketmaster.com).
 * Set TICKETMASTER_API_KEY. Only facts from the response are stored.
 */
const SEGMENT: Record<string, EventCategory> = { Music: "music", Sports: "sports", "Arts & Theatre": "arts", Film: "film", Miscellaneous: "community", Undefined: "other" };

function classify(ev: TmEvent): EventCategory {
  const c = ev.classifications?.[0];
  const seg = c?.segment?.name ?? "";
  const genre = `${c?.genre?.name ?? ""} ${c?.subGenre?.name ?? ""}`.toLowerCase();
  if (/comedy/.test(genre)) return "comedy";
  if (/festival/.test(`${ev.name} ${genre}`.toLowerCase())) return "festival";
  if (/family|children/.test(genre)) return "family";
  if (/food|wine|beer|culinary/.test(genre)) return "food";
  if (/lecture|class|workshop/.test(genre)) return "class";
  return SEGMENT[seg] ?? "other";
}

interface TmEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string }; end?: { dateTime?: string } };
  priceRanges?: { min?: number; max?: number }[];
  classifications?: { segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  _embedded?: { venues?: { name?: string; city?: { name?: string }; address?: { line1?: string }; location?: { latitude?: string; longitude?: string } }[] };
}

export function parseTicketmaster(json: { _embedded?: { events?: TmEvent[] } }): EventResult[] {
  const out: EventResult[] = [];
  for (const ev of json._embedded?.events ?? []) {
    const start = ev.dates?.start?.dateTime ?? (ev.dates?.start?.localDate ? `${ev.dates.start.localDate}T${ev.dates.start.localTime ?? "19:00:00"}Z` : null);
    if (!start || !ev.name) continue;
    const v = ev._embedded?.venues?.[0];
    const pr = ev.priceRanges?.[0];
    out.push({
      provider: "ticketmaster",
      externalId: ev.id,
      name: ev.name.trim().slice(0, 120),
      description: (ev.info ?? ev.pleaseNote ?? "").trim().slice(0, 400),
      category: classify(ev),
      startAt: new Date(start).toISOString(),
      endAt: ev.dates?.end?.dateTime ? new Date(ev.dates.end.dateTime).toISOString() : null,
      venue: v?.name ?? null,
      address: v?.address?.line1 ?? null,
      city: v?.city?.name ?? null,
      lat: v?.location?.latitude ? Number(v.location.latitude) : null,
      lng: v?.location?.longitude ? Number(v.location.longitude) : null,
      priceMin: pr?.min ?? null,
      priceMax: pr?.max ?? null,
      isFree: pr ? pr.min === 0 && (pr.max ?? 0) === 0 : null,
      url: ev.url ?? null,
      sourceName: "Ticketmaster",
    });
  }
  return out;
}

export function ticketmasterSource(apiKey: string, fetchImpl: typeof fetch = fetch): EventSource {
  return {
    id: "ticketmaster",
    name: "Ticketmaster",
    async search({ lat, lng, radiusMi, from, to, signal }) {
      const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${encodeURIComponent(apiKey)}&latlong=${lat},${lng}&radius=${Math.round(radiusMi)}&unit=miles&startDateTime=${fmt(from)}&endDateTime=${fmt(to)}&size=100&sort=date,asc`;
      const res = await fetchImpl(url, { signal, headers: { "User-Agent": "Ascend/0.5 (self-hosted personal app)" } });
      if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
      return parseTicketmaster((await res.json()) as { _embedded?: { events?: TmEvent[] } });
    },
  };
}
