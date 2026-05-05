import Link from "next/link";
import AppShell from "@/components/app-shell";
import { getVehicles } from "@/lib/actions/vehicles";
import FleetHeader from "./fleet-header";

export default async function FleetPage() {
  const trucks = await getVehicles();

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              742 Logistics · FedEx Ground Contractor
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Fleet Inspections
            </h1>
            <p className="text-[13px] text-slate-400 mt-1.5">
              Quarterly U.S. Vehicle Inspection Checklist (M-121) tracking
            </p>
          </div>
          <FleetHeader trucks={trucks} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Trucks",       value: trucks.length,                                          dot: "bg-slate-400",   accent: "text-slate-900" },
            { label: "Inspected Q2",       value: 0,                                                      dot: "bg-indigo-400",  accent: "text-indigo-600" },
            { label: "Defects Pending",    value: 0,                                                      dot: "bg-amber-400",   accent: "text-amber-600" },
            { label: "Out of Service",     value: 0,                                                      dot: "bg-red-400",     accent: "text-red-600" },
          ].map((kpi) => (
            <div key={kpi.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4
                shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`w-1.5 h-1.5 rounded-full ${kpi.dot}`} />
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              </div>
              <span className={`text-[28px] font-extrabold leading-none tracking-tight ${kpi.accent}`}>
                {kpi.value}
              </span>
            </div>
          ))}
        </div>

        {/* Cycle banner */}
        <div className="bg-white rounded-xl border border-slate-200/80 px-6 py-4 mb-8
          shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Q2 2026 Inspection Cycle</span>
              <span className="text-slate-200">·</span>
              <span className="text-[11px] text-slate-400">Next cycle begins July 1, 2026</span>
            </div>
            <p className="text-[13px] font-semibold text-slate-700 mb-2">
              0 of {trucks.length} trucks inspected this quarter
            </p>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" style={{ width: "0%" }} />
            </div>
          </div>
          <p className="text-[12px] text-slate-400 shrink-0">Inspections begin once workflow is live.</p>
        </div>

        {/* Truck grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trucks.map((truck) => (
            <Link
              key={truck.id}
              href={`/fleet/${truck.id}`}
              className="group block bg-white rounded-2xl border border-slate-200/80 p-5
                shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]
                hover:shadow-[0_8px_28px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.05)]
                hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-none">
                  {truck.unitNumber}
                </span>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full
                  bg-slate-100 text-slate-500 border border-slate-200/80">
                  Inspection Due
                </span>
              </div>
              <p className="text-[13px] text-slate-500 mb-1">
                {truck.year} {truck.make} {truck.model}
              </p>
              <p className="text-[11px] text-slate-400 font-mono mb-3">
                VIN: {truck.vin.slice(0, 8)}...{truck.vin.slice(-5)}
              </p>
              <div className="text-[12px] text-slate-400 mb-3">
                {truck.mileage.toLocaleString()} mi
              </div>
              <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                <span className="text-[12px] font-medium text-indigo-600 group-hover:text-indigo-800 transition-colors">
                  View Details →
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          M-121 · U.S. Quarterly Vehicle Inspection Checklist · 742 Logistics
        </p>
      </main>
    </AppShell>
  );
}
