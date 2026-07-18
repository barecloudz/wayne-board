/**
 * Migration: create route_templates and route_template_areas tables.
 * Then seed from the 3 real DRO plans: AUTO, 11 People, Saturday.
 */

import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// Seeded from scripts/pull-dro-plans.mjs output
const TEMPLATES = [
  {
    name: "AUTO — 13 drivers",
    dro_plan_id: 2352850,
    dro_plan_name: "AUTO",
    driver_count: 13,
    day_of_week: null,       // weekday standard
    is_default: true,
    notes: "Main daily plan. Used Mon–Fri at full staffing.",
    routes: [
      { slot: 1,  label: "ASHE HWY",    work_area_number: "0255", dro_vehicle_name: "742 ASHE HWY",
        areas: ["7th Ave","Airport/Advent Health","Ashe Hwy/Highland Ave","Clear Creek","Duncan Hill"] },
      { slot: 2,  label: "ETOWAH / ZIRCONIA", work_area_number: "0442", dro_vehicle_name: "742 ETOWAH",
        areas: ["E allen/ flatrock","Kenmure ","Lower Zirconia","Spartanburg Hwy/Boyd Chevy","Zirconia/ MineGapRd","Zirconia/BellMountainRd","Zirconia/BobsCreek","Zirconia/Cliffs","Zirconia/Gap Creek","Zirconia/Kingdom Place","Zirconia/MondaminRd","Zirconia/NorthLakeSummit","Zirconia/OldUs25","Zirconia/OldZirconiaRd","Zirconia/SouthLakeSummit","Zirconia/ZirconiaRd"] },
      { slot: 3,  label: "EXTRA 5 / DOWNTOWN", work_area_number: "0211", dro_vehicle_name: "742 EXTRA 5",
        areas: ["Brevard Rd/Blythe","Downtown Hendo East","Downtown Hendo/Pardee","Downtown West","Downtown West Laurel Park","Downtown/Jackson Pk"] },
      { slot: 4,  label: "GREEN HWY",   work_area_number: "0275", dro_vehicle_name: "742 GREEN HWY",
        areas: ["Champion Hills/Laurel Park","Downtown/Old Spartanburg","Erkwood/Greenville Hwy","Greenville Hwy"] },
      { slot: 5,  label: "KANUGA 39",   work_area_number: "0314", dro_vehicle_name: "742 KANUGA 39",
        areas: ["Inner Crab Creek","Little River ","Outer Crab Creek","Pleasant Grove"] },
      { slot: 6,  label: "MILLS RIVER", work_area_number: "0326", dro_vehicle_name: "742 MILLS RIVER",
        areas: ["Bat Cave","Gerton","Lake Lure","upper Bearwallow Gerton","west Chimney Rock Rd"] },
      { slot: 7,  label: "SUGARLOAF",   work_area_number: "0351", dro_vehicle_name: "742 SUGARLOAF",
        areas: ["4Season/Sugarloaf","Blue Ridge Mall","Carolina Village","Dana/Tracy Grove Rd","Linda Vista","Thompson St","Walmart/Francis Rd","Walmart/Nix Rd 3","Walmart/Sams 1","Willowbrook"] },
      { slot: 8,  label: "ERKWOOD",     work_area_number: "0418", dro_vehicle_name: "742 ERKWOOD",
        areas: ["Brevard Rd/Davis Mtn","Brevard Rd/Laurel Park","Laurel Park/Country Club","Laurel Park/Somersby"] },
      { slot: 9,  label: "7TH AVE",     work_area_number: "0454", dro_vehicle_name: "742 7TH AVE",
        areas: ["Airport/Ashe Hwy","Asheville Hwy/Brookside Camp","Asheville Hwy/Mtn Home","E glenwood","Huff n Puff","NAPLES RD FRONT"] },
      { slot: 10, label: "CHIMNEY ROC", work_area_number: "0354", dro_vehicle_name: "742 CHIMNEY ROC",
        areas: ["Erkwood/Kanuga","Kanuga/Town","Osceola Lake"] },
      { slot: 11, label: "CUMMINGS CV", work_area_number: "0470", dro_vehicle_name: "742 CUMMINGS CV",
        areas: ["Pressley rd","Sugarloaf Mtn rd","Sunrise Ridge","Union Hill","Upper East Chimney Rock rd","upper east edneyville"] },
      { slot: 12, label: "N RUGBY",     work_area_number: "0247", dro_vehicle_name: "742 N RUGBY",
        areas: ["Chimney Rock","Chimney Rock/Sugarloaf","Fruiland","KYLES CREEK","Locust ridge","Oak Hill","OLD CLEAR CREEK","Ridge rd"] },
      { slot: 13, label: "EXTRA 2",     work_area_number: "0386", dro_vehicle_name: "742 EXTRA 2",
        areas: ["Brevard/Horseshoe","Cummings Cove CC","Cummings Cove/Big Willow","Etowah school rd","upper Cummings Cove"] },
    ],
  },

  {
    name: "11 People",
    dro_plan_id: 2346252,
    dro_plan_name: "11 People",
    driver_count: 11,
    day_of_week: null,
    is_default: false,
    notes: "Lighter staffing — 11 drivers. Some routes absorb extra areas.",
    routes: [
      { slot: 1,  label: "ASHE HWY",    work_area_number: "0255", dro_vehicle_name: "742 ASHE HWY",
        areas: ["7th Ave","Airport/Advent Health","Airport/Ashe Hwy","Ashe Hwy/Highland Ave","Asheville Hwy/Brookside Camp","Asheville Hwy/Mtn Home","Clear Creek","E glenwood","Huff n Puff","NAPLES RD FRONT"] },
      { slot: 2,  label: "ETOWAH / ZIRCONIA", work_area_number: "0442", dro_vehicle_name: "742 ETOWAH",
        areas: ["E allen/ flatrock","Kenmure ","Lower Zirconia","Zirconia/ MineGapRd","Zirconia/BellMountainRd","Zirconia/BobsCreek","Zirconia/Cliffs","Zirconia/Gap Creek","Zirconia/Kingdom Place","Zirconia/MondaminRd","Zirconia/NorthLakeSummit","Zirconia/OldUs25","Zirconia/OldZirconiaRd","Zirconia/SouthLakeSummit","Zirconia/ZirconiaRd"] },
      { slot: 3,  label: "EXTRA 5 / DOWNTOWN", work_area_number: "0211", dro_vehicle_name: "742 EXTRA 5",
        areas: ["Brevard Rd/Blythe","Downtown Hendo East","Downtown Hendo/Pardee","Downtown West","Downtown West Laurel Park","Downtown/Jackson Pk"] },
      { slot: 4,  label: "GREEN HWY",   work_area_number: "0275", dro_vehicle_name: "742 GREEN HWY",
        areas: ["Brevard/Horseshoe","Champion Hills/Laurel Park","Cummings Cove CC","Cummings Cove/Big Willow","Downtown/Old Spartanburg","Erkwood/Greenville Hwy","Etowah school rd","Greenville Hwy","Spartanburg Hwy/Boyd Chevy","upper Cummings Cove"] },
      { slot: 5,  label: "MILLS RIVER", work_area_number: "0326", dro_vehicle_name: "742 MILLS RIVER",
        areas: ["Bat Cave","Gerton","Lake Lure","upper Bearwallow Gerton","west Chimney Rock Rd"] },
      { slot: 6,  label: "SUGARLOAF",   work_area_number: "0351", dro_vehicle_name: "742 SUGARLOAF",
        areas: ["4Season/Sugarloaf","Blue Ridge Mall","Carolina Village","Dana/Tracy Grove Rd","Linda Vista","Thompson St","Walmart/Francis Rd","Walmart/Nix Rd 3","Walmart/Sams 1","Willowbrook"] },
      { slot: 7,  label: "ERKWOOD",     work_area_number: "0418", dro_vehicle_name: "742 ERKWOOD",
        areas: ["Brevard Rd/Davis Mtn","Brevard Rd/Laurel Park","Laurel Park/Country Club","Laurel Park/Somersby"] },
      { slot: 8,  label: "CHIMNEY ROC", work_area_number: "0354", dro_vehicle_name: "742 CHIMNEY ROC",
        areas: ["Erkwood/Kanuga","Kanuga/Town","Osceola Lake"] },
      { slot: 9,  label: "CUMMINGS CV", work_area_number: "0470", dro_vehicle_name: "742 CUMMINGS CV",
        areas: ["Inner Crab Creek","Little River ","Outer Crab Creek","Pleasant Grove"] },
      { slot: 10, label: "N RUGBY",     work_area_number: "0247", dro_vehicle_name: "742 N RUGBY",
        areas: ["Chimney Rock","Chimney Rock/Sugarloaf","Duncan Hill","Fruiland","KYLES CREEK","Locust ridge","Oak Hill","OLD CLEAR CREEK","Ridge rd"] },
      { slot: 11, label: "ZIRCONIA EXTRA", work_area_number: "0386", dro_vehicle_name: "742 ZIRCONIA",
        areas: ["Pressley rd","Sugarloaf Mtn rd","Sunrise Ridge","Union Hill","Upper East Chimney Rock rd","upper east edneyville"] },
    ],
  },

  {
    name: "Saturday — 9 drivers",
    dro_plan_id: 675189,
    dro_plan_name: "Saturday",
    driver_count: 9,
    day_of_week: "sat",
    is_default: false,
    notes: "Saturday plan. NOTE: ASHE HWY route has Cummings Cove areas — needs review on the map.",
    routes: [
      { slot: 1,  label: "ERKWOOD",     work_area_number: "0418", dro_vehicle_name: "742 ERKWOOD",
        areas: ["Brevard Rd/Blythe","Champion Hills/Laurel Park","Downtown West","Laurel Park/Somersby"] },
      { slot: 2,  label: "ASHE HWY",    work_area_number: "0255", dro_vehicle_name: "742 ASHE HWY",
        areas: ["Brevard Rd/Davis Mtn","Brevard Rd/Laurel Park","Brevard/Horseshoe","Cummings Cove CC","Cummings Cove/Big Willow","Etowah school rd"] },
      { slot: 3,  label: "7TH AVE",     work_area_number: "0454", dro_vehicle_name: "742 7TH AVE",
        areas: ["7th Ave","Airport/Advent Health","Airport/Ashe Hwy","Ashe Hwy/Highland Ave","Asheville Hwy/Brookside Camp","Asheville Hwy/Mtn Home","Huff n Puff","NAPLES RD FRONT","Oak Hill"] },
      { slot: 4,  label: "ZIRCONIA",    work_area_number: "0442", dro_vehicle_name: "742 ZIRCONIA",
        areas: ["E allen/ flatrock","Kenmure ","Lower Zirconia","Spartanburg Hwy/Boyd Chevy","Zirconia/ MineGapRd","Zirconia/BellMountainRd","Zirconia/BobsCreek","Zirconia/Cliffs","Zirconia/Gap Creek","Zirconia/Kingdom Place","Zirconia/MondaminRd","Zirconia/NorthLakeSummit","Zirconia/OldUs25","Zirconia/OldZirconiaRd","Zirconia/SouthLakeSummit","Zirconia/ZirconiaRd"] },
      { slot: 5,  label: "GREEN HWY",   work_area_number: "0275", dro_vehicle_name: "742 GREEN HWY",
        areas: ["Inner Crab Creek","Kanuga/Town","Little River ","Osceola Lake","Outer Crab Creek","Pleasant Grove"] },
      { slot: 6,  label: "SUGARLOAF",   work_area_number: "0351", dro_vehicle_name: "742 SUGARLOAF",
        areas: ["4Season/Sugarloaf","Blue Ridge Mall","Carolina Village","Chimney Rock","Chimney Rock/Sugarloaf","Dana/Tracy Grove Rd","Duncan Hill","Linda Vista","Thompson St","Walmart/Francis Rd","Walmart/Nix Rd 3","Walmart/Sams 1"] },
      { slot: 7,  label: "EXTRA 5 / DOWNTOWN", work_area_number: "0211", dro_vehicle_name: "742 EXTRA 5",
        areas: ["Downtown Hendo East","Downtown Hendo/Pardee","Downtown West Laurel Park","Downtown/Jackson Pk","Downtown/Old Spartanburg","Erkwood/Greenville Hwy","Erkwood/Kanuga","Greenville Hwy","Laurel Park/Country Club"] },
      { slot: 8,  label: "MILLS RIVER", work_area_number: "0326", dro_vehicle_name: "742 MILLS RIVER",
        areas: ["KYLES CREEK","OLD CLEAR CREEK"] },
      { slot: 9,  label: "CUMMINGS CV", work_area_number: "0470", dro_vehicle_name: "742 CUMMINGS CV",
        areas: ["Fruiland","Locust ridge","Pressley rd","Ridge rd","Sugarloaf Mtn rd","Sunrise Ridge","Union Hill","Willowbrook"] },
    ],
  },
];

