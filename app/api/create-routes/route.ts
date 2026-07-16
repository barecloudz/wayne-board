import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  drivers, driverSchedules, timeOffEntries, scheduleOverrides,
  droStops, droRoutes,
} from "@/lib/schema";
import { eq, and, lte, gte, sql, not, inArray } from "drizzle-orm";

type DowKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

function todayDow(): DowKey {
  return (["sun","mon","tue","wed","thu","fri","sat"] as DowKey[])[new Date().getDay()];
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const dow = todayDow();

  // Drivers on time off today
  const onTimeOff = await db.select({ driverId: timeOffEntries.driverId })
    .from(timeOffEntries)
    .where(and(lte(timeOffEntries.startDate, today), gte(timeOffEntries.endDate, today)));
  const timeOffIds = onTimeOff.map(r => r.driverId);

  // Normally scheduled non-trainee drivers for today's DOW
  const scheduled = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .innerJoin(driverSchedules, eq(drivers.driverId, driverSchedules.driverId))
    .where(and(
      eq(drivers.active, true),
      eq(drivers.isTrainee, false),
      eq(driverSchedules[dow], true),
      ...(timeOffIds.length > 0 ? [not(inArray(drivers.driverId, timeOffIds))] : [])
    ));

  // Schedule overrides (one-off extra day) — also non-trainee
  const overrides = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .innerJoin(scheduleOverrides, and(
      eq(drivers.driverId, scheduleOverrides.driverId),
      eq(scheduleOverrides.date, today)
    ))
    .where(and(eq(drivers.active, true), eq(drivers.isTrainee, false)));

  // Merge + deduplicate
  const seen = new Set(scheduled.map(d => d.driverId));
  const allDrivers = [...scheduled];
  for (const d of overrides) {
    if (!seen.has(d.driverId)) { allDrivers.push(d); seen.add(d.driverId); }
  }

  // Stop count from DRO (current sync)
  const [stopRow] = await db.select({ count: sql<number>`count(*)::int` }).from(droStops);
  const totalStops = stopRow?.count ?? 0;

  // Route info from DRO
  const routes = await db.select({
    workAreaName:   droRoutes.workAreaName,
    workAreaNumber: droRoutes.workAreaNumber,
    stops:          droRoutes.stops,
    packages:       droRoutes.packages,
  }).from(droRoutes).orderBy(droRoutes.workAreaName);

  const driverCount = allDrivers.length;
  // Max 120 stops per driver → minimum routes needed
  const minRoutes = totalStops > 0 ? Math.ceil(totalStops / 120) : driverCount;
  const maxCut    = Math.max(0, driverCount - minRoutes);

  return NextResponse.json({
    today,
    driverCount,
    scheduledDrivers: allDrivers,
    totalStops,
    totalPackages: routes.reduce((s, r) => s + r.packages, 0),
    droRoutes: routes,
    droRouteCount: routes.length,
    maxCut,
    minRoutes,
  });
}
