import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getPayrollWeek } from "@/lib/actions/attendance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekStart = req.nextUrl.searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });
  }

  // Block future weeks
  const today = new Date().toISOString().slice(0, 10);
  if (weekStart > today) return NextResponse.json({ error: "Cannot view future weeks" }, { status: 400 });

  const weekEnd = new Date(weekStart + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const data = await getPayrollWeek(weekStart, weekEndStr);
  const rows = data.drivers.map((d) => {
    const daysWorked = Object.values(d.attendance).filter(s => s === "work" || s === "half_day" || s === "trainee").length;
    const statusCounts: Record<string, number> = {};
    for (const s of Object.values(d.attendance)) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    return {
      driverId: d.driverId, name: d.name, daysWorked,
      cut: statusCounts["cut"] ?? 0, callOut: statusCounts["call_out"] ?? 0,
      isTrainee: d.isTrainee, isTerminated: d.isTerminated,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ rows, weekStart, weekEnd: weekEndStr });
}
