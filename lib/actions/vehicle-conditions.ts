"use server";

import { db } from "@/lib/db";
import { vehicles, vehicleConditions, drivers, dailyWorkAreaAssignments } from "@/lib/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

async function requireOrgVehicle(orgId: number, vehicleId: number) {
  const [v] = await db.select({ id: vehicles.id }).from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, orgId)))
    .limit(1);
  if (!v) throw new Error("Vehicle not found");
}

export type Severity   = "critical" | "high" | "medium" | "low";
export type CondStatus = "open" | "in_progress" | "resolved";
export type RouteStatus = "in_use" | "not_in_use" | "confirm";

export async function getVehicleConditions(vehicleId: number) {
  const orgId = await requireOrg();
  await requireOrgVehicle(orgId, vehicleId);
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
  const VALID_SEVERITY: Severity[] = ["low", "medium", "high", "critical"];
  if (!VALID_SEVERITY.includes(data.severity)) throw new Error("Invalid severity");
  const orgId = await requireOrg();
  await requireOrgVehicle(orgId, data.vehicleId);
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
  const VALID_SEVERITY: Severity[] = ["low", "medium", "high", "critical"];
  if (!VALID_SEVERITY.includes(data.severity)) throw new Error("Invalid severity");
  const VALID_STATUS: CondStatus[] = ["open", "in_progress", "resolved"];
  if (!VALID_STATUS.includes(data.status)) throw new Error("Invalid status");
  const orgId = await requireOrg();
  await requireOrgVehicle(orgId, vehicleId);
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
  const orgId = await requireOrg();
  await requireOrgVehicle(orgId, vehicleId);
  await db.delete(vehicleConditions).where(eq(vehicleConditions.id, id));
  revalidatePath(`/fleet/${vehicleId}`);
}

// Used by Maintenance History · all resolved conditions across all vehicles
export async function getAllResolvedConditions() {
  const orgId = await requireOrg();
  const orgVehicles = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.organizationId, orgId));
  const vehicleIds = orgVehicles.map((v) => v.id);
  if (vehicleIds.length === 0) return [];
  return db
    .select()
    .from(vehicleConditions)
    .where(and(eq(vehicleConditions.status, "resolved"), inArray(vehicleConditions.vehicleId, vehicleIds)))
    .orderBy(desc(vehicleConditions.resolvedAt));
}

// Used by the Fleet Status Report PDF · returns all vehicles with their open conditions
export async function getAllVehiclesWithConditions() {
  const orgId = await requireOrg();
  const today = new Date().toISOString().slice(0, 10);

  // Two parallel SQL JOIN queries instead of four sequential ones:
  // 1. Vehicles LEFT JOIN assignments LEFT JOIN drivers — resolves driverName per vehicle
  // 2. Open conditions (already filtered to org vehicles via the outer join result)
  const [vehicleDriverRows, allConditions] = await Promise.all([
    db
      .select({
        vehicle: vehicles,
        driverName: drivers.name,
      })
      .from(vehicles)
      .leftJoin(
        dailyWorkAreaAssignments,
        and(
          eq(dailyWorkAreaAssignments.vehicleId, vehicles.id),
          eq(dailyWorkAreaAssignments.date, today)
        )
      )
      .leftJoin(drivers, eq(drivers.driverId, dailyWorkAreaAssignments.driverId))
      .where(eq(vehicles.organizationId, orgId))
      .orderBy(vehicles.unitNumber),
    db
      .select()
      .from(vehicleConditions)
      .leftJoin(vehicles, eq(vehicleConditions.vehicleId, vehicles.id))
      .where(and(eq(vehicleConditions.status, "open"), eq(vehicles.organizationId, orgId)))
      .orderBy(vehicleConditions.vehicleId, vehicleConditions.severity),
  ]);

  // Group conditions by vehicleId
  const conditionsByVehicle = new Map<number, (typeof allConditions)[number]["vehicle_conditions"][]>();
  for (const row of allConditions) {
    const cond = row.vehicle_conditions;
    const list = conditionsByVehicle.get(cond.vehicleId) ?? [];
    list.push(cond);
    conditionsByVehicle.set(cond.vehicleId, list);
  }

  return vehicleDriverRows.map((row) => ({
    ...row.vehicle,
    driverName: row.driverName ?? null,
    conditions: conditionsByVehicle.get(row.vehicle.id) ?? [],
  }));
}
