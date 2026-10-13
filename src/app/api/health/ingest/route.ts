import { NextResponse, type NextRequest } from "next/server";
import { ingestAppleHealth, verifyIngestToken } from "@/health/apple";

/**
 * POST /api/health/ingest — receives HealthKit samples from the iOS bridge or an
 * iOS Shortcut. Bearer token = the token shown in Settings → Connected Services
 * (or HEALTH_INGEST_TOKEN in the environment). Idempotent by sample uuid.
 *
 * Body: { samples: [{type, value, start, end, source?, unit?, uuid?, metadata?}],
 *         workouts: [{activityType, start, end, activeEnergyKcal?, distanceKm?, source?, uuid?}],
 *         permissions?: {steps: "granted", ...}, bridge?: "shortcut"|"native", backgroundDelivery?: boolean }
 * Also accepted, because Shortcuts produce them: a bare array of samples,
 * `samples` as JSON text, or one sample object on its own. uuid is optional —
 * without it duplicates are caught by type + start + end + source (normalize.ts).
 *
 * Answers {ok, received, stored, updated, duplicates, rejected[], ...} so a
 * Shortcut's "Show Result" says exactly what happened to what it sent.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : new URL(req.url).searchParams.get("token");
  if (!verifyIngestToken(token)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized: wrong or missing token. Add a header Authorization with the value Bearer <your token>." },
      { status: 401 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "The body was not JSON. In Get Contents of URL, set Request Body to JSON." },
      { status: 400 },
    );
  }
  try {
    const r = await ingestAppleHealth(body);
    if (r.received === 0 && r.workouts === 0) {
      return NextResponse.json(
        { ok: false, error: "No samples found in the body. Send {\"samples\": [...]} or a list of samples.", ...r },
        { status: 422 },
      );
    }
    if (r.received > 0 && r.rejectedCount === r.received) {
      return NextResponse.json({ ok: false, error: "Every sample was rejected; see rejected[] for why.", ...r }, { status: 422 });
    }
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
