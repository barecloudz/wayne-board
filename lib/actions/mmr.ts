"use server";

import { db } from "@/lib/db";
import { vehicles, locations, vehicleMaintenanceRecords, mmrGenerations, organizations } from "@/lib/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return { orgId: session.organizationId, driverId: session.driverId };
}

export type VehicleMmrRow = {
  id: number;
  unitNumber: string;
  mileage: number;
  stationCode: string | null;
  maintenanceCount: number;
  lastGenerated: Date | null;
  lastGeneratedBy: string | null;
};

export async function getVehiclesForMmrDashboard(monthYear: string): Promise<VehicleMmrRow[]> {
  const { orgId } = await requireOrg();

  const [year, month] = monthYear.split("-").map(Number);
  const firstDay = `${monthYear}-01`;
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

  const vehicleRows = await db
    .select({
      id:          vehicles.id,
      unitNumber:  vehicles.unitNumber,
      mileage:     vehicles.mileage,
      stationCode: locations.terminalId,
    })
    .from(vehicles)
    .leftJoin(locations, eq(vehicles.locationId, locations.id))
    .where(and(eq(vehicles.organizationId, orgId), eq(vehicles.active, true)))
    .orderBy(vehicles.unitNumber);

  const maintRows = await db
    .select({
      vehicleId: vehicleMaintenanceRecords.vehicleId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(vehicleMaintenanceRecords)
    .where(
      and(
        eq(vehicleMaintenanceRecords.organizationId, orgId),
        gte(vehicleMaintenanceRecords.serviceDate, firstDay),
        lte(vehicleMaintenanceRecords.serviceDate, lastDay)
      )
    )
    .groupBy(vehicleMaintenanceRecords.vehicleId);

  const maintMap = new Map<number, number>();
  for (const r of maintRows) {
    if (r.vehicleId !== null) maintMap.set(r.vehicleId, r.cnt);
  }

  const genRows = await db
    .select({
      vehicleId:   mmrGenerations.vehicleId,
      generatedAt: mmrGenerations.generatedAt,
      generatedBy: mmrGenerations.generatedBy,
    })
    .from(mmrGenerations)
    .where(
      and(
        eq(mmrGenerations.organizationId, orgId),
        eq(mmrGenerations.monthYear, monthYear)
      )
    );

  const genMap = new Map<number, { generatedAt: Date | null; generatedBy: string }>();
  for (const r of genRows) {
    genMap.set(r.vehicleId, { generatedAt: r.generatedAt, generatedBy: r.generatedBy });
  }

  return vehicleRows.map((v) => ({
    id:              v.id,
    unitNumber:      v.unitNumber,
    mileage:         v.mileage,
    stationCode:     v.stationCode ?? null,
    maintenanceCount: maintMap.get(v.id) ?? 0,
    lastGenerated:   genMap.get(v.id)?.generatedAt ?? null,
    lastGeneratedBy: genMap.get(v.id)?.generatedBy ?? null,
  }));
}

export async function recordMmrGeneration(
  entries: { vehicleId: number; monthYear: string; mileageSnapshot: string; maintenanceRowCount: number }[]
): Promise<void> {
  const { orgId, driverId } = await requireOrg();

  for (const entry of entries) {
    await db
      .insert(mmrGenerations)
      .values({
        organizationId:      orgId,
        vehicleId:           entry.vehicleId,
        monthYear:           entry.monthYear,
        mileageSnapshot:     entry.mileageSnapshot,
        maintenanceRowCount: entry.maintenanceRowCount,
        generatedBy:         driverId,
      })
      .onConflictDoUpdate({
        target: [mmrGenerations.organizationId, mmrGenerations.vehicleId, mmrGenerations.monthYear],
        set: {
          mileageSnapshot:     entry.mileageSnapshot,
          maintenanceRowCount: entry.maintenanceRowCount,
          generatedBy:         driverId,
          generatedAt:         sql`now()`,
        },
      });
  }

  revalidatePath("/dashboard/mmr");
}

export async function getOrgName(): Promise<string> {
  const { orgId } = await requireOrg();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return org?.name ?? "MyGroundOps";
}
