import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/cron/keep-warm
 *
 * Trivial DB ping that prevents Neon serverless compute from scaling to zero.
 * Without this, the first request after ~5 min of inactivity hits a 1–3s
 * cold-start delay while Neon spins the compute node back up.
 *
 * Add to netlify.toml:
 *   [[crons]]
 *   schedule = "* /5 * * * *"
 *   path = "/api/cron/keep-warm"
 */
export const runtime = "nodejs";

export async function GET() {
  const start = Date.now();
  await db.execute(sql`SELECT 1`);
  const ms = Date.now() - start;

  return NextResponse.json({ ok: true, latency_ms: ms, ts: new Date().toISOString() });
}
