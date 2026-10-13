import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, newSession, rightPassword } from "@/lib/session";

/** Only a path on this site, never somewhere else: "next" comes from the URL. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** A relative Location. Behind the proxy, request.url names the container
 *  (localhost:3000), and an absolute redirect built from it sends the phone
 *  nowhere. Browsers resolve a relative one against the address they used. */
function redirect(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const password = String(form.get("password") ?? "");

  if (!rightPassword(password)) {
    // A second's pause per wrong guess costs a person nothing and a guesser a lot.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const back = `/login?${new URLSearchParams({ next, wrong: "1" })}`;
    return redirect(back);
  }

  const response = redirect(next);
  response.cookies.set(SESSION_COOKIE, await newSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return response;
}
