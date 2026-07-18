import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

if (!process.env.DATABASE_URL) {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k?.trim() && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS dro_anchor_areas (
    id                  SERIAL PRIMARY KEY,
    anchor_area_id      BIGINT UNIQUE NOT NULL,
    name                TEXT NOT NULL DEFAULT '',
    shape_json          TEXT NOT NULL DEFAULT '{}',
    enabled_route_plans TEXT NOT NULL DEFAULT '[]',
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ dro_anchor_areas");

await sql`ALTER TABLE dro_stops ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`;
await sql`ALTER TABLE dro_stops ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`;
console.log("✓ dro_stops lat/lng columns");

await sql`
  INSERT INTO settings (key, value) VALUES ('dro_username', ''), ('dro_password', '')
  ON CONFLICT (key) DO NOTHING
`;
console.log("✓ settings keys");
console.log("\n✅ Anchor area migration complete.");
