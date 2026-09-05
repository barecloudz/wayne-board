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
    avatarUrl:         drivers.avatarUrl,
    assignedVehicleId: drivers.assignedVehicleId,
    active:            drivers.active,
    firstLoginAt:      drivers.firstLoginAt,
    createdAt:         drivers.createdAt,
    terminationType:   drivers.terminationType,
    terminationNote:   drivers.terminationNote,
    terminatedAt:      drivers.terminatedAt,
    username:          drivers.username,
  }).from(drivers).where(eq(drivers.organizationId, orgId)).orderBy(drivers.id);
}

export async function getMyProfile() {
  const session = await getSession();
  if (!session) return null;
  const [row] = await db.select({
    id:        drivers.id,
    driverId:  drivers.driverId,
    name:      drivers.name,
    username:  drivers.username,
    role:      drivers.role,
    avatarUrl: drivers.avatarUrl,
  }).from(drivers)
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, session.driverId)))
    .limit(1);
  return row ?? null;
}

export async function createDriver(
  name: string,
  role: "driver" | "bc",
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

/** @deprecated use setDriverRole */
export async function setDriverAdmin(id: number, isAdmin: boolean) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ isAdmin }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

type AssignableRole = "driver" | "bc" | "co_owner" | "developer";

export async function setDriverRole(id: number, newRole: AssignableRole) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;
  const myRole = session.role;

  // Only owner can assign co_owner or developer
  if ((newRole === "co_owner" || newRole === "developer") && myRole !== "owner") {
    throw new Error("Only the owner can assign this role.");
  }
  // Only owner or co_owner can assign bc
  if (newRole === "bc" && myRole !== "owner" && myRole !== "co_owner") {
    throw new Error("Only owner or co-owner can assign BC role.");
  }

  const [target] = await db
    .select({ role: drivers.role })
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)))
    .limit(1);
  if (!target) throw new Error("Account not found.");
  if (target.role === "owner") throw new Error("The owner account's role cannot be changed.");
  if ((target.role === "co_owner" || target.role === "developer") && myRole !== "owner") {
    throw new Error("Only the owner can change this account's role.");
  }

  const isAdmin = newRole !== "driver";
  await db.update(drivers)
    .set({ role: newRole, isAdmin })
    .where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
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
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;
  const myRole = session.role;

  const [driver] = await db
    .select({ driverId: drivers.driverId, role: drivers.role })
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)))
    .limit(1);
  if (!driver) return;

  if (driver.role === "owner") throw new Error("The owner account cannot be deleted.");
  if ((driver.role === "co_owner" || driver.role === "developer") && myRole !== "owner") {
    throw new Error("Only the owner can delete this account.");
  }

  await db.delete(rydeScores).where(and(eq(rydeScores.organizationId, orgId), eq(rydeScores.driverId, driver.driverId)));
  await db.delete(rydeReviews).where(and(eq(rydeReviews.organizationId, orgId), eq(rydeReviews.driverId, driver.driverId)));
  await db.delete(driverMilestoneClaims).where(eq(driverMilestoneClaims.driverId, driver.driverId));
  await db.delete(drivers).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
}

export async function updateMyAvatar(avatarUrl: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await db.update(drivers)
    .set({ avatarUrl })
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, session.driverId)));
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

export async function updateDriverUsername(id: number, username: string) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ username: username || null }).where(and(eq(drivers.id, id), eq(drivers.organizationId, orgId)));
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

export async function changeMyUsername(driverId: string, newUsername: string) {
  const orgId = await requireOrg();
  const trimmed = newUsername.trim();
  if (!trimmed) return { error: "Username cannot be empty." };
  if (trimmed.length < 3) return { error: "Username must be at least 3 characters." };
  // Check uniqueness
  const [existing] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.username, trimmed))
    .limit(1);
  if (existing) return { error: "That username is already taken." };
  await db.update(drivers).set({ username: trimmed }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  return { ok: true };
}
