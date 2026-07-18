/**
 * Netlify scheduled function — runs nightly at 11:45 PM Eastern.
 * Pulls yesterday's GroundCloud route-day data into gc_route_days,
 * then rebuilds driver profiles.
 *
 * Schedule: 45 3 * * *  (3:45 UTC = 11:45 PM Eastern)
 */

import type { Config } from "@netlify/functions";
import { syncGc } from "../../lib/gc-sync";
import { neon } from "@neondatabase/serverless";

export const config: Config = {
  schedule: "45 3 * * *",
};

export default async function handler() {
  console.log("[cron-sync-gc] Starting nightly GC sync");

  try {
    // Step 1: sync yesterday's route-days
    const result = await syncGc();
    console.log("[cron-sync-gc] Sync result:", JSON.stringify(result));

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), { status: 500 });
    }

    // Step 2: rebuild driver profiles from updated data
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const today = new Date();
    const d30 = new Date(today); d30.setDate(today.getDate() - 30);
    const d90 = new Date(today); d90.setDate(today.getDate() - 90);
    const d14 = new Date(today); d14.setDate(today.getDate() - 14);
    const d28 = new Date(today); d28.setDate(today.getDate() - 28);

    const rows = await sql`
      SELECT driver_id, driver_name, date::text, stops_per_hour, miles_total
      FROM gc_route_days
      WHERE driver_id IS NOT NULL AND stops_per_hour IS NOT NULL AND stops_per_hour > 0
      ORDER BY driver_id, date
    `;

    function avg(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
    function stddev(arr: number[]) {
      if (arr.length < 2) return null;
      const m = avg(arr)!;
      return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
    }

    const byDriver: Record<string, { name: string; rows: any[] }> = {};
    for (const row of rows as any[]) {
      if (!byDriver[row.driver_id]) byDriver[row.driver_id] = { name: row.driver_name, rows: [] };
      byDriver[row.driver_id].rows.push(row);
    }

    let profilesUpdated = 0;
    const s30 = d30.toISOString().slice(0, 10);
    const s90 = d90.toISOString().slice(0, 10);
    const s14 = d14.toISOString().slice(0, 10);
    const s28 = d28.toISOString().slice(0, 10);

    for (const [driverId, { name, rows: dRows }] of Object.entries(byDriver)) {
      const all   = dRows.map(r => r.stops_per_hour);
      const r30   = dRows.filter(r => r.date >= s30);
      const r90   = dRows.filter(r => r.date >= s90);
      const r14   = dRows.filter(r => r.date >= s14);
      const prev14 = dRows.filter(r => r.date >= s28 && r.date < s14);

      const sph30  = r30.map(r => r.stops_per_hour);
      const sph90  = r90.map(r => r.stops_per_hour);
      const avg30  = avg(sph30); const avg90 = avg(sph90); const avgAll = avg(all);
      const tAvg14 = avg(r14.map(r => r.stops_per_hour)) ?? avg30 ?? avgAll;
      const tAvgP  = avg(prev14.map(r => r.stops_per_hour)) ?? avg30 ?? avgAll;
      const delta  = (tAvg14 ?? 0) - (tAvgP ?? 0);
      const trend  = Math.abs(delta) < 0.5 ? "stable" : delta > 0 ? "improving" : "declining";
      const sorted = [...dRows].sort((a, b) => b.stops_per_hour - a.stops_per_hour);
      const best = sorted[0]; const worst = sorted[sorted.length - 1];
      const miles30 = r30.filter(r => r.miles_total).map(r => r.miles_total);

      await sql`
        INSERT INTO gc_driver_profiles (driver_id, driver_name, avg_sph_30d, avg_sph_90d, avg_sph_all, stddev_sph_30d, avg_miles_30d, days_worked_30d, days_worked_90d, sph_trend, trend_delta, best_sph, worst_sph, best_date, worst_date, last_worked, profile_updated)
        VALUES (${driverId}, ${name}, ${avg30}, ${avg90}, ${avgAll}, ${stddev(sph30)}, ${avg(miles30)}, ${r30.length}, ${r90.length}, ${trend}, ${delta}, ${best.stops_per_hour}, ${worst.stops_per_hour}, ${best.date}, ${worst.date}, ${dRows[dRows.length-1].date}, NOW())
        ON CONFLICT (driver_id) DO UPDATE SET
          driver_name=EXCLUDED.driver_name, avg_sph_30d=EXCLUDED.avg_sph_30d, avg_sph_90d=EXCLUDED.avg_sph_90d,
          avg_sph_all=EXCLUDED.avg_sph_all, stddev_sph_30d=EXCLUDED.stddev_sph_30d, avg_miles_30d=EXCLUDED.avg_miles_30d,
          days_worked_30d=EXCLUDED.days_worked_30d, days_worked_90d=EXCLUDED.days_worked_90d,
          sph_trend=EXCLUDED.sph_trend, trend_delta=EXCLUDED.trend_delta,
          best_sph=EXCLUDED.best_sph, worst_sph=EXCLUDED.worst_sph, best_date=EXCLUDED.best_date,
          worst_date=EXCLUDED.worst_date, last_worked=EXCLUDED.last_worked, profile_updated=NOW()
      `;
      profilesUpdated++;
    }

    console.log(`[cron-sync-gc] Profiles updated: ${profilesUpdated}`);
    const { success: _s, ...rest } = result;
    return new Response(JSON.stringify({ success: true, ...rest, profilesUpdated }), { status: 200 });

  } catch (err: any) {
    console.error("[cron-sync-gc] Error:", err?.message ?? err);
    return new Response(JSON.stringify({ success: false, error: err?.message ?? String(err) }), { status: 500 });
  }
}
