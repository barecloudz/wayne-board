import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const [scores, allDrivers, lastSynced, lastSyncResultRaw, syncStatus, mfaOptionsRaw, otpError, startedAt] = await Promise.all([
    // Most recent score per driver (across all weeks), sorted by score desc
    sql`
      SELECT DISTINCT ON (rs.driver_id)
        rs.id, rs.driver_id AS "driverId", rs.score, rs.week,
        rs.deliveries, rs.positive_reviews AS "positiveReviews", d.name AS "driverName"
      FROM ryde_scores rs
      JOIN drivers d ON d.driver_id = rs.driver_id AND d.organization_id = ${orgId}
      WHERE rs.organization_id = ${orgId} AND rs.deliveries > 0
      ORDER BY rs.driver_id, rs.week DESC
    `.then((rows: any[]) => rows.sort((a, b) => b.score - a.score)),
    db.select({ driverId: drivers.driverId, name: drivers.name })
      .from(drivers)
      .where(and(eq(drivers.active, true), eq(drivers.organizationId, orgId))),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_last_synced_at"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_last_sync_result"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_sync_status"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "idle"),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_mfa_options"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_otp_error"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_sync_started_at"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
  ]);

  let lastSyncResult: any = null;
  try { if (lastSyncResultRaw) lastSyncResult = JSON.parse(lastSyncResultRaw as string); } catch {}

  const mfaOptions = mfaOptionsRaw ? (mfaOptionsRaw as string).split(",").filter(Boolean) : [];

  // Auto-reset if a sync has been stuck for more than 20 minutes (crashed/timed out/wrong creds)
  let effectiveStatus = syncStatus as string;
  if (effectiveStatus !== "idle" && startedAt) {
    const elapsed = Date.now() - new Date(startedAt as string).getTime();
    if (elapsed > 20 * 60 * 1000) effectiveStatus = "idle";
  }

  return NextResponse.json({
    scores,
    lastSynced,
    lastSyncResult,
    syncStatus: effectiveStatus,
    mfaOptions,
    otpError: otpError || null,
    driverId: session.driverId,
  });
}
