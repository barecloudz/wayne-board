"use server";

import { db } from "@/lib/db";
import { maintenanceRequests } from "@/lib/schema";
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
