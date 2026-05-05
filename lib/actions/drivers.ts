"use server";

import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

function generateDriverId(existing: { driverId: string }[]) {
  const nums = existing
    .map((d) => parseInt(d.driverId.split("-")[1]))
    .filter((n) => !isNaN(n));
  const next = Math.max(0, ...nums) + 1;
  return `DR-${String(next).padStart(3, "0")}`;
}

function generateTempPassword(length = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
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

export async function createDriver(name: string, role: "driver" | "management") {
  const existing = await db.select({ driverId: drivers.driverId }).from(drivers);
  const driverId = generateDriverId(existing);
  const tempPassword = generateTempPassword();
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
