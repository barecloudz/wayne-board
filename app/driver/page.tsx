import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers, rydeReviews, vehicles } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { getMilestoneRewards, getDriverStreaks, getDriverClaims, claimMilestone } from "@/lib/actions/milestones";
import { getLeaderboard, getCompanyRating, getRydeGoalMessage } from "@/lib/actions/ryde";
import { getDriverSchedule, getDriverTimeOff } from "@/lib/actions/scheduling";
import Image from "next/image";
import LogoutButton from "./logout-button";
import DriverTabs from "./driver-tabs";

export default async function DriverDashboard() {
  const session = await getSession();
  if (!session) redirect("/");

  const today = new Date().toISOString().slice(0, 10);

  const [reviews, milestones, streaks, claims, leaderboard, companyRating, goalMessage, [driverRow], driverSchedule, allTimeOff] = await Promise.all([
    db.select().from(rydeReviews).where(eq(rydeReviews.driverId, session.driverId)).orderBy(desc(rydeReviews.createdAt)),
    getMilestoneRewards(),
    getDriverStreaks(),
    getDriverClaims(session.driverId),
    getLeaderboard(),
    getCompanyRating(),
    getRydeGoalMessage(),
    db.select({ assignedVehicleId: drivers.assignedVehicleId }).from(drivers).where(eq(drivers.driverId, session.driverId)).limit(1),
    getDriverSchedule(session.driverId),
    getDriverTimeOff(session.driverId),
  ]);

  const upcomingTimeOff = allTimeOff.filter((t) => t.endDate >= today);

  const assignedVehicle = driverRow?.assignedVehicleId
    ? await db.select().from(vehicles).where(eq(vehicles.id, driverRow.assignedVehicleId)).limit(1).then((r) => r[0] ?? null)
    : null;

  const streakDays = streaks.find((s) => s.driverId === session.driverId)?.streakDays ?? 0;
  const activeMilestones = milestones.filter((m) => m.active);
  const claimedIds = new Set(claims.map((c) => c.milestoneId));

  // Auto-claim any milestones the driver has earned but not yet recorded
  const newlyEarned = activeMilestones.filter(
    (m) => streakDays >= m.daysRequired && !claimedIds.has(m.id),
  );
  if (newlyEarned.length > 0) {
    await Promise.all(newlyEarned.map((m) => claimMilestone(session.driverId, m.id)));
    newlyEarned.forEach((m) => claimedIds.add(m.id));
  }

  const myRank = leaderboard.findIndex((e) => e.driverId === session.driverId) + 1;

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "linear-gradient(160deg, #4D148C 0%, #7B2FC0 50%, #FF6200 100%)" }}
    >
      {/* Nav */}
      <nav className="flex items-center justify-between px-5 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-xl p-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
            <Image src="/74slogo.svg" alt="742 Logistics" width={38} height={38} className="object-contain" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[14px] font-extrabold text-white tracking-tight">742 Logistics</span>
            <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Driver Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-white/60 hidden sm:block">{session.name}</span>
          <LogoutButton />
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 px-5 pb-10 md:px-10 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <p className="text-[13px] text-white/60 mb-0.5">Welcome back,</p>
          <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-none">{session.name}</h1>
          <p className="text-[12px] text-white/50 mt-1">Driver ID: {session.driverId}</p>
        </div>

        <DriverTabs
          reviews={reviews}
          milestones={activeMilestones}
          streakDays={streakDays}
          driverId={session.driverId}
          claimedMilestoneIds={claimedIds}
          leaderboard={leaderboard}
          myRank={myRank}
          companyRating={companyRating}
          goalMessage={goalMessage}
          assignedVehicle={assignedVehicle}
          driverSchedule={driverSchedule}
          upcomingTimeOff={upcomingTimeOff as any}
        />
      </div>
    </div>
  );
}
