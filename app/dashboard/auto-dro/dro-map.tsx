"use client";

import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip } from "react-leaflet";
import { Layers, Circle, Settings, X } from "lucide-react";
import "leaflet/dist/leaflet.css";

// ── GroundSwell hex codes per work area number ─────────────────────────────────
const GS_HEX: Record<string, string> = {
  "0211": "#9b1b9d", "0247": "#F032E6", "0255": "#AA6E28", "0275": "#E6194B",
  "0314": "#AA6E28", "0326": "#808000", "0351": "#E6BEFF", "0354": "#AAFFC3",
  "0418": "#73ff00", "0426": "#3CB44B", "0442": "#F58231", "0446": "#E6194B",
  "0454": "#F58231", "0470": "#3CB44B", "5104": "#911EB4", "5108": "#E6194B",
  "7757": "#1a1a1a", "7763": "#0082C8", "7764": "#0082C8", "7773": "#911EB4",
  "7779": "#808000", "7783": "#00ff11", "910":  "#00ff11",
};

const FALLBACK_COLORS = [
  "#E91E8C","#9C27B0","#3F51B5","#2196F3","#00897B",
  "#43A047","#9E9D24","#F57C00","#E53935","#795548",
];

function routeColor(wan: string, idx: number): string {
  if (GS_HEX[wan]) return GS_HEX[wan];
  if (GS_HEX[wan.padStart(4, "0")]) return GS_HEX[wan.padStart(4, "0")];
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// ── Parse WKT POLYGON to Leaflet [lat, lng] ring ──────────────────────────────
function parseWkt(wkt: string): [number, number][] {
  const inner = wkt.replace(/^POLYGON \(\(/, "").replace(/\)\)$/, "");
  return inner.split(", ").map(pt => {
    const [lng, lat] = pt.trim().split(" ").map(Number);
    return [lat, lng] as [number, number];
  });
}

// ── Convert EPSG:3857 → WGS84 (fallback for areas without WKT) ───────────────
function merc2ll(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}

// ── Types ──────────────────────────────────────────────────────────────────────
type AnchorArea = {
  anchorAreaId: number;
  name: string;
  shapeJson: string;
  enabledRoutePlans: string;
  wktPoly?: string | null;
  hexCode?: string | null;
};
type StopCoord = { lat: number | null; lng: number | null; actualRoute: string; workAreaNumber: string };
type Route     = { workAreaName: string; workAreaNumber: string };

// ── Component ──────────────────────────────────────────────────────────────────
export default function DroMap({
  anchorAreas,
  stopCoords,
  routes,
}: {
  anchorAreas: AnchorArea[];
  stopCoords:  StopCoord[];
  routes:      Route[];
}) {
  const [showTerritories, setShowTerritories] = useState(true);
  const [showStops,       setShowStops]       = useState(true);
  const [showSettings,    setShowSettings]    = useState(false);

  // Build workAreaNumber → color
  const routeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    routes.forEach((r, i) => { map[r.workAreaNumber] = routeColor(r.workAreaNumber, i); });
    return map;
  }, [routes]);

  // Parse anchor areas · prefer WKT (WGS84) over EPSG:3857 rings
  const polygons = useMemo(() => {
    return anchorAreas.flatMap(a => {
      // Use stored hexCode if available; otherwise color by workAreaNumber
      const color = a.hexCode ?? "#94a3b8";

      // Prefer WKT polygon (already WGS84)
      if (a.wktPoly) {
        try {
          const ring = parseWkt(a.wktPoly);
          if (ring.length > 2) {
            return [{ name: a.name, ring, color, anchorAreaId: a.anchorAreaId }];
          }
        } catch {}
      }

      // Fallback: EPSG:3857 rings from shapeJson
      try {
        const shape = JSON.parse(a.shapeJson);
        return (shape.rings ?? [])
          .map((ring: number[][]) => ring.map((pt: number[]) => merc2ll(pt[0], pt[1])))
          .filter((ring: [number, number][]) => ring.length > 2)
          .map((ring: [number, number][]) => ({ name: a.name, ring, color, anchorAreaId: a.anchorAreaId }));
      } catch {}

      return [];
    });
  }, [anchorAreas]);

  // Colored stop dots
  const dots = useMemo(() => stopCoords
    .filter(s => s.lat != null && s.lng != null)
    .map(s => ({
      lat:   s.lat as number,
      lng:   s.lng as number,
      color: routeColorMap[s.workAreaNumber] ?? "#94a3b8",
    })),
  [stopCoords, routeColorMap]);

  const center: [number, number] = [35.435, -82.50];

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} className="rounded-xl">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showTerritories && polygons.map((poly, i) => (
          <Polygon
            key={`${poly.anchorAreaId}-${i}`}
            positions={poly.ring}
            pathOptions={{ color: poly.color, fillColor: poly.color, fillOpacity: 0.28, weight: 1.5, opacity: 0.85 }}
          >
            <Tooltip sticky>
              <span className="font-semibold text-xs">{poly.name}</span>
            </Tooltip>
          </Polygon>
        ))}

        {showStops && dots.map((d, i) => (
          <CircleMarker
            key={i}
            center={[d.lat, d.lng]}
            radius={3}
            pathOptions={{ color: d.color, fillColor: d.color, fillOpacity: 0.85, weight: 0 }}
          />
        ))}
      </MapContainer>

      {/* ── Map overlay controls ───────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        <button
          onClick={() => setShowSettings(v => !v)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg shadow-md border text-sm font-medium transition-all
            ${showSettings ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          title="Map settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowTerritories(v => !v)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg shadow-md border text-sm font-medium transition-all
            ${showTerritories ? "bg-white text-slate-800 border-slate-200" : "bg-white text-slate-300 border-slate-200 hover:bg-slate-50"}`}
          title={showTerritories ? "Hide territories" : "Show territories"}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowStops(v => !v)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg shadow-md border text-sm font-medium transition-all
            ${showStops ? "bg-white text-slate-800 border-slate-200" : "bg-white text-slate-300 border-slate-200 hover:bg-slate-50"}`}
          title={showStops ? "Hide stops" : "Show stops"}
        >
          <Circle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Settings panel ────────────────────────────────────────────────── */}
      {showSettings && (
        <div className="absolute top-3 right-14 z-[1000] bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-56">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-extrabold text-slate-900 uppercase tracking-widest">Map Layers</p>
            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-[12px] font-semibold text-slate-700">Territories</p>
                <p className="text-[10px] text-slate-400">Route anchor areas</p>
              </div>
              <button
                onClick={() => setShowTerritories(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                  transition-colors ${showTerritories ? "bg-slate-900" : "bg-slate-200"}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition
                  ${showTerritories ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-[12px] font-semibold text-slate-700">Stop Dots</p>
                <p className="text-[10px] text-slate-400">Individual delivery stops</p>
              </div>
              <button
                onClick={() => setShowStops(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                  transition-colors ${showStops ? "bg-slate-900" : "bg-slate-200"}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition
                  ${showStops ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
          </div>

          {/* Route color legend */}
          {routes.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Routes</p>
              <div className="flex flex-col gap-1">
                {routes.map((r, i) => (
                  <div key={r.workAreaNumber} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: routeColor(r.workAreaNumber, i) }} />
                    <p className="text-[10px] text-slate-600 truncate">{r.workAreaName || r.workAreaNumber}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
