import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/app-shell";
import { db } from "@/lib/db";
import { vehicles, inspections, inspectionResults } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { INSPECTION_COMPONENTS } from "@/lib/inspection-components";
import { InspectionStatus } from "@/lib/inspection-types";
import VehicleEditModal from "./vehicle-edit-modal";
import InspectionActions from "./inspection-actions";
import VehicleDeleteButton from "./vehicle-delete-button";

const STATUS_STYLES: Record<InspectionStatus, { cell: string; dot: string; label: string }> = {
  OK:              { cell: "text-emerald-700", dot: "bg-emerald-400", label: "OK" },
  "Repair Needed": { cell: "text-amber-700",   dot: "bg-amber-400",   label: "Repair Needed" },
  "N/A":           { cell: "text-slate-400",   dot: "bg-slate-200",   label: "N/A" },
  "A/D":           { cell: "text-indigo-600",  dot: "bg-indigo-300",  label: "A/D" },
};

const CARD = "bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const id = parseInt(vehicleId);
  if (isNaN(id)) notFound();

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (!vehicle) notFound();

  const [latestInspection] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.vehicleId, id))
    .orderBy(desc(inspections.inspectionDate))
    .limit(1);

  const results = latestInspection
    ? await db
        .select()
        .from(inspectionResults)
        .where(eq(inspectionResults.inspectionId, latestInspection.id))
    : [];

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-6">
          <Link href="/fleet" className="hover:text-indigo-600 transition-colors">Fleet Inspections</Link>
          <span>/</span>
          <span className="text-slate-700 font-medium">{vehicle.unitNumber}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
              742 Logistics · FedEx Ground Contractor
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              {vehicle.unitNumber}
            </h1>
            <p className="text-[14px] text-slate-500 mt-1">
              {vehicle.year} {vehicle.make} {vehicle.model} &middot; {vehicle.mileage.toLocaleString()} mi
            </p>
            {vehicle.vin && (
              <p className="text-[12px] text-slate-400 mt-0.5 font-mono">VIN: {vehicle.vin}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <VehicleDeleteButton vehicleId={vehicle.id} />
            <VehicleEditModal vehicle={vehicle} />
            {latestInspection ? (
              <>
                <InspectionActions
                  inspectionId={latestInspection.id}
                  vehicleId={vehicle.id}
                />
                <a
                  href={`/api/inspection-pdf/${latestInspection.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold border border-slate-200
                    text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300
                    active:scale-[0.98] transition-all duration-150"
                >
                  Generate PDF
                </a>
              </>
            ) : (
              <button disabled
                className="px-4 py-2 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-400 bg-white cursor-not-allowed">
                Generate PDF
              </button>
            )}
            <Link
              href={`/fleet/${vehicle.id}/inspect`}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                hover:bg-slate-700 active:scale-[0.98] transition-all duration-150 shadow-sm"
            >
              Start New Inspection
            </Link>
          </div>
        </div>

        {latestInspection ? (
          <>
            {/* Inspection meta */}
            <div className={`${CARD} p-6 mb-6`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-bold text-slate-900">Latest Inspection</h2>
                <StatusBadge status={latestInspection.status} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Date",       value: latestInspection.inspectionDate },
                  { label: "Inspector",  value: latestInspection.inspectorName },
                  { label: "Station",    value: `${latestInspection.stationName} #${latestInspection.stationNumber}` },
                  { label: "Inspector ID", value: latestInspection.inspectorId },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                    <p className="text-[13px] font-semibold text-slate-800">{f.value}</p>
                  </div>
                ))}
              </div>
              {latestInspection.outOfService && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200/80 rounded-lg">
                  <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-0.5">Out of Service</p>
                  <p className="text-[13px] text-red-700">{latestInspection.outOfServiceDocs}</p>
                </div>
              )}
            </div>

            {/* Results table */}
            <div className={`${CARD} overflow-hidden mb-8`}>
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-[14px] font-bold text-slate-900">M-121 Inspection Results</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">20 components</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Component</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Regulation</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-32">Status</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INSPECTION_COMPONENTS.map((component, idx) => {
                      const result = results.find((r) => r.componentId === component.id);
                      const status = (result?.status ?? "N/A") as InspectionStatus;
                      const styles = STATUS_STYLES[status];
                      return (
                        <tr key={component.id}
                          className={`border-b border-slate-100/80 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"} ${status === "Repair Needed" ? "bg-amber-50/40" : ""}`}>
                          <td className="px-6 py-3 text-slate-400 font-mono text-[11px]">{String(component.id).padStart(2, "0")}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium text-slate-800">{component.name}</span>
                            {component.requiresAccess && <span className="text-slate-300 text-[10px] ml-1">*</span>}
                            {(component.tractorOnly || component.vansOnly) && (
                              <span className="block text-[10px] text-slate-400">
                                {component.tractorOnly ? "Tractors only" : "Vans only"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-400 text-[11px] hidden sm:table-cell">{component.regulation}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} shrink-0`} />
                              <span className={`font-semibold ${styles.cell}`}>{styles.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-500 text-[12px] hidden md:table-cell">
                            {result?.notes ?? <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className={`${CARD} p-10 text-center mb-8`}>
            <p className="text-slate-400 text-[14px]">No inspection on record for this truck.</p>
            <p className="text-slate-300 text-[12px] mt-1">Use "Start New Inspection" to begin the M-121 checklist.</p>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Complete:               "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
    "Defects Pending Repair": "bg-amber-50 text-amber-700 border border-amber-200/80",
    "Out of Service":       "bg-red-50 text-red-700 border border-red-200/80",
    Draft:                  "bg-slate-100 text-slate-500 border border-slate-200/80",
  };
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${map[status] ?? map.Draft}`}>
      {status}
    </span>
  );
}
