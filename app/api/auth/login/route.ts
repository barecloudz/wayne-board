import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { driverId, password } = await req.json();

  if (!driverId || !password) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  const [driver] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.driverId, driverId.trim()))
    .limit(1);

  if (!driver || !driver.active) {
    return NextResponse.json({ error: "Invalid Driver ID or password." }, { status: 401 });
  }

  const match = await bcrypt.compare(password, driver.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "Invalid Driver ID or password." }, { status: 401 });
  }

  await createSession({ driverId: driver.driverId, name: driver.name, role: driver.role, isAdmin: driver.isAdmin });

  return NextResponse.json({ ok: true, role: driver.role, isAdmin: driver.isAdmin });
}
