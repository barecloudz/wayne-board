/**
 * 1. Adds wkt_poly, vehicle_id, hex_code columns to dro_anchor_areas
 * 2. Populates them from gs-clusters.json + gs-vehicles.json
 *    (both captured from GroundSwell API by inspect-gs-dispatch2/3 scripts)
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

if (!process.env.DATABASE_URL_POOLER && !process.env.DATABASE_URL) {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// ── Step 1: Add columns ────────────────────────────────────────────────────────
await sql`ALTER TABLE dro_anchor_areas ADD COLUMN IF NOT EXISTS wkt_poly   TEXT`;
await sql`ALTER TABLE dro_anchor_areas ADD COLUMN IF NOT EXISTS vehicle_id INTEGER`;
await sql`ALTER TABLE dro_anchor_areas ADD COLUMN IF NOT EXISTS hex_code   TEXT`;
console.log("✅ Columns added");

// ── Step 2: Load GS data ───────────────────────────────────────────────────────
const clusters = JSON.parse(readFileSync("scripts/gs-clusters.json", "utf8"));
const vehicles = JSON.parse(readFileSync("scripts/gs-vehicles.json", "utf8"));

// Build vehicle_id → hexCode map
const vehicleHex = {};
for (const v of vehicles) {
  vehicleHex[v.id] = v.hexCode;
}

console.log(`Loaded ${clusters.length} clusters, ${vehicles.length} vehicles`);

// ── Step 3: Update anchor areas ────────────────────────────────────────────────
let updated = 0;
let notFound = 0;

for (const cluster of clusters) {
  const anchorAreaId = parseFloat(cluster.identifier);
  if (!anchorAreaId) continue;

  const hexCode = vehicleHex[cluster.vehicle_id] || null;

  const result = await sql`
    UPDATE dro_anchor_areas
    SET wkt_poly   = ${cluster.poly},
        vehicle_id = ${cluster.vehicle_id},
        hex_code   = ${hexCode}
    WHERE anchor_area_id = ${anchorAreaId}
    RETURNING id
  `;

  if (result.length > 0) {
    updated++;
  } else {
    notFound++;
    // These are clusters for anchor areas not currently in our dro_anchor_areas table
    // (They might be from a different time when the anchor area set was different)
  }
}

console.log(`✅ Updated ${updated} anchor areas with WKT polygons`);
if (notFound > 0) {
  console.log(`ℹ️  ${notFound} clusters had no matching anchor area in DB (may need DRO sync first)`);
}

// Print summary of what we have
const summary = await sql`
  SELECT
    COUNT(*) FILTER (WHERE wkt_poly IS NOT NULL) AS with_wkt,
    COUNT(*) FILTER (WHERE wkt_poly IS NULL)     AS without_wkt,
    COUNT(*)                                     AS total
  FROM dro_anchor_areas
`;
console.log("Anchor areas:", summary[0]);
