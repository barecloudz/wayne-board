"use server";

import { db } from "@/lib/db";
import { maintenanceRequests } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type RequestStatus = "pending" | "in_progress" | "resolved";

export async function submitMaintenanceRequest(
  driverId: string,
  driverName: string,
  truckNumber: string,
  description: string,
) {
  await db.insert(maintenanceRequests).values({
    driverId, driverName, truckNumber: truckNumber.trim(), description: description.trim(),
  });
  revalidatePath("/driver");
  revalidatePath("/wayne-board/maintenance");
}

export async function getMyMaintenanceRequests(driverId: string) {
  return db
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.driverId, driverId))
    .orderBy(desc(maintenanceRequests.createdAt));
}

export async function getAllMaintenanceRequests() {
  return db
    .select()
    .from(maintenanceRequests)
    .orderBy(desc(maintenanceRequests.createdAt));
}

export async function updateRequestStatus(id: number, status: RequestStatus, adminNote?: string) {
  await db.update(maintenanceRequests)
    .set({ status, adminNote: adminNote ?? null, updatedAt: new Date() })
    .where(eq(maintenanceRequests.id, id));
  revalidatePath("/wayne-board/maintenance");
}

export async function deleteRequest(id: number) {
  await db.delete(maintenanceRequests).where(eq(maintenanceRequests.id, id));
  revalidatePath("/wayne-board/maintenance");
}
