import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const r = getDb().get<{ ok: number }>(sql`select 1 as ok`);
    return NextResponse.json({ ok: r?.ok === 1, time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
