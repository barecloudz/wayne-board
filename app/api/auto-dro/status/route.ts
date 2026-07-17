import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droRoutes, droDailyTotals, droAnchorAreas, droStops, droRoutePlans, droStopOverrides, settings } from "@/lib/schema";
import { desc, eq, isNotNull, sql } from "drizzle-orm";

export async function GET() {
  const [
    routes, totals, anchorAreas, stopCoords, totalStopsResult,
    lastSynced, autoEnabled, autoTime,
    routePlans, planningWindowSetting, stopOverridesCount, unroutableCount,
  ] = await Promise.all([
    db.select().from(droRoutes).orderBy(droRoutes.workAreaName),
    db.select().from(droDailyTotals).orderBy(desc(droDailyTotals.date)).limit(7),
    db.select({
      anchorAreaId:      droAnchorAreas.anchorAreaId,
      name:              droAnchorAreas.name,
      shapeJson:         droAnchorAreas.shapeJson,
      enabledRoutePlans: droAnchorAreas.enabledRoutePlans,
      wktPoly:           droAnchorAreas.wktPoly,
      vehicleId:         droAnchorAreas.vehicleId,
      hexCode:           droAnchorAreas.hexCode,
    }).from(droAnchorAreas).orderBy(droAnchorAreas.name),
    db.select({
      lat:            droStops.lat,
      lng:            droStops.lng,
      actualRoute:    droStops.actualRoute,
      workAreaNumber: droStops.workAreaNumber,
    }).from(droStops).where(isNotNull(droStops.lat)),
    db.select({ count: sql<number>`count(*)::int` }).from(droStops),
    db.select().from(settings).where(eq(settings.key, "dro_last_synced_at")).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(eq(settings.key, "dro_auto_sync_enabled")).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(eq(settings.key, "dro_auto_sync_time")).then(r => r[0]?.value ?? "23:55"),
    db.select().from(droRoutePlans).orderBy(droRoutePlans.planId),
    db.select().from(settings).where(eq(settings.key, "dro_planning_window_open")).then(r => r[0]?.value ?? "false"),
    db.select({ count: sql<number>`count(*)::int` }).from(droStopOverrides).then(r => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(droStops).where(eq(droStops.actualRoute, "")).then(r => r[0]?.count ?? 0),
  ]);

  const totalStops    = totalStopsResult[0]?.count ?? 0;
  const totalPackages = routes.reduce((s, r) => s + r.packages, 0);
  const planningWindowOpen = planningWindowSetting === "true";

  return NextResponse.json({
    routes,
    totals,
    anchorAreas,
    stopCoords,
    totalStops,
    totalPackages,
    lastSynced,
    autoEnabled: autoEnabled === "true",
    autoTime,
    routePlans,
    planningWindowOpen,
    stopOverridesCount,
    unroutableCount,
  });
}
