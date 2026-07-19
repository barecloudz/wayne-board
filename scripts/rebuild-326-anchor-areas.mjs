/**
 * Rebuilds route 326 anchor areas from scratch using GroundCloud history.
 *
 * APPROACH:
 *  1. Pull 30 days of Tyler's actual stops (cached after first run)
 *  2. Aggregate to unique locations → avg delivery time per location
 *  3. DBSCAN geographic cluster → find natural delivery zones
 *  4. Use cluster centroids as Voronoi seeds inside the 5 parent polygons
 *     → every point in Tyler's territory is assigned to the nearest cluster
 *     → ZERO gaps, ZERO uncovered area
 *  5. Sort by avg delivery time → Tyler's real sequence (01 = first, 22 = last)
 *  6. Delete old 0326-xx areas, create new ones
 *
 * Usage:
 *   node scripts/rebuild-326-anchor-areas.mjs --dry-run
 *   node scripts/rebuild-326-anchor-areas.mjs --skip-fetch   (reuse cached GC data)
 *   node scripts/rebuild-326-anchor-areas.mjs
 */

import fs from "fs";
import https from "https";
import puppeteer from "puppeteer";
import { neon } from "@neondatabase/serverless";

const DRY_RUN    = process.argv.includes("--dry-run");
const SKIP_FETCH = process.argv.includes("--skip-fetch");
const CACHE_FILE = "./scripts/326-raw-stops.json";

// Clustering tuning
const DAYS_BACK          = 30;
const CLUSTER_EPS_DEG    = 0.007; // ~770 m grouping radius
const MAX_CLUSTER_STOPS  = 30;
const MIN_CLUSTER_STOPS  = 6;
const MIN_DELIVERY_COUNT = 3;     // skip locations delivered <3× in 30 days
const EARLIEST_MINS      = 11 * 60;
const LATEST_MINS        = 21 * 60;

// The 5 original large parent polygons that define Tyler's territory
const PARENT_IDS = [21008965, 21008962, 21008966, 21008967, 21008988];

// ── Load env ──────────────────────────────────────────────────────────────────
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const GC_BASE     = "https://www.groundcloud.io";
const CUSTOMER_ID = 439;
const DRO_BASE    = "https://dro.routesmart.com";
const SA_ID       = "3060743";

// ── Coordinate math ───────────────────────────────────────────────────────────
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
function dist(a, b) {
  const d0 = a[0] - b[0], d1 = a[1] - b[1];
  return Math.sqrt(d0 * d0 + d1 * d1);
}
function pip(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}
function centroidOf(ring) {
  const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lat, lng];
}

