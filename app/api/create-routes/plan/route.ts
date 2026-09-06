export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droStops, droAnchorAreas, droRoutes, settings } from "@/lib/schema";
import { isNotNull, eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

// DRO uses 85% of vehicle capacity as the load threshold (same as GroundSwell maxThresholdNormalized)
const LOAD_THRESHOLD = 0.85;
// Hard stop cap as a secondary safety net
const MAX_STOPS = 150;
// Minimum stops per route (Zirconia is exempt · it runs its own isolated area)
const MIN_STOPS = 80;

const isZirconia = (name: string) => name.toLowerCase().includes("zirconia");

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

// ── Nearest-neighbor TSP (haversine fallback) ─────────────────────────────────
function nearestNeighbor<T extends { lat: number; lng: number }>(
  stops: T[],
  depot: { lat: number; lng: number }
): T[] {
  if (stops.length === 0) return [];
  const unvisited = [...stops];
  const ordered: T[] = [];
  let cur: { lat: number; lng: number } = depot;
  while (unvisited.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
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

// ── 2-opt improvement pass (haversine fallback) ───────────────────────────────
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
        const a   = i === 0 ? depot : route[i - 1];
        const nxt = j + 1 < route.length ? route[j + 1] : depot;
        const dBefore = dist(a.lat, a.lng, route[i].lat, route[i].lng) + dist(route[j].lat, route[j].lng, nxt.lat, nxt.lng);
        const dAfter  = dist(a.lat, a.lng, route[j].lat, route[j].lng) + dist(route[i].lat, route[i].lng, nxt.lat, nxt.lng);
        if (dAfter < dBefore - 0.0001) {
          route = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return route;
}

// ── OSRM drive-time matrix ────────────────────────────────────────────────────
// Returns matrix[i][j] = drive seconds from point i to point j.
// Points[0] is always the depot; 1..n are stops in order.
async function getOsrmMatrix(points: { lat: number; lng: number }[]): Promise<number[][] | null> {
  try {
    const coords = points.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json() as { code?: string; durations?: (number | null)[][] };
    if (data.code !== "Ok" || !data.durations) return null;
    // Replace null values (unreachable) with large fallback
    return data.durations.map(row =>
      row.map(v => (v == null || v < 0) ? 999999 : v)
    );
  } catch {
    return null;
  }
}

// ── Nearest-neighbor using matrix (index-based) ───────────────────────────────
function nnByMatrix(candidates: number[], startIdx: number, matrix: number[][]): number[] {
  const unvisited = [...candidates];
  const ordered: number[] = [];
  let cur = startIdx;
  while (unvisited.length > 0) {
    let bestPos = 0, bestTime = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const t = matrix[cur]?.[unvisited[i]] ?? Infinity;
      if (t < bestTime) { bestTime = t; bestPos = i; }
    }
    const next = unvisited.splice(bestPos, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

// ── 2-opt using matrix (index-based) ─────────────────────────────────────────
function twoOptByMatrix(route: number[], depotIdx: number, matrix: number[][]): number[] {
  if (route.length < 4) return route;
  let r = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < r.length - 1; i++) {
      for (let j = i + 2; j < r.length; j++) {
        const a   = i === 0 ? depotIdx : r[i - 1];
        const nxt = j + 1 < r.length ? r[j + 1] : depotIdx;
        const before = (matrix[a]?.[r[i]] ?? 0) + (matrix[r[j]]?.[nxt] ?? 0);
        const after  = (matrix[a]?.[r[j]] ?? 0) + (matrix[r[i]]?.[nxt] ?? 0);
        if (after < before - 0.01) {
          r = [...r.slice(0, i), ...r.slice(i, j + 1).reverse(), ...r.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return r;
}

// ── Sequence: OSRM drive-time primary, haversine fallback ─────────────────────
async function sequenceRoute<T extends { lat: number; lng: number; isBulkStop: boolean }>(
  stops: T[],
  depot: { lat: number; lng: number }
): Promise<T[]> {
  const regular = stops.filter(s => !s.isBulkStop);
  const bulk    = stops.filter(s => s.isBulkStop);

  // Build point list: [depot=0, ...regular=1..r, ...bulk=r+1..r+b]
  const points  = [depot, ...regular, ...bulk];
  const matrix  = await getOsrmMatrix(points);

  if (matrix) {
    const DEPOT       = 0;
    const regIdxs     = regular.map((_, i) => i + 1);
    const bulkIdxs    = bulk.map((_, i) => regular.length + 1 + i);

    const orderedReg  = twoOptByMatrix(nnByMatrix(regIdxs, DEPOT, matrix), DEPOT, matrix);
    const lastReg     = orderedReg.length > 0 ? orderedReg[orderedReg.length - 1] : DEPOT;
    const orderedBulk = nnByMatrix(bulkIdxs, lastReg, matrix);

    return [
      ...orderedReg.map(i => points[i] as T),
      ...orderedBulk.map(i => points[i] as T),
    ];
  }

  // Haversine fallback
  const optimized   = twoOpt(nearestNeighbor(regular, depot), depot);
  const bulkStart   = optimized.length > 0 ? optimized[optimized.length - 1] : depot;
  const bulkOrdered = nearestNeighbor(bulk, bulkStart);
  return [...optimized, ...bulkOrdered];
}

// ── EPSG:3857 → WGS84 ────────────────────────────────────────────────────────
function merc2ll(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lng, lat];
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as { driverCount?: number; activeWorkAreaNames?: string[] };
    // Support both old (driverCount) and new (activeWorkAreaNames) call shapes
    const activeWorkAreaNames: string[] | null = body.activeWorkAreaNames ?? null;
    const driverCount: number = body.driverCount ?? (activeWorkAreaNames?.length ?? 0);

    // Depot from settings, default to FedEx Ground Fletcher NC station
    const depotLatRow = await db.select().from(settings).where(and(eq(settings.key, "depot_lat"), eq(settings.organizationId, session.organizationId))).then(r => r[0]);
    const depotLngRow = await db.select().from(settings).where(and(eq(settings.key, "depot_lng"), eq(settings.organizationId, session.organizationId))).then(r => r[0]);
    const depot = {
      lat: parseFloat(depotLatRow?.value ?? "35.4210"),
      lng: parseFloat(depotLngRow?.value ?? "-82.5022"),
    };

    // Pull vehicle capacities from DRO route plans (keyed by work area name)
    const droRouteRows = await db.select({
      workAreaName:    droRoutes.workAreaName,
      vehicleCapacity: droRoutes.vehicleCapacity,
    }).from(droRoutes).where(eq(droRoutes.organizationId, session.organizationId));

    const capacityMap: Record<string, number> = {};
    for (const r of droRouteRows) {
      const cap = parseFloat(r.vehicleCapacity);
      if (!isNaN(cap) && cap > 0) capacityMap[r.workAreaName.trim()] = cap;
    }

    // Fallback capacity · guard against Math.min(...[]) = Infinity when all caps empty
    const capValues = Object.values(capacityMap).filter(v => v > 0);
    const rawMin = capValues.length > 0 ? Math.min(...capValues) : Infinity;
    const defaultCapacity = isFinite(rawMin) && rawMin > 0 ? rawMin : 300;

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
    }).from(droStops).where(and(isNotNull(droStops.lat), eq(droStops.organizationId, session.organizationId)));

    const stops = rawStops.filter(s => s.lat != null && s.lng != null) as Stop[];
    if (stops.length === 0) {
      return NextResponse.json({ error: "No stops with coordinates. Run DRO sync first." }, { status: 400 });
    }

    // Pull anchor area polygons (wktPoly preferred, shapeJson EPSG:3857 rings as fallback)
    const anchorAreaRows = await db.select({
      name:      droAnchorAreas.name,
      wktPoly:   droAnchorAreas.wktPoly,
      shapeJson: droAnchorAreas.shapeJson,
    }).from(droAnchorAreas).where(eq(droAnchorAreas.organizationId, session.organizationId));

    const parsedAreas: { name: string; poly: [number, number][]; centLat: number; centLng: number }[] =
      anchorAreaRows.flatMap(a => {
        let poly: [number, number][] | null = null;
        if (a.wktPoly) {
          try { poly = parseWkt(a.wktPoly); } catch {}
        }
        if (!poly && a.shapeJson) {
          try {
            const shape = JSON.parse(a.shapeJson);
            const ring = (shape.rings?.[0] ?? []) as number[][];
            if (ring.length > 2) poly = ring.map(([x, y]) => merc2ll(x, y));
          } catch {}
        }
        if (!poly || poly.length < 3) return [];
        // Compute centroid of polygon vertices (lng,lat pairs)
        const centLng = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const centLat = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        return [{ name: a.name, poly, centLat, centLng }];
      });

    // ── Step 1: Group stops by actualRoute ───────────────────────────────────
    const groups: Map<string, Stop[]> = new Map();
    for (const s of stops) {
      const key = s.actualRoute?.trim() || "";
      if (key) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
      }
    }

    // Planning-window fallback: if no stops have actualRoute yet (pre-solve),
    // seed empty groups from dro_routes so unrouted stops have targets.
    if (groups.size === 0) {
      for (const r of droRouteRows) {
        const name = r.workAreaName?.trim();
        if (name) groups.set(name, []);
      }
    }

    // ── Step 2: Assign unrouted stops ────────────────────────────────────────
    const unrouted   = stops.filter(s => !s.actualRoute?.trim());
    const groupNames = [...groups.keys()];

    // getCentroid falls back to the anchor area centroid when a group is empty (planning window)
    const getCentroid = (name: string) => {
      const g = groups.get(name)!;
      if (g.length > 0) return centroid(g.map(s => ({ lat: s.lat, lng: s.lng })));
      // Try to find a matching anchor area centroid as a warm seed
      for (const area of parsedAreas) {
        if (name.toLowerCase().includes(area.name.toLowerCase().slice(0, 6)) ||
            area.name.toLowerCase().includes(name.toLowerCase().replace(/^742\s*/i, "").slice(0, 6))) {
          return { lat: area.centLat, lng: area.centLng };
        }
      }
      return { lat: depot.lat, lng: depot.lng };
    };

    for (const s of unrouted) {
      if (groupNames.length === 0) continue;

      // If stop falls inside an anchor area polygon, assign to the group
      // whose centroid is geographically closest to that anchor area's centroid
      let assigned = "";
      for (const area of parsedAreas) {
        if (pointInPolygon(s.lat, s.lng, area.poly)) {
          let bestName = groupNames[0];
          let bestDist = Infinity;
          for (const name of groupNames) {
            const c = getCentroid(name);
            const d = dist(area.centLat, area.centLng, c.lat, c.lng);
            if (d < bestDist) { bestDist = d; bestName = name; }
          }
          assigned = bestName;
          break;
        }
      }

      // Fallback: nearest group centroid to the stop itself
      if (!assigned) {
        let bestName = groupNames[0];
        let bestDist = Infinity;
        for (const name of groupNames) {
          const c = getCentroid(name);
          const d = dist(s.lat, s.lng, c.lat, c.lng);
          if (d < bestDist) { bestDist = d; bestName = name; }
        }
        assigned = bestName;
      }

      groups.get(assigned)!.push(s);
    }

    // ── Step 3: Build RouteGroup with cube totals and capacity ───────────────
    let routeGroups: RouteGroup[] = [...groups.entries()].map(([name, stps]) => {  // eslint-disable-line prefer-const
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

    // ── Step 3b: If specific work areas were chosen, redistribute inactive routes ──
    // Stops from inactive routes go to the nearest active route by centroid distance.
    if (activeWorkAreaNames && activeWorkAreaNames.length > 0) {
      const activeSet = new Set(activeWorkAreaNames.map(n => n.trim().toLowerCase()));
      const activeGroups   = routeGroups.filter(rg => activeSet.has(rg.name.trim().toLowerCase()));
      const inactiveGroups = routeGroups.filter(rg => !activeSet.has(rg.name.trim().toLowerCase()));

      for (const inactive of inactiveGroups) {
        for (const s of inactive.stops) {
          if (activeGroups.length === 0) break;
          // Find nearest active route centroid
          let bestGroup = activeGroups[0];
          let bestDist  = Infinity;
          for (const ag of activeGroups) {
            const d = dist(s.lat, s.lng, ag.centLat, ag.centLng);
            if (d < bestDist) { bestDist = d; bestGroup = ag; }
          }
          bestGroup.stops.push(s);
          bestGroup.totalCube += s.totalCube ?? 0;
          const c = centroid(bestGroup.stops.map(st => ({ lat: st.lat, lng: st.lng })));
          bestGroup.centLat = c.lat; bestGroup.centLng = c.lng;
        }
      }

      routeGroups = activeGroups;
    }

    // ── Step 4: Merge to reach driverCount · cube-cap + stop-cap aware ───────
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

    // ── Step 4b: Enforce minimum stop count (80) via border redistribution ──────
    // For each non-Zirconia route under MIN_STOPS, pull border stops from its
    // closest neighbor · specifically the stops nearest to the shared boundary
    // (closest to the receiving route's centroid from that neighbor only).
    // Zirconia never donates.
    {
      const needsTopUp = () => routeGroups.find(rg => !isZirconia(rg.name) && rg.stops.length < MIN_STOPS);
      let underMin = needsTopUp();
      let guard = routeGroups.length * MIN_STOPS;

      while (underMin && guard-- > 0) {
        // Rank eligible neighbors by centroid distance (closest border first)
        const neighbors = routeGroups
          .filter(rg => rg !== underMin && !isZirconia(rg.name) && rg.stops.length > MIN_STOPS)
          .sort((a, b) =>
            dist(underMin!.centLat, underMin!.centLng, a.centLat, a.centLng) -
            dist(underMin!.centLat, underMin!.centLng, b.centLat, b.centLng)
          );

        let moved = false;
        for (const donor of neighbors) {
          // From this specific neighbor, take the stop closest to underMin's centroid
          // (= the stop sitting on the shared border between the two routes)
          let borderStop: Stop | null = null;
          let borderDist = Infinity;
          for (const s of donor.stops) {
            const d = dist(underMin.centLat, underMin.centLng, s.lat, s.lng);
            if (d < borderDist) { borderDist = d; borderStop = s; }
          }
          if (!borderStop) continue;

          // Transfer the border stop
          donor.stops = donor.stops.filter(s => s !== borderStop);
          donor.totalCube -= borderStop.totalCube ?? 0;
          const dc = centroid(donor.stops.map(s => ({ lat: s.lat, lng: s.lng })));
          donor.centLat = dc.lat; donor.centLng = dc.lng;

          underMin.stops.push(borderStop);
          underMin.totalCube += borderStop.totalCube ?? 0;
          const uc = centroid(underMin.stops.map(s => ({ lat: s.lat, lng: s.lng })));
          underMin.centLat = uc.lat; underMin.centLng = uc.lng;

          moved = true;
          break; // one stop at a time · re-evaluate after each move
        }

        if (!moved) break; // no neighbor could help
        if (underMin.stops.length >= MIN_STOPS) underMin = needsTopUp();
      }
    }

// ── Step 5: Sequence each route (OSRM drive-time, all routes in parallel) ──
    const planned = await Promise.all(routeGroups.map(async (rg, idx) => {
      const sequenced = await sequenceRoute(rg.stops, depot);
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
    }));

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
        ? `Could only cut ${actualMerged} · cube capacity would be exceeded`
        : null,
      routes: planned,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
