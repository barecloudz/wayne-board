/**
 * GET  /api/anchor-editor?wan=0326        — anchor areas + stops for a work area
 * POST /api/anchor-editor                 — create new anchor area in DRO
 * DELETE /api/anchor-editor?id=123        — delete anchor area from DRO
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getDroHeaders } from "@/lib/dro-client";

const DRO_BASE = "https://dro.routesmart.com";
const SA_ID = "3060743";

// WGS84 → EPSG:3857
function ll2merc(lat: number, lng: number): [number, number] {
  const x = (lng / 180) * 20037508.34;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / Math.PI * 20037508.34;
  return [x, y];
}

// EPSG:3857 → WGS84
function merc2ll(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}

function rings3857ToLatLng(rings: number[][][]): [number, number][][] {
  return rings.map(ring => ring.map(([x, y]) => merc2ll(x, y)));
}

export async function GET(req: NextRequest) {
  try {
    const wan = req.nextUrl.searchParams.get("wan");
    const headers = await getDroHeaders();

    // Fetch all anchor areas from DRO
    const areasRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers });
    const areasText = await areasRes.text();
    let areasRaw: any[];
    try { areasRaw = areasText ? JSON.parse(areasText) : []; }
    catch { throw new Error(`DRO anchor-area returned non-JSON (HTTP ${areasRes.status}): ${areasText.slice(0, 200)}`); }

    const areas = areasRaw.map((a: any) => {
      const shape = typeof a.shape === "string" ? JSON.parse(a.shape) : (a.shape ?? {});
      const rings = shape?.rings ?? [];
      return {
        anchorAreaId: a.anchorAreaId,
        name: a.name,
        rings: rings3857ToLatLng(rings), // WGS84 for Leaflet
        rings3857: rings,                // EPSG:3857 for DRO
      };
    });

    return NextResponse.json({ areas });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { name: string, latlngs: [number, number][] }
    const { name, latlngs } = body;
    if (!name || !latlngs?.length) {
      return NextResponse.json({ error: "name and latlngs required" }, { status: 400 });
    }

    // Convert WGS84 → EPSG:3857 ring
    const ring = latlngs.map(([lat, lng]: [number, number]) => ll2merc(lat, lng));
    // Close the ring
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0]);
    }

    const shapeJson = JSON.stringify({
      spatialReference: { latestWkid: 3857, wkid: 102100 },
      rings: [ring],
    });

    const headers = await getDroHeaders();
    const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ServiceAreaId: parseInt(SA_ID), Name: name, Station: "", Shape: shapeJson }),
    });

    const text = await res.text();
    // Response is "id: 12345678"
    const newId = parseInt(text.replace("id:", "").trim());

    return NextResponse.json({ success: res.ok, anchorAreaId: newId, status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const headers = await getDroHeaders();
    const body = JSON.stringify({ AnchorAreaId: parseInt(id) });

    // First try without forceDelete
    const check = await fetch(`${DRO_BASE}/api/api/anchor-areas/Deleteanchor-areasvalidated`, {
      method: "DELETE", headers, body,
    });

    if (check.status === 409) {
      // Assigned to route plans — force delete
      const force = await fetch(`${DRO_BASE}/api/api/anchor-areas/Deleteanchor-areasvalidated?forceDelete=true`, {
        method: "DELETE", headers, body,
      });
      return NextResponse.json({ success: force.ok, forced: true, status: force.status });
    }

    return NextResponse.json({ success: check.ok, forced: false, status: check.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
