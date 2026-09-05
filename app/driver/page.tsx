export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: "Driver Portal" };
  const [org] = await db.select({ name: organizations.name, ogImageUrl: organizations.ogImageUrl }).from(organizations).where(eq(organizations.id, session.organizationId)).limit(1);
  const orgName = org?.name;
  const title = orgName ? `${orgName} Driver Portal` : "Driver Portal";
  return {
    title,
    description: "View your Ryde scores, delivery stats, and performance data.",
    openGraph: org?.ogImageUrl ? {
      title,
      description: "View your Ryde scores, delivery stats, and performance data.",
      images: [{ url: org.ogImageUrl, width: 1200, height: 630 }],
    } : undefined,
  };
}
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
  if (!session) redirect("/sign-in");

  const today = new Date().toISOString().slice(0, 10);

  const [reviews, milestones, streaks, claims, leaderboard, companyRating, goalMessage, [driverRow], driverSchedule, allTimeOff, showRydeSetting, showMilestonesSetting, showDswSetting, gateCodes, gateAreas, myRequests, activeVehicles, latestDswRows, myDswHistory, [orgRow]] = await Promise.all([
    db.select().from(rydeReviews).where(and(eq(rydeReviews.driverId, session.driverId), eq(rydeReviews.organizationId, session.organizationId))).orderBy(desc(rydeReviews.createdAt)),
    getMilestoneRewards(),
    getDriverStreaks(),
    getDriverClaims(session.driverId),
    getLeaderboard(),
    getCompanyRating(),
    getRydeGoalMessage(),
    db.select({ assignedVehicleId: drivers.assignedVehicleId, defaultWorkAreaId: drivers.defaultWorkAreaId, username: drivers.username }).from(drivers).where(and(eq(drivers.driverId, session.driverId), eq(drivers.organizationId, session.organizationId))).limit(1),
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
    db.select({ name: organizations.name, logoUrl: organizations.logoUrl, accentColor: organizations.accentColor, slug: organizations.slug }).from(organizations).where(eq(organizations.id, session.organizationId)).limit(1),
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

  const ratedReviews = reviews.filter((r) => r.stars != null);
  const avgScore = ratedReviews.length
    ? ratedReviews.reduce((s, r) => s + r.stars!, 0) / ratedReviews.length
    : null;

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "#F8FAFC" }}
    >
      {/* Sticky nav */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-5 py-3 md:px-10"
        style={{
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-0.5" style={{ background: "#F1F5F9" }}>
            {orgRow?.logoUrl ? (
              <img src={orgRow.logoUrl} alt={orgRow.name} style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 8 }} />
            ) : (
              <Image src="/logo-icon.png" alt="MyGroundOps" width={34} height={34} className="object-contain rounded-lg" />
            )}
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[14px] font-bold tracking-tight" style={{ color: "#0F172A" }}>{orgRow?.name ?? "MyGroundOps"}</span>
            <span className="text-[11px] font-medium" style={{ color: "#94A3B8" }}>Driver Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium hidden sm:block" style={{ color: "#94A3B8" }}>{session.name}</span>
          {session.isAdmin && (
            <a
              href="/dashboard"
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#475569" }}
            >
              Dashboard
            </a>
          )}
          <LogoutButton orgSlug={orgRow?.slug ?? ""} />
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 px-5 pt-6 md:px-10 max-w-2xl mx-auto w-full">
        <div className="mb-7">
          <p className="text-[12px] font-medium mb-0.5" style={{ color: "#94A3B8", letterSpacing: "0.02em" }}>Welcome back,</p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[32px] font-bold tracking-tight leading-none" style={{ color: "#0F172A" }}>{session.name}</h1>
            {showRyde && avgScore !== null && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-full shrink-0"
                style={{
                  background: avgScore >= 4.5 ? "#dcfce7" : avgScore >= 3 ? "#fef9c3" : "#fee2e2",
                  border: `1px solid ${avgScore >= 4.5 ? "#bbf7d0" : avgScore >= 3 ? "#fef08a" : "#fecaca"}`,
                }}
              >
                <span className="text-[12px]">⭐</span>
                <span
                  className="text-[13px] font-bold leading-none"
                  style={{ color: avgScore >= 4.5 ? "#16a34a" : avgScore >= 3 ? "#ca8a04" : "#dc2626" }}
                >
                  {avgScore.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          {todayWorkArea && (
            <div className="flex items-center gap-2 mt-2.5">
              <WorkAreaShape shape={todayWorkArea.shape} color={todayWorkArea.color} size={12} />
              <span className="text-[12px] font-semibold" style={{ color: "#64748B" }}>{todayWorkArea.name}</span>
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
          accentColor={orgRow?.accentColor ?? "#FF6200"}
          currentUsername={driverRow?.username ?? null}
        />
      </div>
    </div>
  );
}
