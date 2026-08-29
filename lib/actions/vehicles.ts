"use server";

import { db } from "@/lib/db";
import { vehicles, inspections, inspectionResults } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function createVehicle(data: {
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  vin?: string;
  type?: string;
  ownership?: string;
}): Promise<{ id: number } | { error: string }> {
  const orgId = await requireOrg();
  try {
    const [vehicle] = await db.insert(vehicles).values({
      organizationId: orgId,
      unitNumber: data.unitNumber,
      make:       data.make,
      model:      data.model,
      year:       data.year,
      mileage:    data.mileage,
      vin:        data.vin ?? "",
      type:       data.type ?? "van",
      ownership:  data.ownership ?? "owned",
      active:     true,
    }).returning({ id: vehicles.id });
    return vehicle;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { error: `A vehicle named "${data.unitNumber}" already exists. Use a different unit number.` };
    }
    return { error: "Failed to add vehicle. Please try again." };
  }
}

export async function deleteVehicle(vehicleId: number) {
  const orgId = await requireOrg();
  // Verify vehicle belongs to org before deleting
  const [vehicle] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)))
    .limit(1);
  if (!vehicle) return;

  // Delete inspection results → inspections → vehicle
  const vehicleInspections = await db
    .select({ id: inspections.id })
    .from(inspections)
    .where(eq(inspections.vehicleId, vehicleId));

  for (const insp of vehicleInspections) {
    await db.delete(inspectionResults).where(eq(inspectionResults.inspectionId, insp.id));
  }
  await db.delete(inspections).where(eq(inspections.vehicleId, vehicleId));
  await db.delete(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)));
}

export async function getVehicles() {
  const orgId = await requireOrg();
  return db.select().from(vehicles).where(eq(vehicles.organizationId, orgId)).orderBy(vehicles.unitNumber);
}

export async function updateVehicleVin(vehicleId: number, vin: string) {
  const orgId = await requireOrg();
  await db.update(vehicles).set({ vin }).where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)));
}

export async function updateVehicleVinWithNhtsa(
  vehicleId: number,
  vin: string,
  nhtsa: { make?: string; model?: string; year?: number }
) {
  const orgId = await requireOrg();
  const updates: Partial<{ vin: string; make: string; model: string; year: number }> = { vin };
  if (nhtsa.make) updates.make = nhtsa.make;
  if (nhtsa.model) updates.model = nhtsa.model;
  if (nhtsa.year && nhtsa.year > 1990) updates.year = nhtsa.year;
  await db.update(vehicles).set(updates).where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)));
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
  const orgId = await requireOrg();
  await db.update(vehicles).set(data).where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)));
}

export async function setVehicleActive(vehicleId: number, active: boolean) {
  const orgId = await requireOrg();
  await db.update(vehicles).set({ active }).where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)));
  revalidatePath("/dashboard/fleet-status");
  revalidatePath("/vehicles");
  revalidatePath("/fleet");
}

export async function updateVehicleCompliance(
  vehicleId: number,
  data: {
    ownership: string;
    mmrDue: string | null;
    federalInspectionDue: string | null;
    registrationExpiry: string | null;
  }
) {
  const orgId = await requireOrg();
  await db.update(vehicles).set(data).where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)));
  revalidatePath("/dashboard/fleet-status");
}
