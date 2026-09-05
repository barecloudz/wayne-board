import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { organizations, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ name: "", orgName: "", orgLogo: null, role: "driver", avatarUrl: null });

  const [[org], [driver]] = await Promise.all([
    db.select({ name: organizations.name, logoUrl: organizations.logoUrl, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, session.organizationId))
      .limit(1),
    db.select({ avatarUrl: drivers.avatarUrl })
      .from(drivers)
      .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, session.driverId)))
      .limit(1),
  ]);

  return NextResponse.json({
    name: session.name,
    orgName: org?.name ?? "MyGroundOps",
    orgLogo: org?.logoUrl ?? null,
    orgSlug: org?.slug ?? null,
    role: session.role,
    avatarUrl: driver?.avatarUrl ?? null,
  });
}
