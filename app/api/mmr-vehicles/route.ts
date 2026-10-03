import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getVehiclesForMmrDashboard } from "@/lib/actions/mmr";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month; expected YYYY-MM" }, { status: 400 });
  }

  // Block current and future months
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const maxMonth = d.toISOString().slice(0, 7);
  if (month > maxMonth) {
    return NextResponse.json({ error: "Cannot generate for current or future months" }, { status: 400 });
  }

  const vehicles = await getVehiclesForMmrDashboard(month);
  return NextResponse.json(vehicles);
}
