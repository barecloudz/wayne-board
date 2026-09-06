import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gcNameMappings, gcRouteDays } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;

  const { gcName, driverId } = await req.json();
  if (!gcName || !driverId) return NextResponse.json({ error: "gcName and driverId required" }, { status: 400 });

  // Save the mapping (upsert)
  await db.insert(gcNameMappings)
    .values({ organizationId: orgId, gcName, driverId })
    .onConflictDoUpdate({
      target: [gcNameMappings.organizationId, gcNameMappings.gcName],
      set: { driverId },
    });

  // Backfill all existing route-days with this GC name
  await db.update(gcRouteDays)
    .set({ driverId })
    .where(and(eq(gcRouteDays.organizationId, orgId), eq(gcRouteDays.driverName, gcName)));

  return NextResponse.json({ ok: true });
}
