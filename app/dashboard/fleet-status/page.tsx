export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = { title: "Fleet Status" };
import { db } from "@/lib/db";
import { vehicles, drivers, vehicleConditions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import FleetStatusClient from "./fleet-status-client";
import { getAllResolvedConditions } from "@/lib/actions/vehicle-conditions";

export default async function FleetStatusPage() {
  const [allVehicles, allDrivers, allConditions, resolvedConditions] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.unitNumber),
    db.select({
      id:                drivers.id,
      driverId:          drivers.driverId,
      name:              drivers.name,
      assignedVehicleId: drivers.assignedVehicleId,
      active:            drivers.active,
    }).from(drivers).orderBy(drivers.name),
    db.select().from(vehicleConditions)
      .where(eq(vehicleConditions.status, "open"))
      .orderBy(vehicleConditions.vehicleId, vehicleConditions.severity),
    getAllResolvedConditions(),
  ]);

  // Group open conditions by vehicleId
  const conditionsByVehicle: Record<number, typeof allConditions> = {};
  for (const c of allConditions) {
    if (!conditionsByVehicle[c.vehicleId]) conditionsByVehicle[c.vehicleId] = [];
    conditionsByVehicle[c.vehicleId].push(c);
  }

  return (
    <AppShell>
      <FleetStatusClient
        vehicles={allVehicles as any}
        drivers={allDrivers}
        conditionsByVehicle={conditionsByVehicle as any}
        resolvedConditions={resolvedConditions as any}
      />
    </AppShell>
  );
}
