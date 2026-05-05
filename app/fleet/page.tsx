import Link from "next/link";
import Image from "next/image";
import AppShell from "@/components/app-shell";
import { db } from "@/lib/db";
import { vehicles, inspections } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import FleetHeader from "./fleet-header";

function getVehicleImage(model: string): string | null {
  const m = model.toLowerCase();
  if (m.includes("transit")) return "/transit.png";
  if (m.includes("p1000") || m.includes("promaster 1000")) return "/p1000.png";
  return null;
}

type InspectionStatus = "Complete" | "Defects Pending Repair" | "Out of Service" | "Draft";

const STATUS_BADGE: Record<InspectionStatus | "None", { label: string; className: string }> = {
  Complete:               { label: "Inspected ✓",        className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "Defects Pending Repair": { label: "Defects Pending",   className: "bg-amber-50 text-amber-700 border-amber-200" },
  "Out of Service":       { label: "Out of Service",      className: "bg-red-50 text-red-700 border-red-200" },
  Draft:                  { label: "Draft",               className: "bg-slate-100 text-slate-500 border-slate-200" },
  None:                   { label: "Inspection Due",      className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export default async function FleetPage() {
  const trucks = await db.select().from(vehicles).orderBy(vehicles.unitNumber);

  // Get latest inspection per vehicle
  const allInspections = await db
    .select({
      vehicleId: inspections.vehicleId,
      status:    inspections.status,
      inspectionDate: inspections.inspectionDate,
    })
    .from(inspections)
    .orderBy(desc(inspections.createdAt));

  const latestByVehicle = new Map<number, { status: string; date: string }>();
  for (const insp of allInspections) {
    if (!latestByVehicle.has(insp.vehicleId)) {
      latestByVehicle.set(insp.vehicleId, { status: insp.status, date: insp.inspectionDate });
    }
  }

  // Stats
  const inspectedCount  = trucks.filter(t => latestByVehicle.get(t.id)?.status === "Complete").length;
  const defectsCount    = trucks.filter(t => latestByVehicle.get(t.id)?.status === "Defects Pending Repair").length;
  const oosCount        = trucks.filter(t => latestByVehicle.get(t.id)?.status === "Out of Service").length;
  const doneCount       = inspectedCount + defectsCount + oosCount;
  const progressPct     = trucks.length > 0 ? Math.round((doneCount / trucks.length) * 100) : 0;

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
            { label: "Total Trucks",    value: trucks.length,  dot: "bg-slate-400",   accent: "text-slate-900" },
            { label: "Inspected Q2",    value: inspectedCount, dot: "bg-emerald-400", accent: "text-emerald-600" },
            { label: "Defects Pending", value: defectsCount,   dot: "bg-amber-400",   accent: "text-amber-600" },
            { label: "Out of Service",  value: oosCount,       dot: "bg-red-400",     accent: "text-red-600" },
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
              {doneCount} of {trucks.length} trucks inspected this quarter
            </p>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <span className={`text-[12px] font-semibold shrink-0 ${progressPct === 100 ? "text-emerald-600" : "text-slate-400"}`}>
            {progressPct === 100 ? "All trucks done ✓" : `${progressPct}% complete`}
          </span>
        </div>

        {/* Truck grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trucks.map((truck) => {
            const latest = latestByVehicle.get(truck.id);
            const statusKey = (latest?.status ?? "None") as InspectionStatus | "None";
            const badge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.None;
            const vehicleImg = getVehicleImage(truck.model);

            return (
              <Link
                key={truck.id}
                href={`/fleet/${truck.id}`}
                className="group relative block bg-white rounded-2xl border border-slate-200/80 p-5
                  shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]
                  hover:shadow-[0_8px_28px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.05)]
                  hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
              >
                {/* Text content — right-padded when image present */}
                <div className={vehicleImg ? "pr-[140px] sm:pr-[152px]" : ""}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-none">
                      {truck.unitNumber}
                    </span>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-500 mb-1">
                    {truck.year} {truck.make} {truck.model}
                  </p>
                  {truck.vin && truck.vin.length === 17 ? (
                    <p className="text-[11px] text-slate-400 font-mono mb-3">
                      VIN: {truck.vin.slice(0, 8)}...{truck.vin.slice(-5)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-300 font-mono mb-3">VIN not scanned</p>
                  )}
                  <div className="text-[12px] text-slate-400 mb-3">
                    {truck.mileage.toLocaleString()} mi
                    {latest?.date && (
                      <span className="ml-2 text-slate-300">· Inspected {latest.date}</span>
                    )}
                  </div>
                </div>

                {/* Vehicle image — absolutely positioned, non-interactive */}
                {vehicleImg && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[148px] sm:w-[160px] pointer-events-none select-none">
                    <Image
                      src={vehicleImg}
                      alt={truck.model}
                      width={320}
                      height={180}
                      className="w-full h-auto object-contain drop-shadow-sm"
                      priority={false}
                    />
                  </div>
                )}

                <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                  <span className="text-[12px] font-medium text-indigo-600 group-hover:text-indigo-800 transition-colors">
                    View Details →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          M-121 · U.S. Quarterly Vehicle Inspection Checklist · 742 Logistics
        </p>
      </main>
    </AppShell>
  );
}
