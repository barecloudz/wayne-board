import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rydeScores, drivers, settings } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const [scores, allDrivers, lastSynced, lastSyncResultRaw, autoEnabled, autoTime] = await Promise.all([
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
      .orderBy(desc(rydeScores.week), desc(rydeScores.score))
      .limit(200),
    db.select({ driverId: drivers.driverId, name: drivers.name })
      .from(drivers)
      .where(eq(drivers.active, true)),
    db.select().from(settings).where(eq(settings.key, "spotlight_last_synced_at")).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(eq(settings.key, "spotlight_last_sync_result")).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(eq(settings.key, "spotlight_auto_sync_enabled")).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(eq(settings.key, "spotlight_auto_sync_time")).then(r => r[0]?.value ?? "09:00"),
  ]);

  let lastSyncResult: any = null;
  try { if (lastSyncResultRaw) lastSyncResult = JSON.parse(lastSyncResultRaw as string); } catch {}

  return NextResponse.json({
    scores,
    lastSynced,
    lastSyncResult,
    autoEnabled: autoEnabled === "true",
    autoTime,
  });
}
