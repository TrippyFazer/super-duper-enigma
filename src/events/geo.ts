/** Lightweight geography: no GPS tracking, just a home area and a radius. */
export function distanceMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export interface GeocodeResult {
  name: string;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
  timezone: string | null;
}

/**
 * City / ZIP / region → coordinates via Open-Meteo's free geocoding API
 * (no key). Returns null on any failure; the caller keeps the typed text.
 */
export async function geocode(query: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<GeocodeResult | null> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=1&language=en&format=json`;
    const res = await f(url, { signal: ctrl.signal, headers: { "User-Agent": "Ascend/0.5 (self-hosted personal app)" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }[] };
    const r = j.results?.[0];
    if (!r) return null;
    return { name: r.name, region: r.admin1 ?? null, country: r.country ?? null, lat: r.latitude, lng: r.longitude, timezone: r.timezone ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
