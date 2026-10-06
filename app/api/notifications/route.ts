import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { eq, and, isNull, count, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.driverDbId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const recipientFilter = eq(notifications.recipientId, session.driverDbId);

  const [rows, [totalRow], [unreadRow]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(recipientFilter)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notifications)
      .where(recipientFilter),
    db
      .select({ count: count() })
      .from(notifications)
      .where(and(recipientFilter, isNull(notifications.readAt))),
  ]);

  return NextResponse.json({
    notifications: rows,
    total: totalRow?.count ?? 0,
    unread: unreadRow?.count ?? 0,
  });
}
