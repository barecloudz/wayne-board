export const dynamic = "force-dynamic";

import { getBadgeTypes, getBadgeHistory } from "@/lib/actions/badges";
import { getDrivers } from "@/lib/actions/drivers";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import LeaderboardClient from "./leaderboard-client";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [badgeTypes, history, allDrivers] = await Promise.all([
    getBadgeTypes(),
    getBadgeHistory(100),
    getDrivers(),
  ]);

  return (
    <AppShell>
      <LeaderboardClient
        initialBadgeTypes={badgeTypes}
        initialHistory={history}
        allDrivers={allDrivers}
      />
    </AppShell>
  );
}
