/**
 * Migration: create gc_driver_profiles table
 */

import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

async function run() {
  console.log("Creating gc_driver_profiles table...");

  await sql`
    CREATE TABLE IF NOT EXISTS gc_driver_profiles (
      driver_id        TEXT PRIMARY KEY REFERENCES drivers(driver_id) ON DELETE CASCADE,
      driver_name      TEXT NOT NULL DEFAULT '',

      -- Rolling averages
      avg_sph_30d      REAL,
      avg_sph_90d      REAL,
      avg_sph_all      REAL,

      -- Consistency
      stddev_sph_30d   REAL,

      -- Volume
      avg_stops_30d    REAL,
      avg_miles_30d    REAL,

      -- Reliability
      days_worked_30d  INTEGER DEFAULT 0,
      days_worked_90d  INTEGER DEFAULT 0,

      -- Trend (last 14d vs prior 14d)
      sph_trend        TEXT DEFAULT 'stable',   -- 'improving' | 'declining' | 'stable'
      trend_delta      REAL,                    -- sph_last14 - sph_prev14

      -- Best / worst
      best_sph         REAL,
      worst_sph        REAL,
      best_date        DATE,
      worst_date       DATE,

      -- Meta
      last_worked      DATE,
      profile_updated  TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log("✅ gc_driver_profiles table ready");
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
