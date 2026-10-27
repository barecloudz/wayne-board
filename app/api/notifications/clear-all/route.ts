import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const session = await getSession();
  if (!session?.driverDbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(notifications)
    .where(eq(notifications.recipientId, session.driverDbId));

  return NextResponse.json({ ok: true });
}
