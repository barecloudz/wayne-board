import AppShell from "@/components/app-shell";
import { db } from "@/lib/db";
import { vehicles, inspections, inspectionResults } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { INSPECTION_COMPONENTS } from "@/lib/inspection-components";
import { getVehicleImage } from "@/lib/vehicle-image";
import Image from "next/image";
import RepairEditor from "./repair-editor";
import Link from "next/link";

export default async function VehiclesPage() {
  const [allVehicles, allInspections, allResults] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.active, true)).orderBy(vehicles.unitNumber),
    db.select().from(inspections).orderBy(desc(inspections.inspectionDate)),
    db.select().from(inspectionResults),
  ]);

  // Build: vehicleId → latest inspection
  const latestInspMap = new Map<number, typeof allInspections[number]>();
  for (const insp of allInspections) {
    if (!latestInspMap.has(insp.vehicleId)) latestInspMap.set(insp.vehicleId, insp);
  }

  // Build: inspectionId → results[]
  const resultsByInsp = new Map<number, typeof allResults>();
  for (const r of allResults) {
    const arr = resultsByInsp.get(r.inspectionId) ?? [];
    arr.push(r);
    resultsByInsp.set(r.inspectionId, arr);
  }

  const withDefects = allVehicles.filter((v) => {
    const insp = latestInspMap.get(v.id);
    if (!insp) return false;
    const results = resultsByInsp.get(insp.id) ?? [];
    return results.some((r) => r.status === "Repair Needed");
  });

  const clean = allVehicles.filter((v) => {
    const insp = latestInspMap.get(v.id);
    if (!insp) return false;
    const results = resultsByInsp.get(insp.id) ?? [];
    return results.every((r) => r.status !== "Repair Needed");
  });

  const uninspected = allVehicles.filter((v) => !latestInspMap.has(v.id));

  const totalDefects = withDefects.reduce((sum, v) => {
    const insp = latestInspMap.get(v.id)!;
    const results = resultsByInsp.get(insp.id) ?? [];
    return sum + results.filter((r) => r.status === "Repair Needed").length;
  }, 0);

  const totalCost = withDefects.reduce((sum, v) => {
    const insp = latestInspMap.get(v.id)!;
    const results = resultsByInsp.get(insp.id) ?? [];
    return sum + results
      .filter((r) => r.status === "Repair Needed" && r.repairCost)
      .reduce((s, r) => s + (r.repairCost ?? 0), 0);
  }, 0);

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            742 Logistics · Fleet Maintenance
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Vehicles
          </h1>
          <p className="text-[13px] text-slate-400 mt-1.5">
            Open defects, repair instructions, and cost estimates.
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total Vehicles",   value: allVehicles.length.toString(),  color: "text-slate-900" },
            { label: "Need Repairs",     value: withDefects.length.toString(),   color: "text-amber-600" },
            { label: "Open Defects",     value: totalDefects.toString(),         color: "text-red-600" },
            { label: "Est. Repair Cost", value: totalCost > 0 ? `$${totalCost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—", color: "text-indigo-600" },
          ].map((kpi) => (
            <div key={kpi.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{kpi.label}</p>
              <span className={`text-[22px] font-extrabold leading-none tracking-tight ${kpi.color}`}>{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* Vehicles needing repairs */}
        {withDefects.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-3">
              Needs Repair · {withDefects.length} {withDefects.length === 1 ? "vehicle" : "vehicles"}
            </h2>
            <div className="flex flex-col gap-4">
              {withDefects.map((vehicle) => {
                const insp = latestInspMap.get(vehicle.id)!;
                const results = (resultsByInsp.get(insp.id) ?? []).filter((r) => r.status === "Repair Needed");
                const vehicleImg = getVehicleImage(vehicle.model);
                const vehicleCost = results.reduce((s, r) => s + (r.repairCost ?? 0), 0);

                return (
                  <div key={vehicle.id}
                    className="bg-white rounded-2xl border border-amber-200/60 overflow-hidden
                      shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {vehicleImg && (
                          <Image src={vehicleImg} alt={vehicle.model}
                            width={100} height={56}
                            className="w-[80px] h-auto object-contain shrink-0 hidden sm:block"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[18px] font-extrabold text-slate-900 tracking-tight">{vehicle.unitNumber}</span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              {results.length} defect{results.length !== 1 ? "s" : ""}
                            </span>
                            {vehicleCost > 0 && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                                Est. ${vehicleCost.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-slate-400 mt-0.5">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                            {vehicle.vin && ` · VIN: ${vehicle.vin.slice(0,8)}...${vehicle.vin.slice(-4)}`}
                          </p>
                          <p className="text-[11px] text-slate-300 mt-0.5">Inspected {insp.inspectionDate} by {insp.inspectorName}</p>
                        </div>
                      </div>
                      <Link href={`/fleet/${vehicle.id}`}
                        className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-800 shrink-0 transition-colors">
                        View →
                      </Link>
                    </div>

                    {/* Defect rows */}
                    <div className="divide-y divide-slate-100">
                      {results.map((result) => {
                        const component = INSPECTION_COMPONENTS.find((c) => c.id === result.componentId);
                        return (
                          <RepairEditor
                            key={result.id}
                            resultId={result.id}
                            componentName={component?.name ?? `Component ${result.componentId}`}
                            inspectorNotes={result.notes ?? ""}
                            repairInstructions={result.repairInstructions ?? ""}
                            repairCost={result.repairCost ?? null}
                            dateRepaired={result.dateRepaired ?? null}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Clean vehicles */}
        {clean.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-3">
              No Open Defects · {clean.length} {clean.length === 1 ? "vehicle" : "vehicles"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {clean.map((vehicle) => (
                <Link key={vehicle.id} href={`/fleet/${vehicle.id}`}
                  className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 flex items-center gap-3
                    hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 truncate">{vehicle.unitNumber}</p>
                    <p className="text-[11px] text-slate-400 truncate">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Uninspected */}
        {uninspected.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Not Yet Inspected · {uninspected.length} {uninspected.length === 1 ? "vehicle" : "vehicles"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {uninspected.map((vehicle) => (
                <Link key={vehicle.id} href={`/fleet/${vehicle.id}/inspect`}
                  className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 flex items-center gap-3
                    hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all duration-200">
                  <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 truncate">{vehicle.unitNumber}</p>
                    <p className="text-[11px] text-slate-400 truncate">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
