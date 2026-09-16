"use server";

import { db } from "@/lib/db";
import { workAreas, dailyWorkAreaAssignments, drivers } from "@/lib/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function getWorkAreas() {
  const orgId = await requireOrg();
  return db.select().from(workAreas).where(eq(workAreas.organizationId, orgId))
    .orderBy(sql`CASE WHEN ${workAreas.name} ~ '^[0-9]+$' THEN CAST(${workAreas.name} AS INTEGER) ELSE 99999 END`, workAreas.name);
}

export async function createWorkArea(name: string, shape: string, color: string) {
  const orgId = await requireOrg();
  await db.insert(workAreas).values({ organizationId: orgId, name: name.trim(), shape, color });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scheduling");
}

export async function deleteWorkArea(id: number) {
  const orgId = await requireOrg();
  await db.delete(workAreas).where(and(eq(workAreas.id, id), eq(workAreas.organizationId, orgId)));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scheduling");
}

export async function setDriverDefaultWorkArea(driverId: string, workAreaId: number | null) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ defaultWorkAreaId: workAreaId }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function setDailyWorkArea(driverId: string, date: string, workAreaId: number | null, vehicleId?: number | null) {
  const orgId = await requireOrg();
  const [driver] = await db.select({ driverId: drivers.driverId }).from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId))).limit(1);
  if (!driver) throw new Error("Driver not found");
  await db.delete(dailyWorkAreaAssignments)
    .where(and(eq(dailyWorkAreaAssignments.driverId, driverId), eq(dailyWorkAreaAssignments.date, date)));
  if (workAreaId !== null) {
    await db.insert(dailyWorkAreaAssignments).values({ driverId, date, workAreaId, vehicleId: vehicleId ?? null });
  }
  revalidatePath("/dashboard/scheduling");
}

export async function setDailyVehicle(driverId: string, date: string, vehicleId: number | null) {
  const orgId = await requireOrg();
  const [driver] = await db.select({ driverId: drivers.driverId }).from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId))).limit(1);
  if (!driver) throw new Error("Driver not found");
  await db.update(dailyWorkAreaAssignments)
    .set({ vehicleId })
    .where(and(eq(dailyWorkAreaAssignments.driverId, driverId), eq(dailyWorkAreaAssignments.date, date)));
  revalidatePath("/dashboard/scheduling");
}

export async function getAllDailyAssignments() {
  const orgId = await requireOrg();
  const orgDrivers = await db.select({ driverId: drivers.driverId }).from(drivers)
    .where(eq(drivers.organizationId, orgId));
  const driverIds = orgDrivers.map((d) => d.driverId);
  if (driverIds.length === 0) return [];
  return db.select().from(dailyWorkAreaAssignments)
    .where(inArray(dailyWorkAreaAssignments.driverId, driverIds));
}
