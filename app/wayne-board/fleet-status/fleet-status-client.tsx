"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, Loader2, ChevronDown, ChevronUp, FileDown, Plus, X, Wrench } from "lucide-react";
import { setVehicleActive, updateVehicleCompliance } from "@/lib/actions/vehicles";
import { addCondition, updateCondition, deleteCondition, type Severity, type RouteStatus, type CondStatus } from "@/lib/actions/vehicle-conditions";
import Link from "next/link";

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

type Condition = {
  id: number;
  vehicleId: number;
  description: string;
  severity: string;
  status: string;
  routeStatus: string;
  repairEstimate: number | null;
  note: string | null;
  reportedAt: Date | null;
};

const INPUT = "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition";
const INPUT_LG = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high:     "bg-orange-50 text-orange-700 border-orange-200",
  medium:   "bg-amber-50 text-amber-700 border-amber-200",
  low:      "bg-slate-100 text-slate-600 border-slate-200",
};

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
  vehicle, assignedDriver, today, conditions, onToggleActive, onReportIssue,
}: {
  vehicle: Vehicle;
  assignedDriver: Driver | undefined;
  today: string;
  conditions: Condition[];
  onToggleActive: (id: number, active: boolean) => void;
  onReportIssue: (vehicle: Vehicle) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [ownership, setOwnership] = useState(vehicle.ownership);
  const [mmrDue, setMmrDue] = useState(vehicle.mmrDue ?? "");
  const [fedDue, setFedDue] = useState(vehicle.federalInspectionDue ?? "");
  const [regExp, setRegExp] = useState(vehicle.registrationExpiry ?? "");
  const [isPending, startTransition] = useTransition();
  const { issues, warning } = statusOf(vehicle, today);

  const openConditions = conditions.filter((c) => c.status !== "resolved");
  const hasCritical = openConditions.some((c) => c.severity === "critical");
  const totalCost = openConditions.reduce((s, c) => s + (c.repairEstimate ?? 0), 0);

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
        <td className="px-4 py-3" colSpan={5}>
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
              {/* Compliance alerts */}
              {issues.map((i) => (
                <span key={i} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">{i}</span>
              ))}
              {warning.map((w) => (
                <span key={w} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">{w}</span>
              ))}
              {/* Mechanical issues */}
              {openConditions.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                  hasCritical ? "bg-red-50 text-red-600 border-red-200" : "bg-orange-50 text-orange-600 border-orange-200"
                }`}>
                  {openConditions.length} mechanical issue{openConditions.length !== 1 ? "s" : ""}
                  {totalCost > 0 ? ` · ~$${totalCost.toLocaleString()}` : ""}
                </span>
              )}
              {issues.length === 0 && warning.length === 0 && openConditions.length === 0 && (
                <span className="text-[10px] text-slate-300">OK</span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-slate-100 transition-colors" title="Edit compliance dates">
                <Pencil className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => onReportIssue(vehicle)}
                className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                title="Report mechanical issue"
              >
                <Wrench className="w-3.5 h-3.5 text-slate-400" />
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
        </>
      )}
    </tr>
  );
}

const BLANK_FORM = {
  description: "",
  severity: "high" as Severity,
  routeStatus: "confirm" as RouteStatus,
  repairEstimate: "",
  note: "",
};

export default function FleetStatusClient({
  vehicles: initialVehicles,
  drivers,
  conditionsByVehicle: initialConditions,
}: {
  vehicles: Vehicle[];
  drivers: Driver[];
  conditionsByVehicle: Record<number, Condition[]>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [showInactive, setShowInactive] = useState(false);
  const [, startTransition] = useTransition();

  // Conditions state — mutable locally for optimistic updates
  const [conditionsMap, setConditionsMap] = useState<Record<number, Condition[]>>(initialConditions);

  // Report issue modal
  const [reportTarget, setReportTarget] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [isSubmitting, startSubmit] = useTransition();

  // Edit condition modal
  const [editCondition, setEditCondition] = useState<Condition | null>(null);
  const [editForm, setEditForm] = useState({ ...BLANK_FORM, status: "open" as CondStatus });
  const [isEditing, startEdit] = useTransition();

  const driverByVehicleId = new Map(
    drivers.filter((d) => d.assignedVehicleId).map((d) => [d.assignedVehicleId!, d])
  );

  function handleToggleActive(id: number, active: boolean) {
    startTransition(async () => {
      await setVehicleActive(id, active);
      setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, active } : v));
    });
  }

  function openReportIssue(vehicle: Vehicle) {
    setReportTarget(vehicle);
    setForm(BLANK_FORM);
  }

  function handleAddCondition() {
    if (!reportTarget || !form.description.trim()) return;
    startSubmit(async () => {
      const estimate = form.repairEstimate ? parseFloat(form.repairEstimate) : null;
      await addCondition({
        vehicleId:     reportTarget.id,
        description:   form.description,
        severity:      form.severity,
        routeStatus:   form.routeStatus,
        repairEstimate: estimate,
        note:          form.note || undefined,
      });
      // Optimistic update
      const newCond: Condition = {
        id: Date.now(),
        vehicleId: reportTarget.id,
        description: form.description,
        severity: form.severity,
        status: "open",
        routeStatus: form.routeStatus,
        repairEstimate: estimate,
        note: form.note || null,
        reportedAt: new Date(),
      };
      setConditionsMap((prev) => ({
        ...prev,
        [reportTarget.id]: [newCond, ...(prev[reportTarget.id] ?? [])],
      }));
      setReportTarget(null);
    });
  }

  function openEditCondition(c: Condition) {
    setEditCondition(c);
    setEditForm({
      description:    c.description,
      severity:       c.severity as Severity,
      routeStatus:    c.routeStatus as RouteStatus,
      repairEstimate: c.repairEstimate?.toString() ?? "",
      note:           c.note ?? "",
      status:         c.status as CondStatus,
    });
  }

  function handleUpdateCondition() {
    if (!editCondition || !editForm.description.trim()) return;
    const estimate = editForm.repairEstimate ? parseFloat(editForm.repairEstimate) : null;
    startEdit(async () => {
      await updateCondition(editCondition.id, editCondition.vehicleId, {
        description:    editForm.description,
        severity:       editForm.severity,
        status:         editForm.status,
        routeStatus:    editForm.routeStatus,
        repairEstimate: estimate,
        note:           editForm.note || undefined,
      });
      setConditionsMap((prev) => {
        const list = prev[editCondition.vehicleId] ?? [];
        if (editForm.status === "resolved") {
          return { ...prev, [editCondition.vehicleId]: list.filter((c) => c.id !== editCondition.id) };
        }
        return {
          ...prev,
          [editCondition.vehicleId]: list.map((c) =>
            c.id === editCondition.id
              ? { ...c, description: editForm.description, severity: editForm.severity,
                  status: editForm.status, routeStatus: editForm.routeStatus,
                  repairEstimate: estimate, note: editForm.note || null }
              : c
          ),
        };
      });
      setEditCondition(null);
    });
  }

  function handleDeleteCondition(condId: number, vehicleId: number) {
    startEdit(async () => {
      await deleteCondition(condId, vehicleId);
      setConditionsMap((prev) => ({
        ...prev,
        [vehicleId]: (prev[vehicleId] ?? []).filter((c) => c.id !== condId),
      }));
    });
  }

  const active   = vehicles.filter((v) => v.active);
  const inactive = vehicles.filter((v) => !v.active);
  const owned    = active.filter((v) => v.ownership !== "rental");
  const rentals  = active.filter((v) => v.ownership === "rental");

  const totalOwned   = vehicles.filter((v) => v.ownership !== "rental").length;
  const totalRentals = vehicles.filter((v) => v.ownership === "rental").length;

  // All open conditions across all active vehicles
  const allOpenConditions = active.flatMap((v) => (conditionsMap[v.id] ?? []).filter((c) => c.status !== "resolved"));
  const totalRepairCost = allOpenConditions.reduce((s, c) => s + (c.repairEstimate ?? 0), 0);

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

  // Vehicles with open mechanical conditions (for the issues section)
  const vehiclesWithIssues = active.filter((v) => (conditionsMap[v.id] ?? []).some((c) => c.status !== "resolved"));

  return (
    <>
      <main className="flex-1 px-6 py-8 max-w-[1300px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Wayne Board · Admin</p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Fleet Status</h1>
            <p className="text-[13px] text-slate-400 mt-1.5">Active vehicles, assignments, compliance dates, and mechanical issues.</p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Active",          value: active.length,              color: "text-emerald-600" },
            { label: "Inactive",        value: inactive.length,            color: "text-slate-400" },
            { label: "Owned (total)",   value: totalOwned,                 color: "text-slate-900" },
            { label: "Rentals (total)", value: totalRentals,               color: "text-purple-600" },
            { label: "Open Issues",     value: allOpenConditions.length,   color: allOpenConditions.length > 0 ? "text-orange-600" : "text-slate-400" },
            {
              label: "Est. Repair Cost",
              value: totalRepairCost > 0 ? `$${totalRepairCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—",
              color: totalRepairCost > 0 ? "text-red-600" : "text-slate-400",
            },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
              <span className={`text-[22px] font-extrabold leading-none ${k.color}`}>{k.value}</span>
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
                      <VehicleRow
                        key={v.id}
                        vehicle={v}
                        assignedDriver={driverByVehicleId.get(v.id)}
                        today={today}
                        conditions={conditionsMap[v.id] ?? []}
                        onToggleActive={handleToggleActive}
                        onReportIssue={openReportIssue}
                      />
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
                      <VehicleRow
                        key={v.id}
                        vehicle={v}
                        assignedDriver={driverByVehicleId.get(v.id)}
                        today={today}
                        conditions={conditionsMap[v.id] ?? []}
                        onToggleActive={handleToggleActive}
                        onReportIssue={openReportIssue}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Mechanical Issues ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold text-orange-600 uppercase tracking-widest">
              Mechanical Issues — {allOpenConditions.length} open
              {totalRepairCost > 0 && ` · ~$${totalRepairCost.toLocaleString("en-US", { maximumFractionDigits: 0 })} est.`}
            </h2>
          </div>

          {vehiclesWithIssues.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 px-6 py-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[13px] text-slate-400">No open mechanical issues — use the wrench icon on any vehicle to report one.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {vehiclesWithIssues.map((vehicle) => {
                const conds = (conditionsMap[vehicle.id] ?? []).filter((c) => c.status !== "resolved");
                const vehicleCost = conds.reduce((s, c) => s + (c.repairEstimate ?? 0), 0);
                return (
                  <div key={vehicle.id} className="bg-white rounded-2xl border border-orange-200/60 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    {/* Vehicle header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] font-extrabold text-slate-900">{vehicle.unitNumber}</span>
                        <span className="text-[12px] text-slate-400">{vehicle.year} {vehicle.make} {vehicle.model}</span>
                        {conds.some((c) => c.severity === "critical") && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">⚠ Critical</span>
                        )}
                        {vehicleCost > 0 && (
                          <span className="text-[11px] font-semibold text-slate-500">~${vehicleCost.toLocaleString()} est.</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openReportIssue(vehicle)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Report Issue
                        </button>
                        <Link
                          href={`/fleet/${vehicle.id}`}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          View Vehicle →
                        </Link>
                      </div>
                    </div>
                    {/* Issue list */}
                    <div className="divide-y divide-slate-100">
                      {conds.map((c, i) => (
                        <div key={c.id} className="px-5 py-3 flex items-start gap-3">
                          <span className="text-[11px] text-slate-300 w-4 shrink-0 mt-0.5">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${SEVERITY_STYLE[c.severity] ?? SEVERITY_STYLE.medium}`}>
                                {c.severity}
                              </span>
                              {c.repairEstimate && (
                                <span className="text-[11px] font-semibold text-slate-500">~${c.repairEstimate.toLocaleString()}</span>
                              )}
                            </div>
                            <p className="text-[13px] text-slate-800">{c.description}</p>
                            {c.note && <p className="text-[11px] text-slate-400 italic mt-0.5">{c.note}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditCondition(c)}
                              className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteCondition(c.id, c.vehicleId)}
                              className="p-1.5 rounded hover:bg-red-50 transition-colors text-[10px] font-semibold text-slate-400 hover:text-red-500"
                              title="Delete"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
                        <VehicleRow
                          key={v.id}
                          vehicle={v}
                          assignedDriver={driverByVehicleId.get(v.id)}
                          today={today}
                          conditions={conditionsMap[v.id] ?? []}
                          onToggleActive={handleToggleActive}
                          onReportIssue={openReportIssue}
                        />
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

      {/* ── Report Issue Modal ── */}
      {reportTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Report Issue</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">{reportTarget.unitNumber} — {reportTarget.year} {reportTarget.make} {reportTarget.model}</p>
              </div>
              <button onClick={() => setReportTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-all">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Oil change needed, blinker not working, backup camera offline..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className={INPUT_LG + " resize-none"}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Severity</label>
                  <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))} className={INPUT_LG}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Route Status</label>
                  <select value={form.routeStatus} onChange={(e) => setForm((f) => ({ ...f, routeStatus: e.target.value as RouteStatus }))} className={INPUT_LG}>
                    <option value="in_use">In Use</option>
                    <option value="not_in_use">Not in Use</option>
                    <option value="confirm">Confirm</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Est. Repair Cost ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 250"
                    value={form.repairEstimate}
                    onChange={(e) => setForm((f) => ({ ...f, repairEstimate: e.target.value }))}
                    className={INPUT_LG}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Note (optional)</label>
                  <input
                    type="text"
                    placeholder="Parts ordered, quote pending..."
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    className={INPUT_LG}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setReportTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddCondition}
                disabled={!form.description.trim() || isSubmitting}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Condition Modal ── */}
      {editCondition && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Edit Issue</h2>
              <button onClick={() => setEditCondition(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-all">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className={INPUT_LG + " resize-none"}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Severity</label>
                  <select value={editForm.severity} onChange={(e) => setEditForm((f) => ({ ...f, severity: e.target.value as Severity }))} className={INPUT_LG}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</label>
                  <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as CondStatus }))} className={INPUT_LG}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Est. Repair Cost ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.repairEstimate}
                    onChange={(e) => setEditForm((f) => ({ ...f, repairEstimate: e.target.value }))}
                    className={INPUT_LG}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Note</label>
                  <input
                    type="text"
                    value={editForm.note}
                    onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                    className={INPUT_LG}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setEditCondition(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleUpdateCondition}
                disabled={!editForm.description.trim() || isEditing}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {isEditing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
