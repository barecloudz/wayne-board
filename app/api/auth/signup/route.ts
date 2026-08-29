import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations, drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { companyName, slug, ownerName, driverId, password } = await req.json();

  // Validate all fields present
  if (!companyName?.trim() || !slug?.trim() || !ownerName?.trim() || !driverId?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  // Validate password length
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Validate slug format
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugPattern.test(slug)) {
    return NextResponse.json({ error: "Invalid company URL slug." }, { status: 400 });
  }

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "That company URL is already taken." }, { status: 409 });
  }

  // Hash password
  const hash = await bcrypt.hash(password, 12);

  // Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: companyName.trim(),
      slug: slug.trim(),
      plan: "starter",
      subscriptionStatus: "trialing",
    })
    .returning({ id: organizations.id });

  // Create admin driver
  await db.insert(drivers).values({
    organizationId: org.id,
    driverId: driverId.trim(),
    name: ownerName.trim(),
    passwordHash: hash,
    role: "owner",
    isAdmin: true,
    active: true,
  });

  return NextResponse.json({ ok: true, slug: slug.trim() });
}
