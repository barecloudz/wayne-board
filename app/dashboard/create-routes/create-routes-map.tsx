"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// ── Route colors ──────────────────────────────────────────────────────────────
const PALETTE = [
  "#E91E8C","#9C27B0","#3F51B5","#2196F3","#00897B",
  "#43A047","#F57C00","#E53935","#795548","#0082C8",
  "#73ff00","#F032E6","#AA6E28","#808000","#911EB4",
];

function routeColor(idx: number) {
  return PALETTE[idx % PALETTE.length];
}

// ── WKT → [lat,lng][] ────────────────────────────────────────────────────────
function parseWkt(wkt: string): [number, number][] {
  const inner = wkt.replace(/^POLYGON \(\(/, "").replace(/\)\)$/, "");
  return inner.split(", ").map(pt => {
    const [lng, lat] = pt.trim().split(" ").map(Number);
    return [lat, lng] as [number, number];
  });
}

function merc2ll(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}

// ── Types ─────────────────────────────────────────────────────────────────────
type AnchorArea = {
  anchorAreaId: number;
  name: string;
  shapeJson: string;
  wktPoly?: string | null;
  hexCode?: string | null;
};

type PlannedStop = {
  lat: number;
  lng: number;
  waypointId: string;
  address: string;
  packages: number;
};

type PlannedRoute = {
  routeIndex: number;
  name: string;
  stopCount: number;
  stops: PlannedStop[];
};

type PlanResult = {
  routes: PlannedRoute[];
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CreateRoutesMap({
  plan,
  anchorAreas,
  activeWorkAreas,
}: {
  plan: PlanResult;
  anchorAreas: AnchorArea[];
  activeWorkAreas: Set<string>;
}) {
  // Map route index → color
  const routeColors = useMemo(() =>
    Object.fromEntries(plan.routes.map((r, i) => [r.routeIndex, routeColor(i)])),
  [plan.routes]);

  // Parse anchor area polygons
  const polygons = useMemo(() => {
    return anchorAreas.flatMap(a => {
      const color = a.hexCode ?? "#94a3b8";

      if (a.wktPoly) {
        try {
          const ring = parseWkt(a.wktPoly);
          if (ring.length > 2) return [{ name: a.name, ring, color, id: a.anchorAreaId }];
        } catch {}
      }

      try {
        const shape = JSON.parse(a.shapeJson);
        return (shape.rings ?? [])
          .map((ring: number[][]) => ring.map((pt: number[]) => merc2ll(pt[0], pt[1])))
          .filter((ring: [number, number][]) => ring.length > 2)
          .map((ring: [number, number][]) => ({ name: a.name, ring, color, id: a.anchorAreaId }));
      } catch {}

      return [];
    });
  }, [anchorAreas]);

  // Flatten stops with their route color
  const dots = useMemo(() =>
    plan.routes.flatMap(r =>
      r.stops
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({
          lat:    s.lat,
          lng:    s.lng,
          color:  routeColors[r.routeIndex] ?? "#94a3b8",
          label:  `${r.name}: ${s.address}`,
          pkgs:   s.packages,
        }))
    ),
  [plan.routes, routeColors]);

  const center: [number, number] = [35.435, -82.50];

  return (
    <div className="relative w-full" style={{ height: 420 }}>
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} className="rounded-2xl overflow-hidden">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Anchor area territories */}
        {polygons.map((poly, i) => (
          <Polygon
            key={`${poly.id}-${i}`}
            positions={poly.ring}
            pathOptions={{ color: poly.color, fillColor: poly.color, fillOpacity: 0.22, weight: 1.5, opacity: 0.8 }}
          >
            <Tooltip sticky>
              <span className="text-xs font-semibold">{poly.name}</span>
            </Tooltip>
          </Polygon>
        ))}

        {/* Planned stop dots colored by route */}
        {dots.map((d, i) => (
          <CircleMarker
            key={i}
            center={[d.lat, d.lng]}
            radius={4}
            pathOptions={{ color: d.color, fillColor: d.color, fillOpacity: 0.9, weight: 0 }}
          >
            <Tooltip>
              <span className="text-xs">{d.label} · {d.pkgs} pkg{d.pkgs !== 1 ? "s" : ""}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Route color legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-3 py-2.5 max-h-48 overflow-y-auto">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Routes</p>
        <div className="flex flex-col gap-1">
          {plan.routes.map((r, i) => (
            <div key={r.routeIndex} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: routeColor(i) }} />
              <span className="text-[11px] text-slate-700 font-semibold">{r.name.replace(/^742\s*/i, "")}</span>
              <span className="text-[10px] text-slate-400 ml-auto pl-3">{r.stopCount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
