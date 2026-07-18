/**
 * Build driver profiles from gc_route_days.
 *
 * Reads all rows from gc_route_days, calculates rolling averages,
 * trend, consistency, and upserts into gc_driver_profiles.
 *
 * Run: node scripts/build-driver-profiles.mjs
 * Also run after every nightly gc sync.
 */

import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return null;
  const mean = avg(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

async function run() {
  const today = new Date();
  const cutoff30 = new Date(today); cutoff30.setDate(today.getDate() - 30);
  const cutoff90 = new Date(today); cutoff90.setDate(today.getDate() - 90);
  const cutoff14 = new Date(today); cutoff14.setDate(today.getDate() - 14);
  const cutoff28 = new Date(today); cutoff28.setDate(today.getDate() - 28);

  const d30 = cutoff30.toISOString().slice(0, 10);
  const d90 = cutoff90.toISOString().slice(0, 10);
  const d14 = cutoff14.toISOString().slice(0, 10);
  const d28 = cutoff28.toISOString().slice(0, 10);

  // Pull all matched route-days (driver_id not null, sph not null)
  const rows = await sql`
    SELECT
      driver_id,
      driver_name,
      date::text,
      stops_per_hour,
      miles_total
    FROM gc_route_days
    WHERE driver_id IS NOT NULL
      AND stops_per_hour IS NOT NULL
      AND stops_per_hour > 0
    ORDER BY driver_id, date
  `;

  console.log(`${rows.length} matched route-day rows loaded\n`);

  // Group by driver
  const byDriver = {};
  for (const row of rows) {
    if (!byDriver[row.driver_id]) byDriver[row.driver_id] = { name: row.driver_name, rows: [] };
    byDriver[row.driver_id].rows.push(row);
  }

  let updated = 0;

  for (const [driverId, { name, rows: dRows }] of Object.entries(byDriver)) {
    const all   = dRows.map(r => r.stops_per_hour);
    const r30   = dRows.filter(r => r.date >= d30);
    const r90   = dRows.filter(r => r.date >= d90);
    const r14   = dRows.filter(r => r.date >= d14);                   // last 14 days
    const prev14 = dRows.filter(r => r.date >= d28 && r.date < d14); // prior 14 days

    const sph30   = r30.map(r => r.stops_per_hour);
    const sph90   = r90.map(r => r.stops_per_hour);
    const sph14   = r14.map(r => r.stops_per_hour);
    const sphP14  = prev14.map(r => r.stops_per_hour);

    const avgAll  = avg(all);
    const avg30   = avg(sph30);
    const avg90   = avg(sph90);
    const std30   = stddev(sph30);

    // Trend
    const trendAvg14  = avg(sph14)  ?? avg30 ?? avgAll;
    const trendAvgP14 = avg(sphP14) ?? avg30 ?? avgAll;
    const delta = trendAvgP14 != null ? trendAvg14 - trendAvgP14 : 0;
    const trend = Math.abs(delta) < 0.5 ? "stable"
                : delta > 0             ? "improving"
                :                         "declining";

    // Best / worst
    const sorted = [...dRows].sort((a, b) => b.stops_per_hour - a.stops_per_hour);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Avg miles (30d)
    const miles30 = r30.filter(r => r.miles_total).map(r => r.miles_total);

    const lastWorked = dRows[dRows.length - 1].date;

    await sql`
      INSERT INTO gc_driver_profiles (
        driver_id, driver_name,
        avg_sph_30d, avg_sph_90d, avg_sph_all,
        stddev_sph_30d,
        avg_miles_30d,
        days_worked_30d, days_worked_90d,
        sph_trend, trend_delta,
        best_sph, worst_sph, best_date, worst_date,
        last_worked, profile_updated
      ) VALUES (
        ${driverId}, ${name},
        ${avg30}, ${avg90}, ${avgAll},
        ${std30},
        ${avg(miles30)},
        ${r30.length}, ${r90.length},
        ${trend}, ${delta},
        ${best.stops_per_hour}, ${worst.stops_per_hour},
        ${best.date}, ${worst.date},
        ${lastWorked}, NOW()
      )
      ON CONFLICT (driver_id) DO UPDATE SET
        driver_name     = EXCLUDED.driver_name,
        avg_sph_30d     = EXCLUDED.avg_sph_30d,
        avg_sph_90d     = EXCLUDED.avg_sph_90d,
        avg_sph_all     = EXCLUDED.avg_sph_all,
        stddev_sph_30d  = EXCLUDED.stddev_sph_30d,
        avg_miles_30d   = EXCLUDED.avg_miles_30d,
        days_worked_30d = EXCLUDED.days_worked_30d,
        days_worked_90d = EXCLUDED.days_worked_90d,
        sph_trend       = EXCLUDED.sph_trend,
        trend_delta     = EXCLUDED.trend_delta,
        best_sph        = EXCLUDED.best_sph,
        worst_sph       = EXCLUDED.worst_sph,
        best_date       = EXCLUDED.best_date,
        worst_date      = EXCLUDED.worst_date,
        last_worked     = EXCLUDED.last_worked,
        profile_updated = NOW()
    `;

    console.log(`${driverId.padEnd(14)} SPH 30d=${avg30?.toFixed(2) ?? "—"} | 90d=${avg90?.toFixed(2) ?? "—"} | trend=${trend} (${delta >= 0 ? "+" : ""}${delta.toFixed(2)}) | days=${r30.length}/30d | best=${best.stops_per_hour.toFixed(2)}`);
    updated++;
  }

  console.log(`\n✅ ${updated} driver profiles built/updated`);
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
