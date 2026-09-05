import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ name: "", orgName: "", orgLogo: null });

  const [org] = await db
    .select({ name: organizations.name, logoUrl: organizations.logoUrl, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

  return NextResponse.json({
    name: session.name,
    orgName: org?.name ?? "MyGroundOps",
    orgLogo: org?.logoUrl ?? null,
    orgSlug: org?.slug ?? null,
  });
}
