/**
 * Sandbox: Route Balancing Algorithm
 * ────────────────────────────────────
 * Tests whether the geographic neighbor graph + balancing logic produces
 * sensible anchor area swap suggestions before we build any UI.
 *
 * Algorithm:
 *  1. Load anchor area polygons → compute WGS84 centroids
 *  2. Build neighbor graph: two areas are neighbors if centroids are ≤ MAX_NEIGHBOR_MILES apart
 *  3. Estimate avg stop counts per route from 30-day gc_route_days history
 *  4. Distribute route stops evenly across its anchor areas (proxy weight per area)
 *  5. Iteratively: find heaviest route → find its border areas (touching a lighter route)
 *     → suggest the swap that brings both routes closest to equal
 *  6. Print proposed swaps + flag any that cross geographic common sense (> MAX_MOVE_MILES)
 *
 * Usage: node scripts/sandbox-balance.mjs [templateName]
 */

import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const TEMPLATE_NAME    = process.argv[2] ?? "AUTO — 13 drivers";
const MAX_NEIGHBOR_MILES = 3.0;   // areas within this distance can be neighbors
const MAX_MOVE_MILES     = 8.0;   // hard cap: never suggest moving an area to a route > this far
const TARGET_TOLERANCE   = 8;     // stop count difference below which we stop balancing
const DAYS_BACK          = 30;

const env = readFileSync(".env.local", "utf8");
const getEnv = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const sql = neon(getEnv("DATABASE_URL_POOLER") || getEnv("DATABASE_URL"));

