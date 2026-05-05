"use server";

import { db } from "@/lib/db";
import { vehicles, inspections, inspectionResults } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function createVehicle(data: {
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  vin?: string;
  type?: string;
}) {
  const [vehicle] = await db.insert(vehicles).values({
    unitNumber: data.unitNumber,
    make:       data.make,
    model:      data.model,
    year:       data.year,
    mileage:    data.mileage,
    vin:        data.vin ?? "",
    type:       data.type ?? "van",
    active:     true,
  }).returning({ id: vehicles.id });
  return vehicle;
}

export async function deleteVehicle(vehicleId: number) {
  // Delete inspection results → inspections → vehicle
  const vehicleInspections = await db
    .select({ id: inspections.id })
    .from(inspections)
    .where(eq(inspections.vehicleId, vehicleId));

  for (const insp of vehicleInspections) {
    await db.delete(inspectionResults).where(eq(inspectionResults.inspectionId, insp.id));
  }
  await db.delete(inspections).where(eq(inspections.vehicleId, vehicleId));
  await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
}

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
