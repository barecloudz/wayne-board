export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = { title: "Maintenance" };
import { getAllMaintenanceRequests, getMaintenanceRecords } from "@/lib/actions/maintenance";
import { getVehicles } from "@/lib/actions/vehicles";
import MaintenanceAdmin from "./maintenance-admin";

export default async function MaintenancePage() {
  const [requests, records, vehicles] = await Promise.all([
    getAllMaintenanceRequests(),
    getMaintenanceRecords(),
    getVehicles(),
  ]);
  return (
    <AppShell>
      <MaintenanceAdmin
        initial={requests as any}
        initialRecords={records as any}
        vehicles={vehicles.map(v => ({ id: v.id, unitNumber: v.unitNumber }))}
      />
    </AppShell>
  );
}
