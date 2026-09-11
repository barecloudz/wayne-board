export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getPayrollWeek } from "@/lib/actions/attendance";
import { getSetting } from "@/lib/actions/settings";
import PayrollClient from "./payroll-client";

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

  const params = await searchParams;
  const offset = Math.max(0, parseInt(params.offset ?? "0", 10) || 0);

  const payWeekStartStr = await getSetting("pay_week_start", "6");
  const payWeekStart = parseInt(payWeekStartStr, 10);
  const { weekStart, weekEnd } = getPayWeekBounds(offset, payWeekStart);
  const weekData = await getPayrollWeek(weekStart, weekEnd);

  return (
    <AppShell>
      <PayrollClient weekData={weekData} currentOffset={offset} payWeekStart={payWeekStart} />
    </AppShell>
  );
}
