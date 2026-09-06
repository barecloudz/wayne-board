/**
 * Fetches coordinates for work area 326 stops from ArcGIS via DRO proxy.
 * Uses stored DRO session cookie from DB.
 * Outputs: scripts/stops-326.json
 */

import fs from "fs";
import { neon } from "@neondatabase/serverless";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// Get stored session cookie
const rows = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookies' LIMIT 1`;
const cookie = rows[0]?.value;
if (!cookie) { console.error("No DRO session cookie in DB. Run capture-anchor-api.mjs first."); process.exit(1); }

const headers = { Cookie: cookie, "Content-Type": "application/json" };
const DRO_BASE = "https://dro.routesmart.com";
const STATION_ID = "259";
const SA_ID = "3060743";
const SORT_DATE = "2026-07-16";

// Load 326 waypoints from historical data
const historical = JSON.parse(fs.readFileSync("./scripts/dro-historical-data.json", "utf8"));
const key = `/api/api/service-areas/${SA_ID}/waypoints?sortDate=${SORT_DATE}&solutionType=actual`;
const allWaypoints = historical[key]?.data ?? [];
const w326 = allWaypoints.filter(w => w.workAreaNumber === "0326");
console.log(`Found ${w326.length} stops for work area 326`);

// Fetch ArcGIS coordinates
const encWhere = s => encodeURIComponent(s).replace(/'/g, "%27");
const agsWhere = encWhere(`sort_date = date'${SORT_DATE}' and station_id = '${STATION_ID}' and csa = '304169'`);
const agsParamValues = encodeURIComponent(JSON.stringify({ sort_date: SORT_DATE, station_id: STATION_ID }));
const agsLayerParamValues = encodeURIComponent(JSON.stringify([{ "8": { sort_date: SORT_DATE, station_id: STATION_ID } }, { "13": { sort_date: SORT_DATE, station_id: STATION_ID } }]));
const agsInner = `http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query?f=json&outFields=wid,route&where=${agsWhere}&returnGeometry=true&outSR=102100&parameterValues=${agsParamValues}&layerParameterValues=${agsLayerParamValues}`;
const agsUrl = `${DRO_BASE}/api/api/Proxy?${agsInner}`;

console.log("Fetching ArcGIS coordinates...");
const agsRes = await fetch(agsUrl, { headers });
const agsData = await agsRes.json();
const features = agsData?.features ?? [];
console.log(`Got ${features.length} coordinate features`);

// Build wid → coords lookup
const merc2lat = y => (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
const merc2lng = x => (x / 20037508.34) * 180;

const widCoords = {};
for (const f of features) {
  if (f.geometry?.x != null && f.attributes?.wid != null) {
    const x = f.geometry.x, y = f.geometry.y;
    widCoords[String(f.attributes.wid)] = {
      lat: Math.abs(y) > 90 ? merc2lat(y) : y,
      lng: Math.abs(x) > 180 ? merc2lng(x) : x,
    };
  }
}

// Merge coords into 326 stops
const stops = w326.map(w => ({
  waypointId: w.waypointId,
  wid: w.wid,
  address: w.address,
  city: w.city,
  postalCode: w.postalCode,
  firmName: w.firmName,
  actualRoute: w.actualRoute,
  actualSequence: w.actualSequence,
  workAreaNumber: w.workAreaNumber,
  noPackages: w.noPackages,
  isLPPackage: w.isLPPackage,
  isBulkStop: w.isBulkStop,
  ...widCoords[String(w.wid)] ?? { lat: null, lng: null },
}));

const withCoords = stops.filter(s => s.lat != null);
console.log(`Stops with coordinates: ${withCoords.length}/${stops.length}`);

// Also load anchor area shapes for 326
const anchorData = JSON.parse(fs.readFileSync("./scripts/dro-anchor-areas-full.json", "utf8"));
const anchorAreas = Array.isArray(anchorData) ? anchorData : anchorData.anchorAreas ?? [];
const ids326 = [21008965, 21008962, 21008966, 21008967, 21008988];
const areas326 = ids326.map(id => {
  const a = anchorAreas.find(x => x.anchorAreaId === id);
  if (!a) return null;
  const shape = typeof a.shape === "string" ? JSON.parse(a.shape) : a.shape;
  return { anchorAreaId: a.anchorAreaId, name: a.name, rings: shape?.rings ?? [] };
}).filter(Boolean);

const out = { stops, anchorAreas: areas326, sortDate: SORT_DATE, workAreaNumber: "0326" };
fs.writeFileSync("./scripts/stops-326.json", JSON.stringify(out, null, 2));
console.log(`\n✅ Saved to scripts/stops-326.json`);
console.log(`   ${stops.length} stops, ${withCoords.length} with coords, ${areas326.length} anchor areas`);
