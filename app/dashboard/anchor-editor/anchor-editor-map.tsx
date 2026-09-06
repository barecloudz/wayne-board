"use client";

import {
  MapContainer, TileLayer, CircleMarker, Polygon, Polyline, Tooltip, useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type Stop = {
  stopNum: string;
  sid: string;
  pkgs: number;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
};

export type DroArea = {
  anchorAreaId: number;
  name: string;
  rings: [number, number][][]; // WGS84 [lat, lng]
};

export type DrawnArea = {
  tempId: string;
  anchorAreaId: number | null;
  name: string;
  points: [number, number][]; // closed ring
  color: string;
};

// SID 1000→block1 red, 2000→orange, etc.
const SID_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#06b6d4",
  6: "#3b82f6",
  7: "#8b5cf6",
  8: "#ec4899",
  9: "#a16207",
};

export function sidBlock(sid: string): number {
  const n = parseInt(sid);
  if (isNaN(n)) return 0;
  return Math.floor(n / 1000);
}

export function sidColor(sid: string): string {
  return SID_COLORS[sidBlock(sid)] ?? "#94a3b8";
}

const DRAWN_COLORS = [
  "#2563eb", "#16a34a", "#9333ea", "#dc2626", "#0891b2",
  "#d97706", "#059669", "#7c3aed", "#be185d", "#0369a1",
];
export function drawnColor(idx: number): string {
  return DRAWN_COLORS[idx % DRAWN_COLORS.length];
}

// Point-in-polygon ray casting
function pip(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function stopsInsideRing(stops: Stop[], ring: [number, number][]): Stop[] {
  return stops.filter(s => s.lat != null && s.lng != null && pip(s.lat!, s.lng!, ring));
}

type Props = {
  stops: Stop[];
  droAreas: DroArea[];
  drawnAreas: DrawnArea[];
  draftPoints: [number, number][];
  drawMode: boolean;
  onMapClick: (lat: number, lng: number) => void;
  hoveredAreaId: number | null;
  onAreaHover: (id: number | null) => void;
};

function ClickHandler({ drawMode, onMapClick }: { drawMode: boolean; onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (drawMode) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AnchorEditorMap({
  stops, droAreas, drawnAreas, draftPoints, drawMode, onMapClick, hoveredAreaId, onAreaHover,
}: Props) {
  const withCoords = stops.filter(s => s.lat != null && s.lng != null);

  return (
    <div className={`w-full h-full ${drawMode ? "cursor-crosshair" : ""}`}
      style={drawMode ? { cursor: "crosshair" } : {}}>
      <MapContainer
        center={[35.415, -82.345]}
        zoom={13}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <ClickHandler drawMode={drawMode} onMapClick={onMapClick} />

        {/* Existing DRO anchor areas · dashed outlines */}
        {droAreas.map(area => (
          area.rings[0] && (
            <Polygon
              key={area.anchorAreaId}
              positions={area.rings[0]}
              pathOptions={{
                color: "#000",
                weight: hoveredAreaId === area.anchorAreaId ? 3 : 1.5,
                opacity: hoveredAreaId === area.anchorAreaId ? 0.9 : 0.4,
                fillColor: "#000",
                fillOpacity: hoveredAreaId === area.anchorAreaId ? 0.06 : 0.02,
                dashArray: "6 4",
              }}
              eventHandlers={{
                mouseover: () => onAreaHover(area.anchorAreaId),
                mouseout: () => onAreaHover(null),
              }}
            >
              <Tooltip sticky>{area.name}</Tooltip>
            </Polygon>
          )
        ))}

        {/* Newly drawn areas (saved this session) */}
        {drawnAreas.map((a, idx) => (
          a.anchorAreaId != null && (
            <Polygon
              key={a.tempId}
              positions={a.points}
              pathOptions={{
                color: drawnColor(idx),
                weight: 2,
                opacity: 0.85,
                fillColor: drawnColor(idx),
                fillOpacity: 0.18,
              }}
            >
              <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none">
                <span className="text-[11px] font-bold" style={{ color: drawnColor(idx) }}>{a.name}</span>
              </Tooltip>
            </Polygon>
          )
        ))}

        {/* Draft polygon being drawn */}
        {draftPoints.length >= 2 && (
          <Polyline
            positions={draftPoints}
            pathOptions={{ color: "#16a34a", weight: 2, dashArray: "5 4" }}
          />
        )}
        {/* Draft closing line back to first vertex */}
        {draftPoints.length >= 3 && (
          <Polyline
            positions={[draftPoints[draftPoints.length - 1], draftPoints[0]]}
            pathOptions={{ color: "#16a34a", weight: 1.5, dashArray: "3 4", opacity: 0.5 }}
          />
        )}
        {/* Draft vertices */}
        {draftPoints.map(([lat, lng], i) => (
          <CircleMarker
            key={i}
            center={[lat, lng]}
            radius={i === 0 ? 6 : 4}
            pathOptions={{
              color: "#16a34a",
              fillColor: i === 0 ? "#16a34a" : "#fff",
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}

        {/* Stop dots colored by SID block */}
        {withCoords.map(stop => (
          <CircleMarker
            key={stop.stopNum}
            center={[stop.lat!, stop.lng!]}
            radius={5}
            pathOptions={{
              color: "#fff",
              weight: 1,
              fillColor: sidColor(stop.sid),
              fillOpacity: 0.9,
            }}
          >
            <Tooltip>
              <div className="text-xs">
                <div className="font-bold">#{stop.stopNum} · SID {stop.sid}</div>
                <div>{stop.address}</div>
                <div className="text-slate-400">{stop.pkgs} pkg{stop.pkgs !== 1 ? "s" : ""}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
