"use server";

import { db } from "@/lib/db";
import { drivers, rydeScores, rydeReviews, driverMilestoneClaims } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

function suggestDriverId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20) || "driver";
}


export async function isDriverIdTaken(driverId: string) {
  const orgId = await requireOrg();
  const rows = await db
    .select({ driverId: drivers.driverId })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  return rows.length > 0;
}

export async function getDrivers() {
  const orgId = await requireOrg();
  return db.select({
    id:                drivers.id,
    driverId:          drivers.driverId,
    name:              drivers.name,
    role:              drivers.role,
    isAdmin:           drivers.isAdmin,
    assignedVehicleId: drivers.assignedVehicleId,
    active:            drivers.active,
    firstLoginAt:      drivers.firstLoginAt,
    createdAt:         drivers.createdAt,
    terminationType:   drivers.terminationType,
    terminationNote:   drivers.terminationNote,
    terminatedAt:      drivers.terminatedAt,
  }).from(drivers).where(eq(drivers.organizationId, orgId)).orderBy(drivers.id);
}

export async function createDriver(
  name: string,
  role: "driver" | "management",
  customDriverId?: string,
  customTempPassword?: string,
) {
  const orgId = await requireOrg();
  const driverId     = customDriverId     ?? suggestDriverId(name);
  const tempPassword = customTempPassword ?? "Fedex1234#";
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await db.insert(drivers).values({ organizationId: orgId, driverId, name, passwordHash, role });

  return { driverId, tempPassword };
}

export async function setDriverActive(id: number, active: boolean) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ active }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

export async function setDriverAdmin(id: number, isAdmin: boolean) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ isAdmin }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

export async function assignDriverVehicle(id: number, vehicleId: number | null) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ assignedVehicleId: vehicleId }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

export async function resetDriverPassword(id: number, newPassword: string) {
  const orgId = await requireOrg();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(drivers).set({ passwordHash }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
  return { tempPassword: newPassword };
}

export async function deleteDriver(id: number) {
  const orgId = await requireOrg();
  const [driver] = await db
    .select({ driverId: drivers.driverId })
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)))
    .limit(1);
  if (!driver) return;
  // Delete FK-constrained rows that don't have ON DELETE CASCADE
  await db.delete(rydeScores).where(and(eq(rydeScores.organizationId, orgId), eq(rydeScores.driverId, driver.driverId)));
  await db.delete(rydeReviews).where(and(eq(rydeReviews.organizationId, orgId), eq(rydeReviews.driverId, driver.driverId)));
  await db.delete(driverMilestoneClaims).where(eq(driverMilestoneClaims.driverId, driver.driverId));
  await db.delete(drivers).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

// Soft-delete with termination reason — record is kept for records
export async function terminateDriver(
  id: number,
  type: "notice" | "fired",
  note: string,
) {
  const orgId = await requireOrg();
  await db.update(drivers).set({
    active:          false,
    terminationType: type,
    terminationNote: note,
    terminatedAt:    new Date(),
  }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

// Wipe RYDE scores + reviews for a driver (used when terminating with purge option)
export async function purgeDriverRydeData(id: number) {
  const orgId = await requireOrg();
  const [driver] = await db
    .select({ driverId: drivers.driverId })
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)))
    .limit(1);
  if (!driver) return;
  await db.delete(rydeScores).where(and(eq(rydeScores.organizationId, orgId), eq(rydeScores.driverId, driver.driverId)));
  await db.delete(rydeReviews).where(and(eq(rydeReviews.organizationId, orgId), eq(rydeReviews.driverId, driver.driverId)));
}

export async function changeDriverPassword(driverId: string, currentPassword: string, newPassword: string) {
  const orgId = await requireOrg();
  const [driver] = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)))
    .limit(1);
  if (!driver) return { error: "Driver not found." };
  const match = await bcrypt.compare(currentPassword, driver.passwordHash);
  if (!match) return { error: "Current password is incorrect." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(drivers).set({ passwordHash }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  return { ok: true };
}
