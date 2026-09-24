import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { deleteFromR2 } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "driver") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { driverId } = await req.json() as { driverId?: string };
  if (!driverId) return NextResponse.json({ error: "Missing driverId" }, { status: 400 });

  const [driver] = await db
    .select({ avatarUrl: drivers.avatarUrl })
    .from(drivers)
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, driverId)))
    .limit(1);
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  if (driver.avatarUrl) {
    // Extract key from URL: strip PUBLIC_URL prefix
    const publicUrl = process.env.R2_PUBLIC_URL ?? "";
    const key = driver.avatarUrl.replace(`${publicUrl}/`, "");
    try { await deleteFromR2(key); } catch { /* already gone */ }
  }

  await db
    .update(drivers)
    .set({ avatarUrl: null })
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, driverId)));

  return NextResponse.json({ ok: true });
}
