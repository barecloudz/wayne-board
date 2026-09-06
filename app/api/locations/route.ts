import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { locations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      terminalId: locations.terminalId,
    })
    .from(locations)
    .where(eq(locations.organizationId, session.organizationId))
    .orderBy(locations.name);

  return NextResponse.json(rows);
}
