import { NextResponse } from "next/server";
import { getVehiclesForMmrDashboard } from "@/lib/actions/mmr";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  try {
    const vehicles = await getVehiclesForMmrDashboard(month);
    return NextResponse.json(vehicles);
  } catch (e) {
    console.error("MMR vehicles fetch error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
