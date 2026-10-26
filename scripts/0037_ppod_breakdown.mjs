import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "../.env.local"), "utf8");
const dbUrl = env.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/)?.[1]?.trim();
if (!dbUrl) { console.error("DATABASE_URL not found in .env.local"); process.exit(1); }

const sql = neon(dbUrl);

const steps = [
  // Photo quality breakdown
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS photo_total          integer`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS photo_no_pkg_pct     real`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS photo_sensitive_pct  real`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS photo_other_pct      real`,
  // Location quality breakdown
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS loc_total            integer`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS loc_good_pct         real`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS loc_poor_pct         real`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS loc_over_mile_pct    real`,
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS loc_total_applied    integer`,
  // Door-to-customer
  `ALTER TABLE ppod_days ADD COLUMN IF NOT EXISTS dtc_pct              real`,
];

let pass = 0, fail = 0;
for (const stmt of steps) {
  try {
    await sql.unsafe(stmt);
    console.log("✓", stmt.slice(0, 80));
    pass++;
  } catch (e) {
    console.error("✗", stmt.slice(0, 80), "→", e.message);
    fail++;
  }
}
console.log(`\n${pass} passed · ${fail} failed`);
