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

export async function updateVehicleVinWithNhtsa(
  vehicleId: number,
  vin: string,
  nhtsa: { make?: string; model?: string; year?: number }
) {
  const updates: Partial<{ vin: string; make: string; model: string; year: number }> = { vin };
  if (nhtsa.make) updates.make = nhtsa.make;
  if (nhtsa.model) updates.model = nhtsa.model;
  if (nhtsa.year && nhtsa.year > 1990) updates.year = nhtsa.year;
  await db.update(vehicles).set(updates).where(eq(vehicles.id, vehicleId));
}

export async function updateVehicle(
  vehicleId: number,
  data: {
    unitNumber: string;
    make: string;
    model: string;
    year: number;
    mileage: number;
    vin: string;
    type: string;
    active: boolean;
  }
) {
  await db.update(vehicles).set(data).where(eq(vehicles.id, vehicleId));
}