// ── Geometry helpers ──────────────────────────────────────────────────────────
const merc2lat = y => (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
const merc2lng = x => (x / 20037508.34) * 180;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polygonCentroid(rings) {
  // Use exterior ring (rings[0]), convert EPSG:3857 → WGS84, return centroid
  const ring = rings[0];
  if (!ring || ring.length === 0) return null;
  let sumLat = 0, sumLng = 0;
  for (const [x, y] of ring) {
    sumLat += merc2lat(y);
    sumLng += merc2lng(x);
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

// ── Load data ─────────────────────────────────────────────────────────────────
console.log(`Loading template: "${TEMPLATE_NAME}"`);

// 1. Template areas
const templateRows = await sql`
  SELECT rta.id, rta.anchor_area_name, rta.work_area_number, rta.route_label, rta.route_slot
  FROM route_template_areas rta
  JOIN route_templates rt ON rt.id = rta.template_id
  WHERE rt.name = ${TEMPLATE_NAME}
  ORDER BY rta.route_slot, rta.anchor_area_name
`;

if (!templateRows.length) {
  console.error(`Template "${TEMPLATE_NAME}" not found.`);
  process.exit(1);
}

// 2. Anchor area polygons (join by name)
const anchorRows = await sql`
  SELECT name, shape_json
  FROM dro_anchor_areas
  WHERE shape_json IS NOT NULL
`;

const anchorShapes = {};
for (const row of anchorRows) {
  try {
    const shape = typeof row.shape_json === "string" ? JSON.parse(row.shape_json) : row.shape_json;
    anchorShapes[row.name] = shape?.rings ?? null;
  } catch {}
}

// 3. Historical stop counts per route (last 30 days)
const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - DAYS_BACK);
const cutoffStr = cutoff.toISOString().slice(0, 10);

const historyRows = await sql`
  SELECT
    route_name,
    COUNT(*) as days,
    AVG(stops_per_hour * (drive_time / 3600.0)) as avg_stops,
    AVG(stops_per_hour) as avg_sph
  FROM gc_route_days
  WHERE date >= ${cutoffStr}
    AND stops_per_hour > 0
    AND drive_time > 0
  GROUP BY route_name
`;

// Build route_name → avg_stops map (gc route_name = work_area_number without leading zero)
const gcStops = {};
for (const row of historyRows) {
  // Pad to 4 digits with leading zero to match work_area_number
  const wan = row.route_name.padStart(4, "0");
  gcStops[wan] = { avgStops: parseFloat(row.avg_stops), days: parseInt(row.days), avgSph: parseFloat(row.avg_sph) };
}

console.log(`GC history: ${Object.keys(gcStops).length} routes with ${DAYS_BACK}d data`);

// ── Build route index ──────────────────────────────────────────────────────────
// Group template areas by route
const routes = {}; // routeLabel → { slot, wan, areas[], avgStops, stopsPerArea }
for (const row of templateRows) {
  if (!routes[row.route_label]) {
    routes[row.route_label] = {
      label: row.route_label,
      slot: row.route_slot,
      wan: row.work_area_number,
      areas: [],
    };
  }
  // Attach centroid
  const rings = anchorShapes[row.anchor_area_name];
  const centroid = rings ? polygonCentroid(rings) : null;
  routes[row.route_label].areas.push({
    id: row.id,
    name: row.anchor_area_name,
    centroid,
  });
}

// Attach stop estimates to each route
for (const [label, route] of Object.entries(routes)) {
  const gc = gcStops[route.wan];
  route.avgStops = gc?.avgStops ?? null;
  route.days = gc?.days ?? 0;
  route.stopsPerArea = route.avgStops != null ? route.avgStops / route.areas.length : null;
}

// Print current state
console.log("\n── Current Route State ─────────────────────────────────────────────");
const routeList = Object.values(routes).sort((a, b) => (b.avgStops ?? 0) - (a.avgStops ?? 0));
for (const r of routeList) {
  const stops = r.avgStops != null ? r.avgStops.toFixed(0).padStart(4) : "  N/A";
  const areas = String(r.areas.length).padStart(3);
  const spaStr = r.stopsPerArea != null ? r.stopsPerArea.toFixed(1).padStart(5) : "  N/A";
  console.log(`  ${r.label.padEnd(24)} ${stops} stops (${r.days}d avg)  ${areas} areas  ${spaStr} stops/area`);
}

const withData = routeList.filter(r => r.avgStops != null);
const allStops = withData.map(r => r.avgStops);
const median = allStops.sort((a,b)=>a-b)[Math.floor(allStops.length/2)];
const mean = allStops.reduce((s,v)=>s+v,0) / allStops.length;
const stddev = Math.sqrt(allStops.reduce((s,v)=>s+(v-mean)**2,0)/allStops.length);
console.log(`\nMedian: ${median.toFixed(0)} stops  Mean: ${mean.toFixed(0)}  StdDev: ${stddev.toFixed(1)}`);

// ── Build neighbor graph ───────────────────────────────────────────────────────
console.log("\n── Building Neighbor Graph ─────────────────────────────────────────");

// All areas with centroids, keyed by name
const allAreas = [];
for (const route of Object.values(routes)) {
  for (const area of route.areas) {
    if (area.centroid) {
      allAreas.push({ ...area, routeLabel: route.label });
    } else {
      console.log(`  ⚠ No centroid for: ${area.name} (${route.label})`);
    }
  }
}

// Build adjacency: for each area, find areas in OTHER routes within MAX_NEIGHBOR_MILES
const neighbors = {}; // areaName → [{ areaName, routeLabel, dist }]
for (const a of allAreas) {
  neighbors[a.name] = [];
  for (const b of allAreas) {
    if (b.routeLabel === a.routeLabel) continue; // same route
    const d = haversine(a.centroid.lat, a.centroid.lng, b.centroid.lat, b.centroid.lng);
    if (d <= MAX_NEIGHBOR_MILES) {
      neighbors[a.name].push({ areaName: b.name, routeLabel: b.routeLabel, dist: d });
    }
  }
  neighbors[a.name].sort((a, b) => a.dist - b.dist);
}

// Print border areas (areas that touch another route)
const borderAreas = allAreas.filter(a => neighbors[a.name].length > 0);
console.log(`  ${allAreas.length} areas total, ${borderAreas.length} are border areas (within ${MAX_NEIGHBOR_MILES}mi of another route)`);
console.log(`  ${allAreas.length - borderAreas.length} are interior areas (isolated)`);

// Flag any areas with NO neighbors at all
const isolated = allAreas.filter(a => neighbors[a.name].length === 0);
if (isolated.length) {
  console.log(`\n  Isolated areas (can never be moved):`);
  for (const a of isolated) {
    console.log(`    ${a.name} (${a.routeLabel})`);
  }
}

// ── Run balancing algorithm ───────────────────────────────────────────────────
console.log("\n── Balancing Algorithm ─────────────────────────────────────────────");

// Work on a mutable copy of route assignments
const currentAssignment = {}; // areaName → routeLabel
for (const route of Object.values(routes)) {
  for (const area of route.areas) {
    currentAssignment[area.name] = route.label;
  }
}

// Current stop estimate per route (mutable)
const routeStops = {}; // routeLabel → estimated avg stops
for (const route of Object.values(routes)) {
  routeStops[route.label] = route.avgStops;
}

// Areas per route
const routeAreaList = {}; // routeLabel → Set of area names
for (const route of Object.values(routes)) {
  routeAreaList[route.label] = new Set(route.areas.map(a => a.name));
}

const stopsPerAreaEst = {}; // routeLabel → stops per area estimate
for (const route of Object.values(routes)) {
  stopsPerAreaEst[route.label] = route.stopsPerArea;
}

const proposals = [];
const triedPairs = new Set(); // "heavy|light" pairs already tried in this pass
const MAX_ITERATIONS = 100;
let iter = 0;
let passWithNoSwap = 0;

while (iter++ < MAX_ITERATIONS) {
  // Only consider routes with stop data AND min days of history
  const MIN_DAYS = 7;
  const active = Object.entries(routeStops)
    .filter(([label, v]) => v != null && (routes[label]?.days ?? 0) >= MIN_DAYS);
  if (active.length < 2) break;

  active.sort((a, b) => b[1] - a[1]);

  // Find the heaviest route that has any untried pairing
  let foundAny = false;
  for (let hi = 0; hi < active.length; hi++) {
    const [heavyLabel, heavyStops] = active[hi];

    // Find the lightest route it hasn't tried yet
    for (let li = active.length - 1; li > hi; li--) {
      const [lightLabel, lightStops] = active[li];
      const pairKey = `${heavyLabel}|${lightLabel}`;
      if (triedPairs.has(pairKey)) continue;

      const diff = heavyStops - lightStops;
      if (diff <= TARGET_TOLERANCE) {
        // This pair is close enough — mark done and continue to others
        triedPairs.add(pairKey);
        continue;
      }

      // Look for best border area swap between this pair
      const heavyAreas = [...routeAreaList[heavyLabel]];
      let bestProposal = null;

      for (const areaName of heavyAreas) {
        const areaNeighbors = neighbors[areaName] ?? [];
        // Does this area touch the light route (via neighbor OR directly assigned)?
        const touchesLight = areaNeighbors.some(n =>
          currentAssignment[n.areaName] === lightLabel
        );
        if (!touchesLight) continue;

        const areaStopEstimate = stopsPerAreaEst[heavyLabel] ?? 0;
        const newHeavy = heavyStops - areaStopEstimate;
        const newLight = lightStops + areaStopEstimate;
        const newDiff = Math.abs(newHeavy - newLight);
        const improvement = diff - newDiff;
        if (improvement <= 0) continue;

        // Distance check: area centroid → light route centroid
        const lightAreaCentroid = (() => {
          const pts = [...routeAreaList[lightLabel]]
            .map(n => allAreas.find(a => a.name === n)?.centroid)
            .filter(Boolean);
          if (!pts.length) return null;
          return { lat: pts.reduce((s,p)=>s+p.lat,0)/pts.length, lng: pts.reduce((s,p)=>s+p.lng,0)/pts.length };
        })();

        const areaObj = allAreas.find(a => a.name === areaName);
        if (!areaObj?.centroid || !lightAreaCentroid) continue;
        const distToLight = haversine(areaObj.centroid.lat, areaObj.centroid.lng, lightAreaCentroid.lat, lightAreaCentroid.lng);
        if (distToLight > MAX_MOVE_MILES) continue;

        if (!bestProposal || improvement > bestProposal.improvement) {
          bestProposal = {
            area: areaName,
            from: heavyLabel,
            to: lightLabel,
            stopsTransferred: areaStopEstimate,
            heavyBefore: heavyStops,
            lightBefore: lightStops,
            heavyAfter: newHeavy,
            lightAfter: newLight,
            diffBefore: diff,
            diffAfter: newDiff,
            improvement,
            distToLight: distToLight.toFixed(1),
          };
        }
      }

      if (!bestProposal) {
        console.log(`  ⚠ No valid border swap between ${heavyLabel} (${heavyStops.toFixed(0)}) and ${lightLabel} (${lightStops.toFixed(0)})`);
        triedPairs.add(pairKey);
        continue;
      }

      // Apply the proposal
      routeAreaList[bestProposal.from].delete(bestProposal.area);
      routeAreaList[bestProposal.to].add(bestProposal.area);
      currentAssignment[bestProposal.area] = bestProposal.to;
      routeStops[bestProposal.from] = bestProposal.heavyAfter;
      routeStops[bestProposal.to] = bestProposal.lightAfter;
      stopsPerAreaEst[bestProposal.from] = bestProposal.heavyAfter / routeAreaList[bestProposal.from].size;
      stopsPerAreaEst[bestProposal.to] = bestProposal.lightAfter / routeAreaList[bestProposal.to].size;
      // Clear tried pairs since state changed
      triedPairs.clear();

      proposals.push(bestProposal);
      console.log(`  Swap ${proposals.length}: Move "${bestProposal.area}"`);
      console.log(`    FROM ${bestProposal.from.padEnd(22)} ${bestProposal.heavyBefore.toFixed(0)} → ${bestProposal.heavyAfter.toFixed(0)} stops`);
      console.log(`    TO   ${bestProposal.to.padEnd(22)} ${bestProposal.lightBefore.toFixed(0)} → ${bestProposal.lightAfter.toFixed(0)} stops`);
      console.log(`    Distance: ${bestProposal.distToLight} mi  Improvement: ${bestProposal.improvement.toFixed(0)} stops`);
      foundAny = true;
      break;
    }
    if (foundAny) break;
  }

  if (!foundAny) {
    console.log(`\n  ✓ No more valid swaps found. Converged.`);
    break;
  }
}

if (iter >= MAX_ITERATIONS) {
  console.log(`\n  ⚠ Reached max iterations (${MAX_ITERATIONS}).`);
}

// ── Final state ───────────────────────────────────────────────────────────────
console.log("\n── Proposed Final Route State ──────────────────────────────────────");

// Use ALL routes (including those excluded from balancing due to low data)
const allFinalRoutes = Object.values(routes).map(r => {
  const finalStops = routeStops[r.label] ?? r.avgStops;
  const original = r.avgStops;
  const changed = finalStops !== original;
  return { label: r.label, stops: finalStops, original, changed, areas: routeAreaList[r.label]?.size ?? r.areas.length, days: r.days };
}).sort((a, b) => (b.stops ?? 0) - (a.stops ?? 0));

for (const r of allFinalRoutes) {
  const stopsStr = r.stops != null ? r.stops.toFixed(0).padStart(4) : "  N/A";
  const delta = r.changed && r.original != null ? (r.stops - r.original) : 0;
  const deltaStr = delta !== 0 ? (delta > 0 ? ` (+${delta.toFixed(0)})` : ` (${delta.toFixed(0)})`) : "";
  const dataFlag = r.days < 7 ? ` ⚠ only ${r.days}d data` : "";
  console.log(`  ${r.label.padEnd(24)} ${stopsStr} stops  ${r.areas} areas${deltaStr}${dataFlag}`);
}

const withDataFinal = allFinalRoutes.filter(r => r.stops != null && r.days >= 7);
if (withDataFinal.length >= 2) {
  const fVals = withDataFinal.map(r => r.stops);
  const fMean = fVals.reduce((s,v)=>s+v,0) / fVals.length;
  const fStddev = Math.sqrt(fVals.reduce((s,v)=>s+(v-fMean)**2,0)/fVals.length);
  const beforeVals = withDataFinal.map(r => r.original ?? r.stops);
  const bMean = beforeVals.reduce((s,v)=>s+v,0)/beforeVals.length;
  const bStddev = Math.sqrt(beforeVals.reduce((s,v)=>s+(v-bMean)**2,0)/beforeVals.length);
  console.log(`\nStdDev (routes with ≥7d data): ${fStddev.toFixed(1)} stops (was ${bStddev.toFixed(1)})`);
  console.log(`Range: ${Math.min(...fVals).toFixed(0)}–${Math.max(...fVals).toFixed(0)} stops (was ${Math.min(...beforeVals).toFixed(0)}–${Math.max(...beforeVals).toFixed(0)})`);
}

// ── Summary of proposals ──────────────────────────────────────────────────────
console.log(`\n── Summary: ${proposals.length} proposed swap(s) ─────────────────────────────────`);
if (!proposals.length) {
  console.log("  No swaps needed — routes are already balanced.");
} else {
  for (const p of proposals) {
    console.log(`  Move "${p.area}" → ${p.to}  (saves ${p.improvement.toFixed(0)} stops, ${p.distToLight}mi)`);
  }
}

// ── Neighbor graph spot check ─────────────────────────────────────────────────
console.log("\n── Neighbor Graph Spot Check ───────────────────────────────────────");
const checks = [
  "Zirconia/ZirconiaRd",
  "Bat Cave",
  "Chimney Rock",
  "7th Ave",
  "Osceola Lake",
];
for (const name of checks) {
  const ns = neighbors[name];
  if (!ns) { console.log(`  ${name}: NOT FOUND in template`); continue; }
  if (!ns.length) { console.log(`  ${name}: NO neighbors within ${MAX_NEIGHBOR_MILES}mi ✓ (isolated)`); continue; }
  const nbStr = ns.slice(0, 3).map(n => `${n.areaName}(${n.routeLabel}, ${n.dist.toFixed(1)}mi)`).join(", ");
  console.log(`  ${name}: ${nbStr}`);
}

// Write full output to file
const output = {
  template: TEMPLATE_NAME,
  parameters: { MAX_NEIGHBOR_MILES, MAX_MOVE_MILES, TARGET_TOLERANCE, DAYS_BACK },
  routesBefore: Object.fromEntries(routeList.map(r => [r.label, { avgStops: r.avgStops, areas: r.areas.length, wan: r.wan }])),
  neighborGraph: Object.fromEntries(Object.entries(neighbors).map(([k,v]) => [k, v.map(n => ({ route: n.routeLabel, dist: n.dist.toFixed(2) }))])),
  proposals,
  routesAfter: Object.fromEntries(Object.entries(routeAreaList).map(([k,v]) => [k, [...v]])),
};
writeFileSync("scripts/balance-output.json", JSON.stringify(output, null, 2));
console.log("\nFull output written to scripts/balance-output.json");
