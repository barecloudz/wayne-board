export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30", 10);
    const driverIdsParam = searchParams.get("driverIds");
    const driverIds = driverIdsParam ? driverIdsParam.split(",").filter(Boolean) : null;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let rows: any[];
    if (driverIds && driverIds.length > 0) {
      rows = await sql`
        SELECT
          grd.driver_id,
          d.name,
          grd.date::text AS date,
          grd.stops_per_hour,
          grd.route_name
        FROM gc_route_days grd
        JOIN drivers d ON d.driver_id = grd.driver_id
        WHERE d.active = true
          AND d.role = 'driver'
          AND d.organization_id = ${session.organizationId}
          AND grd.organization_id = ${session.organizationId}
          AND grd.driver_id = ANY(${driverIds})
          AND grd.date >= ${cutoffStr}
          AND grd.stops_per_hour IS NOT NULL
          AND EXTRACT(DOW FROM grd.date) != 0
        ORDER BY grd.date ASC
      `;
    } else {
      rows = await sql`
        SELECT
          grd.driver_id,
          d.name,
          grd.date::text AS date,
          grd.stops_per_hour,
          grd.route_name
        FROM gc_route_days grd
        JOIN drivers d ON d.driver_id = grd.driver_id
        WHERE d.active = true
          AND d.role = 'driver'
          AND d.organization_id = ${session.organizationId}
          AND grd.organization_id = ${session.organizationId}
          AND grd.date >= ${cutoffStr}
          AND grd.stops_per_hour IS NOT NULL
          AND EXTRACT(DOW FROM grd.date) != 0
        ORDER BY grd.date ASC
      `;
    }

    // Collect all dates that have at least one driver's data
    const dateSet = new Set<string>();
    const driverMap = new Map<string, { driverId: string; name: string; byDate: Map<string, { sph: number; routeName: string }> }>();

    for (const row of rows) {
      dateSet.add(row.date);
      if (!driverMap.has(row.driver_id)) {
        driverMap.set(row.driver_id, { driverId: row.driver_id, name: row.name, byDate: new Map() });
      }
      driverMap.get(row.driver_id)!.byDate.set(row.date, {
        sph: parseFloat(row.stops_per_hour),
        routeName: row.route_name ?? "",
      });
    }

    const dates = Array.from(dateSet).sort();

    const drivers = Array.from(driverMap.values()).map(({ driverId, name, byDate }) => ({
      driverId,
      name,
      data: Array.from(byDate.entries()).map(([date, { sph, routeName }]) => ({ date, sph, routeName })),
    }));

    return NextResponse.json({ dates, drivers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
