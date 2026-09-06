// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");
import { neonConfig, Pool } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function run(query: string) {
  return pool.query(query);
}

async function main() {
  // Store the FedEx tracking number per review — natural unique key from Spotlight
  await run(`ALTER TABLE ryde_reviews ADD COLUMN IF NOT EXISTS track_id TEXT`);
  console.log("✓ ryde_reviews.track_id");

  // Unique constraint only where track_id is populated (Spotlight rows)
  // Manual admin reviews have no track_id and are never constrained
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS ryde_reviews_track_id_unique
    ON ryde_reviews (track_id)
    WHERE track_id IS NOT NULL
  `);
  console.log("✓ unique index on ryde_reviews.track_id (WHERE NOT NULL)");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
