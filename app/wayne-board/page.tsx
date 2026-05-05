import AppShell from "@/components/app-shell";
import FleetCard from "@/components/cards/fleet-card";
import PayrollCard from "@/components/cards/payroll-card";
import DriversCard from "@/components/cards/drivers-card";
import RoutesCard from "@/components/cards/routes-card";
import { db } from "@/lib/db";
import { vehicles, drivers, inspections } from "@/lib/schema";
import { count, eq } from "drizzle-orm";

export default async function Home() {
  const [[{ vehicleCount }], [{ driverCount }], [{ completedCount }], [{ oosCount }]] =
    await Promise.all([
      db.select({ vehicleCount: count() }).from(vehicles).where(eq(vehicles.active, true)),
      db.select({ driverCount: count() }).from(drivers).where(eq(drivers.active, true)),
      db.select({ completedCount: count() }).from(inspections).where(eq(inspections.status, "Complete")),
      db.select({ oosCount: count() }).from(inspections).where(eq(inspections.status, "Out of Service")),
    ]);

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            742 Logistics · FedEx Ground Contractor
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Operations Overview
          </h1>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Active Trucks",    value: vehicleCount.toString(),  trend: null },
            { label: "Active Drivers",   value: driverCount.toString(),   trend: null },
            { label: "Q2 Inspections",   value: completedCount.toString(), trend: null },
            { label: "Out of Service",   value: oosCount.toString(),      trend: null },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4
                shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {kpi.label}
              </p>
              <div className="flex items-end gap-2">
                <span className="text-[22px] font-extrabold text-slate-900 leading-none tracking-tight">
                  {kpi.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Report cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FleetCard vehicleCount={vehicleCount} inspectedCount={completedCount} />
          <PayrollCard />
          <DriversCard driverCount={driverCount} />
          <RoutesCard />
        </div>
      </main>
    </AppShell>
  );
}
