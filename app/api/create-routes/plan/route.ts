import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droStops, droAnchorAreas, droRoutes, settings } from "@/lib/schema";
import { isNotNull, eq } from "drizzle-orm";

// DRO uses 85% of vehicle capacity as the load threshold (same as GroundSwell maxThresholdNormalized)
const LOAD_THRESHOLD = 0.85;
// Hard stop cap as a secondary safety net
const MAX_STOPS = 150;

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

// ── Nearest-neighbor TSP ──────────────────────────────────────────────────────
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
        const a  = i === 0 ? depot : route[i - 1];
        const nxt = j + 1 < route.length ? route[j + 1] : depot;

        const dBefore =
          dist(a.lat, a.lng, route[i].lat, route[i].lng) +
          dist(route[j].lat, route[j].lng, nxt.lat, nxt.lng);

        const dAfter =
          dist(a.lat, a.lng, route[j].lat, route[j].lng) +
          dist(route[i].lat, route[i].lng, nxt.lat, nxt.lng);

        if (dAfter < dBefore - 0.0001) {
          const seg = route.slice(i, j + 1).reverse();
          route = [...route.slice(0, i), ...seg, ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return route;
}

// ── Sequence: regular stops optimized via NN+2opt, bulk pinned to end ─────────
function sequenceRoute<T extends { lat: number; lng: number; isBulkStop: boolean }>(
  stops: T[],
  depot: { lat: number; lng: number }
): T[] {
  const regular = stops.filter(s => !s.isBulkStop);
  const bulk    = stops.filter(s => s.isBulkStop);

  const optimized = twoOpt(nearestNeighbor(regular, depot), depot);
  const bulkStart = optimized.length > 0 ? optimized[optimized.length - 1] : depot;
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
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
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
  totalCube: number;
  totalWeight: number;
  isBulkStop: boolean;
  actualRoute: string;
  workAreaNumber: string;
};

type RouteGroup = {
  name: string;
  stops: Stop[];
  totalCube: number;
  vehicleCapacity: number;   // from DRO route plan
  cubeCap: number;           // vehicleCapacity * LOAD_THRESHOLD
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

    // Pull vehicle capacities from DRO route plans (keyed by work area name)
    const droRouteRows = await db.select({
      workAreaName:    droRoutes.workAreaName,
      vehicleCapacity: droRoutes.vehicleCapacity,
    }).from(droRoutes);

    const capacityMap: Record<string, number> = {};
    for (const r of droRouteRows) {
      const cap = parseFloat(r.vehicleCapacity);
      if (!isNaN(cap) && cap > 0) capacityMap[r.workAreaName.trim()] = cap;
    }

    // Fallback capacity if a route isn't in DRO (e.g. after merge)
    const defaultCapacity = droRouteRows.length > 0
      ? Math.min(...Object.values(capacityMap).filter(v => v > 0))
      : 300;

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
      totalCube:      droStops.totalCube,
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

    // ── Step 2: Assign unrouted stops ────────────────────────────────────────
    const unrouted   = stops.filter(s => !s.actualRoute?.trim());
    const groupNames = [...groups.keys()];

    const getCentroid = (name: string) => {
      const g = groups.get(name)!;
      return centroid(g.map(s => ({ lat: s.lat, lng: s.lng })));
    };

    for (const s of unrouted) {
      let assigned = "";

      for (const area of parsedAreas) {
        if (pointInPolygon(s.lat, s.lng, area.poly)) {
          const match = groupNames.find(n =>
            n.toLowerCase().includes(area.name.toLowerCase().slice(0, 5))
          );
          if (match) { assigned = match; break; }
        }
      }

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

    // ── Step 3: Build RouteGroup with cube totals and capacity ───────────────
    let routeGroups: RouteGroup[] = [...groups.entries()].map(([name, stps]) => {
      const c    = centroid(stps.map(s => ({ lat: s.lat, lng: s.lng })));
      const cube = stps.reduce((sum, s) => sum + (s.totalCube ?? 0), 0);
      const cap  = capacityMap[name] ?? defaultCapacity;
      return {
        name,
        stops: stps,
        totalCube: cube,
        vehicleCapacity: cap,
        cubeCap: cap * LOAD_THRESHOLD,
        centLat: c.lat,
        centLng: c.lng,
      };
    });

    const currentCount = routeGroups.length;

    // ── Step 4: Merge to reach driverCount — cube-cap + stop-cap aware ───────
    let mergeAttempts = 0;
    const maxAttempts = routeGroups.length * routeGroups.length;

    while (routeGroups.length > driverCount && mergeAttempts < maxAttempts) {
      mergeAttempts++;
      routeGroups.sort((a, b) => a.totalCube - b.totalCube);
      const smallest = routeGroups[0];

      // Find nearest route that can absorb smallest without busting cube or stop cap
      let bestIdx  = -1;
      let bestDist = Infinity;
      for (let i = 1; i < routeGroups.length; i++) {
        const target       = routeGroups[i];
        const combinedCube = target.totalCube + smallest.totalCube;
        const combinedStops = target.stops.length + smallest.stops.length;
        // Use the larger van's cap when merging (we'd assign the bigger vehicle)
        const effectiveCap  = Math.max(target.cubeCap, smallest.cubeCap);
        if (combinedCube > effectiveCap) continue;
        if (combinedStops > MAX_STOPS)   continue;
        const d = dist(smallest.centLat, smallest.centLng, target.centLat, target.centLng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }

      if (bestIdx === -1) break; // no safe merge

      const target = routeGroups[bestIdx];
      target.stops = [...target.stops, ...smallest.stops];
      target.totalCube += smallest.totalCube;
      // Keep the larger vehicle capacity
      target.vehicleCapacity = Math.max(target.vehicleCapacity, smallest.vehicleCapacity);
      target.cubeCap         = target.vehicleCapacity * LOAD_THRESHOLD;
      const c = centroid(target.stops.map(s => ({ lat: s.lat, lng: s.lng })));
      target.centLat = c.lat;
      target.centLng = c.lng;

      routeGroups.splice(0, 1);
    }

    // ── Step 5: Sequence each route ──────────────────────────────────────────
    const planned = routeGroups.map((rg, idx) => {
      const sequenced = sequenceRoute(rg.stops, depot);
      const totalDist = routeDist(sequenced, depot);
      const cubePct   = Math.round((rg.totalCube / rg.vehicleCapacity) * 100);
      return {
        routeIndex:      idx + 1,
        name:            rg.name,
        stopCount:       sequenced.length,
        packages:        sequenced.reduce((s, p) => s + (p.noPackages ?? 0), 0),
        bulkStops:       sequenced.filter(s => s.isBulkStop).length,
        totalCube:       Math.round(rg.totalCube * 10) / 10,
        vehicleCapacity: rg.vehicleCapacity,
        cubePct,
        estMiles:        Math.round(totalDist * 10) / 10,
        centLat:         rg.centLat,
        centLng:         rg.centLng,
        stops: sequenced.map((s, i) => ({
          seq:        i + 1,
          address:    s.address,
          city:       s.city,
          firmName:   s.firmName || null,
          lat:        s.lat,
          lng:        s.lng,
          packages:   s.noPackages,
          cube:       Math.round((s.totalCube ?? 0) * 10) / 10,
          isBulk:     s.isBulkStop,
          waypointId: s.waypointId,
        })),
      };
    });

    planned.sort((a, b) =>
      dist(depot.lat, depot.lng, a.centLat, a.centLng) -
      dist(depot.lat, depot.lng, b.centLat, b.centLng)
    );
    planned.forEach((r, i) => { r.routeIndex = i + 1; });

    const actualMerged = currentCount - planned.length;

    return NextResponse.json({
      depot,
      totalStops:    stops.length,
      totalPackages: planned.reduce((s, r) => s + r.packages, 0),
      totalEstMiles: planned.reduce((s, r) => s + r.estMiles, 0),
      routeCount:    planned.length,
      originalRouteCount: currentCount,
      merged:        actualMerged,
      cappedAt:      actualMerged < currentCount - driverCount
        ? `Could only cut ${actualMerged} — cube capacity would be exceeded`
        : null,
      routes: planned,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
