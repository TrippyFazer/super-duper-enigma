/**
 * Optional weather context from Open-Meteo (free, no key). Enhancement only:
 * when it is unavailable, outdoor quests are simply not weather-adjusted.
 */
export interface HourWeather {
  time: string; // ISO hour (UTC)
  tempC: number | null;
  precipProb: number | null; // 0-100
  code: number | null; // WMO weather code
}

export interface Forecast {
  fetchedAt: string;
  hours: HourWeather[];
}

export async function fetchForecast(lat: number, lng: number, opts: { fetchImpl?: typeof fetch; timeoutMs?: number; days?: number } = {}): Promise<Forecast | null> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=${opts.days ?? 4}&timezone=UTC`;
    const res = await f(url, { signal: ctrl.signal, headers: { "User-Agent": "Ascend/0.5 (self-hosted personal app)" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { hourly?: { time: string[]; temperature_2m?: (number | null)[]; precipitation_probability?: (number | null)[]; weather_code?: (number | null)[] } };
    if (!j.hourly?.time) return null;
    return {
      fetchedAt: new Date().toISOString(),
      hours: j.hourly.time.map((time, i) => ({ time: time.length === 16 ? time + ":00Z" : time, tempC: j.hourly!.temperature_2m?.[i] ?? null, precipProb: j.hourly!.precipitation_probability?.[i] ?? null, code: j.hourly!.weather_code?.[i] ?? null })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type OutdoorSuitability = "good" | "iffy" | "bad" | "unknown";

/** WMO codes: 95–99 thunderstorm, 71–77/85–86 snow, 61–67/80–82 rain. */
export function outdoorSuitability(fc: Forecast | null, at: string): OutdoorSuitability {
  if (!fc) return "unknown";
  const target = new Date(at).getTime();
  const h = fc.hours.reduce<HourWeather | null>((best, x) => {
    const d = Math.abs(new Date(x.time).getTime() - target);
    return !best || d < Math.abs(new Date(best.time).getTime() - target) ? x : best;
  }, null);
  if (!h || Math.abs(new Date(h.time).getTime() - target) > 2 * 3600_000) return "unknown";
  const code = h.code ?? 0;
  if (code >= 95) return "bad";
  if ((h.precipProb ?? 0) >= 70 || (code >= 63 && code <= 67) || (code >= 71 && code <= 77) || code >= 81) return "bad";
  if ((h.precipProb ?? 0) >= 40 || (h.tempC != null && (h.tempC <= -5 || h.tempC >= 35))) return "iffy";
  return "good";
}
