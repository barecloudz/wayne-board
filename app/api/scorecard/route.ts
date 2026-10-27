export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";
import { getActiveLocationId } from "@/lib/active-location";

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Most recent Saturday on or before today
function getMostRecentSaturday(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun … 6=Sat
  const diff = day === 6 ? 0 : day + 1; // days back to Saturday
  const sat = new Date(today);
  sat.setDate(today.getDate() - diff);
  return sat.toISOString().slice(0, 10);
}

type StatusColor = "GOLD" | "RED" | "YELLOW" | null;

function ilsStatus(v: number | null): StatusColor {
  if (v === null) return null;
  return v >= 99 ? "GOLD" : "RED";
}

function actDelStatus(v: number | null): StatusColor {
  if (v === null) return null;
  return v >= 99 ? "GOLD" : "RED";
}

function ppodStatus(v: number | null): StatusColor {
  if (v === null) return null;
  return v >= 99 ? "GOLD" : "RED";
}

function rydeStatus(v: number | null): StatusColor {
  if (v === null) return null;
  if (v >= 4.5) return "GOLD";
  if (v < 4.0) return "RED";
  return "YELLOW";
}

// ── GET /api/scorecard?weekEnding=YYYY-MM-DD ──────────────────────────────────

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.organizationId;
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
  const locationId = await getActiveLocationId();

  const { searchParams } = new URL(req.url);
  let weekEnding = searchParams.get("weekEnding") ?? "";
  if (!weekEnding || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) {
    weekEnding = getMostRecentSaturday();
  }
  const weekStart = addDays(weekEnding, -6); // Mon–Sat = 7 days

  // ── 1. DSW aggregates ───────────────────────────────────────────────────────
  let dswRows: any[] = [];
  try {
    dswRows = locationId !== null
      ? await sql`
          SELECT
            d.driver_id,
            d.name,
            COUNT(dsw.id)::int                                             AS days_worked,
            COALESCE(SUM(dsw.act_del_pkgs), 0)::int                       AS del_pkgs,
            COALESCE(SUM(dsw.act_del_stps), 0)::int                       AS del_stps,
            COALESCE(SUM(dsw.del_stps_planned), 0)::int                   AS del_stps_planned,
            AVG(dsw.ils_pct)                                               AS avg_ils,
            COALESCE(SUM(dsw.dna), 0)::int                                AS dna,
            COALESCE(SUM(dsw.code_85), 0)::int                            AS code85,
            COALESCE(SUM(dsw.miles), 0)                                   AS miles,
            COALESCE(
              SUM(
                CASE
                  WHEN dsw.on_road_hours ~ E'^\\d+:\\d{2}$' THEN
                    SPLIT_PART(dsw.on_road_hours, ':', 1)::int * 60 +
                    SPLIT_PART(dsw.on_road_hours, ':', 2)::int
                  ELSE 0
                END
              ), 0
            )::int                                                         AS total_minutes
          FROM drivers d
          INNER JOIN dsw_route_days dsw
            ON dsw.driver_id = d.driver_id
            AND dsw.organization_id = ${orgId}
            AND dsw.date >= ${weekStart}
            AND dsw.date <= ${weekEnding}
          WHERE d.organization_id = ${orgId}
            AND d.active = true
            AND d.location_id = ${locationId}
          GROUP BY d.driver_id, d.name
        `
      : await sql`
          SELECT
            d.driver_id,
            d.name,
            COUNT(dsw.id)::int                                             AS days_worked,
            COALESCE(SUM(dsw.act_del_pkgs), 0)::int                       AS del_pkgs,
            COALESCE(SUM(dsw.act_del_stps), 0)::int                       AS del_stps,
            COALESCE(SUM(dsw.del_stps_planned), 0)::int                   AS del_stps_planned,
            AVG(dsw.ils_pct)                                               AS avg_ils,
            COALESCE(SUM(dsw.dna), 0)::int                                AS dna,
            COALESCE(SUM(dsw.code_85), 0)::int                            AS code85,
            COALESCE(SUM(dsw.miles), 0)                                   AS miles,
            COALESCE(
              SUM(
                CASE
                  WHEN dsw.on_road_hours ~ E'^\\d+:\\d{2}$' THEN
                    SPLIT_PART(dsw.on_road_hours, ':', 1)::int * 60 +
                    SPLIT_PART(dsw.on_road_hours, ':', 2)::int
                  ELSE 0
                END
              ), 0
            )::int                                                         AS total_minutes
          FROM drivers d
          INNER JOIN dsw_route_days dsw
            ON dsw.driver_id = d.driver_id
            AND dsw.organization_id = ${orgId}
            AND dsw.date >= ${weekStart}
            AND dsw.date <= ${weekEnding}
          WHERE d.organization_id = ${orgId}
            AND d.active = true
          GROUP BY d.driver_id, d.name
        `;
  } catch (e: any) {
    console.error("[scorecard] dsw query failed:", e);
    return NextResponse.json({ error: "DSW query failed: " + (e?.message ?? String(e)) }, { status: 500 });
  }

  if (dswRows.length === 0) {
    return NextResponse.json({
      weekEnding,
      weekStart,
      drivers: [],
      totals: null,
      coachingPriorities: [],
    });
  }

  const driverIds = dswRows.map((r: any) => r.driver_id);

  // ── 2. PPOD averages ────────────────────────────────────────────────────────
  let ppodMap = new Map<string, number>();
  try {
    const ppodRows: any[] = await sql`
      SELECT driver_id, AVG(ppod_pct) AS avg_ppod
      FROM ppod_days
      WHERE organization_id = ${orgId}
        AND driver_id IS NOT NULL
        AND date >= ${weekStart}
        AND date <= ${weekEnding}
      GROUP BY driver_id
    `;
    for (const r of ppodRows) {
      if (driverIds.includes(r.driver_id)) {
        ppodMap.set(r.driver_id, parseFloat(r.avg_ppod));
      }
    }
  } catch (e: any) {
    console.error("[scorecard] ppod query failed:", e);
  }

  // ── 3. Ryde averages ────────────────────────────────────────────────────────
  let rydeMap = new Map<string, { avg: number; count: number }>();
  try {
    const rydeRows: any[] = await sql`
      SELECT driver_id, AVG(stars) AS ryde_avg, COUNT(*)::int AS ryde_count
      FROM ryde_reviews
      WHERE organization_id = ${orgId}
        AND driver_id IS NOT NULL
        AND stars IS NOT NULL
        AND DATE(created_at) >= ${weekStart}::date
        AND DATE(created_at) <= ${weekEnding}::date
      GROUP BY driver_id
    `;
    for (const r of rydeRows) {
      if (driverIds.includes(r.driver_id)) {
        rydeMap.set(r.driver_id, { avg: parseFloat(r.ryde_avg), count: parseInt(r.ryde_count) });
      }
    }
  } catch (e: any) {
    console.error("[scorecard] ryde query failed:", e);
  }

  // ── 4. Build per-driver objects ─────────────────────────────────────────────
  const drivers = dswRows.map((row: any) => {
    const driverId: string = row.driver_id;
    const daysWorked: number = parseInt(row.days_worked) || 0;
    const delPkgs: number = parseInt(row.del_pkgs) || 0;
    const delStps: number = parseInt(row.del_stps) || 0;
    const delStpsPlanned: number = parseInt(row.del_stps_planned) || 0;
    const avgIls: number | null = row.avg_ils != null ? parseFloat(row.avg_ils) : null;
    const dna: number = parseInt(row.dna) || 0;
    const code85: number = parseInt(row.code85) || 0;
    const miles: number = parseFloat(row.miles) || 0;
    const totalMinutes: number = parseInt(row.total_minutes) || 0;
    const hours: number = totalMinutes / 60;

    const ppodPct: number | null = ppodMap.has(driverId) ? ppodMap.get(driverId)! : null;
    const rydeData = rydeMap.get(driverId) ?? null;
    const rydeAvg: number | null = rydeData ? rydeData.avg : null;
    const rydeCount: number = rydeData ? rydeData.count : 0;

    const actDelPct: number | null = delStpsPlanned > 0
      ? (delStps / delStpsPlanned) * 100
      : null;

    return {
      driverId,
      name: row.name as string,
      daysWorked,
      delPkgs,
      delStps,
      delStpsPlanned,
      avgIls: avgIls !== null ? parseFloat(avgIls.toFixed(2)) : null,
      dna,
      code85,
      miles: parseFloat(miles.toFixed(1)),
      hours: parseFloat(hours.toFixed(2)),
      ppodPct: ppodPct !== null ? parseFloat(ppodPct.toFixed(2)) : null,
      rydeAvg: rydeAvg !== null ? parseFloat(rydeAvg.toFixed(2)) : null,
      rydeCount,
      actDelPct: actDelPct !== null ? parseFloat(actDelPct.toFixed(2)) : null,
      // Status flags
      ilsStatus: ilsStatus(avgIls),
      actDelStatus: actDelStatus(actDelPct),
      ppodStatus: ppodStatus(ppodPct),
      rydeStatus: rydeStatus(rydeAvg),
    };
  });

  // Sort by ILS ascending (worst first, nulls last)
  drivers.sort((a, b) => {
    if (a.avgIls === null && b.avgIls === null) return 0;
    if (a.avgIls === null) return 1;
    if (b.avgIls === null) return -1;
    return a.avgIls - b.avgIls;
  });

  // ── 5. Team totals ──────────────────────────────────────────────────────────
  const totalDelPkgs  = drivers.reduce((s, d) => s + d.delPkgs, 0);
  const totalDelStps  = drivers.reduce((s, d) => s + d.delStps, 0);
  const totalDelStpsPlanned = drivers.reduce((s, d) => s + d.delStpsPlanned, 0);
  const totalDna      = drivers.reduce((s, d) => s + d.dna, 0);
  const totalCode85   = drivers.reduce((s, d) => s + d.code85, 0);
  const totalMiles    = drivers.reduce((s, d) => s + d.miles, 0);
  const totalHours    = drivers.reduce((s, d) => s + d.hours, 0);
  const driversWorked = drivers.length;

  const ilsDrivers  = drivers.filter(d => d.avgIls !== null);
  const ppodDrivers = drivers.filter(d => d.ppodPct !== null);
  const rydeDrivers = drivers.filter(d => d.rydeAvg !== null);
  const actDelDrivers = drivers.filter(d => d.actDelPct !== null);

  const teamAvgIls    = ilsDrivers.length  ? ilsDrivers.reduce((s, d) => s + d.avgIls!, 0) / ilsDrivers.length   : null;
  const teamAvgPpod   = ppodDrivers.length ? ppodDrivers.reduce((s, d) => s + d.ppodPct!, 0) / ppodDrivers.length : null;
  const teamAvgRyde   = rydeDrivers.length ? rydeDrivers.reduce((s, d) => s + d.rydeAvg!, 0) / rydeDrivers.length : null;
  const teamActDel    = totalDelStpsPlanned > 0 ? (totalDelStps / totalDelStpsPlanned) * 100 : null;

  const totals = {
    delPkgs:       totalDelPkgs,
    delStps:       totalDelStps,
    delStpsPlanned:totalDelStpsPlanned,
    dna:           totalDna,
    code85:        totalCode85,
    miles:         parseFloat(totalMiles.toFixed(1)),
    hours:         parseFloat(totalHours.toFixed(2)),
    driversWorked,
    avgIls:        teamAvgIls     !== null ? parseFloat(teamAvgIls.toFixed(2))    : null,
    avgPpod:       teamAvgPpod    !== null ? parseFloat(teamAvgPpod.toFixed(2))   : null,
    avgRyde:       teamAvgRyde    !== null ? parseFloat(teamAvgRyde.toFixed(2))   : null,
    actDelPct:     teamActDel     !== null ? parseFloat(teamActDel.toFixed(2))    : null,
    ilsStatus:     ilsStatus(teamAvgIls),
    actDelStatus:  actDelStatus(teamActDel),
    ppodStatus:    ppodStatus(teamAvgPpod),
    rydeStatus:    rydeStatus(teamAvgRyde),
  };

  // ── 6. Coaching priorities ──────────────────────────────────────────────────
  type CoachPriority = {
    metric: string;
    status: string;
    message: string;
    drivers: Array<{ name: string; value: number | null }>;
  };
  const coachingPriorities: CoachPriority[] = [];

  // ILS RED
  const redIlsDrivers = drivers
    .filter(d => d.ilsStatus === "RED" && d.avgIls !== null)
    .sort((a, b) => a.avgIls! - b.avgIls!) // worst first
    .slice(0, 3);
  if (redIlsDrivers.length > 0) {
    const gap = teamAvgIls !== null ? (99 - teamAvgIls).toFixed(1) : null;
    coachingPriorities.push({
      metric: "ILS%",
      status: "RED",
      message: `Team ILS is ${teamAvgIls !== null ? teamAvgIls.toFixed(1) + "%" : "N/A"}${gap ? `, ${gap}pts below standard` : ""}. Focus on these drivers to move the needle.`,
      drivers: redIlsDrivers.map(d => ({ name: d.name, value: d.avgIls })),
    });
  }

  // Act Del RED
  const redActDelDrivers = drivers
    .filter(d => d.actDelStatus === "RED" && d.actDelPct !== null)
    .sort((a, b) => a.actDelPct! - b.actDelPct!)
    .slice(0, 3);
  if (redActDelDrivers.length > 0) {
    const gap = teamActDel !== null ? (99 - teamActDel).toFixed(1) : null;
    coachingPriorities.push({
      metric: "Act Del%",
      status: "RED",
      message: `Team Act Del is ${teamActDel !== null ? teamActDel.toFixed(1) + "%" : "N/A"}${gap ? `, ${gap}pts below standard` : ""}. These drivers are leaving stops undelivered.`,
      drivers: redActDelDrivers.map(d => ({ name: d.name, value: d.actDelPct })),
    });
  }

  // PPOD RED
  const redPpodDrivers = drivers
    .filter(d => d.ppodStatus === "RED" && d.ppodPct !== null)
    .sort((a, b) => a.ppodPct! - b.ppodPct!)
    .slice(0, 3);
  if (redPpodDrivers.length > 0) {
    const gap = teamAvgPpod !== null ? (99 - teamAvgPpod).toFixed(1) : null;
    coachingPriorities.push({
      metric: "PPOD%",
      status: "RED",
      message: `Team PPOD is ${teamAvgPpod !== null ? teamAvgPpod.toFixed(1) + "%" : "N/A"}${gap ? `, ${gap}pts below standard` : ""}. Photo compliance needs attention.`,
      drivers: redPpodDrivers.map(d => ({ name: d.name, value: d.ppodPct })),
    });
  }

  // Ryde RED
  const redRydeDrivers = drivers
    .filter(d => d.rydeStatus === "RED" && d.rydeAvg !== null)
    .sort((a, b) => a.rydeAvg! - b.rydeAvg!)
    .slice(0, 3);
  if (redRydeDrivers.length > 0) {
    coachingPriorities.push({
      metric: "Ryde",
      status: "RED",
      message: `These drivers have Ryde scores below 4.0 this week — customer experience needs immediate attention.`,
      drivers: redRydeDrivers.map(d => ({ name: d.name, value: d.rydeAvg })),
    });
  }

  // High DNA (top 3 by count, only if any exist)
  const dnaDrivers = drivers
    .filter(d => d.dna > 0)
    .sort((a, b) => b.dna - a.dna)
    .slice(0, 3);
  if (dnaDrivers.length > 0 && totalDna > 0) {
    coachingPriorities.push({
      metric: "DNA",
      status: "RED",
      message: `${totalDna} total DNA this week. These drivers account for the most.`,
      drivers: dnaDrivers.map(d => ({ name: d.name, value: d.dna })),
    });
  }

  return NextResponse.json({
    weekEnding,
    weekStart,
    drivers,
    totals,
    coachingPriorities,
  });
}
