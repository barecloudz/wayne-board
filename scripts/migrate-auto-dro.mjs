/**
 * Migration: creates Auto DRO tables in Neon.
 * Run once: node scripts/migrate-auto-dro.mjs
 *
 * Tables created:
 *   dro_routes       — today's route summaries (wiped + reloaded on each sync)
 *   dro_stops        — today's individual stops (wiped + reloaded on each sync)
 *   dro_daily_totals — lightweight historical aggregate (no PII, kept permanently)
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Load .env.local if env vars not already set
if (!process.env.DATABASE_URL) {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// ── dro_routes ────────────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS dro_routes (
    id               SERIAL PRIMARY KEY,
    work_area_name   TEXT    NOT NULL,
    work_area_number TEXT    NOT NULL,
    route_type       TEXT    NOT NULL DEFAULT '',
    stops            INTEGER NOT NULL DEFAULT 0,
    packages         INTEGER NOT NULL DEFAULT 0,
    distance         REAL    NOT NULL DEFAULT 0,
    time_hours       REAL    NOT NULL DEFAULT 0,
    cube             REAL    NOT NULL DEFAULT 0,
    vehicle_capacity TEXT    NOT NULL DEFAULT '',
    sort_date        DATE    NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ dro_routes");

// ── dro_stops ─────────────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS dro_stops (
    id               SERIAL PRIMARY KEY,
    waypoint_id      TEXT    NOT NULL,
    stop_id          TEXT    NOT NULL,
    firm_name        TEXT    NOT NULL DEFAULT '',
    address          TEXT    NOT NULL DEFAULT '',
    city             TEXT    NOT NULL DEFAULT '',
    state            TEXT    NOT NULL DEFAULT '',
    postal_code      TEXT    NOT NULL DEFAULT '',
    actual_route     TEXT    NOT NULL DEFAULT '',
    actual_sequence  INTEGER,
    arrival_time     TEXT    NOT NULL DEFAULT '',
    stop_class       TEXT    NOT NULL DEFAULT '',
    no_packages      INTEGER NOT NULL DEFAULT 0,
    total_weight     REAL    NOT NULL DEFAULT 0,
    total_cube       REAL    NOT NULL DEFAULT 0,
    is_lp_package    BOOLEAN NOT NULL DEFAULT FALSE,
    is_bulk_stop     BOOLEAN NOT NULL DEFAULT FALSE,
    work_area_number TEXT    NOT NULL DEFAULT '',
    sort_date        DATE    NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ dro_stops");

// ── dro_daily_totals ──────────────────────────────────────────────────────────
await sql`
  CREATE TABLE IF NOT EXISTS dro_daily_totals (
    id             SERIAL PRIMARY KEY,
    date           DATE    NOT NULL UNIQUE,
    routes         INTEGER NOT NULL DEFAULT 0,
    total_stops    INTEGER NOT NULL DEFAULT 0,
    total_packages INTEGER NOT NULL DEFAULT 0,
    total_distance REAL    NOT NULL DEFAULT 0,
    synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ dro_daily_totals");

// ── Settings keys for Auto DRO ────────────────────────────────────────────────
// Seed default values only if the key doesn't exist yet
await sql`
  INSERT INTO settings (key, value) VALUES
    ('dro_auto_sync_enabled', 'false'),
    ('dro_auto_sync_time',    '23:55'),
    ('dro_last_synced_at',    ''),
    ('dro_service_area_id',   '3060743'),
    ('dro_station_id',        '259')
  ON CONFLICT (key) DO NOTHING
`;
console.log("✓ settings keys seeded");

console.log("\n✅ Auto DRO migration complete.");
