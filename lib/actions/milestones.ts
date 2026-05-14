"use server";

import { db } from "@/lib/db";
import { milestoneRewards, rydeReviews, drivers } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";

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
export async function getDriverStreaks() {
  const allDrivers = await db
    .select({ id: drivers.id, driverId: drivers.driverId, name: drivers.name, createdAt: drivers.createdAt })
    .from(drivers)
    .where(eq(drivers.active, true));

  const atFaultReviews = await db
    .select({ driverId: rydeReviews.driverId, createdAt: rydeReviews.createdAt })
    .from(rydeReviews)
    .where(eq(rydeReviews.atFault, true));

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
