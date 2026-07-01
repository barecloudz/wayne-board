"use server";

import { db } from "@/lib/db";
import { drivers, rydeScores, rydeReviews, driverMilestoneClaims } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

function suggestDriverId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20) || "driver";
}


export async function isDriverIdTaken(driverId: string) {
  const rows = await db.select({ driverId: drivers.driverId }).from(drivers).where(eq(drivers.driverId, driverId));
  return rows.length > 0;
}

export async function getDrivers() {
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
  }).from(drivers).orderBy(drivers.id);
}

export async function createDriver(
  name: string,
  role: "driver" | "management",
  customDriverId?: string,
  customTempPassword?: string,
) {
  const driverId     = customDriverId     ?? suggestDriverId(name);
  const tempPassword = customTempPassword ?? "Fedex1234#";
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await db.insert(drivers).values({ driverId, name, passwordHash, role });

  return { driverId, tempPassword };
}

export async function setDriverActive(id: number, active: boolean) {
  await db.update(drivers).set({ active }).where(eq(drivers.id, id));
}

export async function setDriverAdmin(id: number, isAdmin: boolean) {
  await db.update(drivers).set({ isAdmin }).where(eq(drivers.id, id));
}

export async function assignDriverVehicle(id: number, vehicleId: number | null) {
  await db.update(drivers).set({ assignedVehicleId: vehicleId }).where(eq(drivers.id, id));
}

export async function resetDriverPassword(id: number, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(drivers).set({ passwordHash }).where(eq(drivers.id, id));
  return { tempPassword: newPassword };
}

export async function deleteDriver(id: number) {
  const [driver] = await db.select({ driverId: drivers.driverId }).from(drivers).where(eq(drivers.id, id)).limit(1);
  if (!driver) return;
  // Delete FK-constrained rows that don't have ON DELETE CASCADE
  await db.delete(rydeScores).where(eq(rydeScores.driverId, driver.driverId));
  await db.delete(rydeReviews).where(eq(rydeReviews.driverId, driver.driverId));
  await db.delete(driverMilestoneClaims).where(eq(driverMilestoneClaims.driverId, driver.driverId));
  await db.delete(drivers).where(eq(drivers.id, id));
}

// Soft-delete with termination reason — record is kept for records
export async function terminateDriver(
  id: number,
  type: "notice" | "fired",
  note: string,
) {
  await db.update(drivers).set({
    active:          false,
    terminationType: type,
    terminationNote: note,
    terminatedAt:    new Date(),
  }).where(eq(drivers.id, id));
}

export async function changeDriverPassword(driverId: string, currentPassword: string, newPassword: string) {
  const [driver] = await db.select().from(drivers).where(eq(drivers.driverId, driverId)).limit(1);
  if (!driver) return { error: "Driver not found." };
  const match = await bcrypt.compare(currentPassword, driver.passwordHash);
  if (!match) return { error: "Current password is incorrect." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(drivers).set({ passwordHash }).where(eq(drivers.driverId, driverId));
  return { ok: true };
}