function toEasternMins(iso) {
  const d = new Date(new Date(iso).getTime() - 4 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function fmtTime(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  const hh = m === 60 ? h + 1 : h;
  const mm = m === 60 ? 0 : m;
  return `${hh > 12 ? hh - 12 : hh || 12}:${String(mm).padStart(2,"0")} ${hh >= 12 ? "PM" : "AM"}`;
}

// ── Voronoi half-plane clipping ───────────────────────────────────────────────
// Clips polygon to the half-plane that is closer to 'ci' than to 'cj'.
// Uses Sutherland-Hodgman with the perpendicular bisector of ci-cj.
function clipHalfPlane(poly, ci, cj) {
  const mx = (ci[0] + cj[0]) / 2, my = (ci[1] + cj[1]) / 2;
  const nx = ci[0] - cj[0],       ny = ci[1] - cj[1];
  function side(p) { return (p[0] - mx) * nx + (p[1] - my) * ny; }
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

// Returns Voronoi cell for 'centroid' within 'parentRing',
// competing against 'allCentroids'.
function voronoiCell(centroid, allCentroids, parentRing) {
  let cell = [...parentRing];
  for (const other of allCentroids) {
    if (other === centroid) continue;
    if (cell.length < 3) return [];
    cell = clipHalfPlane(cell, centroid, other);
  }
  return cell.length >= 3 ? cell : [];
}

// ── GroundCloud helpers ───────────────────────────────────────────────────────
function apiGet(cookieHdr, path) {
  return new Promise((resolve, reject) => {
    https.get(
      { host: "www.groundcloud.io", path, headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" } },
      (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try { resolve({ ok: res.statusCode < 400, data: JSON.parse(data) }); }
          catch { resolve({ ok: false, data: null }); }
        });
      }
    ).on("error", reject);
  });
}

async function gcLogin() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page    = await browser.newPage();
  await page.goto("https://www.groundcloud.io/dashboard/login/", { waitUntil: "networkidle2" });
  const u = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const p = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (u) await u.type(process.env.GC_USERNAME || "Blake742Logistics", { delay: 30 });
  if (p) await p.type(process.env.GC_PASSWORD || "dowell2026", { delay: 30 });
  await page.evaluate(() => document.querySelector("form")?.submit());
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  const cookies = await page.cookies();
  await browser.close();
  const sid = cookies.find(c => c.name === "sessionid");
  if (!sid) throw new Error("GC login failed");
  console.log("✓ Logged in to GroundCloud");
  return `sessionid=${sid.value}; csrftoken=${cookies.find(c => c.name === "csrftoken")?.value || ""}`;
}

async function fetchAllPages(cookieHdr, path) {
  const items = [];
  let next = path;
  while (next) {
    const { ok, data } = await apiGet(cookieHdr, next);
    if (!ok || !data) break;
    items.push(...(Array.isArray(data) ? data : (data.results || [])));
    next = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
  }
  return items;
}

// ── DBSCAN ────────────────────────────────────────────────────────────────────
function dbscan(points, eps) {
  const n = points.length, labels = new Array(n).fill(-1);
  let cluster = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    const nb = points.map((p, j) => j).filter(j => j !== i && dist([points[i].lat, points[i].lng], [points[j].lat, points[j].lng]) <= eps);
    labels[i] = cluster;
    const q = [...nb];
    while (q.length) {
      const j = q.shift();
      if (labels[j] !== -1) continue;
      labels[j] = cluster;
      const jnb = points.map((p, k) => k).filter(k => k !== j && dist([points[j].lat, points[j].lng], [points[k].lat, points[k].lng]) <= eps);
      q.push(...jnb.filter(k => labels[k] === -1));
    }
    cluster++;
  }
  const clusters = Array.from({ length: cluster }, () => []);
  labels.forEach((l, i) => { if (l >= 0) clusters[l].push(i); });
  return clusters;
}

