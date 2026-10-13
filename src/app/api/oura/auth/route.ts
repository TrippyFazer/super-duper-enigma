import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl, oauthConfigured } from "@/integrations/oura/client";

export async function GET() {
  if (!oauthConfigured()) {
    return NextResponse.redirect(new URL("/profile/settings?error=OAuth+not+configured", process.env.APP_URL ?? "http://localhost:3000"));
  }
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("oura_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
