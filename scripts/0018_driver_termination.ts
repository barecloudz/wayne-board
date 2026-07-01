// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");
import { neonConfig, Pool } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function run(query: string) {
  return pool.query(query);
}

async function main() {
  await run(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS termination_type TEXT`);
  console.log("✓ drivers.termination_type");

  await run(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS termination_note TEXT`);
  console.log("✓ drivers.termination_note");

  await run(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMP`);
  console.log("✓ drivers.terminated_at");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
