import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { eq, and, isNull, count } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session?.driverDbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, session.driverDbId),
        isNull(notifications.readAt),
      ),
    );

  return NextResponse.json(
    { count: row?.count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
