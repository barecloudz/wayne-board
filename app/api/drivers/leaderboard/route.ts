export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";
import { getActiveLocationId } from "@/lib/active-location";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const locationId = await getActiveLocationId();
    const orgId = session.organizationId;

    // ── 1. Drivers ───────────────────────────────────────────────────────────
    const driverRows = locationId !== null
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

    if (driverRows.length === 0) return NextResponse.json([]);

    // ── 2. SPH from gc_route_days ────────────────────────────────────────────
    const sphRows = await sql`
      SELECT
        driver_id,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN stops_per_hour END)  AS avg_sph_30d,
        STDDEV(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN stops_per_hour END) AS stddev_sph_30d,
        COUNT(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' AND stops_per_hour IS NOT NULL THEN 1 END) AS days_worked_30d,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' THEN stops_per_hour END)  AS avg_sph_90d,
        COUNT(CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' AND stops_per_hour IS NOT NULL THEN 1 END) AS days_worked_90d,
        MAX(stops_per_hour)                                                                AS best_sph,
        MIN(CASE WHEN stops_per_hour > 0 THEN stops_per_hour END)                         AS worst_sph,
        MAX(date)::text                                                                    AS last_worked,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN miles_traveled END)  AS avg_miles_30d,
        AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '14 days' THEN stops_per_hour END)  AS sph_recent,
        AVG(CASE WHEN date <  CURRENT_DATE - INTERVAL '14 days'
                  AND date >= CURRENT_DATE - INTERVAL '28 days'
                  THEN stops_per_hour END)                                                 AS sph_prior
      FROM gc_route_days
      WHERE organization_id = ${orgId}
        AND stops_per_hour IS NOT NULL AND stops_per_hour > 0
      GROUP BY driver_id
    `;

    // ── 3. Best/worst dates ──────────────────────────────────────────────────
    const bestDateRows = await sql`
      SELECT DISTINCT ON (driver_id)
        driver_id, date::text AS best_date
      FROM gc_route_days
      WHERE organization_id = ${orgId} AND stops_per_hour IS NOT NULL
      ORDER BY driver_id, stops_per_hour DESC
    `;

    const worstDateRows = await sql`
      SELECT DISTINCT ON (driver_id)
        driver_id, date::text AS worst_date
      FROM gc_route_days
      WHERE organization_id = ${orgId} AND stops_per_hour IS NOT NULL AND stops_per_hour > 0
      ORDER BY driver_id, stops_per_hour ASC
    `;

    // ── 4. RYDE reviews ──────────────────────────────────────────────────────
    const rydeRows = await sql`
      SELECT driver_id, AVG(stars) AS ryde_avg, COUNT(*) AS ryde_count
      FROM ryde_reviews
      WHERE organization_id = ${orgId}
        AND stars IS NOT NULL AND stars > 0
      GROUP BY driver_id
    `;

    // ── 5. ILS from dsw_route_days ───────────────────────────────────────────
    const ilsRows = await sql`
      SELECT driver_id, AVG(ils_pct) AS avg_ils
      FROM dsw_route_days
      WHERE organization_id = ${orgId} AND driver_id IS NOT NULL
      GROUP BY driver_id
    `;

    // ── 6. PPOD from ppod_days ───────────────────────────────────────────────
    const ppodRows = await sql`
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
      GROUP BY driver_id
    `;

    // ── Build lookup maps ────────────────────────────────────────────────────
    const sphMap      = new Map((sphRows      as any[]).map((r) => [r.driver_id, r]));
    const bestDateMap = new Map((bestDateRows  as any[]).map((r) => [r.driver_id, r.best_date]));
    const worstDateMap= new Map((worstDateRows as any[]).map((r) => [r.driver_id, r.worst_date]));
    const rydeMap     = new Map((rydeRows      as any[]).map((r) => [r.driver_id, r]));
    const ilsMap      = new Map((ilsRows       as any[]).map((r) => [r.driver_id, r]));
    const ppodMap     = new Map((ppodRows      as any[]).map((r) => [r.driver_id, r]));

    // ── Merge ────────────────────────────────────────────────────────────────
    const merged = (driverRows as any[]).map((d) => {
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
        days_worked_30d:         sph?.days_worked_30d         ? parseInt(sph.days_worked_30d)           : null,
        days_worked_90d:         sph?.days_worked_90d         ? parseInt(sph.days_worked_90d)           : null,
        best_sph:                sph?.best_sph                ? parseFloat(sph.best_sph)                : null,
        worst_sph:               sph?.worst_sph               ? parseFloat(sph.worst_sph)               : null,
        last_worked:             sph?.last_worked             ?? null,
        avg_miles_30d:           sph?.avg_miles_30d           ? parseFloat(sph.avg_miles_30d)           : null,
        best_date:               bestDateMap.get(d.driver_id) ?? null,
        worst_date:              worstDateMap.get(d.driver_id)?? null,
        ryde_score:              ryde?.ryde_avg               ? parseFloat(ryde.ryde_avg)               : null,
        ryde_count:              ryde?.ryde_count             ? parseInt(ryde.ryde_count)                : null,
        avg_ils_30d:             ils?.avg_ils                 ? parseFloat(ils.avg_ils)                  : null,
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

    // Sort by 30d SPH desc, drivers without SPH data at the bottom
    merged.sort((a, b) => (b.avg_sph_30d ?? -1) - (a.avg_sph_30d ?? -1));

    const ranked = merged.map((r, i) => ({ ...r, rank: i + 1 }));

    return NextResponse.json(ranked);
  } catch (err: any) {
    console.error("[leaderboard]", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
