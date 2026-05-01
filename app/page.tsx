import AppShell from "@/components/app-shell";
import FleetCard from "@/components/cards/fleet-card";
import PayrollCard from "@/components/cards/payroll-card";
import DriversCard from "@/components/cards/drivers-card";
import RoutesCard from "@/components/cards/routes-card";

export default function Home() {
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
            { label: "Active Vehicles", value: "12", trend: null },
            { label: "Weekly Payroll", value: "$14,280", trend: "+2.1%" },
            { label: "Fleet ILS Score", value: "99.2%", trend: "+0.3%" },
            { label: "Routes Covered", value: "12 / 12", trend: null },
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
                {kpi.trend && (
                  <span className="text-[11px] font-semibold text-emerald-500 mb-0.5">
                    ↑ {kpi.trend}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Report cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FleetCard />
          <PayrollCard />
          <DriversCard />
          <RoutesCard />
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Prototype · data is illustrative · Wayne Board by Blake Nardoni
        </p>
      </main>
    </AppShell>
  );
}
