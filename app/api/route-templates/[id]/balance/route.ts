import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_NEIGHBOR_MILES = 3.0;
const MAX_MOVE_MILES = 8.0;
const TARGET_TOLERANCE = 8;
const DAYS_BACK = 30;
const MIN_DAYS = 7;

// ── Geometry helpers ──────────────────────────────────────────────────────────
function merc2lat(y: number): number {
  return (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
}
function merc2lng(x: number): number {
  return (x / 20037508.34) * 180;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polygonCentroid(rings: number[][][]): { lat: number; lng: number } | null {
  const ring = rings[0];
  if (!ring || ring.length === 0) return null;
  let sumLat = 0, sumLng = 0;
  for (const [x, y] of ring) {
    sumLat += merc2lat(y);
    sumLng += merc2lng(x);
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Centroid = { lat: number; lng: number };

type AreaEntry = {
  id: number;
  name: string;
  centroid: Centroid | null;
  routeLabel: string;
};

type RouteEntry = {
  label: string;
  slot: number;
  wan: string;
  areas: { id: number; name: string; centroid: Centroid | null }[];
  avgStops: number | null;
  days: number;
  stopsPerArea: number | null;
};

type Proposal = {
  area: string;
  from: string;
  to: string;
  improvement: number;
  distMiles: string;
  heavyBefore: number;
  heavyAfter: number;
  lightBefore: number;
  lightAfter: number;
};

type RouteBeforeEntry = {
  label: string;
  avgStops: number | null;
  days: number;
  areas: number;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);

  // 1. Load template areas
  const templateRows = await sql`
    SELECT rta.id, rta.anchor_area_name, rta.work_area_number, rta.route_label, rta.route_slot
    FROM route_template_areas rta
    WHERE rta.template_id = ${templateId}
    ORDER BY rta.route_slot, rta.anchor_area_name
  `;

  if (!templateRows.length) {
    return NextResponse.json({ error: "Template not found or has no areas" }, { status: 404 });
  }

  // 2. Load anchor area polygons
  const anchorRows = await sql`
    SELECT name, shape_json
    FROM dro_anchor_areas
    WHERE shape_json IS NOT NULL
  `;

  const anchorShapes: Record<string, number[][][] | null> = {};
  for (const row of anchorRows) {
    try {
      const shape = typeof row.shape_json === "string" ? JSON.parse(row.shape_json) : row.shape_json;
      anchorShapes[row.name as string] = (shape?.rings as number[][][] | undefined) ?? null;
    } catch {
      // ignore parse errors
    }
  }

  // 3. Historical stop counts (last 30 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const historyRows = await sql`
    SELECT
      route_name,
      COUNT(*) as days,
      AVG(stops_per_hour * (drive_time / 3600.0)) as avg_stops
    FROM gc_route_days
    WHERE date >= ${cutoffStr}
      AND stops_per_hour > 0
      AND drive_time > 0
    GROUP BY route_name
  `;

  const gcStops: Record<string, { avgStops: number; days: number }> = {};
  for (const row of historyRows) {
    const wan = (row.route_name as string).padStart(4, "0");
    gcStops[wan] = {
      avgStops: parseFloat(row.avg_stops as string),
      days: parseInt(row.days as string, 10),
    };
  }

  // ── Build route index ─────────────────────────────────────────────────────
  const routes: Record<string, RouteEntry> = {};
  for (const row of templateRows) {
    const label = row.route_label as string;
    if (!routes[label]) {
      routes[label] = {
        label,
        slot: row.route_slot as number,
        wan: row.work_area_number as string,
        areas: [],
        avgStops: null,
        days: 0,
        stopsPerArea: null,
      };
    }
    const rings = anchorShapes[row.anchor_area_name as string];
    const centroid = rings ? polygonCentroid(rings) : null;
    routes[label].areas.push({
      id: row.id as number,
      name: row.anchor_area_name as string,
      centroid,
    });
  }

  // Attach stop estimates
  for (const route of Object.values(routes)) {
    const gc = gcStops[route.wan];
    route.avgStops = gc?.avgStops ?? null;
    route.days = gc?.days ?? 0;
    route.stopsPerArea = route.avgStops != null ? route.avgStops / route.areas.length : null;
  }

  // Snapshot routesBefore
  const routeList = Object.values(routes).sort((a, b) => (b.avgStops ?? 0) - (a.avgStops ?? 0));
  const routesBefore: RouteBeforeEntry[] = routeList.map((r) => ({
    label: r.label,
    avgStops: r.avgStops != null ? Math.round(r.avgStops) : null,
    days: r.days,
    areas: r.areas.length,
  }));

  // Compute stddev before
  const withDataBefore = routeList.filter((r) => r.avgStops != null && r.days >= MIN_DAYS);
  const valsBefore = withDataBefore.map((r) => r.avgStops as number);
  const meanBefore = valsBefore.length
    ? valsBefore.reduce((s, v) => s + v, 0) / valsBefore.length
    : 0;
  const stddevBefore =
    valsBefore.length >= 2
      ? Math.sqrt(valsBefore.reduce((s, v) => s + (v - meanBefore) ** 2, 0) / valsBefore.length)
      : 0;

  // ── Build neighbor graph ──────────────────────────────────────────────────
  const allAreas: AreaEntry[] = [];
  for (const route of Object.values(routes)) {
    for (const area of route.areas) {
      if (area.centroid) {
        allAreas.push({ ...area, routeLabel: route.label });
      }
    }
  }

  const neighbors: Record<string, { areaName: string; routeLabel: string; dist: number }[]> = {};
  for (const a of allAreas) {
    neighbors[a.name] = [];
    for (const b of allAreas) {
      if (b.routeLabel === a.routeLabel) continue;
      const d = haversine(
        a.centroid!.lat, a.centroid!.lng,
        b.centroid!.lat, b.centroid!.lng
      );
      if (d <= MAX_NEIGHBOR_MILES) {
        neighbors[a.name].push({ areaName: b.name, routeLabel: b.routeLabel, dist: d });
      }
    }
    neighbors[a.name].sort((a, b) => a.dist - b.dist);
  }

  // ── Run balancing algorithm ───────────────────────────────────────────────
  const currentAssignment: Record<string, string> = {};
  for (const route of Object.values(routes)) {
    for (const area of route.areas) {
      currentAssignment[area.name] = route.label;
    }
  }

  const routeStops: Record<string, number | null> = {};
  for (const route of Object.values(routes)) {
    routeStops[route.label] = route.avgStops;
  }

  const routeAreaList: Record<string, Set<string>> = {};
  for (const route of Object.values(routes)) {
    routeAreaList[route.label] = new Set(route.areas.map((a) => a.name));
  }

  const stopsPerAreaEst: Record<string, number | null> = {};
  for (const route of Object.values(routes)) {
    stopsPerAreaEst[route.label] = route.stopsPerArea;
  }

  const proposals: Proposal[] = [];
  const triedPairs = new Set<string>();
  const MAX_ITERATIONS = 100;
  let iter = 0;

  while (iter++ < MAX_ITERATIONS) {
    const active = Object.entries(routeStops)
      .filter(([label, v]) => v != null && (routes[label]?.days ?? 0) >= MIN_DAYS) as [string, number][];

    if (active.length < 2) break;
    active.sort((a, b) => b[1] - a[1]);

    let foundAny = false;

    for (let hi = 0; hi < active.length; hi++) {
      const [heavyLabel, heavyStops] = active[hi];

      for (let li = active.length - 1; li > hi; li--) {
        const [lightLabel, lightStops] = active[li];
        const pairKey = `${heavyLabel}|${lightLabel}`;
        if (triedPairs.has(pairKey)) continue;

        const diff = heavyStops - lightStops;
        if (diff <= TARGET_TOLERANCE) {
          triedPairs.add(pairKey);
          continue;
        }

        const heavyAreas = [...routeAreaList[heavyLabel]];
        let bestProposal: Proposal | null = null;
        let bestImprovement = 0;

        for (const areaName of heavyAreas) {
          const areaNeighbors = neighbors[areaName] ?? [];
          const touchesLight = areaNeighbors.some(
            (n) => currentAssignment[n.areaName] === lightLabel
          );
          if (!touchesLight) continue;

          const areaStopEstimate = stopsPerAreaEst[heavyLabel] ?? 0;
          const newHeavy = heavyStops - areaStopEstimate;
          const newLight = lightStops + areaStopEstimate;
          const newDiff = Math.abs(newHeavy - newLight);
          const improvement = diff - newDiff;
          if (improvement <= 0) continue;

          // Distance check: area centroid → light route centroid
          const lightPts = [...routeAreaList[lightLabel]]
            .map((n) => allAreas.find((a) => a.name === n)?.centroid)
            .filter((c): c is Centroid => c != null);

          if (!lightPts.length) continue;
          const lightCentroid: Centroid = {
            lat: lightPts.reduce((s, p) => s + p.lat, 0) / lightPts.length,
            lng: lightPts.reduce((s, p) => s + p.lng, 0) / lightPts.length,
          };

          const areaObj = allAreas.find((a) => a.name === areaName);
          if (!areaObj?.centroid) continue;

          const distToLight = haversine(
            areaObj.centroid.lat, areaObj.centroid.lng,
            lightCentroid.lat, lightCentroid.lng
          );
          if (distToLight > MAX_MOVE_MILES) continue;

          if (improvement > bestImprovement) {
            bestImprovement = improvement;
            bestProposal = {
              area: areaName,
              from: heavyLabel,
              to: lightLabel,
              improvement: Math.round(improvement),
              distMiles: distToLight.toFixed(1),
              heavyBefore: Math.round(heavyStops),
              heavyAfter: Math.round(newHeavy),
              lightBefore: Math.round(lightStops),
              lightAfter: Math.round(newLight),
            };
          }
        }

        if (!bestProposal) {
          triedPairs.add(pairKey);
          continue;
        }

        // Apply proposal to running state
        routeAreaList[bestProposal.from].delete(bestProposal.area);
        routeAreaList[bestProposal.to].add(bestProposal.area);
        currentAssignment[bestProposal.area] = bestProposal.to;
        routeStops[bestProposal.from] = bestProposal.heavyAfter;
        routeStops[bestProposal.to] = bestProposal.lightAfter;
        const fromSize = routeAreaList[bestProposal.from].size;
        const toSize = routeAreaList[bestProposal.to].size;
        stopsPerAreaEst[bestProposal.from] = fromSize > 0 ? bestProposal.heavyAfter / fromSize : null;
        stopsPerAreaEst[bestProposal.to] = toSize > 0 ? bestProposal.lightAfter / toSize : null;
        triedPairs.clear();

        proposals.push(bestProposal);
        foundAny = true;
        break;
      }
      if (foundAny) break;
    }

    if (!foundAny) break;
  }

  // Compute stddev after
  const withDataAfter = Object.values(routes).filter(
    (r) => routeStops[r.label] != null && r.days >= MIN_DAYS
  );
  const valsAfter = withDataAfter.map((r) => routeStops[r.label] as number);
  const meanAfter = valsAfter.length
    ? valsAfter.reduce((s, v) => s + v, 0) / valsAfter.length
    : 0;
  const stddevAfter =
    valsAfter.length >= 2
      ? Math.sqrt(valsAfter.reduce((s, v) => s + (v - meanAfter) ** 2, 0) / valsAfter.length)
      : 0;

  return NextResponse.json({
    routesBefore,
    proposals,
    stddevBefore: parseFloat(stddevBefore.toFixed(1)),
    stddevAfter: parseFloat(stddevAfter.toFixed(1)),
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[balance]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
