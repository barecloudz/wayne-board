export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min Vercel Pro max

import { NextResponse } from "next/server";
import { syncGc } from "@/lib/gc-sync";
import { getSession } from "@/lib/session";
import { neon } from "@neondatabase/serverless";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startDate } = await req.json();
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
  const orgRows = await sql`SELECT id FROM organizations WHERE id = ${session.organizationId} LIMIT 1`;
  const orgId: number = orgRows[0]?.id;
  if (!orgId) return NextResponse.json({ error: "Organization not found" }, { status: 400 });

  // Build date list from startDate to yesterday, skipping Sundays
  const dates: string[] = [];
  const cursor = new Date(startDate + "T12:00:00Z");
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(23, 59, 59, 0);

  while (cursor <= yesterday) {
    if (cursor.getUTCDay() !== 0) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (dates.length === 0) {
    return NextResponse.json({ error: "No dates to sync in that range" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      send({ type: "start", total: dates.length });

      let totalRoutes = 0;
      let totalMatched = 0;
      let errors = 0;

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        try {
          const result = await syncGc(date, orgId);
          if (result.success) {
            totalRoutes  += result.routeDays;
            totalMatched += result.matched;
          } else {
            errors++;
          }
          send({
            type:      "progress",
            current:   i + 1,
            total:     dates.length,
            date,
            routeDays: result.routeDays,
            matched:   result.matched,
            success:   result.success,
            error:     result.error,
          });
        } catch (e: any) {
          errors++;
          send({ type: "progress", current: i + 1, total: dates.length, date, success: false, error: e?.message });
        }
      }

      send({ type: "done", totalRoutes, totalMatched, errors, days: dates.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