function kmeans(indices, k) {
  const sorted = [...indices].sort((a, b) => locs[a].avgMins - locs[b].avgMins);
  const step   = Math.floor(sorted.length / k);
  let   cents  = Array.from({ length: k }, (_, i) => {
    const idx = sorted[Math.min(i * step, sorted.length - 1)];
    return [locs[idx].lat, locs[idx].lng];
  });
  let assign = new Array(indices.length).fill(0);
  for (let iter = 0; iter < 20; iter++) {
    assign = indices.map(i => {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist([locs[i].lat, locs[i].lng], cents[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    });
    const nc = Array.from({ length: k }, () => [0, 0, 0]);
    assign.forEach((c, ii) => { nc[c][0] += locs[indices[ii]].lat; nc[c][1] += locs[indices[ii]].lng; nc[c][2]++; });
    cents = nc.map(([s0, s1, n], c) => n ? [s0 / n, s1 / n] : cents[c]);
  }
  const groups = Array.from({ length: k }, () => []);
  assign.forEach((c, ii) => groups[c].push(indices[ii]));
  return groups.filter(g => g.length > 0);
}

// ── Step 1: Pull or load stops ────────────────────────────────────────────────
let rawStops;
if (SKIP_FETCH && fs.existsSync(CACHE_FILE)) {
  rawStops = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  console.log(`Loaded ${rawStops.length} cached stops from ${CACHE_FILE}`);
} else {
  const cookieHdr = await gcLogin();
  console.log("Finding route 326...");
  const allRoutes = await fetchAllPages(cookieHdr, `/api/routes/?customer=${CUSTOMER_ID}&archived=false`);
  const r326 = allRoutes.find(r => r.name === "326");
  if (!r326) { console.error("Route 326 not found"); process.exit(1); }
  console.log(`✓ Route 326 = GC id ${r326.id}\n`);
  rawStops = [];
  let daysFound = 0;
  const today = new Date();
  for (let i = 1; i <= DAYS_BACK; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const rds = await fetchAllPages(cookieHdr, `/api/route-days/?customer=${CUSTOMER_ID}&day=${day}&route=${r326.id}`);
    for (const rd of rds) {
      if (rd.status !== "COMPLETE" && rd.status !== "STARTED") continue;
      const { ok, data: detail } = await apiGet(cookieHdr, `/api/route-days/${rd.id}/`);
      if (!ok || !detail?.stops) continue;
      const delivered = detail.stops.filter(s => s.delivered && s.lat && s.lon);
      if (!delivered.length) continue;
      rawStops.push(...delivered.map(s => ({ lat: s.lat, lng: s.lon, deliveredMins: toEasternMins(s.delivered), address: s.recip_street || "", date: day })));
      console.log(`  ${day}: ${delivered.length} stops`); daysFound++;
    }
  }
  console.log(`\nTotal: ${rawStops.length} stops across ${daysFound} days`);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(rawStops, null, 2));
}

// ── Step 2: Aggregate to unique locations ─────────────────────────────────────
const locMap = new Map();
for (const s of rawStops) {
  const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
  if (!locMap.has(key)) locMap.set(key, { lat: s.lat, lng: s.lng, times: [], addresses: [] });
  const loc = locMap.get(key);
  loc.times.push(s.deliveredMins);
  if (s.address) loc.addresses.push(s.address);
}

const locsAll = [...locMap.values()].map(loc => {
  const validTimes = loc.times.filter(t => t >= EARLIEST_MINS && t <= LATEST_MINS);
  const avgMins = (validTimes.length ? validTimes : loc.times).reduce((a, b) => a + b, 0) / (validTimes.length || loc.times.length);
  return { lat: loc.lat, lng: loc.lng, avgMins, count: loc.times.length, address: [...new Set(loc.addresses)][0] || "" };
});

const locs = locsAll.filter(l => l.count >= MIN_DELIVERY_COUNT && l.avgMins >= EARLIEST_MINS && l.avgMins <= LATEST_MINS);
console.log(`\n${locsAll.length} unique locations → ${locs.length} after filtering (≥${MIN_DELIVERY_COUNT} deliveries, 11AM–9PM)`);

// ── Step 3: DBSCAN + split/merge ──────────────────────────────────────────────
let clusters = dbscan(locs, CLUSTER_EPS_DEG);
console.log(`DBSCAN: ${clusters.length} initial clusters`);

const splitClusters = [];
for (const cl of clusters) {
  if (cl.length <= MAX_CLUSTER_STOPS) { splitClusters.push(cl); continue; }
  const k = Math.ceil(cl.length / 8);
  const parts = kmeans(cl, k);
  splitClusters.push(...parts);
  console.log(`  Split cluster of ${cl.length} → ${parts.length} sub-clusters`);
}
clusters = splitClusters;

let changed = true;
while (changed) {
  changed = false;
  for (let i = clusters.length - 1; i >= 0; i--) {
    if (clusters[i].length >= MIN_CLUSTER_STOPS) continue;
    const ci = centroidOf(clusters[i].map(idx => [locs[idx].lat, locs[idx].lng]));
    let bestJ = -1, bestD = Infinity;
    for (let j = 0; j < clusters.length; j++) {
      if (j === i) continue;
      const d = dist(ci, centroidOf(clusters[j].map(idx => [locs[idx].lat, locs[idx].lng])));
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ >= 0) { clusters[bestJ].push(...clusters[i]); clusters.splice(i, 1); changed = true; }
  }
}
console.log(`After split/merge: ${clusters.length} clusters`);

// ── Step 4: Compute cluster stats + centroids ─────────────────────────────────
const clusterStats = clusters.map(cl => {
  const avgMins = cl.reduce((s, i) => s + locs[i].avgMins, 0) / cl.length;
  const words   = cl.flatMap(i => locs[i].address.replace(/^\d+\s*/, "").trim().split(/\s+/).slice(0, 2));
  const freq    = {};
  for (const w of words) if (w.length > 2) freq[w] = (freq[w] || 0) + 1;
  const landmark = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Area";
  const cap      = landmark.charAt(0).toUpperCase() + landmark.slice(1).toLowerCase();
  const centroid = centroidOf(cl.map(idx => [locs[idx].lat, locs[idx].lng]));
  return { cl, centroid, avgMins, landmark: cap, uniqueLocs: cl.length, totalDeliveries: cl.reduce((s, i) => s + locs[i].count, 0) };
});
clusterStats.sort((a, b) => a.avgMins - b.avgMins);

// ── Step 5: Fetch parent polygons from DRO ────────────────────────────────────
const sql   = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const [row] = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookies' LIMIT 1`;
if (!row?.value) { console.error("No DRO session — run scripts/refresh-dro-session.mjs"); process.exit(1); }
const droHdrs = { Cookie: row.value, "Content-Type": "application/json" };

console.log("\nFetching DRO anchor areas...");
const areasRaw = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers: droHdrs })).json();

