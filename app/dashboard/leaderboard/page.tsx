export const dynamic = "force-dynamic";

import { getBadgeTypes, getBadgeHistory } from "@/lib/actions/badges";
import { getDrivers } from "@/lib/actions/drivers";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import LeaderboardClient from "./leaderboard-client";
import { getWeeklyStandings, getMonthlyBadgeCounts } from "@/lib/weekly-awards";
import { getSetting } from "@/lib/actions/settings";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [
    badgeTypes, history, allDrivers, weeklyStandings, monthlyBadgeCounts,
    minIlsDays, minRydeReviews, ilsEnabled, rydeEnabled, monthlyEnabled,
  ] = await Promise.all([
    getBadgeTypes(),
    getBadgeHistory(100),
    getDrivers(),
    getWeeklyStandings(session.organizationId),
    getMonthlyBadgeCounts(session.organizationId),
    getSetting('award_min_ils_days', '1'),
    getSetting('award_min_ryde_reviews', '1'),
    getSetting('award_ils_enabled', 'true'),
    getSetting('award_ryde_enabled', 'true'),
    getSetting('award_monthly_enabled', 'true'),
  ]);

  const initialAwardRules = {
    minIlsDays: parseInt(minIlsDays) || 1,
    minRydeReviews: parseInt(minRydeReviews) || 1,
    ilsEnabled: ilsEnabled === 'true',
    rydeEnabled: rydeEnabled === 'true',
    monthlyEnabled: monthlyEnabled === 'true',
  };

  return (
    <AppShell>
      <LeaderboardClient
        initialBadgeTypes={badgeTypes}
        initialHistory={history}
        allDrivers={allDrivers.sort((a, b) => a.name.localeCompare(b.name))}
        weeklyStandings={weeklyStandings}
        monthlyBadgeCounts={monthlyBadgeCounts}
        initialAwardRules={initialAwardRules}
      />
    </AppShell>
  );
}
