export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers, rydeReviews, vehicles, workAreas, dailyWorkAreaAssignments } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";
import { getMilestoneRewards, getDriverStreaks, getDriverClaims, claimMilestone } from "@/lib/actions/milestones";
import { getLeaderboard, getCompanyRating, getRydeGoalMessage } from "@/lib/actions/ryde";
import { getDriverSchedule, getDriverTimeOff } from "@/lib/actions/scheduling";
import { getSetting } from "@/lib/actions/settings";
import { getGateCodes, getGateAreas } from "@/lib/actions/gate-codes";
import { getMyMaintenanceRequests } from "@/lib/actions/maintenance";
import Image from "next/image";
import LogoutButton from "./logout-button";
import DriverTabs from "./driver-tabs";

function WorkAreaShape({ shape, color, size = 14 }: { shape: string; color: string; size?: number }) {
  if (shape === "triangle") {
    const half = Math.round(size * 0.55);
    return (
      <span style={{
        display: "inline-block", width: 0, height: 0,
        borderLeft: `${half}px solid transparent`,
        borderRight: `${half}px solid transparent`,
        borderBottom: `${size}px solid ${color}`,
        flexShrink: 0,
      }} />
    );
  }
  return (
    <span style={{
      display: "inline-block",
      width: size,
      height: size,
      backgroundColor: color,
      borderRadius: shape === "circle" ? "50%" : "2px",
      transform: shape === "diamond" ? "rotate(45deg)" : "none",
      flexShrink: 0,
    }} />
  );
}

export default async function DriverDashboard() {
  const session = await getSession();
  if (!session) redirect("/");

  const today = new Date().toISOString().slice(0, 10);

  const [reviews, milestones, streaks, claims, leaderboard, companyRating, goalMessage, [driverRow], driverSchedule, allTimeOff, showRydeSetting, showMilestonesSetting, gateCodes, gateAreas, myRequests, activeVehicles] = await Promise.all([
    db.select().from(rydeReviews).where(eq(rydeReviews.driverId, session.driverId)).orderBy(desc(rydeReviews.createdAt)),
    getMilestoneRewards(),
    getDriverStreaks(),
    getDriverClaims(session.driverId),
    getLeaderboard(),
    getCompanyRating(),
    getRydeGoalMessage(),
    db.select({ assignedVehicleId: drivers.assignedVehicleId, defaultWorkAreaId: drivers.defaultWorkAreaId }).from(drivers).where(eq(drivers.driverId, session.driverId)).limit(1),
    getDriverSchedule(session.driverId),
    getDriverTimeOff(session.driverId),
    getSetting("show_ryde", "true"),
    getSetting("show_milestones", "true"),
    getGateCodes(session.driverId),
    getGateAreas(),
    getMyMaintenanceRequests(session.driverId),
    db.select({ id: vehicles.id, unitNumber: vehicles.unitNumber, model: vehicles.model }).from(vehicles).where(eq(vehicles.active, true)).orderBy(vehicles.unitNumber),
  ]);

  const showRyde       = showRydeSetting === "true";
  const showMilestones = showMilestonesSetting === "true";

  // Resolve today's effective work area (daily override → default)
  let todayWorkArea: { id: number; name: string; shape: string; color: string } | null = null;
  const [dailyWaAssignment] = await db
    .select({ workAreaId: dailyWorkAreaAssignments.workAreaId })
    .from(dailyWorkAreaAssignments)
    .where(and(eq(dailyWorkAreaAssignments.driverId, session.driverId), eq(dailyWorkAreaAssignments.date, today)))
    .limit(1);
  const effectiveWaId = dailyWaAssignment?.workAreaId ?? driverRow?.defaultWorkAreaId ?? null;
  if (effectiveWaId) {
    const [wa] = await db
      .select({ id: workAreas.id, name: workAreas.name, shape: workAreas.shape, color: workAreas.color })
      .from(workAreas)
      .where(eq(workAreas.id, effectiveWaId))
      .limit(1);
    todayWorkArea = wa ?? null;
  }

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
          {session.isAdmin && (
            <a
              href="/wayne-board"
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 transition-colors block"
            >
              Wayne Board
            </a>
          )}
          <LogoutButton />
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 px-5 pb-10 md:px-10 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <p className="text-[13px] text-white/60 mb-0.5">Welcome back,</p>
          <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-none">{session.name}</h1>
          <p className="text-[12px] text-white/50 mt-1">Driver ID: {session.driverId}</p>
          {todayWorkArea && (
            <div className="flex items-center gap-2 mt-2">
              <WorkAreaShape shape={todayWorkArea.shape} color={todayWorkArea.color} size={14} />
              <span className="text-[13px] font-semibold text-white/80">{todayWorkArea.name}</span>
            </div>
          )}
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
          showRyde={showRyde}
          showMilestones={showMilestones}
          gateCodes={gateCodes}
          gateAreas={gateAreas}
          maintenanceRequests={myRequests as any}
          activeVehicles={activeVehicles}
          isAdmin={session.isAdmin}
          driverName={session.name}
        />
      </div>
    </div>
  );
}
