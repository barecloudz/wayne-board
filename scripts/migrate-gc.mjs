/**
 * Migration: create gc_route_days table
 */

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL_POOLER && !process.env.DATABASE_URL) {
  const { readFileSync } = await import("fs");
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

async function run() {
  console.log("Running GC migration...");

  await sql`
    CREATE TABLE IF NOT EXISTS gc_route_days (
      id              SERIAL PRIMARY KEY,
      gc_route_day_id INTEGER NOT NULL UNIQUE,
      driver_id       TEXT REFERENCES drivers(driver_id) ON DELETE SET NULL,
      driver_name     TEXT NOT NULL DEFAULT '',
      route_name      TEXT NOT NULL DEFAULT '',
      date            DATE NOT NULL,
      stops_per_hour  REAL,
      miles_total     REAL,
      miles_traveled  REAL,
      drive_time      INTEGER,
      status          TEXT NOT NULL DEFAULT '',
      synced_at       TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log("✅ gc_route_days table ready");

  await sql`CREATE INDEX IF NOT EXISTS gc_route_days_date_idx      ON gc_route_days(date)`;
  await sql`CREATE INDEX IF NOT EXISTS gc_route_days_driver_id_idx ON gc_route_days(driver_id)`;
  console.log("✅ Indexes ready");
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
