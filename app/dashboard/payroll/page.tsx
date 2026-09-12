export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getPayrollWeek } from "@/lib/actions/attendance";
import { getDswDataForRange } from "@/lib/actions/dsw-data";
import { getSetting } from "@/lib/actions/settings";
import PayrollClient from "./payroll-client";
import { db } from "@/lib/db";
import { driverLocations } from "@/lib/schema";
import { eq } from "drizzle-orm";

function getPayWeekBounds(offsetWeeks: number, payWeekStart: number): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const payWeekEnd = (payWeekStart + 6) % 7;
  const daysToEnd = ((dayOfWeek - payWeekEnd + 7) % 7) || 7;
  const lastEndDay = new Date(today);
  lastEndDay.setDate(today.getDate() - daysToEnd - offsetWeeks * 7);
  const weekEnd = lastEndDay.toISOString().slice(0, 10);
  const weekStartDate = new Date(lastEndDay);
  weekStartDate.setDate(lastEndDay.getDate() - 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

type Props = {
  searchParams: Promise<{ offset?: string }>;
};

export default async function PayrollPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const orgId = session.organizationId;

  const params = await searchParams;
  const offset = Math.max(0, parseInt(params.offset ?? "0", 10) || 0);

  const payWeekStartStr = await getSetting("pay_week_start", "6");
  const payWeekStart = parseInt(payWeekStartStr, 10);
  const { weekStart, weekEnd } = getPayWeekBounds(offset, payWeekStart);

  const [weekData, dswRows, driverLocRows] = await Promise.all([
    getPayrollWeek(weekStart, weekEnd),
    getDswDataForRange(weekStart, weekEnd),
    db
      .select({ driverId: driverLocations.driverId, locationId: driverLocations.locationId })
      .from(driverLocations)
      .where(eq(driverLocations.organizationId, orgId)),
  ]);

  const driverLocationMap: Record<string, number[]> = {};
  for (const row of driverLocRows) {
    if (!driverLocationMap[row.driverId]) driverLocationMap[row.driverId] = [];
    driverLocationMap[row.driverId].push(row.locationId);
  }

  return (
    <AppShell>
      <PayrollClient weekData={weekData} currentOffset={offset} payWeekStart={payWeekStart} dswRows={dswRows} driverLocationMap={driverLocationMap} />
    </AppShell>
  );
}
