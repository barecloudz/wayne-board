"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, Loader2, ChevronDown, ChevronUp, FileDown } from "lucide-react";
import { setVehicleActive, updateVehicleCompliance } from "@/lib/actions/vehicles";

type Vehicle = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  type: string;
  ownership: string;
  active: boolean;
  mmrDue: string | null;
  federalInspectionDue: string | null;
  registrationExpiry: string | null;
};

type Driver = {
  id: number;
  driverId: string;
  name: string;
  assignedVehicleId: number | null;
  active: boolean;
};

const INPUT = "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition";

function statusOf(v: Vehicle, today: string) {
  const issues: string[] = [];
  if (v.mmrDue && v.mmrDue < today) issues.push("MMR Overdue");
  if (v.federalInspectionDue && v.federalInspectionDue < today) issues.push("Fed Insp. Overdue");
  if (v.registrationExpiry && v.registrationExpiry < today) issues.push("Reg. Expired");
  const warning: string[] = [];
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  if (v.mmrDue && v.mmrDue >= today && v.mmrDue <= soonStr) warning.push("MMR Due Soon");
  if (v.federalInspectionDue && v.federalInspectionDue >= today && v.federalInspectionDue <= soonStr) warning.push("Fed Insp. Due Soon");
  if (v.registrationExpiry && v.registrationExpiry >= today && v.registrationExpiry <= soonStr) warning.push("Reg. Expiring Soon");
  return { issues, warning };
}

