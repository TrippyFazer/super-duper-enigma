import { categorize, type EventResult, type EventSource } from "../types";

/**
 * Public iCalendar feeds (city calendars, venue calendars, tourism boards).
 * Set EVENT_ICS_URLS to a comma-separated list of .ics URLs. Minimal VEVENT
 * parser: SUMMARY, DESCRIPTION, DTSTART, DTEND, LOCATION, URL, GEO, UID.
 */
function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}
function parseDate(v: string, params: string): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "19", mi = "00", s = "00", z] = m;
  const allDay = /VALUE=DATE/.test(params) || !/T/.test(v);
  const iso = `${y}-${mo}-${d}T${allDay ? "17" : h}:${allDay ? "00" : mi}:${s}${z ? "Z" : "Z"}`;
  return new Date(iso).toISOString();
}
const unescape = (s: string) => s.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();

export function parseIcs(text: string, sourceName: string): EventResult[] {
  const out: EventResult[] = [];
  let cur: Record<string, { v: string; p: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART ? parseDate(cur.DTSTART.v, cur.DTSTART.p) : null;
      const name = cur.SUMMARY ? unescape(cur.SUMMARY.v) : "";
      if (start && name) {
        const geo = cur.GEO?.v.split(";").map(Number);
        const desc = cur.DESCRIPTION ? unescape(cur.DESCRIPTION.v) : "";
        const free = /\bfree\b/i.test(`${name} ${desc}`) && !/not free|isn't free/i.test(desc);
        out.push({
          provider: "ics",
          externalId: `${sourceName}:${cur.UID?.v ?? `${name}@${start}`}`.slice(0, 200),
          name: name.slice(0, 120),
          description: desc.slice(0, 400),
          category: categorize(`${name} ${desc}`),
          startAt: start,
          endAt: cur.DTEND ? parseDate(cur.DTEND.v, cur.DTEND.p) : null,
          venue: cur.LOCATION ? unescape(cur.LOCATION.v).split(",")[0].slice(0, 120) : null,
          address: cur.LOCATION ? unescape(cur.LOCATION.v).slice(0, 200) : null,
          city: null,
          lat: geo && geo.length === 2 && !Number.isNaN(geo[0]) ? geo[0] : null,
          lng: geo && geo.length === 2 && !Number.isNaN(geo[1]) ? geo[1] : null,
          priceMin: free ? 0 : null,
          priceMax: free ? 0 : null,
          isFree: free ? true : null,
          url: cur.URL?.v ?? null,
          sourceName,
        });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i);
      const [key, ...params] = head.split(";");
      cur[key.toUpperCase()] = { v: line.slice(i + 1), p: params.join(";") };
    }
  }
  return out;
}

export function icsSource(urls: string[], fetchImpl: typeof fetch = fetch): EventSource {
  return {
    id: "ics",
    name: "Public calendars",
    async search({ from, to, signal }) {
      const all: EventResult[] = [];
      for (const url of urls) {
        try {
          const res = await fetchImpl(url, { signal, headers: { "User-Agent": "Ascend/0.5 (self-hosted personal app)" } });
          if (!res.ok) continue;
          const host = new URL(url).hostname.replace(/^www\./, "");
          all.push(...parseIcs(await res.text(), host).filter((e) => e.startAt >= from.toISOString() && e.startAt <= to.toISOString()));
        } catch {
          /* one bad feed never blocks the others */
        }
      }
      return all;
    },
  };
}
