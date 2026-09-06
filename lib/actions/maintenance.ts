"use server";

import { db } from "@/lib/db";
import { maintenanceRequests, vehicleMaintenanceRecords } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type RequestStatus = "pending" | "in_progress" | "resolved";

export async function submitMaintenanceRequest(
  driverId: string,
  driverName: string,
  truckNumber: string,
  description: string,
) {
  const orgId = await requireOrg();
  await db.insert(maintenanceRequests).values({
    organizationId: orgId,
    driverId, driverName, truckNumber: truckNumber.trim(), description: description.trim(),
  });
  revalidatePath("/driver");
  revalidatePath("/dashboard/maintenance");
}

export async function getMyMaintenanceRequests(driverId: string) {
  const orgId = await requireOrg();
  return db
    .select()
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.organizationId, orgId), eq(maintenanceRequests.driverId, driverId)))
    .orderBy(desc(maintenanceRequests.createdAt));
}

export async function getAllMaintenanceRequests() {
  const orgId = await requireOrg();
  return db
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.organizationId, orgId))
    .orderBy(desc(maintenanceRequests.createdAt));
}

export async function updateRequestStatus(id: number, status: RequestStatus, adminNote?: string) {
  const orgId = await requireOrg();
  await db.update(maintenanceRequests)
    .set({ status, adminNote: adminNote ?? null, updatedAt: new Date() })
    .where(and(eq(maintenanceRequests.id, id), eq(maintenanceRequests.organizationId, orgId)));
  revalidatePath("/dashboard/maintenance");
}

export async function deleteRequest(id: number) {
  const orgId = await requireOrg();
  await db.delete(maintenanceRequests).where(and(eq(maintenanceRequests.id, id), eq(maintenanceRequests.organizationId, orgId)));
  revalidatePath("/dashboard/maintenance");
}

// ── Vehicle Maintenance Records (admin-logged completed work) ─────────────────

export type MaintenanceRecordType = "oil_change" | "tire_rotation" | "mmr" | "fed_inspection" | "registration" | "repair" | "other";

export async function createMaintenanceRecord(data: {
  vehicleId?: number;
  truckNumber: string;
  serviceDate: string;
  type: MaintenanceRecordType;
  description: string;
  mileage?: number;
  cost?: number;
  vendor?: string;
  createdBy: string;
}) {
  const orgId = await requireOrg();
  await db.insert(vehicleMaintenanceRecords).values({
    organizationId: orgId,
    vehicleId: data.vehicleId ?? null,
    truckNumber: data.truckNumber.trim(),
    serviceDate: data.serviceDate,
    type: data.type,
    description: data.description.trim(),
    mileage: data.mileage ?? null,
    cost: data.cost ?? null,
    vendor: data.vendor?.trim() || null,
    createdBy: data.createdBy,
  });
  revalidatePath("/dashboard/maintenance");
}

export async function getMaintenanceRecords() {
  const orgId = await requireOrg();
  return db
    .select()
    .from(vehicleMaintenanceRecords)
    .where(eq(vehicleMaintenanceRecords.organizationId, orgId))
    .orderBy(desc(vehicleMaintenanceRecords.serviceDate), desc(vehicleMaintenanceRecords.createdAt));
}

export async function deleteMaintenanceRecord(id: number) {
  const orgId = await requireOrg();
  await db.delete(vehicleMaintenanceRecords).where(
    and(eq(vehicleMaintenanceRecords.id, id), eq(vehicleMaintenanceRecords.organizationId, orgId))
  );
  revalidatePath("/dashboard/maintenance");
}
