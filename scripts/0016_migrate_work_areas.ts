// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");
import { neonConfig, Pool } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function run(query: string) {
  const res = await pool.query(query);
  return res;
}

async function main() {
  await run(`
    CREATE TABLE IF NOT EXISTS work_areas (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      shape      TEXT NOT NULL DEFAULT 'circle',
      color      TEXT NOT NULL DEFAULT '#6366f1',
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("✓ work_areas table");

  await run(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS default_work_area_id INTEGER REFERENCES work_areas(id)`);
  console.log("✓ drivers.default_work_area_id column");

  await run(`
    CREATE TABLE IF NOT EXISTS daily_work_area_assignments (
      id           SERIAL PRIMARY KEY,
      driver_id    TEXT NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
      date         DATE NOT NULL,
      work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE(driver_id, date)
    )
  `);
  console.log("✓ daily_work_area_assignments table");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
