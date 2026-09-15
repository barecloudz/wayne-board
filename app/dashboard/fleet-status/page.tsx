export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = { title: "Fleet Status" };
import { db } from "@/lib/db";
import { vehicles, drivers, vehicleConditions, dailyWorkAreaAssignments } from "@/lib/schema";
import { eq } from "drizzle-orm";
import FleetStatusClient from "./fleet-status-client";
import { getAllResolvedConditions } from "@/lib/actions/vehicle-conditions";

export default async function FleetStatusPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [allVehicles, allDriversBase, todayAssignments, allConditions, resolvedConditions] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.unitNumber),
    db.select({ id: drivers.id, driverId: drivers.driverId, name: drivers.name, active: drivers.active }).from(drivers).orderBy(drivers.name),
    db.select({ driverId: dailyWorkAreaAssignments.driverId, vehicleId: dailyWorkAreaAssignments.vehicleId }).from(dailyWorkAreaAssignments).where(eq(dailyWorkAreaAssignments.date, today)),
    db.select().from(vehicleConditions)
      .where(eq(vehicleConditions.status, "open"))
      .orderBy(vehicleConditions.vehicleId, vehicleConditions.severity),
    getAllResolvedConditions(),
  ]);
  const vehicleByDriver = new Map(todayAssignments.filter((a) => a.vehicleId).map((a) => [a.driverId, a.vehicleId!]));
  const allDrivers = allDriversBase.map((d) => ({ ...d, assignedVehicleId: vehicleByDriver.get(d.driverId) ?? null }));

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
