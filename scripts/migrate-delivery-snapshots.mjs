/**
 * One-time migration: creates the delivery_snapshots table in Neon.
 * Run once: node scripts/migrate-delivery-snapshots.mjs
 */
import { neon } from "@neondatabase/serverless";

const connStr = process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL;
if (!connStr) {
  // Try loading .env.local manually
  const { readFileSync } = await import("fs");
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS delivery_snapshots (
    id                 SERIAL PRIMARY KEY,
    date               DATE NOT NULL UNIQUE,
    stops_total        INTEGER NOT NULL DEFAULT 0,
    stops_delivered    INTEGER NOT NULL DEFAULT 0,
    impacts            INTEGER NOT NULL DEFAULT 0,
    exceptions         INTEGER NOT NULL DEFAULT 0,
    packages_total     INTEGER NOT NULL DEFAULT 0,
    packages_delivered INTEGER NOT NULL DEFAULT 0,
    scraped_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

console.log("✓ delivery_snapshots table created (or already exists)");
