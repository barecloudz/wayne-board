import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droStops, droAnchorAreas, settings } from "@/lib/schema";
import { isNotNull, eq } from "drizzle-orm";

const MAX_STOPS = 120;

// ── Haversine distance in miles ───────────────────────────────────────────────
function dist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Total route distance (depot → s[0] → ... → s[n-1]) ───────────────────────
function routeDist(
  stops: { lat: number; lng: number }[],
  depot: { lat: number; lng: number }
): number {
  if (stops.length === 0) return 0;
  let total = dist(depot.lat, depot.lng, stops[0].lat, stops[0].lng);
  for (let i = 1; i < stops.length; i++) {
    total += dist(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  }
  return total;
}

// ── Centroid of a set of stops ────────────────────────────────────────────────
function centroid(stops: { lat: number; lng: number }[]): { lat: number; lng: number } {
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length;
  return { lat, lng };
}

// ── Nearest-neighbor TSP (non-bulk stops only, from depot) ───────────────────
function nearestNeighbor<T extends { lat: number; lng: number }>(
  stops: T[],
  depot: { lat: number; lng: number }
): T[] {
  if (stops.length === 0) return [];
  const unvisited = [...stops];
  const ordered: T[] = [];
  let cur: { lat: number; lng: number } = depot;

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = dist(cur.lat, cur.lng, unvisited[i].lat, unvisited[i].lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = unvisited.splice(bestIdx, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

// ── 2-opt improvement pass ────────────────────────────────────────────────────
// Tries reversing every sub-segment; keeps the reversal if it shortens total distance.
// Only runs on non-bulk stops (bulk stays pinned at end).
function twoOpt<T extends { lat: number; lng: number }>(
  stops: T[],
  depot: { lat: number; lng: number }
): T[] {
  if (stops.length < 4) return stops;
  let route = [...stops];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 2; j < route.length; j++) {
        // Cost before: ...→ route[i] → route[i+1] → ... → route[j] → route[j+1]→...
        const a = i === 0 ? depot : route[i - 1];
        const d_before =
          dist(a.lat, a.lng, route[i].lat, route[i].lng) +
          dist(route[j].lat, route[j].lng,
            j + 1 < route.length ? route[j + 1].lat : depot.lat,
            j + 1 < route.length ? route[j + 1].lng : depot.lng);

        // Cost after reversing segment [i..j]:
        const d_after =
          dist(a.lat, a.lng, route[j].lat, route[j].lng) +
          dist(route[i].lat, route[i].lng,
            j + 1 < route.length ? route[j + 1].lat : depot.lat,
            j + 1 < route.length ? route[j + 1].lng : depot.lng);

        if (d_after < d_before - 0.0001) {
          // Reverse the segment
          const seg = route.slice(i, j + 1).reverse();
          route = [...route.slice(0, i), ...seg, ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return route;
}

// ── Sequence a route: regular stops optimized, bulk pinned to end ─────────────
function sequenceRoute<T extends { lat: number; lng: number; isBulkStop: boolean }>(
  stops: T[],
  depot: { lat: number; lng: number }
): T[] {
  const regular = stops.filter(s => !s.isBulkStop);
  const bulk    = stops.filter(s => s.isBulkStop);

  const nn       = nearestNeighbor(regular, depot);
  const optimized = twoOpt(nn, depot);

  // Sequence bulk among themselves (nearest-neighbor from last regular stop or depot)
  const bulkStart = optimized.length > 0
    ? optimized[optimized.length - 1]
    : depot;
  const bulkOrdered = nearestNeighbor(bulk, bulkStart);

  return [...optimized, ...bulkOrdered];
}

// ── Point-in-polygon (ray casting, WGS84) ────────────────────────────────────
function parseWkt(wkt: string): [number, number][] {
  const inner = wkt.replace(/^POLYGON\s*\(\(/i, "").replace(/\)\)$/, "");
  return inner.split(",").map(p => {
    const [lngStr, latStr] = p.trim().split(/\s+/);
    return [parseFloat(lngStr), parseFloat(latStr)];
  });
}

function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

type Stop = {
  id: number;
  waypointId: string;
  address: string;
  city: string;
  firmName: string;
  lat: number;
  lng: number;
  noPackages: number;
  totalWeight: number;
  isBulkStop: boolean;
  actualRoute: string;
  workAreaNumber: string;
};

type RouteGroup = {
  name: string;
  stops: Stop[];
  centLat: number;
  centLng: number;
};

export async function POST(req: NextRequest) {
  try {
    const { driverCount } = await req.json() as { driverCount: number };

    // Depot from settings, default to FedEx Ground Fletcher NC station
    const depotLatRow = await db.select().from(settings).where(eq(settings.key, "depot_lat")).then(r => r[0]);
    const depotLngRow = await db.select().from(settings).where(eq(settings.key, "depot_lng")).then(r => r[0]);
    const depot = {
      lat: parseFloat(depotLatRow?.value ?? "35.4210"),
      lng: parseFloat(depotLngRow?.value ?? "-82.5022"),
    };

    // Pull all stops with coordinates
    const rawStops = await db.select({
      id:             droStops.id,
      waypointId:     droStops.waypointId,
      address:        droStops.address,
      city:           droStops.city,
      firmName:       droStops.firmName,
      lat:            droStops.lat,
      lng:            droStops.lng,
      noPackages:     droStops.noPackages,
      totalWeight:    droStops.totalWeight,
      isBulkStop:     droStops.isBulkStop,
      actualRoute:    droStops.actualRoute,
      workAreaNumber: droStops.workAreaNumber,
    }).from(droStops).where(isNotNull(droStops.lat));

    const stops = rawStops.filter(s => s.lat != null && s.lng != null) as Stop[];

    if (stops.length === 0) {
      return NextResponse.json({ error: "No stops with coordinates. Run DRO sync first." }, { status: 400 });
    }

    // Pull anchor area polygons
    const anchorAreas = await db.select({
      name:    droAnchorAreas.name,
      wktPoly: droAnchorAreas.wktPoly,
    }).from(droAnchorAreas);

    const parsedAreas = anchorAreas
      .filter(a => a.wktPoly)
      .map(a => ({ name: a.name, poly: parseWkt(a.wktPoly!) }));

    // ── Step 1: Group stops by actualRoute ───────────────────────────────────
    const groups: Map<string, Stop[]> = new Map();

    for (const s of stops) {
      const key = s.actualRoute?.trim() || "";
      if (key) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
      }
    }

    // ── Step 2: Assign unrouted stops via point-in-polygon, else nearest centroid
    const unrouted = stops.filter(s => !s.actualRoute?.trim());
    const groupNames = [...groups.keys()];

    const getCentroid = (name: string) => {
      const g = groups.get(name)!;
      return centroid(g.map(s => ({ lat: s.lat, lng: s.lng })));
    };

    for (const s of unrouted) {
      let assigned = "";

      // Point-in-polygon first
      for (const area of parsedAreas) {
        if (pointInPolygon(s.lat, s.lng, area.poly)) {
          const match = groupNames.find(n =>
            n.toLowerCase().includes(area.name.toLowerCase().slice(0, 5))
          );
          if (match) { assigned = match; break; }
        }
      }

      // Fall back to nearest centroid
      if (!assigned && groupNames.length > 0) {
        let bestName = groupNames[0];
        let bestDist = Infinity;
        for (const name of groupNames) {
          const c = getCentroid(name);
          const d = dist(s.lat, s.lng, c.lat, c.lng);
          if (d < bestDist) { bestDist = d; bestName = name; }
        }
        assigned = bestName;
      }

      if (assigned) groups.get(assigned)!.push(s);
    }

    // ── Step 3: Convert to RouteGroup array ──────────────────────────────────
    let routeGroups: RouteGroup[] = [...groups.entries()].map(([name, stps]) => {
      const c = centroid(stps.map(s => ({ lat: s.lat, lng: s.lng })));
      return { name, stops: stps, centLat: c.lat, centLng: c.lng };
    });

    const currentCount = routeGroups.length;

    // ── Step 4: Merge routes to reach driverCount, respecting MAX_STOPS ──────
    // Each merge iteration: find smallest route, try to merge into nearest
    // neighbor that won't exceed MAX_STOPS. If no safe merge exists, stop.
    let mergeAttempts = 0;
    const maxAttempts = routeGroups.length * routeGroups.length;

    while (routeGroups.length > driverCount && mergeAttempts < maxAttempts) {
      mergeAttempts++;

      // Sort by stop count ascending
      routeGroups.sort((a, b) => a.stops.length - b.stops.length);
      const smallest = routeGroups[0];

      // Find nearest neighbor that can absorb smallest without exceeding cap
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 1; i < routeGroups.length; i++) {
        const combined = routeGroups[i].stops.length + smallest.stops.length;
        if (combined > MAX_STOPS) continue; // would blow the cap
        const d = dist(smallest.centLat, smallest.centLng, routeGroups[i].centLat, routeGroups[i].centLng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }

      if (bestIdx === -1) {
        // No safe merge exists — can't cut any further
        break;
      }

      const target = routeGroups[bestIdx];
      target.stops = [...target.stops, ...smallest.stops];
      const c = centroid(target.stops.map(s => ({ lat: s.lat, lng: s.lng })));
      target.centLat = c.lat;
      target.centLng = c.lng;

      routeGroups.splice(0, 1); // remove smallest
    }

    // ── Step 5: Sequence each route (regular optimized, bulk last) ───────────
    const planned = routeGroups.map((rg, idx) => {
      const sequenced = sequenceRoute(rg.stops, depot);
      const totalDist = routeDist(sequenced, depot);
      return {
        routeIndex: idx + 1,
        name: rg.name,
        stopCount: sequenced.length,
        packages: sequenced.reduce((s, p) => s + (p.noPackages ?? 0), 0),
        bulkStops: sequenced.filter(s => s.isBulkStop).length,
        estMiles: Math.round(totalDist * 10) / 10,
        centLat: rg.centLat,
        centLng: rg.centLng,
        stops: sequenced.map((s, i) => ({
          seq:        i + 1,
          address:    s.address,
          city:       s.city,
          firmName:   s.firmName || null,
          lat:        s.lat,
          lng:        s.lng,
          packages:   s.noPackages,
          isBulk:     s.isBulkStop,
          waypointId: s.waypointId,
        })),
      };
    });

    // Sort by centroid distance from depot
    planned.sort((a, b) =>
      dist(depot.lat, depot.lng, a.centLat, a.centLng) -
      dist(depot.lat, depot.lng, b.centLat, b.centLng)
    );
    planned.forEach((r, i) => { r.routeIndex = i + 1; });

    const actualMerged = currentCount - planned.length;

    return NextResponse.json({
      depot,
      totalStops: stops.length,
      totalPackages: planned.reduce((s, r) => s + r.packages, 0),
      totalEstMiles: planned.reduce((s, r) => s + r.estMiles, 0),
      routeCount: planned.length,
      originalRouteCount: currentCount,
      merged: actualMerged,
      cappedAt: actualMerged < (currentCount - driverCount)
        ? `Could only cut ${actualMerged} (120-stop cap reached)`
        : null,
      routes: planned,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
