import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  computeAndAwardWeeklyBadges,
  computeAndAwardMonthlyPerformer,
  getPreviousMonday,
} from "@/lib/weekly-awards";
import { getSetting } from "@/lib/actions/settings";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const weekStart: string = body.weekStart ?? getPreviousMonday();

  const [minIlsDaysSetting, minRydeReviewsSetting, ilsEnabledSetting, rydeEnabledSetting] = await Promise.all([
    getSetting('award_min_ils_days', '1'),
    getSetting('award_min_ryde_reviews', '1'),
    getSetting('award_ils_enabled', 'true'),
    getSetting('award_ryde_enabled', 'true'),
  ]);
  const options = {
    minIlsDays: parseInt(minIlsDaysSetting) || 1,
    minRydeReviews: parseInt(minRydeReviewsSetting) || 1,
    ilsEnabled: ilsEnabledSetting === 'true',
    rydeEnabled: rydeEnabledSetting === 'true',
  };

  const result = await computeAndAwardWeeklyBadges(weekStart, session.organizationId, options);

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
