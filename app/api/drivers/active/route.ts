import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { and, eq, asc } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });
  const rows = await db
    .select({ driver_id: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.active, true)))
    .orderBy(asc(drivers.name));
  return NextResponse.json(rows);
}
