/**
 * Auto-creates smaller anchor areas for work area 0326.
 *
 * For each of the 5 existing large anchor areas:
 *   1. Sorts the stops inside by lat (south→north)
 *   2. Computes quantile boundaries so each strip has ~6 stops
 *   3. Clips the parent polygon into N strips at those boundaries
 *   4. Sorts ALL strips globally by their avg delivery order (stop number)
 *   5. Names them 0326-01, 0326-02, ... and POSTs to DRO
 *
 * Strips tile the full parent area with zero gaps.
 *
 * Usage:
 *   node scripts/create-anchor-areas-326.mjs --dry-run
 *   node scripts/create-anchor-areas-326.mjs
 */

import fs from "fs";
import { neon } from "@neondatabase/serverless";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Load env ──────────────────────────────────────────────────────────────────
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const DRO_BASE = "https://dro.routesmart.com";
const SA_ID = "3060743";

// ── DRO session ───────────────────────────────────────────────────────────────
const rows = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookies' LIMIT 1`;
const cookie = rows[0]?.value;
if (!cookie) { console.error("No DRO session. Run: node scripts/refresh-dro-session.mjs"); process.exit(1); }
const headers = { Cookie: cookie, "Content-Type": "application/json" };

// ── Coordinate conversions ────────────────────────────────────────────────────
function ll2merc(lat, lng) {
  const x = (lng / 180) * 20037508.34;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / Math.PI * 20037508.34;
  return [x, y];
}
function merc2ll(x, y) {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}

// ── Point in polygon ──────────────────────────────────────────────────────────
function pip(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// ── Clip polygon to a horizontal lat band ─────────────────────────────────────
function clipHalf(poly, val, keepAbove) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const aIn = keepAbove ? a[0] >= val : a[0] <= val;
    const bIn = keepAbove ? b[0] >= val : b[0] <= val;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (val - a[0]) / (b[0] - a[0]);
      out.push([val, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
function clipToStrip(ring, latLow, latHigh) {
  let poly = clipHalf(ring, latLow, true);
  if (poly.length < 3) return [];
  poly = clipHalf(poly, latHigh, false);
  return poly.length >= 3 ? poly : [];
}

// ── Strip boundary cuts using stop lat quantiles ──────────────────────────────
// Groups stops into K batches of ~targetSize by lat, returns K-1 cut latitudes.
function quantileCuts(stops, targetSize) {
  const byLat = [...stops].sort((a, b) => a.lat - b.lat);
  const K = Math.max(2, Math.round(byLat.length / targetSize));
  const cuts = [];
  for (let i = 1; i < K; i++) {
    const idx = Math.floor(i * byLat.length / K);
    // Put cut between stop idx-1 and idx
    if (idx > 0 && idx < byLat.length) {
      cuts.push((byLat[idx - 1].lat + byLat[idx].lat) / 2);
    }
  }
  return [...new Set(cuts)].sort((a, b) => a - b);
}

// ── Extract street landmark ───────────────────────────────────────────────────
function landmark(addr) {
  return addr.replace(/^\d+\s*/, "").trim()
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// ── Load stops ────────────────────────────────────────────────────────────────
const stopsData = JSON.parse(fs.readFileSync("./public/stops-326.json", "utf8"));
const allStops = stopsData.stops
  .filter(s => s.lat != null && s.lng != null)
  .sort((a, b) => parseInt(a.stopNum) - parseInt(b.stopNum));
console.log(`Loaded ${allStops.length} geocoded stops\n`);

// ── Fetch anchor areas ────────────────────────────────────────────────────────
console.log("Fetching anchor areas from DRO...");
const areasRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers });
if (!areasRes.ok) { console.error("Failed:", areasRes.status); process.exit(1); }
const areasRaw = await areasRes.json();
const droAreas = areasRaw.map(a => {
  const shape = typeof a.shape === "string" ? JSON.parse(a.shape) : (a.shape ?? {});
  const rings3857 = shape?.rings ?? [];
  const rings = rings3857.map(ring => ring.map(([x, y]) => merc2ll(x, y)));
  return { anchorAreaId: a.anchorAreaId, name: a.name, rings };
});
console.log(`Found ${droAreas.length} anchor areas\n`);

// ── The 5 parent 326 areas ────────────────────────────────────────────────────
const IDS_326 = [21008965, 21008962, 21008966, 21008967, 21008988];
const areas326 = droAreas.filter(a => IDS_326.includes(a.anchorAreaId));
if (areas326.length === 0) { console.error("No 326 parent areas found."); process.exit(1); }

console.log(`Parent areas:`);
areas326.forEach(a => console.log(`  ${a.anchorAreaId}: ${a.name}`));
console.log();

// ── Build sub-area list ───────────────────────────────────────────────────────
const subAreas = [];

for (const parent of areas326) {
  const ring = parent.rings[0];
  if (!ring || ring.length < 3) continue;

  const lats = ring.map(p => p[0]);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);

  // Stops inside this parent
  const inside = allStops.filter(s => pip(s.lat, s.lng, ring));
  console.log(`${parent.name}: ${inside.length} stops`);

  // Determine strip boundaries
  let cuts;
  if (inside.length >= 12) {
    cuts = quantileCuts(inside, 6); // ~6 stops per strip
  } else if (inside.length >= 6) {
    cuts = quantileCuts(inside, 5);
  } else {
    // Fewer than 6 stops — use a single split at lat midpoint
    cuts = [(latMin + latMax) / 2];
  }

  // Strip lat ranges: [latMin … cut0 … cut1 … latMax]
  const bounds = [latMin, ...cuts, latMax];
  console.log(`  → ${bounds.length - 1} strips`);

  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i], hi = bounds[i + 1];
    const stripped = clipToStrip(ring, lo, hi);
    if (stripped.length < 3) continue;

    const stripStops = inside.filter(s => s.lat >= lo && s.lat <= hi);

    // Average delivery order
    const avgStopNum = stripStops.length > 0
      ? stripStops.reduce((s, x) => s + parseInt(x.stopNum), 0) / stripStops.length
      : (lo + hi) / 2 * 1000; // no stops → lat proxy

    const byDelivery = [...stripStops].sort((a, b) => parseInt(a.stopNum) - parseInt(b.stopNum));
    const firstStop = byDelivery[0];
    const landmarkName = firstStop
      ? landmark(firstStop.address)
      : `${parent.name} ${i === 0 ? "S" : i === bounds.length - 2 ? "N" : "M"}`;

    const sidRange = byDelivery.length >= 2
      ? `${byDelivery[0].sid}–${byDelivery[byDelivery.length-1].sid}`
      : byDelivery[0]?.sid ?? "—";

    subAreas.push({ parentName: parent.name, ring: stripped, avgStopNum, landmarkName, stopCount: stripStops.length, sidRange });
  }
  console.log();
}

