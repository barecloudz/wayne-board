export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getPayrollWeek } from "@/lib/actions/attendance";
import PayrollClient from "./payroll-client";

function getPayWeekBounds(offsetWeeks: number): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun...6=Sat
  const daysToFri = (dayOfWeek + 2) % 7;
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - daysToFri - offsetWeeks * 7);
  const weekEnd = lastFriday.toISOString().slice(0, 10);
  const satStart = new Date(lastFriday);
  satStart.setDate(lastFriday.getDate() - 6);
  const weekStart = satStart.toISOString().slice(0, 10);
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

  const { weekStart, weekEnd } = getPayWeekBounds(offset);
  const weekData = await getPayrollWeek(weekStart, weekEnd);

  return (
    <AppShell>
      <PayrollClient weekData={weekData} currentOffset={offset} />
    </AppShell>
  );
}
