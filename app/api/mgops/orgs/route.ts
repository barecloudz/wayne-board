import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { organizations, drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function checkAuth() {
  const cookieStore = await cookies();
  return cookieStore.get("mgops_session")?.value === "authenticated";
}

export async function POST(req: Request) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyName, slug, plan, subscriptionStatus, ownerName, driverId, password, demoMode, demoExpiresAt, superAdminNote } = await req.json();

  if (!companyName || !slug || !ownerName || !driverId || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Check slug uniqueness
  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "That slug is already taken" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [org] = await db.insert(organizations).values({
    name: companyName,
    slug,
    plan: plan ?? "starter",
    subscriptionStatus: subscriptionStatus ?? "trialing",
    demoMode: demoMode ?? false,
    demoExpiresAt: demoExpiresAt ? new Date(demoExpiresAt) : null,
    superAdminNote: superAdminNote ?? null,
  }).returning({ id: organizations.id });

  await db.insert(drivers).values({
    organizationId: org.id,
    driverId: driverId.trim(),
    name: ownerName,
    passwordHash,
    role: "owner",
    isAdmin: true,
    active: true,
  });

  return NextResponse.json({ ok: true, id: org.id });
}
