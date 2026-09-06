export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { syncGc } from "@/lib/gc-sync";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip Sundays
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 0) {
    return NextResponse.json({ success: true, skipped: true, reason: "Sunday · no sync" });
  }

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Find all orgs that have auto-sync enabled AND have GC credentials configured
  const rows = await sql`
    SELECT DISTINCT s.organization_id
    FROM settings s
    WHERE s.key = 'gc_auto_sync_enabled' AND s.value = 'true'
      AND EXISTS (
        SELECT 1 FROM settings s2
        WHERE s2.organization_id = s.organization_id
          AND s2.key = 'gc_username' AND s2.value != ''
      )
      AND EXISTS (
        SELECT 1 FROM settings s3
        WHERE s3.organization_id = s.organization_id
          AND s3.key = 'gc_password' AND s3.value != ''
      )
  `;

  if (rows.length === 0) {
    return NextResponse.json({ success: true, orgs: 0, message: "No orgs with auto-sync enabled" });
  }

  const results = await Promise.allSettled(
    rows.map((r: any) => syncGc(undefined, r.organization_id))
  );

  const summary = results.map((r, i) => ({
    orgId: (rows[i] as any).organization_id,
    ...(r.status === "fulfilled" ? r.value : { success: false, error: String((r as any).reason) }),
  }));

  return NextResponse.json({ success: true, orgs: rows.length, results: summary });
}
