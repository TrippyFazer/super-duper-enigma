/**
 * The one password in front of the hosted site.
 *
 * The app is single-user with no accounts, which is right on a laptop and
 * wrong on a public URL: anyone who found it could read and change everything.
 * So when APP_PASSWORD is set, every page needs a signed session cookie, and
 * the cookie lasts long enough (400 days, the browser maximum) that the phone
 * signs in once. Unset (local dev), there is no gate at all.
 *
 * Web Crypto only, because middleware runs on the Edge runtime.
 */

export const SESSION_COOKIE = "tfh_session";
export const SESSION_DAYS = 400;

const encoder = new TextEncoder();

function secret(): string {
  // Signing with the password itself when no separate secret is set means
  // changing the password signs everyone out, which is what you would want.
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
}

export function gateEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function newSession(): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await sign(String(expires))}`;
}

export async function validSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return sameString(mac, await sign(expires));
}

export function rightPassword(given: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  return expected.length > 0 && sameString(given, expected);
}