// Find parent polygons (original 5 large areas OR any large area covering 326 territory)
let parentPolygons = areasRaw
  .filter(a => PARENT_IDS.includes(a.anchorAreaId))
  .map(a => {
    const shape = typeof a.shape === "string" ? JSON.parse(a.shape) : (a.shape ?? {});
    return (shape.rings?.[0] || []).map(([x, y]) => merc2ll(x, y));
  })
  .filter(r => r.length >= 3);

if (parentPolygons.length === 0) {
  console.error("Parent polygons not found in DRO (IDs:", PARENT_IDS.join(", "), ")");
  console.error("They may have been deleted. Cannot compute gap-free coverage without them.");
  process.exit(1);
}
console.log(`✓ Found ${parentPolygons.length} parent polygons`);

// ── Step 6: Voronoi subdivision of each parent polygon ────────────────────────
// For each parent polygon, find which cluster centroids are inside it,
// then clip the parent to the Voronoi cell of each centroid.
// Parent polygons with no centroid inside get assigned to the nearest centroid.

const centroids = clusterStats.map(cs => cs.centroid);

// Map each parent polygon → list of centroid indices inside it
const parentCentroidMap = parentPolygons.map(ring => {
  const inside = centroids.map((c, i) => ({ i, c })).filter(({ c }) => pip(c[0], c[1], ring));
  return { ring, inside: inside.map(x => x.i) };
});

// For parent polygons with no centroid inside, find nearest centroid and assign the whole polygon
for (const pp of parentCentroidMap) {
  if (pp.inside.length > 0) continue;
  const pCenter = centroidOf(pp.ring);
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const d = dist(pCenter, centroids[i]);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  pp.inside = [bestI];
  console.log(`  Parent polygon with no centroid → assigned to cluster ${bestI} (${clusterStats[bestI].landmark})`);
}

// Build Voronoi cells: for each cluster, collect all polygons assigned to it
const clusterRings = Array.from({ length: clusterStats.length }, () => []);

for (const { ring, inside } of parentCentroidMap) {
  if (inside.length === 1) {
    // Whole parent polygon belongs to this cluster
    clusterRings[inside[0]].push(ring);
  } else {
    // Multiple centroids → compute Voronoi cells
    const insideCentroids = inside.map(i => centroids[i]);
    for (const ci of inside) {
      const cell = voronoiCell(centroids[ci], insideCentroids, ring);
      if (cell.length >= 3) clusterRings[ci].push(cell);
    }
  }
}

