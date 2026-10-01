import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  computeAndAwardWeeklyBadges,
  computeAndAwardMonthlyPerformer,
  getPreviousMonday,
} from "@/lib/weekly-awards";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const weekStart: string = body.weekStart ?? getPreviousMonday();

  const result = await computeAndAwardWeeklyBadges(weekStart, session.organizationId);

  // Run monthly performer if caller requests it
  if (body.runMonthly) {
    const today = new Date();
    const priorMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthFirstDay = priorMonth.toISOString().slice(0, 10);
    const monthly = await computeAndAwardMonthlyPerformer(monthFirstDay, session.organizationId);
    result.monthlyPerformer = monthly.performers.length > 0 ? monthly.performers : null;
    result.badgesInserted += monthly.inserted;
    result.skipped += monthly.skipped;
  }

  revalidatePath("/dashboard/leaderboard");
  revalidatePath("/driver");

  return NextResponse.json(result);
}
