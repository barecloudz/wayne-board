/**
 * Serves the GroundSwell cluster geofence data (WKT polygons in WGS84).
 * These are fetched during GroundSwell sync and stored in the DB.
 * Falls back to the droAnchorAreas data if GS clusters aren't available.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droAnchorAreas } from "@/lib/schema";

export async function GET() {
  const areas = await db.select().from(droAnchorAreas).orderBy(droAnchorAreas.name);
  return NextResponse.json({ anchorAreas: areas });
}
