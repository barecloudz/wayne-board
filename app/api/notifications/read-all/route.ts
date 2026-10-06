import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST() {
  const session = await getSession();
  if (!session?.driverDbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientId, session.driverDbId),
        isNull(notifications.readAt),
      ),
    );

  return NextResponse.json({ ok: true });
}
