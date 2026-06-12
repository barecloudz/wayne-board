import AppShell from "@/components/app-shell";
import { getAllMaintenanceRequests } from "@/lib/actions/maintenance";
import MaintenanceAdmin from "./maintenance-admin";

export default async function MaintenancePage() {
  const requests = await getAllMaintenanceRequests();
  return (
    <AppShell>
      <MaintenanceAdmin initial={requests as any} />
    </AppShell>
  );
}
