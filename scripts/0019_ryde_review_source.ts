// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");
import { neonConfig, Pool } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function run(query: string) {
  return pool.query(query);
}

async function main() {
  // 'spotlight' = pulled from FedEx Spotlight RYDE report
  // null = manually added via admin UI
  await run(`ALTER TABLE ryde_reviews ADD COLUMN IF NOT EXISTS source TEXT`);
  console.log("✓ ryde_reviews.source");

  // Mark all existing rows as manually entered (null = admin UI)
  // Spotlight-scraped rows will be tagged 'spotlight' going forward
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
