/**
 * Migration: create gc_route_map table and populate from our known routes.
 * GC route name = DRO workAreaNumber without leading zero ("0255" → "255").
 */

import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// Our station 742 routes — pulled from today's route-days + DRO workAreaNumber mapping
const ROUTES = [
  { gc_route_id: 353238, gc_route_name: "211", work_area_number: "0211", dro_name: "EXTRA 5" },
  { gc_route_id: 329635, gc_route_name: "247", work_area_number: "0247", dro_name: "N RUGBY" },
  { gc_route_id: 329636, gc_route_name: "255", work_area_number: "0255", dro_name: "ASHE HWY" },
  { gc_route_id: 444264, gc_route_name: "275", work_area_number: "0275", dro_name: "GREEN HWY" },
  { gc_route_id: 106291, gc_route_name: "314", work_area_number: "0314", dro_name: "314" },
  { gc_route_id: 106287, gc_route_name: "326", work_area_number: "0326", dro_name: "MILLS RIVER" },
  { gc_route_id: 544196, gc_route_name: "351", work_area_number: "0351", dro_name: "SUGARLOAF" },
  { gc_route_id: 399434, gc_route_name: "354", work_area_number: "0354", dro_name: "CHIMNEY ROC" },
  { gc_route_id: 556598, gc_route_name: "386", work_area_number: "0386", dro_name: "EXTRA 2" },
  { gc_route_id: 312996, gc_route_name: "418", work_area_number: "0418", dro_name: "418" },
  { gc_route_id: 310203, gc_route_name: "442", work_area_number: "0442", dro_name: "442" },
  { gc_route_id: 339158, gc_route_name: "454", work_area_number: "0454", dro_name: "454" },
  { gc_route_id: 91109,  gc_route_name: "470", work_area_number: "0470", dro_name: "470" },
];

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS gc_route_map (
      gc_route_id      INTEGER PRIMARY KEY,
      gc_route_name    TEXT NOT NULL,       -- e.g. "255"
      work_area_number TEXT NOT NULL,       -- e.g. "0255" — matches DRO workAreaNumber
      dro_name         TEXT NOT NULL DEFAULT '', -- human name e.g. "ASHE HWY"
      active           BOOLEAN NOT NULL DEFAULT true,
      updated_at       TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log("✅ gc_route_map table ready");

  for (const r of ROUTES) {
    await sql`
      INSERT INTO gc_route_map (gc_route_id, gc_route_name, work_area_number, dro_name)
      VALUES (${r.gc_route_id}, ${r.gc_route_name}, ${r.work_area_number}, ${r.dro_name})
      ON CONFLICT (gc_route_id) DO UPDATE SET
        gc_route_name    = EXCLUDED.gc_route_name,
        work_area_number = EXCLUDED.work_area_number,
        dro_name         = EXCLUDED.dro_name,
        updated_at       = NOW()
    `;
    console.log(`  ${r.work_area_number} → ${r.dro_name} (GC route ${r.gc_route_id})`);
  }

  console.log(`\n✅ ${ROUTES.length} routes stored in gc_route_map`);
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
