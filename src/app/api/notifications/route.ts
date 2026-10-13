import { NextResponse, type NextRequest } from "next/server";
import { unreadSince } from "@/services/notifications";

export async function GET(req: NextRequest) {
  const since = Number(new URL(req.url).searchParams.get("since") ?? "0") || 0;
  const items = unreadSince(since).map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href }));
  return NextResponse.json({ items });
}
