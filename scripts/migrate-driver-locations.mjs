import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Parse .env.local manually, stripping surrounding quotes
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eqIdx = line.indexOf("=");
  if (eqIdx === -1) continue;
  const key = line.slice(0, eqIdx).trim();
  const raw = line.slice(eqIdx + 1).trim();
  const val = raw.replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS all_locations BOOLEAN NOT NULL DEFAULT false`;
console.log("✅ drivers.all_locations added");

await sql`
  CREATE TABLE IF NOT EXISTS driver_locations (
    id              SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    driver_id       TEXT    NOT NULL,
    location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (driver_id, location_id)
  )
`;
console.log("✅ driver_locations table created");

await sql`CREATE INDEX IF NOT EXISTS driver_locations_org_idx ON driver_locations(organization_id)`;
await sql`CREATE INDEX IF NOT EXISTS driver_locations_driver_idx ON driver_locations(driver_id)`;
console.log("✅ Indexes created");

// Verify
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='drivers' AND column_name='all_locations'`;
const tbl  = await sql`SELECT table_name FROM information_schema.tables WHERE table_name='driver_locations'`;
console.log("Verification:", cols.length ? "all_locations ✅" : "all_locations ❌", tbl.length ? "driver_locations ✅" : "driver_locations ❌");
