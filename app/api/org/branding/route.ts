import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { logoUrl, accentColor } = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof logoUrl !== "undefined") update.logoUrl = logoUrl || null;
  if (typeof accentColor !== "undefined") update.accentColor = accentColor || null;

  await db.update(organizations).set(update).where(eq(organizations.id, session.organizationId));
  return NextResponse.json({ ok: true });
}
