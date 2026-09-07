import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rydeScores, drivers, settings } from "@/lib/schema";
import { desc, eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;

  const [scores, allDrivers, lastSynced, lastSyncResultRaw, autoEnabled, autoTime, syncStatus, mfaOptionsRaw, otpError, startedAt] = await Promise.all([
    db.select({
      id:              rydeScores.id,
      driverId:        rydeScores.driverId,
      score:           rydeScores.score,
      week:            rydeScores.week,
      deliveries:      rydeScores.deliveries,
      positiveReviews: rydeScores.positiveReviews,
      driverName:      drivers.name,
    })
      .from(rydeScores)
      .innerJoin(drivers, eq(rydeScores.driverId, drivers.driverId))
      .where(and(eq(rydeScores.organizationId, orgId), eq(drivers.organizationId, orgId)))
      .orderBy(desc(rydeScores.week), desc(rydeScores.score))
      .limit(200),
    db.select({ driverId: drivers.driverId, name: drivers.name })
      .from(drivers)
      .where(and(eq(drivers.active, true), eq(drivers.organizationId, orgId))),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_last_synced_at"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_last_sync_result"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_auto_sync_enabled"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(and(eq(settings.key, "spotlight_auto_sync_time"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "09:00"),
    db.select().from(settings).where(eq(settings.key, "spotlight_sync_status")).then(r => r[0]?.value ?? "idle"),
    db.select().from(settings).where(eq(settings.key, "spotlight_mfa_options")).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(eq(settings.key, "spotlight_otp_error")).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(eq(settings.key, "spotlight_sync_started_at")).then(r => r[0]?.value ?? ""),
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
    autoEnabled: autoEnabled === "true",
    autoTime,
    syncStatus: effectiveStatus,
    mfaOptions,
    otpError: otpError || null,
  });
}
