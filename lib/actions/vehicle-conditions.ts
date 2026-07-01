"use server";

import { db } from "@/lib/db";
import { vehicles, vehicleConditions, drivers } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type Severity   = "critical" | "high" | "medium" | "low";
export type CondStatus = "open" | "in_progress" | "resolved";
export type RouteStatus = "in_use" | "not_in_use" | "confirm";

export async function getVehicleConditions(vehicleId: number) {
  return db
    .select()
    .from(vehicleConditions)
    .where(eq(vehicleConditions.vehicleId, vehicleId))
    .orderBy(desc(vehicleConditions.reportedAt));
}

export async function addCondition(data: {
  vehicleId: number;
  description: string;
  severity: Severity;
  routeStatus?: RouteStatus;
  repairEstimate?: number | null;
  note?: string;
}) {
  await db.insert(vehicleConditions).values({
    vehicleId:      data.vehicleId,
    description:    data.description,
    severity:       data.severity,
    routeStatus:    data.routeStatus ?? "confirm",
    repairEstimate: data.repairEstimate ?? null,
    note:           data.note ?? null,
    status:         "open",
  });
  revalidatePath(`/fleet/${data.vehicleId}`);
}

export async function updateCondition(id: number, vehicleId: number, data: {
  description: string;
  severity: Severity;
  status: CondStatus;
  routeStatus?: RouteStatus;
  repairEstimate?: number | null;
  note?: string;
}) {
  await db.update(vehicleConditions).set({
    description:    data.description,
    severity:       data.severity,
    status:         data.status,
    routeStatus:    data.routeStatus ?? "confirm",
    repairEstimate: data.repairEstimate ?? null,
    note:           data.note ?? null,
    resolvedAt:     data.status === "resolved" ? new Date() : null,
  }).where(eq(vehicleConditions.id, id));
  revalidatePath(`/fleet/${vehicleId}`);
}

export async function deleteCondition(id: number, vehicleId: number) {
  await db.delete(vehicleConditions).where(eq(vehicleConditions.id, id));
  revalidatePath(`/fleet/${vehicleId}`);
}

// Used by Maintenance History — all resolved conditions across all vehicles
export async function getAllResolvedConditions() {
  return db
    .select()
    .from(vehicleConditions)
    .where(eq(vehicleConditions.status, "resolved"))
    .orderBy(desc(vehicleConditions.resolvedAt));
}

// Used by the Fleet Status Report PDF — returns all vehicles with their open conditions
export async function getAllVehiclesWithConditions() {
  const allVehicles = await db.select().from(vehicles).orderBy(vehicles.unitNumber);
  const allConditions = await db
    .select()
    .from(vehicleConditions)
    .where(eq(vehicleConditions.status, "open"))
    .orderBy(vehicleConditions.vehicleId, vehicleConditions.severity);

  // Attach assigned driver name
  const allDrivers = await db
    .select({ assignedVehicleId: drivers.assignedVehicleId, name: drivers.name })
    .from(drivers);
  const driverByVehicle = new Map(
    allDrivers.filter((d) => d.assignedVehicleId).map((d) => [d.assignedVehicleId!, d.name])
  );

  return allVehicles.map((v) => ({
    ...v,
    driverName:  driverByVehicle.get(v.id) ?? null,
    conditions:  allConditions.filter((c) => c.vehicleId === v.id),
  }));
}