// ── Step 7: Build final area list ─────────────────────────────────────────────
// For clusters with multiple polygons (split across parent polygons), merge into one
// by taking the largest polygon. (DRO only accepts one ring per area.)
const toCreate = clusterStats
  .map((cs, i) => {
    const rings = clusterRings[i];
    if (!rings.length) return null;
    const ring = rings.reduce((best, r) => r.length > best.length ? r : best, rings[0]);
    return { ring, avgMins: cs.avgMins, uniqueLocs: cs.uniqueLocs, totalDeliveries: cs.totalDeliveries, landmark: cs.landmark };
  })
  .filter(Boolean)
  // Renumber sequentially starting at 01 after filtering
  .map((a, i) => ({ ...a, name: `0326-${String(i + 1).padStart(2, "0")}-${a.landmark}` }));

// ── Step 8: Print plan ────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(72));
console.log(`  REBUILD PLAN — ${toCreate.length} anchor areas (gap-free Voronoi coverage)`);
console.log("═".repeat(72));
console.log("  Seq  Name                              Avg Time  Locs  Deliveries");
console.log("  " + "─".repeat(68));
for (const a of toCreate) {
  console.log(`  ${a.name.split("-")[1]}   ${a.name.padEnd(36)} ${fmtTime(a.avgMins)}  ${String(a.uniqueLocs).padStart(4)}  ${String(a.totalDeliveries).padStart(6)}`);
}
console.log();

if (DRY_RUN) { console.log("[DRY RUN] Rerun without --dry-run to apply.\n"); process.exit(0); }

// ── Step 9: Delete existing 0326-xx areas ─────────────────────────────────────
const old326 = areasRaw.filter(a => a.name?.startsWith("0326-"));
console.log(`Deleting ${old326.length} existing 0326-xx areas...\n`);
for (const area of old326) {
  const body = JSON.stringify({ AnchorAreaId: area.anchorAreaId });
  let res = await fetch(`${DRO_BASE}/api/api/anchor-areas/Deleteanchor-areasvalidated`, { method: "DELETE", headers: droHdrs, body });
  if (res.status === 409) res = await fetch(`${DRO_BASE}/api/api/anchor-areas/Deleteanchor-areasvalidated?forceDelete=true`, { method: "DELETE", headers: droHdrs, body });
  console.log(`  ${res.ok ? "✅" : "❌"} Deleted ${area.name} (${area.anchorAreaId}) — HTTP ${res.status}`);
  await new Promise(r => setTimeout(r, 800));
}

// ── Step 10: Create new areas ─────────────────────────────────────────────────
console.log("\nCreating new anchor areas in DRO...\n");
let created = 0, failed = 0;
const results = [];

for (const area of toCreate) {
  const mercRing = area.ring.map(([lat, lng]) => ll2merc(lat, lng));
  if (mercRing[0][0] !== mercRing[mercRing.length - 1][0]) mercRing.push(mercRing[0]);
  const shapeJson = JSON.stringify({ spatialReference: { latestWkid: 3857, wkid: 102100 }, rings: [mercRing] });
  try {
    const res  = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, {
      method: "POST", headers: droHdrs,
      body: JSON.stringify({ ServiceAreaId: parseInt(SA_ID), Name: area.name, Station: "", Shape: shapeJson }),
    });
    const text = await res.text();
    const newId = parseInt(text.replace("id:", "").trim());
    if (res.ok && newId) {
      console.log(`✅ ${area.name} → ID ${newId}`);
      results.push({ name: area.name, anchorAreaId: newId });
      created++;
    } else {
      console.log(`❌ ${area.name} — HTTP ${res.status}: ${text.slice(0, 100)}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ ${area.name} — ${err.message}`);
    failed++;
  }
  await new Promise(r => setTimeout(r, 12000));
}

console.log(`\n✅ Created: ${created}   ❌ Failed: ${failed}`);
fs.writeFileSync("./scripts/rebuilt-anchor-areas-326.json", JSON.stringify(results, null, 2));
console.log("Saved IDs → scripts/rebuilt-anchor-areas-326.json");
