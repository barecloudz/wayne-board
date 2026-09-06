import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers, organizations } from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
  const { username, password, orgSlug } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  // Resolve org — orgSlug required for scoped login
  if (!orgSlug) {
    return NextResponse.json({ error: "Invalid login link." }, { status: 400 });
  }

  const [org] = await db
    .select({
      id: organizations.id,
      subscriptionStatus: organizations.subscriptionStatus,
      demoMode: organizations.demoMode,
      demoExpiresAt: organizations.demoExpiresAt,
    })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org || org.subscriptionStatus === "canceled") {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  // Match by username if set, fall back to driverId for drivers without one yet
  const [driver] = await db
    .select()
    .from(drivers)
    .where(and(
      eq(drivers.organizationId, org.id),
      or(eq(drivers.username, username.trim()), eq(drivers.driverId, username.trim())),
    ))
    .limit(1);

  if (!driver || driver.loginDisabled) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const match = await bcrypt.compare(password, driver.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const isFirstLogin = !driver.firstLoginAt;
  if (isFirstLogin) {
    await db
      .update(drivers)
      .set({ firstLoginAt: new Date() })
      .where(and(eq(drivers.organizationId, org.id), eq(drivers.driverId, driver.driverId)));
  }

  const isAdmin = driver.role !== "driver";

  await createSession({
    driverId: driver.driverId,
    organizationId: driver.organizationId,
    name: driver.name,
    role: driver.role,
    isAdmin,
    subscriptionStatus: org.subscriptionStatus,
    demoMode: org.demoMode,
    demoExpiresAt: org.demoExpiresAt ? org.demoExpiresAt.toISOString() : null,
    mustChangePassword: isFirstLogin,
  });

  return NextResponse.json({ ok: true, role: driver.role, isAdmin });
  } catch (err) {
    console.error("[login] unhandled error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
