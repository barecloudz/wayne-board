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
  await run(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'owned'`);
  console.log("✓ vehicles.ownership");

  await run(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mmr_due DATE`);
  console.log("✓ vehicles.mmr_due");

  await run(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS federal_inspection_due DATE`);
  console.log("✓ vehicles.federal_inspection_due");

  await run(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_expiry DATE`);
  console.log("✓ vehicles.registration_expiry");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
