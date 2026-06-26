export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import { db } from "@/lib/db";
import { vehicles, drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import FleetStatusClient from "./fleet-status-client";

export default async function FleetStatusPage() {
  const [allVehicles, allDrivers] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.unitNumber),
    db.select({
      id:                drivers.id,
      driverId:          drivers.driverId,
      name:              drivers.name,
      assignedVehicleId: drivers.assignedVehicleId,
      active:            drivers.active,
    }).from(drivers).orderBy(drivers.name),
  ]);

  return (
    <AppShell>
      <FleetStatusClient vehicles={allVehicles as any} drivers={allDrivers} />
    </AppShell>
  );
}
