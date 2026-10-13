/**
 * Oura API v2 client (https://cloud.ouraring.com/v2/docs).
 *
 * Auth: Bearer token. Oura deprecated Personal Access Tokens in Dec 2025, so
 * OAuth2 is the primary path; an existing PAT still works where accepted.
 * Field names below follow the v2 OpenAPI spec (see docs/oura-integration.md).
 */

export const OURA_API = "https://api.ouraring.com";
export const OURA_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
export const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
export const OURA_SCOPES = ["daily", "heartrate", "personal", "workout"];

export class OuraError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "unauthorized" | "forbidden" | "rate_limited" | "network" | "other",
  ) {
    super(message);
  }
}

export interface OuraDailySleep {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  contributors?: Record<string, number | null>;
}

export interface OuraSleepSession {
  id: string;
  day: string;
  type: "long_sleep" | "sleep" | "late_nap" | "rest" | string;
  bedtime_start: string;
  bedtime_end: string;
  total_sleep_duration: number | null; // seconds
  time_in_bed: number | null;
  efficiency: number | null;
  latency: number | null; // seconds
  average_hrv: number | null;
  lowest_heart_rate: number | null;
  average_heart_rate: number | null;
  deep_sleep_duration?: number | null;
  rem_sleep_duration?: number | null;
  light_sleep_duration?: number | null;
  awake_time?: number | null;
}

export interface OuraDailyReadiness {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation?: number | null;
}

export interface OuraDailyActivity {
  id: string;
  day: string;
  score: number | null;
  steps: number | null;
  active_calories?: number | null;
  total_calories?: number | null;
  high_activity_time?: number | null; // seconds
  medium_activity_time?: number | null;
  low_activity_time?: number | null;
}

interface Page<T> {
  data: T[];
  next_token: string | null;
}

async function get<T>(path: string, token: string, params: Record<string, string>): Promise<Page<T>> {
  const url = new URL(`${OURA_API}/v2/usercollection/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch (e) {
    throw new OuraError(`Network error reaching Oura: ${(e as Error).message}`, 0, "network");
  }
  if (res.status === 401) throw new OuraError("Oura rejected the token (expired or revoked).", 401, "unauthorized");
  if (res.status === 403) throw new OuraError("Oura returned 403 — an active Oura membership is required for API access.", 403, "forbidden");
  if (res.status === 429) throw new OuraError("Oura rate limit hit. Try again in a few minutes.", 429, "rate_limited");
  if (!res.ok) throw new OuraError(`Oura API error ${res.status}`, res.status, "other");
  return (await res.json()) as Page<T>;
}

async function getAll<T>(path: string, token: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  do {
    const params: Record<string, string> = { start_date: start, end_date: end };
    if (next) params.next_token = next;
    const page: Page<T> = await get<T>(path, token, params);
    out.push(...page.data);
    next = page.next_token;
  } while (next);
  return out;
}

export interface OuraFetchResult {
  dailySleep: OuraDailySleep[];
  sleep: OuraSleepSession[];
  readiness: OuraDailyReadiness[];
  activity: OuraDailyActivity[];
}

export async function fetchOuraRange(token: string, start: string, end: string): Promise<OuraFetchResult> {
  const [dailySleep, sleep, readiness, activity] = await Promise.all([
    getAll<OuraDailySleep>("daily_sleep", token, start, end),
    getAll<OuraSleepSession>("sleep", token, start, end),
    getAll<OuraDailyReadiness>("daily_readiness", token, start, end),
    getAll<OuraDailyActivity>("daily_activity", token, start, end),
  ]);
  return { dailySleep, sleep, readiness, activity };
}

export async function fetchPersonalInfo(token: string): Promise<{ id?: string; email?: string; age?: number } | null> {
  try {
    const res = await fetch(`${OURA_API}/v2/usercollection/personal_info`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { id?: string; email?: string; age?: number };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- OAuth2 ----
export function oauthConfigured(): boolean {
  return !!process.env.OURA_CLIENT_ID && !!process.env.OURA_CLIENT_SECRET;
}

export function redirectUri(): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/oura/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(OURA_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.OURA_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", OURA_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: process.env.OURA_CLIENT_ID ?? "",
    client_secret: process.env.OURA_CLIENT_SECRET ?? "",
  });
  const res = await fetch(OURA_TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!res.ok) throw new OuraError(`Token exchange failed (${res.status})`, res.status, "other");
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.OURA_CLIENT_ID ?? "",
    client_secret: process.env.OURA_CLIENT_SECRET ?? "",
  });
  const res = await fetch(OURA_TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!res.ok) throw new OuraError(`Token refresh failed (${res.status})`, res.status, "unauthorized");
  return (await res.json()) as TokenResponse;
}
