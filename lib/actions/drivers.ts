"use server";

import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function isDriverIdTaken(driverId: string) {
  const rows = await db.select({ driverId: drivers.driverId }).from(drivers).where(eq(drivers.driverId, driverId));
  return rows.length > 0;
}

export async function getDrivers() {
  return db.select({
    id:        drivers.id,
    driverId:  drivers.driverId,
    name:      drivers.name,
    role:      drivers.role,
    active:    drivers.active,
    createdAt: drivers.createdAt,
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

export async function resetDriverPassword(id: number) {
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db.update(drivers).set({ passwordHash }).where(eq(drivers.id, id));
  return { tempPassword };
}
