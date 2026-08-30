import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droRoutes, droDailyTotals, droAnchorAreas, droStops, droRoutePlans, droStopOverrides, settings } from "@/lib/schema";
import { desc, eq, isNotNull, sql, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;
  const [
    routes, totals, anchorAreas, stopCoords, totalStopsResult,
    lastSynced, lastSyncResultRaw, autoEnabled, autoTime,
    routePlans, planningWindowSetting, stopOverridesCount, unroutableCount,
  ] = await Promise.all([
    db.select().from(droRoutes).where(eq(droRoutes.organizationId, orgId)).orderBy(droRoutes.workAreaName),
    db.select().from(droDailyTotals).where(eq(droDailyTotals.organizationId, orgId)).orderBy(desc(droDailyTotals.date)).limit(7),
    db.select({
      anchorAreaId:      droAnchorAreas.anchorAreaId,
      name:              droAnchorAreas.name,
      shapeJson:         droAnchorAreas.shapeJson,
      enabledRoutePlans: droAnchorAreas.enabledRoutePlans,
      wktPoly:           droAnchorAreas.wktPoly,
      vehicleId:         droAnchorAreas.vehicleId,
      hexCode:           droAnchorAreas.hexCode,
    }).from(droAnchorAreas).where(eq(droAnchorAreas.organizationId, orgId)).orderBy(droAnchorAreas.name),
    db.select({
      lat:            droStops.lat,
      lng:            droStops.lng,
      actualRoute:    droStops.actualRoute,
      workAreaNumber: droStops.workAreaNumber,
    }).from(droStops).where(and(isNotNull(droStops.lat), eq(droStops.organizationId, orgId))),
    db.select({ count: sql<number>`count(*)::int` }).from(droStops).where(eq(droStops.organizationId, orgId)),
    db.select().from(settings).where(and(eq(settings.key, "dro_last_synced_at"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "dro_last_sync_result"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "dro_auto_sync_enabled"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(and(eq(settings.key, "dro_auto_sync_time"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "23:55"),
    db.select().from(droRoutePlans).where(eq(droRoutePlans.organizationId, orgId)).orderBy(droRoutePlans.planId),
    db.select().from(settings).where(and(eq(settings.key, "dro_planning_window_open"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "false"),
    db.select({ count: sql<number>`count(*)::int` }).from(droStopOverrides).where(eq(droStopOverrides.organizationId, orgId)).then(r => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(droStops).where(and(eq(droStops.actualRoute, ""), eq(droStops.organizationId, orgId))).then(r => r[0]?.count ?? 0),
  ]);

  const totalStops    = totalStopsResult[0]?.count ?? 0;
  const totalPackages = routes.reduce((s, r) => s + r.packages, 0);
  const planningWindowOpen = planningWindowSetting === "true";

  let lastSyncResult: any = null;
  try { if (lastSyncResultRaw) lastSyncResult = JSON.parse(lastSyncResultRaw as string); } catch {}

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
    lastSyncResult,
  });
}
