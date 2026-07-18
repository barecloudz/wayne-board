"use client";

import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip } from "react-leaflet";
import { X } from "lucide-react";
import "leaflet/dist/leaflet.css";

// ── Slot color palette ─────────────────────────────────────────────────────────
const SLOT_COLORS: Record<number, string> = {
  1:  "#E53935",
  2:  "#F57C00",
  3:  "#FBC02D",
  4:  "#388E3C",
  5:  "#0097A7",
  6:  "#1976D2",
  7:  "#7B1FA2",
  8:  "#C2185B",
  9:  "#5D4037",
  10: "#455A64",
  11: "#00796B",
  12: "#F06292",
  13: "#689F38",
};

function slotColor(slot: number): string {
  return SLOT_COLORS[slot] ?? "#94a3b8";
}

// ── Parse WKT POLYGON → Leaflet [lat, lng] ring ───────────────────────────────
function parseWkt(wkt: string): [number, number][] {
  const inner = wkt.replace(/^POLYGON \(\(/, "").replace(/\)\)$/, "");
  return inner.split(", ").map((pt) => {
    const [lng, lat] = pt.trim().split(" ").map(Number);
    return [lat, lng] as [number, number];
  });
}

// ── EPSG:3857 → WGS84 ─────────────────────────────────────────────────────────
function merc2ll(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const lat =
    (180 / Math.PI) *
    (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}

// ── Types ──────────────────────────────────────────────────────────────────────
export type MapArea = {
  id: number;
  anchor_area_name: string;
  route_slot: number;
  route_label: string;
  shape_json: string;
  wkt_poly: string | null;
};

export type RouteSlot = {
  slot: number;
  label: string;
  work_area_number: string;
};

type Props = {
  areas: MapArea[];
  routes: RouteSlot[];
  onReassign: (
    areaId: number,
    newSlot: number,
    newLabel: string,
    newWorkAreaNumber: string
  ) => void;
  highlightedAreas?: Set<string>;
  proposalMap?: Map<string, { from: string; to: string }>;
  areaStops?: Record<string, number>;
};

// ── Parsed polygon shape ───────────────────────────────────────────────────────
type ParsedPoly = {
  areaId: number;
  name: string;
  route_slot: number;
  route_label: string;
  ring: [number, number][];
};

function parseAreaPolygons(areas: MapArea[]): ParsedPoly[] {
  return areas.flatMap((a) => {
    // Prefer WKT
    if (a.wkt_poly) {
      try {
        const ring = parseWkt(a.wkt_poly);
        if (ring.length > 2) {
          return [
            {
              areaId: a.id,
              name: a.anchor_area_name,
              route_slot: a.route_slot,
              route_label: a.route_label,
              ring,
            },
          ];
        }
      } catch {}
    }

    // Fallback: EPSG:3857 rings from shape_json
    try {
      const raw =
        typeof a.shape_json === "string" ? JSON.parse(a.shape_json) : a.shape_json;
      return (raw.rings ?? [])
        .map((ring: number[][]) =>
          ring.map((pt: number[]) => merc2ll(pt[0], pt[1]))
        )
        .filter((ring: [number, number][]) => ring.length > 2)
        .map((ring: [number, number][]) => ({
          areaId: a.id,
          name: a.anchor_area_name,
          route_slot: a.route_slot,
          route_label: a.route_label,
          ring,
        }));
    } catch {}

    return [];
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function RoutePlannerMap({ areas, routes, onReassign, highlightedAreas, proposalMap, areaStops }: Props) {
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [moveToSlot, setMoveToSlot] = useState<string>("");

  const polygons = useMemo(() => parseAreaPolygons(areas), [areas]);

  const selectedArea = selectedAreaId != null
    ? areas.find((a) => a.id === selectedAreaId) ?? null
    : null;

  function handlePolygonClick(areaId: number) {
    setSelectedAreaId(areaId);
    setMoveToSlot("");
  }

  function handleConfirm() {
    if (!selectedArea || !moveToSlot) return;
    const target = routes.find((r) => r.slot === parseInt(moveToSlot, 10));
    if (!target) return;
    onReassign(selectedArea.id, target.slot, target.label, target.work_area_number);
    setSelectedAreaId(null);
    setMoveToSlot("");
  }

  const center: [number, number] = [35.435, -82.5];

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        className="rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {polygons.map((poly, i) => {
          const color = slotColor(poly.route_slot);
          const isSelected = selectedAreaId === poly.areaId;
          const isHighlighted = highlightedAreas?.has(poly.name) ?? false;
          const proposal = proposalMap?.get(poly.name);
          return (
            <Polygon
              key={`${poly.areaId}-${i}`}
              positions={poly.ring}
              pathOptions={
                isHighlighted
                  ? {
                      color: "#f59e0b",
                      fillColor: color,
                      fillOpacity: 0.35,
                      weight: 3,
                      opacity: 1,
                      dashArray: "8,4",
                    }
                  : {
                      color: isSelected ? "#ffffff" : color,
                      fillColor: color,
                      fillOpacity: isSelected ? 0.55 : 0.28,
                      weight: isSelected ? 2.5 : 1.5,
                      opacity: 0.9,
                    }
              }
              eventHandlers={{ click: () => handlePolygonClick(poly.areaId) }}
            >
              <Tooltip sticky>
                <span className="font-semibold text-xs">{poly.name}</span>
                <br />
                {isHighlighted && proposal ? (
                  <span className="text-[10px] text-amber-600 font-semibold">
                    Proposed: move to {proposal.to}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">
                    {poly.route_label}
                    {areaStops?.[poly.name] != null && (
                      <> · ~{areaStops[poly.name]} stops/day</>
                    )}
                  </span>
                )}
              </Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>

      {/* ── Area reassign panel ─────────────────────────────────────────────── */}
      {selectedArea && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-72">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                Anchor Area
              </p>
              <p className="text-[13px] font-extrabold text-slate-900 leading-tight">
                {selectedArea.anchor_area_name}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: slotColor(selectedArea.route_slot) }}
                />
                <p className="text-[11px] text-slate-500">{selectedArea.route_label}</p>
              </div>
            </div>
            <button
              onClick={() => { setSelectedAreaId(null); setMoveToSlot(""); }}
              className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Move to
            </label>
            <select
              value={moveToSlot}
              onChange={(e) => setMoveToSlot(e.target.value)}
              className="w-full text-[12px] font-semibold text-slate-800 bg-slate-50 border border-slate-200
                rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">— select route —</option>
              {routes
                .filter((r) => r.slot !== selectedArea.route_slot)
                .map((r) => (
                  <option key={r.slot} value={r.slot}>
                    Slot {r.slot} — {r.label}
                  </option>
                ))}
            </select>
          </div>

          <button
            onClick={handleConfirm}
            disabled={!moveToSlot}
            className="w-full py-2 rounded-lg text-[12px] font-bold tracking-wide transition-all
              bg-slate-900 text-white hover:bg-slate-700
              disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Confirm Move
          </button>
        </div>
      )}
    </div>
  );
}
