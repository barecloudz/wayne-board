import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  drivers, driverSchedules, timeOffEntries, scheduleOverrides,
  droStops, droRoutes, droDailyTotals,
} from "@/lib/schema";
import { eq, and, lte, gte, sql, not, inArray, desc } from "drizzle-orm";

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

  // Route info from DRO — prefer dro_routes (from route-summary), fall back to
  // aggregating dro_stops by work_area_number (works during planning window when
  // solutionType=actual returns nothing yet)
  let routes = await db.select({
    workAreaName:   droRoutes.workAreaName,
    workAreaNumber: droRoutes.workAreaNumber,
    stops:          droRoutes.stops,
    packages:       droRoutes.packages,
  }).from(droRoutes).orderBy(droRoutes.workAreaName);

  if (routes.length === 0 && totalStops > 0) {
    // Derive routes from stop records — group by work_area_number
    const derived = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(optimal_route, ''), NULLIF(actual_route, ''), work_area_number) AS work_area_name,
        work_area_number,
        COUNT(*)::int AS stops,
        SUM(no_packages)::int AS packages
      FROM dro_stops
      WHERE work_area_number != ''
      GROUP BY work_area_number, COALESCE(NULLIF(optimal_route, ''), NULLIF(actual_route, ''), work_area_number)
      ORDER BY work_area_number
    `);
    const derivedRows: any[] = (derived as any).rows ?? (derived as any) ?? [];
    routes = derivedRows.map((r: any) => ({
      workAreaName:   String(r.work_area_name ?? r.work_area_number),
      workAreaNumber: String(r.work_area_number),
      stops:          Number(r.stops),
      packages:       Number(r.packages),
    }));
  }

  const driverCount = allDrivers.length;
  // Max 120 stops per driver → minimum routes needed
  const minRoutes = totalStops > 0 ? Math.ceil(totalStops / 120) : driverCount;
  const maxCut    = Math.max(0, driverCount - minRoutes);

  // Historical prediction: average total_stops for the same day-of-week over last 6 occurrences
  // Pull last 60 days of history then filter by matching DOW
  const DOW_JS = new Date().getDay(); // 0=Sun..6=Sat
  const histRows = await db.select({ date: droDailyTotals.date, totalStops: droDailyTotals.totalStops })
    .from(droDailyTotals)
    .orderBy(desc(droDailyTotals.date))
    .limit(60);
  const sameDow = histRows.filter(r => {
    const [y, m, d] = r.date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay() === DOW_JS;
  }).slice(0, 6);
  const predictedStops = sameDow.length > 0
    ? Math.round(sameDow.reduce((s, r) => s + r.totalStops, 0) / sameDow.length)
    : null;
  const suggestedDrivers = predictedStops ? Math.ceil(predictedStops / 120) : null;

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
    predictedStops,
    suggestedDrivers,
    historicalSampleSize: sameDow.length,
  });
}
