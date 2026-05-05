"use server";

import { db } from "@/lib/db";
import { vehicles } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function getVehicles() {
  return db.select().from(vehicles).orderBy(vehicles.unitNumber);
}

export async function updateVehicleVin(vehicleId: number, vin: string) {
  await db.update(vehicles).set({ vin }).where(eq(vehicles.id, vehicleId));
}