function fmt(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function ComplianceDot({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="w-2 h-2 rounded-full bg-slate-200 inline-block shrink-0" />;
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  if (date < today) return <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />;
  if (date <= soonStr) return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />;
}

function VehicleRow({
  vehicle, assignedDriver, today, onToggleActive,
}: {
  vehicle: Vehicle;
  assignedDriver: Driver | undefined;
  today: string;
  onToggleActive: (id: number, active: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [ownership, setOwnership] = useState(vehicle.ownership);
  const [mmrDue, setMmrDue] = useState(vehicle.mmrDue ?? "");
  const [fedDue, setFedDue] = useState(vehicle.federalInspectionDue ?? "");
  const [regExp, setRegExp] = useState(vehicle.registrationExpiry ?? "");
  const [isPending, startTransition] = useTransition();
  const { issues, warning } = statusOf(vehicle, today);

  function handleSave() {
    startTransition(async () => {
      await updateVehicleCompliance(vehicle.id, {
        ownership,
        mmrDue: mmrDue || null,
        federalInspectionDue: fedDue || null,
        registrationExpiry: regExp || null,
      });
      setEditing(false);
    });
  }

  return (
    <tr className={`border-b border-slate-100 ${!vehicle.active ? "opacity-50" : ""}`}>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${vehicle.active ? "bg-emerald-400" : "bg-slate-300"}`} />
          <span className="text-[13px] font-bold text-slate-900">{vehicle.unitNumber}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-[12px] font-semibold text-slate-700">{vehicle.year} {vehicle.make} {vehicle.model}</p>
        <p className="text-[11px] text-slate-400 capitalize">{vehicle.type}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
          ownership === "rental" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-50 text-slate-600 border-slate-200"
        }`}>
          {ownership === "rental" ? "Rental" : "Owned"}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {assignedDriver
          ? <span className="text-[12px] font-semibold text-slate-700">{assignedDriver.name}</span>
          : <span className="text-[12px] text-slate-300">Unassigned</span>}
      </td>
      {editing ? (
        <td className="px-4 py-3" colSpan={4}>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              <div className="flex flex-col gap-0.5 min-w-[120px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">MMR Due</label>
                <input type="date" value={mmrDue} onChange={(e) => setMmrDue(e.target.value)} className={INPUT} />
              </div>
              <div className="flex flex-col gap-0.5 min-w-[120px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fed Inspection Due</label>
                <input type="date" value={fedDue} onChange={(e) => setFedDue(e.target.value)} className={INPUT} />
              </div>
              <div className="flex flex-col gap-0.5 min-w-[120px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registration Expiry</label>
                <input type="date" value={regExp} onChange={(e) => setRegExp(e.target.value)} className={INPUT} />
              </div>
              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ownership</label>
                <select value={ownership} onChange={(e) => setOwnership(e.target.value)} className={INPUT}>
                  <option value="owned">Owned</option>
                  <option value="rental">Rental</option>
                </select>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={handleSave} disabled={isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40">
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save
              </button>
              <button onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </td>
      ) : (
        <>
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <ComplianceDot date={vehicle.mmrDue} today={today} />
              <span className="text-[11px] text-slate-500">{fmt(vehicle.mmrDue)}</span>
            </div>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <ComplianceDot date={vehicle.federalInspectionDue} today={today} />
              <span className="text-[11px] text-slate-500">{fmt(vehicle.federalInspectionDue)}</span>
            </div>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <ComplianceDot date={vehicle.registrationExpiry} today={today} />
              <span className="text-[11px] text-slate-500">{fmt(vehicle.registrationExpiry)}</span>
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="flex flex-col gap-0.5">
              {issues.map((i) => (
                <span key={i} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">{i}</span>
              ))}
              {warning.map((w) => (
                <span key={w} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">{w}</span>
              ))}
              {issues.length === 0 && warning.length === 0 && (
                <span className="text-[10px] text-slate-300">OK</span>
              )}
            </div>
          </td>
        </>
      )}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-slate-100 transition-colors" title="Edit">
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            onClick={() => onToggleActive(vehicle.id, !vehicle.active)}
            className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
              vehicle.active
                ? "border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            }`}
          >
            {vehicle.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}


export default function FleetStatusClient({
  vehicles: initialVehicles,
  drivers,
}: {
  vehicles: Vehicle[];
  drivers: Driver[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [showInactive, setShowInactive] = useState(false);
  const [, startTransition] = useTransition();

  const driverByVehicleId = new Map(
    drivers.filter((d) => d.assignedVehicleId).map((d) => [d.assignedVehicleId!, d])
  );

  function handleToggleActive(id: number, active: boolean) {
    startTransition(async () => {
      await setVehicleActive(id, active);
      setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, active } : v));
    });
  }

  const active   = vehicles.filter((v) => v.active);
  const inactive = vehicles.filter((v) => !v.active);
  const owned    = active.filter((v) => v.ownership !== "rental");
  const rentals  = active.filter((v) => v.ownership === "rental");

  // KPI totals count across ALL vehicles, not just active
  const totalOwned   = vehicles.filter((v) => v.ownership !== "rental").length;
  const totalRentals = vehicles.filter((v) => v.ownership === "rental").length;

  const allIssues = vehicles.filter((v) => {
    const { issues, warning } = statusOf(v, today);
    return issues.length > 0 || warning.length > 0;
  });


  const tableHead = (
    <thead>
      <tr className="border-b-2 border-slate-200 bg-slate-50">
        {["Unit", "Vehicle", "Type", "Assigned Driver", "MMR Due", "Fed Inspection", "Registration", "Alerts", ""].map((h) => (
          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <>
      <main className="flex-1 px-6 py-8 max-w-[1300px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Wayne Board · Admin</p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Fleet Status</h1>
            <p className="text-[13px] text-slate-400 mt-1.5">Active vehicles, assignments, and compliance dates.</p>
          </div>
          <a
            href="/api/fleet-pdf"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
          >
            <FileDown className="w-4 h-4" />
            Download PDF
          </a>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Active",        value: active.length,   color: "text-emerald-600" },
            { label: "Inactive",      value: inactive.length, color: "text-slate-400" },
            { label: "Owned (total)", value: totalOwned,      color: "text-slate-900" },
            { label: "Rentals (total)", value: totalRentals,  color: "text-purple-600" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <span className={`text-[24px] font-extrabold leading-none ${k.color}`}>{k.value}</span>
            </div>
          ))}
        </div>

        {/* Compliance alerts */}
        {allIssues.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <p className="text-[12px] font-bold text-red-700 mb-2">{allIssues.length} vehicle{allIssues.length !== 1 ? "s" : ""} need attention</p>
            <div className="flex flex-wrap gap-2">
              {allIssues.map((v) => {
                const { issues, warning } = statusOf(v, today);
                return (
                  <span key={v.id} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    issues.length > 0 ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {v.unitNumber} — {[...issues, ...warning].join(", ")}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Owned */}
        {owned.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              Owned — {owned.length} vehicle{owned.length !== 1 ? "s" : ""}
            </h2>
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  {tableHead}
                  <tbody>
                    {owned.map((v) => (
                      <VehicleRow key={v.id} vehicle={v} assignedDriver={driverByVehicleId.get(v.id)} today={today} onToggleActive={handleToggleActive} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Rentals */}
        {rentals.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[11px] font-bold text-purple-600 uppercase tracking-widest mb-3">
              Rentals — {rentals.length} vehicle{rentals.length !== 1 ? "s" : ""}
            </h2>
            <div className="bg-white rounded-2xl border border-purple-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  {tableHead}
                  <tbody>
                    {rentals.map((v) => (
                      <VehicleRow key={v.id} vehicle={v} assignedDriver={driverByVehicleId.get(v.id)} today={today} onToggleActive={handleToggleActive} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Inactive — collapsible */}
        {inactive.length > 0 && (
          <section>
            <button
              onClick={() => setShowInactive((p) => !p)}
              className="flex items-center gap-2 text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors mb-3"
            >
              {showInactive ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Inactive — {inactive.length} vehicle{inactive.length !== 1 ? "s" : ""}
            </button>
            {showInactive && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full opacity-60">
                    {tableHead}
                    <tbody>
                      {inactive.map((v) => (
                        <VehicleRow key={v.id} vehicle={v} assignedDriver={driverByVehicleId.get(v.id)} today={today} onToggleActive={handleToggleActive} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Legend */}
        <div className="mt-8 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> OK</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Due within 30 days</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Overdue</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-200 inline-block" /> Date not set</span>
        </div>
      </main>
    </>
  );
}
