export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { getDaysInMonth, getDay, lastDayOfMonth } from "date-fns";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

/**
 * Returns the last business day (Mon–Fri) of the given month.
 */
function getLastBusinessDay(date: Date): Date {
  const last = lastDayOfMonth(date);
  const dow = getDay(last); // 0 = Sun, 6 = Sat
  if (dow === 0) {
    // Sunday → Friday
    last.setDate(last.getDate() - 2);
  } else if (dow === 6) {
    // Saturday → Friday
    last.setDate(last.getDate() - 1);
  }
  return last;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const lastBizDay = getLastBusinessDay(today);
  const lastBizDayStr = lastBizDay.toISOString().slice(0, 10);

  if (todayStr !== lastBizDayStr) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not last business day of month" });
  }

  const allOrgs = await db.select({ id: organizations.id }).from(organizations);

  for (const org of allOrgs) {
    await createNotification({
      organizationId: org.id,
      type: NOTIFICATION_TYPES.MMR_REPORT,
      title: "Monthly MMR Report Ready",
      body: "Your end-of-month MMR report is now available for review.",
      linkTo: "/dashboard/mmr",
    });
  }

  return NextResponse.json({ ok: true, orgsNotified: allOrgs.length });
}
