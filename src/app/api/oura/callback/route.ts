import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/integrations/oura/client";
import { saveOuraToken, syncOura } from "@/integrations/oura/sync";
import { reconcile } from "@/services/progression";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const jar = await cookies();
  const expected = jar.get("oura_oauth_state")?.value;
  jar.delete("oura_oauth_state");

  if (err) return NextResponse.redirect(new URL(`/profile/settings?error=${encodeURIComponent(err)}`, base));
  if (!code || !state || state !== expected) return NextResponse.redirect(new URL("/profile/settings?error=invalid+state", base));

  try {
    const t = await exchangeCode(code);
    saveOuraToken({ accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresIn: t.expires_in ?? null, authType: "oauth" });
    const r = await syncOura(90);
    if (r.ok) reconcile();
    return NextResponse.redirect(new URL("/profile/settings?oura=connected", base));
  } catch (e) {
    return NextResponse.redirect(new URL(`/profile/settings?error=${encodeURIComponent((e as Error).message)}`, base));
  }
}
