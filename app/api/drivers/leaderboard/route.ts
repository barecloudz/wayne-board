export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

    // Join profiles + ryde scores + driver info
    const rows = await sql`
      SELECT
        d.driver_id,
        d.name,
        d.active,
        p.avg_sph_30d,
        p.avg_sph_90d,
        p.avg_sph_all,
        p.stddev_sph_30d,
        p.days_worked_30d,
        p.days_worked_90d,
        p.sph_trend,
        p.trend_delta,
        p.best_sph,
        p.worst_sph,
        p.best_date,
        p.worst_date,
        p.last_worked,
        p.avg_miles_30d,
        -- Latest Ryde score
        rs.score        AS ryde_score,
        rs.week         AS ryde_week,
        rs.deliveries   AS ryde_deliveries
      FROM drivers d
      LEFT JOIN gc_driver_profiles p ON p.driver_id = d.driver_id
      LEFT JOIN LATERAL (
        SELECT score, week, deliveries
        FROM ryde_scores
        WHERE driver_id = d.driver_id
          AND organization_id = ${session.organizationId}
        ORDER BY week DESC
        LIMIT 1
      ) rs ON true
      WHERE d.active = true
        AND d.role = 'driver'
        AND d.organization_id = ${session.organizationId}
      ORDER BY COALESCE(p.avg_sph_30d, 0) DESC
    `;

    // Add rank
    const ranked = (rows as any[]).map((r, i) => ({
      ...r,
      rank: i + 1,
      avg_sph_30d:    r.avg_sph_30d    ? parseFloat(r.avg_sph_30d)    : null,
      avg_sph_90d:    r.avg_sph_90d    ? parseFloat(r.avg_sph_90d)    : null,
      stddev_sph_30d: r.stddev_sph_30d ? parseFloat(r.stddev_sph_30d) : null,
      trend_delta:    r.trend_delta    ? parseFloat(r.trend_delta)    : null,
      best_sph:       r.best_sph       ? parseFloat(r.best_sph)       : null,
      worst_sph:      r.worst_sph      ? parseFloat(r.worst_sph)      : null,
      ryde_score:     r.ryde_score     ? parseFloat(r.ryde_score)     : null,
      avg_miles_30d:  r.avg_miles_30d  ? parseFloat(r.avg_miles_30d)  : null,
    }));

    return NextResponse.json(ranked);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
