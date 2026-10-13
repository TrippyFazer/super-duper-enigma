import { NextResponse, type NextRequest } from "next/server";
import { ingestAppleHealth, verifyIngestToken, type IngestPayload } from "@/health/apple";

/**
 * POST /api/health/ingest — receives HealthKit samples from the iOS bridge or an
 * iOS Shortcut. Bearer token = the token shown in Settings → Connected Services
 * (or HEALTH_INGEST_TOKEN in the environment). Idempotent by sample uuid.
 *
 * Body: { samples: [{type, value, unit?, start, end, source?, device?, uuid?, metadata?}],
 *         workouts: [{activityType, start, end, activeEnergyKcal?, distanceKm?, source?, uuid?}],
 *         permissions?: {steps: "granted", ...}, bridge?: "shortcut"|"native", backgroundDelivery?: boolean }
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : new URL(req.url).searchParams.get("token");
  if (!verifyIngestToken(token)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: IngestPayload;
  try {
    body = (await req.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  // Shortcuts sometimes send a single object or a bare array of samples.
  if (Array.isArray(body)) body = { samples: body as IngestPayload["samples"] };
  try {
    const r = await ingestAppleHealth(body);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : new URL(req.url).searchParams.get("token");
  if (!verifyIngestToken(token)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { appleHealthStatus } = await import("@/health/apple");
  return NextResponse.json({ ok: true, status: appleHealthStatus() });
}
