export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";
import { getActiveLocationId } from "@/lib/active-location";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get("days") ?? "30", 10)));
  const recentDays = Math.round(days / 2);

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
  const locationId = await getActiveLocationId();
  const orgId = session.organizationId;

  const errors: Record<string, string> = {};

  // ── 1. Drivers ───────────────────────────────────────────────────────────────
  let driverRows: any[] = [];
  try {
    driverRows = locationId !== null
      ? await sql`
          SELECT driver_id, name FROM drivers
          WHERE active = true AND role = 'driver'
            AND organization_id = ${orgId}
            AND location_id = ${locationId}
        `
      : await sql`
          SELECT driver_id, name FROM drivers
          WHERE active = true AND role = 'driver'
            AND organization_id = ${orgId}
        `;
  } catch (e: any) {
    errors.drivers = e?.message ?? String(e);
    console.error("[leaderboard] drivers query failed:", e);
    return NextResponse.json({ error: errors.drivers, _debug: "drivers query" }, { status: 500 });
  }

  if (driverRows.length === 0) return NextResponse.json([]);

  // ── 2. SPH ────────────────────────────────────────────────────────────────────
  let sphMap = new Map<string, any>();
  try {
    const rows = await sql`
      SELECT
        driver_id,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '1 day' * ${days} THEN stops_per_hour END)    AS avg_sph_30d,
        STDDEV(CASE WHEN date >= CURRENT_DATE - INTERVAL '1 day' * ${days} THEN stops_per_hour END) AS stddev_sph_30d,
        COUNT(DISTINCT CASE WHEN date >= CURRENT_DATE - INTERVAL '1 day' * ${days} AND stops_per_hour IS NOT NULL THEN date END) AS days_worked_30d,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' THEN stops_per_hour END)    AS avg_sph_90d,
        COUNT(DISTINCT CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' AND stops_per_hour IS NOT NULL THEN date END) AS days_worked_90d,
        MAX(stops_per_hour)                                                                  AS best_sph,
        MIN(CASE WHEN stops_per_hour > 0 THEN stops_per_hour END)                           AS worst_sph,
        MAX(date)::text                                                                      AS last_worked,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '1 day' * ${days} THEN miles_traveled END)    AS avg_miles_30d,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '1 day' * ${recentDays} THEN stops_per_hour END)    AS sph_recent,
        AVG(CASE WHEN date <  CURRENT_DATE - INTERVAL '1 day' * ${recentDays}
                  AND date >= CURRENT_DATE - INTERVAL '1 day' * ${days}
                  THEN stops_per_hour END)                                                   AS sph_prior
      FROM gc_route_days
      WHERE organization_id = ${orgId}
        AND stops_per_hour IS NOT NULL AND stops_per_hour > 0
      GROUP BY driver_id
    `;
    sphMap = new Map(rows.map((r: any) => [r.driver_id, r]));
  } catch (e: any) {
    errors.sph = e?.message ?? String(e);
    console.error("[leaderboard] sph query failed:", e);
  }

  // ── 3. Best/worst dates ───────────────────────────────────────────────────────
  let bestDateMap = new Map<string, string>();
  let worstDateMap = new Map<string, string>();
  try {
    const best = await sql`
      SELECT DISTINCT ON (driver_id) driver_id, date::text AS best_date
      FROM gc_route_days
      WHERE organization_id = ${orgId} AND stops_per_hour IS NOT NULL
      ORDER BY driver_id, stops_per_hour DESC
    `;
    bestDateMap = new Map(best.map((r: any) => [r.driver_id, r.best_date]));

    const worst = await sql`
      SELECT DISTINCT ON (driver_id) driver_id, date::text AS worst_date
      FROM gc_route_days
      WHERE organization_id = ${orgId} AND stops_per_hour IS NOT NULL AND stops_per_hour > 0
      ORDER BY driver_id, stops_per_hour ASC
    `;
    worstDateMap = new Map(worst.map((r: any) => [r.driver_id, r.worst_date]));
  } catch (e: any) {
    errors.dates = e?.message ?? String(e);
    console.error("[leaderboard] dates query failed:", e);
  }

  // ── 4. RYDE ───────────────────────────────────────────────────────────────────
  let rydeMap = new Map<string, any>();
  try {
    const rows = await sql`
      SELECT driver_id, AVG(stars) AS ryde_avg, COUNT(*) AS ryde_count
      FROM ryde_reviews
      WHERE organization_id = ${orgId} AND stars IS NOT NULL AND stars > 0
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * ${days}
      GROUP BY driver_id
    `;
    rydeMap = new Map(rows.map((r: any) => [r.driver_id, r]));
  } catch (e: any) {
    errors.ryde = e?.message ?? String(e);
    console.error("[leaderboard] ryde query failed:", e);
  }

  // ── 5. ILS + DSW coaching fields ─────────────────────────────────────────────
  let ilsMap = new Map<string, any>();
  try {
    const rows = await sql`
      SELECT
        driver_id,
        AVG(ils_pct)                                          AS avg_ils,
        SUM(code_85)                                          AS total_code85,
        SUM(dna)                                              AS total_dna,
        SUM(non_delvd_stps)                                   AS total_non_delvd,
        SUM(act_del_stps)                                     AS total_act_del,
        COUNT(DISTINCT date)::int                             AS days_worked_period,
        COUNT(DISTINCT CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' THEN date END)::int AS days_worked_90d
      FROM dsw_route_days
      WHERE organization_id = ${orgId} AND driver_id IS NOT NULL
        AND date >= CURRENT_DATE - INTERVAL '1 day' * ${days}
      GROUP BY driver_id
    `;
    ilsMap = new Map(rows.map((r: any) => [r.driver_id, r]));
  } catch (e: any) {
    errors.ils = e?.message ?? String(e);
    console.error("[leaderboard] ils query failed:", e);
  }

  // ── 6. PPOD ───────────────────────────────────────────────────────────────────
  let ppodMap = new Map<string, any>();
  try {
    const rows = await sql`
      SELECT
        driver_id,
        AVG(ppod_pct)            AS avg_ppod,
        AVG(photo_no_pkg_pct)    AS avg_photo_no_pkg_pct,
        AVG(photo_sensitive_pct) AS avg_photo_sensitive_pct,
        AVG(photo_other_pct)     AS avg_photo_other_pct,
        AVG(loc_good_pct)        AS avg_loc_good_pct,
        AVG(loc_poor_pct)        AS avg_loc_poor_pct,
        AVG(loc_over_mile_pct)   AS avg_loc_over_mile_pct,
        AVG(dtc_pct)             AS avg_dtc_pct
      FROM ppod_days
      WHERE organization_id = ${orgId} AND driver_id IS NOT NULL
        AND date >= CURRENT_DATE - INTERVAL '1 day' * ${days}
      GROUP BY driver_id
    `;
    ppodMap = new Map(rows.map((r: any) => [r.driver_id, r]));
  } catch (e: any) {
    errors.ppod = e?.message ?? String(e);
    console.error("[leaderboard] ppod query failed:", e);
  }

  // ── Merge ─────────────────────────────────────────────────────────────────────
  const merged = driverRows.map((d: any) => {
    const sph  = sphMap.get(d.driver_id);
    const ryde = rydeMap.get(d.driver_id);
    const ils  = ilsMap.get(d.driver_id);
    const ppod = ppodMap.get(d.driver_id);

    const sphRecent = sph?.sph_recent ? parseFloat(sph.sph_recent) : null;
    const sphPrior  = sph?.sph_prior  ? parseFloat(sph.sph_prior)  : null;
    let sph_trend: string | null = null;
    let trend_delta: number | null = null;
    if (sphRecent !== null && sphPrior !== null) {
      trend_delta = parseFloat((sphRecent - sphPrior).toFixed(2));
      if (sphRecent > sphPrior + 0.5)      sph_trend = "improving";
      else if (sphRecent < sphPrior - 0.5) sph_trend = "declining";
      else                                  sph_trend = "stable";
    }

    return {
      driver_id:               d.driver_id,
      name:                    d.name,
      avg_sph_30d:             sph?.avg_sph_30d             ? parseFloat(sph.avg_sph_30d)             : null,
      avg_sph_90d:             sph?.avg_sph_90d             ? parseFloat(sph.avg_sph_90d)             : null,
      stddev_sph_30d:          sph?.stddev_sph_30d          ? parseFloat(sph.stddev_sph_30d)          : null,
      days_worked_30d:         ils?.days_worked_period      ? parseInt(ils.days_worked_period)        : (sph?.days_worked_30d ? parseInt(sph.days_worked_30d) : null),
      days_worked_90d:         ils?.days_worked_90d         ? parseInt(ils.days_worked_90d)           : (sph?.days_worked_90d ? parseInt(sph.days_worked_90d) : null),
      best_sph:                sph?.best_sph                ? parseFloat(sph.best_sph)                : null,
      worst_sph:               sph?.worst_sph               ? parseFloat(sph.worst_sph)               : null,
      last_worked:             sph?.last_worked             ?? null,
      avg_miles_30d:           sph?.avg_miles_30d           ? parseFloat(sph.avg_miles_30d)           : null,
      best_date:               bestDateMap.get(d.driver_id) ?? null,
      worst_date:              worstDateMap.get(d.driver_id)?? null,
      ryde_score:              ryde?.ryde_avg               ? parseFloat(ryde.ryde_avg)               : null,
      ryde_count:              ryde?.ryde_count             ? parseInt(ryde.ryde_count)                : null,
      avg_ils_30d:             ils?.avg_ils                 ? parseFloat(ils.avg_ils)                  : null,
      total_code85:            ils?.total_code85            ? parseInt(ils.total_code85)               : null,
      total_dna:               ils?.total_dna               ? parseInt(ils.total_dna)                  : null,
      total_non_delvd:         ils?.total_non_delvd         ? parseInt(ils.total_non_delvd)            : null,
      total_act_del:           ils?.total_act_del           ? parseInt(ils.total_act_del)              : null,
      avg_ppod_30d:            ppod?.avg_ppod               ? parseFloat(ppod.avg_ppod)               : null,
      avg_photo_no_pkg_pct:    ppod?.avg_photo_no_pkg_pct   ? parseFloat(ppod.avg_photo_no_pkg_pct)   : null,
      avg_photo_sensitive_pct: ppod?.avg_photo_sensitive_pct? parseFloat(ppod.avg_photo_sensitive_pct): null,
      avg_photo_other_pct:     ppod?.avg_photo_other_pct    ? parseFloat(ppod.avg_photo_other_pct)    : null,
      avg_loc_good_pct:        ppod?.avg_loc_good_pct       ? parseFloat(ppod.avg_loc_good_pct)       : null,
      avg_loc_poor_pct:        ppod?.avg_loc_poor_pct       ? parseFloat(ppod.avg_loc_poor_pct)       : null,
      avg_loc_over_mile_pct:   ppod?.avg_loc_over_mile_pct  ? parseFloat(ppod.avg_loc_over_mile_pct)  : null,
      avg_dtc_pct:             ppod?.avg_dtc_pct            ? parseFloat(ppod.avg_dtc_pct)            : null,
      sph_trend,
      trend_delta,
    };
  });

  merged.sort((a, b) => (b.avg_sph_30d ?? -1) - (a.avg_sph_30d ?? -1));
  const ranked = merged.map((r, i) => ({ ...r, rank: i + 1, _errors: Object.keys(errors).length ? errors : undefined }));

  return NextResponse.json(ranked);
}
