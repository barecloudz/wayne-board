export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const rows = await sql`SELECT value FROM user_settings WHERE driver_id = ${session.driverId} AND key = ${key} LIMIT 1`;
  return NextResponse.json({ value: (rows[0] as any)?.value ?? null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  await sql`
    INSERT INTO user_settings (driver_id, key, value) VALUES (${session.driverId}, ${key}, ${value})
    ON CONFLICT (driver_id, key) DO UPDATE SET value = EXCLUDED.value
  `;
  return NextResponse.json({ ok: true });
}
