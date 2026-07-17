import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { droStops } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  const stops = await db
    .select({
      stopId:             droStops.stopId,
      firmName:           droStops.firmName,
      address:            droStops.address,
      city:               droStops.city,
      state:              droStops.state,
      postalCode:         droStops.postalCode,
      packages:           droStops.noPackages,
      isSmallStop:        droStops.isSmallStop,
      isHazardous:        droStops.isHazardous,
      isHeavyweight:      droStops.isHeavyweight,
      isCdoStop:          droStops.isCdoStop,
      reasonCode:         droStops.reasonCode,
      pickupType:         droStops.pickupType,
      windowOpen:         droStops.windowOpen,
      windowClose:        droStops.windowClose,
      overflowedRoute:    droStops.overflowedRoute,
      numLpPackages:      droStops.numLpPackages,
      lat:                droStops.lat,
      lng:                droStops.lng,
    })
    .from(droStops)
    .where(eq(droStops.actualRoute, ""))
    .orderBy(asc(droStops.postalCode));

  return NextResponse.json({ stops, count: stops.length });
}