async function run() {
  // ── Tables ────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS route_templates (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      dro_plan_id   INTEGER,
      dro_plan_name TEXT NOT NULL DEFAULT '',
      driver_count  INTEGER NOT NULL,
      day_of_week   TEXT,             -- 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'|NULL
      is_default    BOOLEAN NOT NULL DEFAULT false,
      notes         TEXT,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log("✅ route_templates table ready");

  await sql`
    CREATE TABLE IF NOT EXISTS route_template_areas (
      id               SERIAL PRIMARY KEY,
      template_id      INTEGER NOT NULL REFERENCES route_templates(id) ON DELETE CASCADE,
      route_slot       INTEGER NOT NULL,          -- which truck (1-based)
      route_label      TEXT NOT NULL DEFAULT '',  -- human name e.g. "ASHE HWY"
      work_area_number TEXT NOT NULL,             -- DRO workAreaNumber e.g. "0255"
      dro_vehicle_name TEXT NOT NULL DEFAULT '',  -- DRO vehicle name e.g. "742 ASHE HWY"
      anchor_area_name TEXT NOT NULL,             -- individual anchor area name
      UNIQUE (template_id, work_area_number, anchor_area_name)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rta_template_slot ON route_template_areas(template_id, route_slot)`;
  console.log("✅ route_template_areas table ready\n");

  // ── Seed templates ────────────────────────────────────────────────────────
  for (const tmpl of TEMPLATES) {
    const [row] = await sql`
      INSERT INTO route_templates (name, dro_plan_id, dro_plan_name, driver_count, day_of_week, is_default, notes)
      VALUES (${tmpl.name}, ${tmpl.dro_plan_id}, ${tmpl.dro_plan_name}, ${tmpl.driver_count}, ${tmpl.day_of_week}, ${tmpl.is_default}, ${tmpl.notes})
      ON CONFLICT (name) DO UPDATE SET
        dro_plan_id   = EXCLUDED.dro_plan_id,
        dro_plan_name = EXCLUDED.dro_plan_name,
        driver_count  = EXCLUDED.driver_count,
        day_of_week   = EXCLUDED.day_of_week,
        is_default    = EXCLUDED.is_default,
        notes         = EXCLUDED.notes,
        updated_at    = NOW()
      RETURNING id
    `;
    const templateId = row.id;
    console.log(`Template: "${tmpl.name}" (id=${templateId})`);

    // Delete existing areas for this template (full re-seed)
    await sql`DELETE FROM route_template_areas WHERE template_id = ${templateId}`;

    let totalAreas = 0;
    for (const route of tmpl.routes) {
      for (const area of route.areas) {
        await sql`
          INSERT INTO route_template_areas
            (template_id, route_slot, route_label, work_area_number, dro_vehicle_name, anchor_area_name)
          VALUES
            (${templateId}, ${route.slot}, ${route.label}, ${route.work_area_number}, ${route.dro_vehicle_name}, ${area})
          ON CONFLICT (template_id, work_area_number, anchor_area_name) DO UPDATE SET
            route_slot       = EXCLUDED.route_slot,
            route_label      = EXCLUDED.route_label,
            dro_vehicle_name = EXCLUDED.dro_vehicle_name
        `;
        totalAreas++;
      }
      console.log(`  Slot ${route.slot} — ${route.label} (${route.work_area_number}): ${route.areas.length} areas`);
    }
    console.log(`  → ${totalAreas} total anchor areas seeded\n`);
  }

  console.log("✅ All 3 templates seeded");
  console.log("\nNext: build the map UI at /wayne-board/route-planner");
  console.log("  — see anchor areas colored by route");
  console.log("  — drag to reassign before pushing to DRO");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
