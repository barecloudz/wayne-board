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
    ALTER TABLE drivers ADD COLUMN IF NOT EXISTS hire_date date
  `);
  console.log("✓ hire_date column added to drivers");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
