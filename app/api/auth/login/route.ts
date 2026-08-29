import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers, organizations } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { driverId, password, orgSlug } = await req.json();

  if (!driverId || !password) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  // Resolve org — orgSlug required for scoped login
  if (!orgSlug) {
    return NextResponse.json({ error: "Invalid login link." }, { status: 400 });
  }

  const [org] = await db
    .select({ id: organizations.id, subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org || org.subscriptionStatus === "canceled") {
    return NextResponse.json({ error: "Invalid Driver ID or password." }, { status: 401 });
  }

  const [driver] = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.organizationId, org.id), eq(drivers.driverId, driverId.trim())))
    .limit(1);

  if (!driver || !driver.active) {
    return NextResponse.json({ error: "Invalid Driver ID or password." }, { status: 401 });
  }

  const match = await bcrypt.compare(password, driver.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "Invalid Driver ID or password." }, { status: 401 });
  }

  if (!driver.firstLoginAt) {
    await db
      .update(drivers)
      .set({ firstLoginAt: new Date() })
      .where(and(eq(drivers.organizationId, org.id), eq(drivers.driverId, driver.driverId)));
  }

  await createSession({
    driverId: driver.driverId,
    organizationId: driver.organizationId,
    name: driver.name,
    role: driver.role,
    isAdmin: driver.isAdmin,
  });

  return NextResponse.json({ ok: true, role: driver.role, isAdmin: driver.isAdmin });
}
