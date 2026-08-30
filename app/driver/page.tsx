export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Driver Portal",
  description: "View your Ryde scores, delivery stats, and performance data.",
};
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers, rydeReviews, vehicles, workAreas, dailyWorkAreaAssignments, dswRouteDays, organizations } from "@/lib/schema";
import { eq, desc, and, gte } from "drizzle-orm";
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

  const [reviews, milestones, streaks, claims, leaderboard, companyRating, goalMessage, [driverRow], driverSchedule, allTimeOff, showRydeSetting, showMilestonesSetting, showDswSetting, gateCodes, gateAreas, myRequests, activeVehicles, latestDswRows, myDswHistory, [orgRow]] = await Promise.all([
    db.select().from(rydeReviews).where(and(eq(rydeReviews.driverId, session.driverId), eq(rydeReviews.organizationId, session.organizationId))).orderBy(desc(rydeReviews.createdAt)),
    getMilestoneRewards(),
    getDriverStreaks(),
    getDriverClaims(session.driverId),
    getLeaderboard(),
    getCompanyRating(),
    getRydeGoalMessage(),
    db.select({ assignedVehicleId: drivers.assignedVehicleId, defaultWorkAreaId: drivers.defaultWorkAreaId }).from(drivers).where(and(eq(drivers.driverId, session.driverId), eq(drivers.organizationId, session.organizationId))).limit(1),
    getDriverSchedule(session.driverId),
    getDriverTimeOff(session.driverId),
    getSetting("show_ryde", "true"),
    getSetting("show_milestones", "true"),
    getSetting("show_dsw", "true"),
    getGateCodes(session.driverId),
    getGateAreas(),
    getMyMaintenanceRequests(session.driverId),
    db.select({ id: vehicles.id, unitNumber: vehicles.unitNumber, model: vehicles.model }).from(vehicles).where(and(eq(vehicles.active, true), eq(vehicles.organizationId, session.organizationId))).orderBy(vehicles.unitNumber),
    db.select().from(dswRouteDays).orderBy(desc(dswRouteDays.date)).limit(60).catch(() => []),
    (() => {
      const d14 = new Date(); d14.setDate(d14.getDate() - 14);
      const since = d14.toISOString().slice(0, 10);
      return db.select().from(dswRouteDays)
        .where(gte(dswRouteDays.date, since))
        .orderBy(desc(dswRouteDays.date))
        .catch(() => []);
    })(),
    db.select({ name: organizations.name, logoUrl: organizations.logoUrl }).from(organizations).where(eq(organizations.id, session.organizationId)).limit(1),
  ]);

  const showRyde       = showRydeSetting === "true";
  const showMilestones = showMilestonesSetting === "true";
  const showDsw        = showDswSetting === "true";

  const latestDswDate = latestDswRows[0]?.date ?? null;
  const dswRows = latestDswDate
    ? latestDswRows.filter(r => r.date === latestDswDate && !!r.driverNameRaw)
    : [];

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
      .where(and(eq(workAreas.id, effectiveWaId), eq(workAreas.organizationId, session.organizationId)))
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
      style={{ background: "linear-gradient(160deg, #060011 0%, #0e001f 55%, #150600 100%)" }}
    >
      {/* Sticky frosted nav */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-5 py-3.5 md:px-10"
        style={{
          background: "rgba(6, 0, 17, 0.72)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-xl p-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
            {orgRow?.logoUrl ? (
              <img src={orgRow.logoUrl} alt={orgRow.name} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }} />
            ) : (
              <Image src="/logo-icon.png" alt="MyGroundOps" width={36} height={36} className="object-contain rounded-lg" />
            )}
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[14px] font-bold text-white tracking-tight">{orgRow?.name ?? "MyGroundOps"}</span>
            <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Driver Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium hidden sm:block" style={{ color: "rgba(255,255,255,0.45)" }}>{session.name}</span>
          {session.isAdmin && (
            <a
              href="/dashboard"
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Dashboard
            </a>
          )}
          <LogoutButton />
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 px-5 pt-6 md:px-10 max-w-2xl mx-auto w-full">
        <div className="mb-7">
          <p className="text-[12px] font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.02em" }}>Welcome back,</p>
          <h1 className="text-[32px] font-bold text-white tracking-tight leading-none">{session.name}</h1>
          {todayWorkArea && (
            <div className="flex items-center gap-2 mt-2.5">
              <WorkAreaShape shape={todayWorkArea.shape} color={todayWorkArea.color} size={12} />
              <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>{todayWorkArea.name}</span>
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
          showDsw={showDsw}
          gateCodes={gateCodes}
          gateAreas={gateAreas}
          maintenanceRequests={myRequests as any}
          activeVehicles={activeVehicles}
          isAdmin={session.isAdmin}
          driverName={session.name}
          dswRows={dswRows as any}
          myDswHistory={myDswHistory as any}
        />
      </div>
    </div>
  );
}
