// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");
import { neonConfig, Pool } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function run(query: string) {
  return pool.query(query);
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS mmr_generations (
      id                    SERIAL PRIMARY KEY,
      organization_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      vehicle_id            INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      month_year            TEXT NOT NULL,
      mileage_snapshot      TEXT,
      maintenance_row_count INTEGER NOT NULL DEFAULT 0,
      generated_by          TEXT NOT NULL,
      generated_at          TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("✓ mmr_generations table created");

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS mmr_generations_org_vehicle_month_unique
    ON mmr_generations (organization_id, vehicle_id, month_year)
  `);
  console.log("✓ mmr_generations_org_vehicle_month_unique index created");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
