"use server";

import { db } from "@/lib/db";
import { milestoneRewards, rydeReviews, drivers, driverMilestoneClaims } from "@/lib/schema";
import { eq, asc, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function getMilestoneRewards() {
  return db
    .select()
    .from(milestoneRewards)
    .orderBy(asc(milestoneRewards.sortOrder), asc(milestoneRewards.daysRequired));
}

export async function createMilestoneReward(data: {
  name: string;
  description: string | null;
  daysRequired: number;
  type: "physical" | "bonus";
  bonusAmount: number | null;
  icon: string;
  sortOrder: number;
}) {
  await db.insert(milestoneRewards).values(data);
}

export async function updateMilestoneReward(
  id: number,
  data: {
    name: string;
    description: string | null;
    daysRequired: number;
    type: "physical" | "bonus";
    bonusAmount: number | null;
    icon: string;
    active: boolean;
    sortOrder: number;
  },
) {
  await db.update(milestoneRewards).set(data).where(eq(milestoneRewards.id, id));
}

export async function deleteMilestoneReward(id: number) {
  await db.delete(milestoneRewards).where(eq(milestoneRewards.id, id));
}

// Returns each active driver with their current clean streak (days since last at-fault review)
export async function getDriverClaims(driverId: string) {
  return db
    .select({ milestoneId: driverMilestoneClaims.milestoneId, earnedAt: driverMilestoneClaims.earnedAt })
    .from(driverMilestoneClaims)
    .where(eq(driverMilestoneClaims.driverId, driverId));
}

export async function claimMilestone(driverId: string, milestoneId: number) {
  // Idempotent · only insert if not already claimed
  const existing = await db
    .select({ id: driverMilestoneClaims.id })
    .from(driverMilestoneClaims)
    .where(and(eq(driverMilestoneClaims.driverId, driverId), eq(driverMilestoneClaims.milestoneId, milestoneId)))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(driverMilestoneClaims).values({ driverId, milestoneId });
}

export async function getDriverStreaks() {
  const orgId = await requireOrg();

  const allDrivers = await db
    .select({ id: drivers.id, driverId: drivers.driverId, name: drivers.name, createdAt: drivers.createdAt })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));

  const atFaultReviews = await db
    .select({ driverId: rydeReviews.driverId, createdAt: rydeReviews.createdAt })
    .from(rydeReviews)
    .where(and(eq(rydeReviews.organizationId, orgId), eq(rydeReviews.atFault, true)));

  const now = Date.now();

  return allDrivers.map((driver) => {
    const driverFaults = atFaultReviews
      .filter((r) => r.driverId === driver.driverId && r.createdAt != null)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    const streakStart = driverFaults.length > 0
      ? new Date(driverFaults[0].createdAt!)
      : new Date(driver.createdAt ?? now);

    const streakDays = Math.floor((now - streakStart.getTime()) / (1000 * 60 * 60 * 24));

    return { ...driver, streakDays };
  });
}
