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

    const rows = locationId !== null
      ? await sql`
          SELECT
            d.driver_id,
            d.name,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.stops_per_hour END)    AS avg_sph_30d,
            STDDEV(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.stops_per_hour END) AS stddev_sph_30d,
            COUNT(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' AND grd.stops_per_hour IS NOT NULL THEN 1 END) AS days_worked_30d,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '90 days' THEN grd.stops_per_hour END)    AS avg_sph_90d,
            COUNT(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '90 days' AND grd.stops_per_hour IS NOT NULL THEN 1 END) AS days_worked_90d,
            MAX(grd.stops_per_hour)                                                                     AS best_sph,
            MIN(CASE WHEN grd.stops_per_hour > 0 THEN grd.stops_per_hour END)                          AS worst_sph,
            MAX(grd.date)::text                                                                         AS last_worked,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.miles_traveled END)   AS avg_miles_30d,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '14 days' THEN grd.stops_per_hour END)   AS sph_recent,
            AVG(CASE WHEN grd.date <  CURRENT_DATE - INTERVAL '14 days'
                      AND grd.date >= CURRENT_DATE - INTERVAL '28 days'
                      THEN grd.stops_per_hour END)                                                      AS sph_prior,
            (SELECT grd2.date::text FROM gc_route_days grd2
             WHERE grd2.driver_id = d.driver_id AND grd2.organization_id = ${orgId}
               AND grd2.stops_per_hour IS NOT NULL
             ORDER BY grd2.stops_per_hour DESC LIMIT 1)                                                 AS best_date,
            (SELECT grd2.date::text FROM gc_route_days grd2
             WHERE grd2.driver_id = d.driver_id AND grd2.organization_id = ${orgId}
               AND grd2.stops_per_hour IS NOT NULL AND grd2.stops_per_hour > 0
             ORDER BY grd2.stops_per_hour ASC LIMIT 1)                                                  AS worst_date,
            rs.score   AS ryde_score,
            rs.week    AS ryde_week
          FROM drivers d
          LEFT JOIN gc_route_days grd
            ON grd.driver_id = d.driver_id
            AND grd.organization_id = ${orgId}
            AND grd.stops_per_hour IS NOT NULL
            AND grd.stops_per_hour > 0
          LEFT JOIN LATERAL (
            SELECT score, week FROM ryde_scores
            WHERE driver_id = d.driver_id AND organization_id = ${orgId}
            ORDER BY week DESC LIMIT 1
          ) rs ON true
          WHERE d.active = true
            AND d.role = 'driver'
            AND d.organization_id = ${orgId}
            AND d.location_id = ${locationId}
          GROUP BY d.driver_id, d.name, rs.score, rs.week
          ORDER BY COALESCE(AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.stops_per_hour END), 0) DESC NULLS LAST
        `
      : await sql`
          SELECT
            d.driver_id,
            d.name,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.stops_per_hour END)    AS avg_sph_30d,
            STDDEV(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.stops_per_hour END) AS stddev_sph_30d,
            COUNT(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' AND grd.stops_per_hour IS NOT NULL THEN 1 END) AS days_worked_30d,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '90 days' THEN grd.stops_per_hour END)    AS avg_sph_90d,
            COUNT(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '90 days' AND grd.stops_per_hour IS NOT NULL THEN 1 END) AS days_worked_90d,
            MAX(grd.stops_per_hour)                                                                     AS best_sph,
            MIN(CASE WHEN grd.stops_per_hour > 0 THEN grd.stops_per_hour END)                          AS worst_sph,
            MAX(grd.date)::text                                                                         AS last_worked,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.miles_traveled END)   AS avg_miles_30d,
            AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '14 days' THEN grd.stops_per_hour END)   AS sph_recent,
            AVG(CASE WHEN grd.date <  CURRENT_DATE - INTERVAL '14 days'
                      AND grd.date >= CURRENT_DATE - INTERVAL '28 days'
                      THEN grd.stops_per_hour END)                                                      AS sph_prior,
            (SELECT grd2.date::text FROM gc_route_days grd2
             WHERE grd2.driver_id = d.driver_id AND grd2.organization_id = ${orgId}
               AND grd2.stops_per_hour IS NOT NULL
             ORDER BY grd2.stops_per_hour DESC LIMIT 1)                                                 AS best_date,
            (SELECT grd2.date::text FROM gc_route_days grd2
             WHERE grd2.driver_id = d.driver_id AND grd2.organization_id = ${orgId}
               AND grd2.stops_per_hour IS NOT NULL AND grd2.stops_per_hour > 0
             ORDER BY grd2.stops_per_hour ASC LIMIT 1)                                                  AS worst_date,
            rs.score   AS ryde_score,
            rs.week    AS ryde_week
          FROM drivers d
          LEFT JOIN gc_route_days grd
            ON grd.driver_id = d.driver_id
            AND grd.organization_id = ${orgId}
            AND grd.stops_per_hour IS NOT NULL
            AND grd.stops_per_hour > 0
          LEFT JOIN LATERAL (
            SELECT score, week FROM ryde_scores
            WHERE driver_id = d.driver_id AND organization_id = ${orgId}
            ORDER BY week DESC LIMIT 1
          ) rs ON true
          WHERE d.active = true
            AND d.role = 'driver'
            AND d.organization_id = ${orgId}
          GROUP BY d.driver_id, d.name, rs.score, rs.week
          ORDER BY COALESCE(AVG(CASE WHEN grd.date >= CURRENT_DATE - INTERVAL '30 days' THEN grd.stops_per_hour END), 0) DESC NULLS LAST
        `;

    const ranked = (rows as any[]).map((r, i) => {
      const sphRecent = r.sph_recent ? parseFloat(r.sph_recent) : null;
      const sphPrior  = r.sph_prior  ? parseFloat(r.sph_prior)  : null;
      let sph_trend: string | null = null;
      let trend_delta: number | null = null;
      if (sphRecent !== null && sphPrior !== null) {
        trend_delta = parseFloat((sphRecent - sphPrior).toFixed(2));
        if (sphRecent > sphPrior + 0.5)      sph_trend = "improving";
        else if (sphRecent < sphPrior - 0.5) sph_trend = "declining";
        else                                  sph_trend = "stable";
      }
      return {
        ...r,
        rank:           i + 1,
        avg_sph_30d:    r.avg_sph_30d    ? parseFloat(r.avg_sph_30d)    : null,
        avg_sph_90d:    r.avg_sph_90d    ? parseFloat(r.avg_sph_90d)    : null,
        stddev_sph_30d: r.stddev_sph_30d ? parseFloat(r.stddev_sph_30d) : null,
        best_sph:       r.best_sph       ? parseFloat(r.best_sph)       : null,
        worst_sph:      r.worst_sph      ? parseFloat(r.worst_sph)      : null,
        ryde_score:     r.ryde_score     ? parseFloat(r.ryde_score)     : null,
        avg_miles_30d:  r.avg_miles_30d  ? parseFloat(r.avg_miles_30d)  : null,
        sph_trend,
        trend_delta,
      };
    });

    return NextResponse.json(ranked);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
