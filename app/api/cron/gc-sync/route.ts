export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { syncGc } from "@/lib/gc-sync";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Skip if yesterday was Sunday — routes almost never run on Sundays
  // and the rare exceptions shouldn't pollute driver averages
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 0) {
    return NextResponse.json({ success: true, skipped: true, reason: "Sunday — no sync" });
  }

  // Sync yesterday's data
  const result = await syncGc();
  // Update last_synced_at setting
  if (result.success) {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    await sql`INSERT INTO settings (key, value) VALUES ('gc_last_synced_at', ${new Date().toISOString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  return NextResponse.json(result);
}
