import { getBadgeTypes, getBadgeHistory } from "@/lib/actions/badges";
import { getDrivers } from "@/lib/actions/drivers";
import LeaderboardClient from "./leaderboard-client";

export default async function LeaderboardPage() {
  const [badgeTypes, history, allDrivers] = await Promise.all([
    getBadgeTypes(),
    getBadgeHistory(100),
    getDrivers(),
  ]);
  return (
    <LeaderboardClient
      initialBadgeTypes={badgeTypes}
      initialHistory={history}
      allDrivers={allDrivers}
    />
  );
}
