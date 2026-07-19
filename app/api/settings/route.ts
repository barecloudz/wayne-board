export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const key = new URL(req.url).searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    const rows = await sql`SELECT value FROM settings WHERE key = ${key} LIMIT 1`;
    return NextResponse.json({ value: (rows[0] as any)?.value ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    await sql`
      INSERT INTO settings (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