// ── Sort by delivery order → assign sequence numbers ─────────────────────────
subAreas.sort((a, b) => a.avgStopNum - b.avgStopNum);

const toCreate = subAreas.map((sa, i) => ({
  ...sa,
  seq: i + 1,
  name: `0326-${String(i + 1).padStart(2, "0")}-${sa.landmarkName}`,
}));

// ── Print plan ────────────────────────────────────────────────────────────────
console.log(`${"=".repeat(66)}`);
console.log(`PLAN — ${toCreate.length} new anchor areas (in delivery order):`);
console.log(`${"=".repeat(66)}`);
for (const a of toCreate) {
  const stops = a.stopCount > 0 ? `${a.stopCount} stops  SID ${a.sidRange}` : "0 stops (geographic tile)";
  console.log(`  ${String(a.seq).padStart(2,"0")}: "${a.name}"  [${a.parentName}]  ${stops}`);
}
console.log();

if (DRY_RUN) {
  console.log("[DRY RUN] Rerun without --dry-run to create in DRO.");
  process.exit(0);
}

// ── POST to DRO ───────────────────────────────────────────────────────────────
console.log("Creating anchor areas in DRO...\n");
let created = 0, failed = 0;
const results = [];

for (const { name, ring } of toCreate) {
  const mercRing = ring.map(([lat, lng]) => ll2merc(lat, lng));
  if (mercRing[0][0] !== mercRing[mercRing.length - 1][0]) mercRing.push(mercRing[0]);

  const shapeJson = JSON.stringify({
    spatialReference: { latestWkid: 3857, wkid: 102100 },
    rings: [mercRing],
  });

  try {
    const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ServiceAreaId: parseInt(SA_ID), Name: name, Station: "", Shape: shapeJson }),
    });
    const text = await res.text();
    const newId = parseInt(text.replace("id:", "").trim());
    if (res.ok && newId) {
      console.log(`✅ ${name} → ID ${newId}`);
      results.push({ name, anchorAreaId: newId });
      created++;
    } else {
      console.log(`❌ ${name} — HTTP ${res.status}: ${text.slice(0, 100)}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ ${name} — ${err.message}`);
    failed++;
  }

  // DRO needs ~10s to settle its AdvancedVehicleSet update before accepting another
  await new Promise(r => setTimeout(r, 12000));
}

console.log(`\n✅ Created: ${created}   ❌ Failed: ${failed}`);
if (results.length > 0) {
  fs.writeFileSync("./scripts/created-anchor-areas-326.json", JSON.stringify(results, null, 2));
  console.log(`Saved IDs → scripts/created-anchor-areas-326.json`);
}
console.log(`\nVerify in DRO, then delete the 5 old parent areas.`);
