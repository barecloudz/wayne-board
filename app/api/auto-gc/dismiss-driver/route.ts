import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gcNameMappings } from "@/lib/schema";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;

  const { gcName } = await req.json();
  if (!gcName) return NextResponse.json({ error: "gcName required" }, { status: 400 });

  await db.insert(gcNameMappings)
    .values({ organizationId: orgId, gcName, driverId: "__dismissed__" })
    .onConflictDoUpdate({
      target: [gcNameMappings.organizationId, gcNameMappings.gcName],
      set: { driverId: "__dismissed__" },
    });

  return NextResponse.json({ ok: true });
}
