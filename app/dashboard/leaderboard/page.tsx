export const dynamic = "force-dynamic";

import { getBadgeTypes, getBadgeHistory } from "@/lib/actions/badges";
import { getDrivers } from "@/lib/actions/drivers";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import LeaderboardClient from "./leaderboard-client";
import { getWeeklyStandings, getMonthlyBadgeCounts } from "@/lib/weekly-awards";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [badgeTypes, history, allDrivers, weeklyStandings, monthlyBadgeCounts] = await Promise.all([
    getBadgeTypes(),
    getBadgeHistory(100),
    getDrivers(),
    getWeeklyStandings(session.organizationId),
    getMonthlyBadgeCounts(session.organizationId),
  ]);

  return (
    <AppShell>
      <LeaderboardClient
        initialBadgeTypes={badgeTypes}
        initialHistory={history}
        allDrivers={allDrivers.sort((a, b) => a.name.localeCompare(b.name))}
        weeklyStandings={weeklyStandings}
        monthlyBadgeCounts={monthlyBadgeCounts}
      />
    </AppShell>
  );
}
