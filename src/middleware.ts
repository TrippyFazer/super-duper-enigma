import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, gateEnabled, validSession } from "@/lib/session";

/** Reachable without signing in: the login itself, and what iOS fetches to
 *  put the icon on the home screen (it does not send the cookie for those). */
const OPEN = ["/login", "/api/login", "/manifest.webmanifest", "/icons/", "/sw.js", "/offline"];

export async function middleware(request: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (OPEN.some((p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)))) {
    return NextResponse.next();
  }
  if (await validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything but Next's own build assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
