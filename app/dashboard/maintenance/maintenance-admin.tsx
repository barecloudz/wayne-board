"use client";

import { useState, useTransition, lazy, Suspense } from "react";
import {
  Clock, AlertTriangle, CheckCircle2, Trash2, Loader2, ChevronDown,
  Pencil, X, Check, Truck, Plus, Wrench, FileText,
} from "lucide-react";
import { updateRequestStatus, deleteRequest, createMaintenanceRecord, deleteMaintenanceRecord } from "@/lib/actions/maintenance";
import type { RequestStatus, MaintenanceRecordType } from "@/lib/actions/maintenance";

const TruckViewer = lazy(() => import("@/app/dashboard/fleet/tires/TruckViewer"));

type Request = {
  id: number;
  driverId: string;
  driverName: string;
  truckNumber: string;
  description: string;
  status: string;
  adminNote: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type MaintenanceRecord = {
  id: number;
  truckNumber: string;
  serviceDate: string;
  type: string;
  description: string;
  mileage: number | null;
  cost: number | null;
  vendor: string | null;
  createdBy: string;
  createdAt: Date | null;
};

type Vehicle = { id: number; unitNumber: string };

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cell: string; badge: string }> = {
  pending:     { label: "Pending",     icon: Clock,         cell: "text-amber-700",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  in_progress: { label: "In Progress", icon: AlertTriangle, cell: "text-blue-700",    badge: "bg-blue-50 text-blue-700 border-blue-200" },
  resolved:    { label: "Resolved",    icon: CheckCircle2,  cell: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const RECORD_TYPE_LABELS: Record<string, string> = {
  oil_change:      "Oil Change",
  tire_rotation:   "Tire Rotation",
  mmr:             "MMR",
  fed_inspection:  "Federal Inspection",
  registration:    "Registration",
  repair:          "Repair",
  other:           "Other",
};

const RECORD_TYPE_COLORS: Record<string, string> = {
  oil_change:      "bg-amber-50 text-amber-700 border-amber-200",
  tire_rotation:   "bg-blue-50 text-blue-700 border-blue-200",
  mmr:             "bg-purple-50 text-purple-700 border-purple-200",
  fed_inspection:  "bg-red-50 text-red-700 border-red-200",
  registration:    "bg-slate-50 text-slate-700 border-slate-200",
  repair:          "bg-orange-50 text-orange-700 border-orange-200",
  other:           "bg-slate-50 text-slate-600 border-slate-200",
};

const INPUT = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

const RECORD_TYPES: MaintenanceRecordType[] = [
  "oil_change", "tire_rotation", "mmr", "fed_inspection", "registration", "repair", "other",
];

export default function MaintenanceAdmin({
  initial,
  initialRecords,
  vehicles,
}: {
  initial: Request[];
  initialRecords: MaintenanceRecord[];
  vehicles: Vehicle[];
}) {
  const [requests, setRequests] = useState<Request[]>(initial);
  const [records, setRecords]   = useState<MaintenanceRecord[]>(initialRecords);

  const [editId, setEditId]         = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<RequestStatus>("pending");
  const [editNote, setEditNote]     = useState("");

  const [tab, setTab]               = useState<"requests" | "records">("requests");
  const [filter, setFilter]         = useState<"all" | "pending" | "in_progress" | "resolved">("all");
  const [showResolved, setShowResolved] = useState(false);
  const [showViewer, setShowViewer] = useState(false);

  const [showLogModal, setShowLogModal] = useState(false);
  const [logTruck, setLogTruck]         = useState("");
  const [logDate, setLogDate]           = useState(() => new Date().toISOString().slice(0, 10));
  const [logType, setLogType]           = useState<MaintenanceRecordType>("oil_change");
  const [logDesc, setLogDesc]           = useState("");
  const [logMileage, setLogMileage]     = useState("");
  const [logCost, setLogCost]           = useState("");
  const [logVendor, setLogVendor]       = useState("");
  const [logError, setLogError]         = useState("");

  const [isPending, startTransition] = useTransition();

  function openEdit(r: Request) {
    setEditId(r.id);
    setEditStatus(r.status as RequestStatus);
    setEditNote(r.adminNote ?? "");
  }

  function handleSave() {
    if (!editId) return;
    startTransition(async () => {
      await updateRequestStatus(editId, editStatus, editNote || undefined);
      setRequests((prev) => prev.map((r) => r.id === editId
        ? { ...r, status: editStatus, adminNote: editNote || null, updatedAt: new Date() }
        : r
      ));
      setEditId(null);
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    });
  }

  function openLogModal() {
    setLogTruck("");
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogType("oil_change");
    setLogDesc("");
    setLogMileage("");
    setLogCost("");
    setLogVendor("");
    setLogError("");
    setShowLogModal(true);
  }

  function handleLogSave() {
    if (!logTruck.trim()) { setLogError("Select a truck."); return; }
    if (!logDate)          { setLogError("Service date is required."); return; }
    setLogError("");
    startTransition(async () => {
      const vehicle = vehicles.find(v => v.unitNumber === logTruck);
      await createMaintenanceRecord({
        vehicleId:   vehicle?.id,
        truckNumber: logTruck,
        serviceDate: logDate,
        type:        logType,
        description: logDesc,
        mileage:     logMileage ? parseInt(logMileage) : undefined,
        cost:        logCost    ? parseFloat(logCost)  : undefined,
        vendor:      logVendor || undefined,
        createdBy:   "Admin",
      });
      setRecords(prev => [{
        id: Date.now(),
        truckNumber: logTruck,
        serviceDate: logDate,
        type: logType,
        description: logDesc,
        mileage:  logMileage ? parseInt(logMileage) : null,
        cost:     logCost    ? parseFloat(logCost)  : null,
        vendor:   logVendor || null,
        createdBy: "Admin",
        createdAt: new Date(),
      }, ...prev]);
      setShowLogModal(false);
    });
  }

  function handleDeleteRecord(id: number) {
    startTransition(async () => {
      await deleteMaintenanceRecord(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    });
  }

  const pending    = requests.filter((r) => r.status === "pending");
  const inProgress = requests.filter((r) => r.status === "in_progress");
  const resolved   = requests.filter((r) => r.status === "resolved");

  const visible = filter === "all"
    ? requests.filter((r) => r.status !== "resolved")
    : requests.filter((r) => r.status === filter);

  return (
    <main className="flex-1 px-6 py-8 max-w-[1100px] w-full mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Maintenance</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openLogModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-700 transition-all"
          >
            <Plus className="w-4 h-4" />
            Log Maintenance
          </button>
          <button
            onClick={() => setShowViewer((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all ${
              showViewer
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            <Truck className="w-4 h-4" />
            {showViewer ? "Hide Viewer" : "Truck Inspector"}
          </button>
        </div>
      </div>

      {/* Truck viewer */}
      {showViewer && (
        <div className="mb-6 rounded-2xl overflow-hidden border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]" style={{ height: 520 }}>
          <Suspense fallback={
            <div className="w-full h-full bg-slate-100 flex items-center justify-center gap-2 text-[13px] text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading 3D viewer…
            </div>
          }>
            <TruckViewer />
          </Suspense>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Pending",        value: pending.length,    color: "text-amber-600" },
          { label: "In Progress",    value: inProgress.length, color: "text-blue-600" },
          { label: "Resolved",       value: resolved.length,   color: "text-emerald-600" },
          { label: "Records Logged", value: records.length,    color: "text-slate-700" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
            <span className={`text-[24px] font-extrabold leading-none ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("requests")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${tab === "requests" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          <Wrench className="w-3.5 h-3.5" />
          Driver Requests
          {pending.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">{pending.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("records")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${tab === "records" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          <FileText className="w-3.5 h-3.5" />
          Maintenance Records
        </button>
      </div>

      {/* ── DRIVER REQUESTS TAB ── */}
      {tab === "requests" && (
        <>
          <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
            {(["all", "pending", "in_progress", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f === "all" ? "Open" : f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
            {visible.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-400 text-[13px]">
                No {filter === "all" ? "open" : filter.replace("_", " ")} requests.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visible.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon as React.ComponentType<{ className?: string }>;
                  const isEditing = editId === r.id;
                  return (
                    <div key={r.id} className={`px-6 py-5 ${r.status === "pending" ? "bg-amber-50/30" : ""}`}>
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-2">
                            <span className="text-[15px] font-extrabold text-slate-900">{r.truckNumber}</span>
                            <span className="text-[13px] font-semibold text-slate-500">{r.driverName}</span>
                            <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>
                              <Icon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-[13px] text-slate-700 leading-relaxed mb-2">{r.description}</p>
                          {r.adminNote && !isEditing && (
                            <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-[12px] text-slate-600 mb-1">
                              <span className="font-semibold text-slate-400 uppercase text-[10px] tracking-wider mr-1">Note:</span>
                              {r.adminNote}
                            </div>
                          )}
                          {r.createdAt && (
                            <p className="text-[11px] text-slate-300 mt-1">
                              Submitted {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </p>
                          )}
                          {isEditing && (
                            <div className="mt-3 flex flex-col gap-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
                              <div className="flex gap-2">
                                {(["pending", "in_progress", "resolved"] as RequestStatus[]).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => setEditStatus(s)}
                                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                                      editStatus === s
                                        ? "bg-slate-900 text-white border-slate-900"
                                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                                    }`}
                                  >
                                    {s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="text"
                                placeholder="Add a note for the driver (optional)"
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                className={INPUT}
                              />
                              <div className="flex gap-2">
                                <button onClick={() => setEditId(null)}
                                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
                                  Cancel
                                </button>
                                <button onClick={handleSave} disabled={isPending}
                                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
                                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Save
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        {!isEditing && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                              <Pencil className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                            <button onClick={() => handleDelete(r.id)} disabled={isPending} className="p-1.5 rounded hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {filter === "all" && resolved.length > 0 && (
            <div>
              <button
                onClick={() => setShowResolved((p) => !p)}
                className="flex items-center gap-2 text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showResolved ? "rotate-180" : ""}`} />
                {resolved.length} resolved request{resolved.length !== 1 ? "s" : ""}
              </button>
              {showResolved && (
                <div className="mt-2 bg-white rounded-2xl border border-slate-200/80 overflow-hidden divide-y divide-slate-100">
                  {resolved.map((r) => (
                    <div key={r.id} className="px-6 py-4 flex items-center gap-4 opacity-60">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-slate-800 text-[13px]">{r.truckNumber}</span>
                          <span className="text-slate-400 text-[12px]">{r.driverName}</span>
                        </div>
                        <p className="text-[12px] text-slate-500 line-through">{r.description}</p>
                      </div>
                      <button onClick={() => handleDelete(r.id)} disabled={isPending} className="p-1.5 rounded hover:bg-red-50 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MAINTENANCE RECORDS TAB ── */}
      {tab === "records" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          {records.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <FileText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-[13px] text-slate-400 mb-4">No maintenance records yet.</p>
              <button
                onClick={openLogModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all"
              >
                <Plus className="w-4 h-4" />
                Log First Record
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((r) => {
                const typeColor = RECORD_TYPE_COLORS[r.type] ?? RECORD_TYPE_COLORS.other;
                const typeLabel = RECORD_TYPE_LABELS[r.type] ?? r.type;
                return (
                  <div key={r.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="text-[15px] font-extrabold text-slate-900">{r.truckNumber}</span>
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${typeColor}`}>{typeLabel}</span>
                        <span className="text-[12px] text-slate-400">
                          {new Date(r.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        {r.description && <p className="text-[13px] text-slate-600">{r.description}</p>}
                        {r.mileage != null && <span className="text-[12px] text-slate-400">{r.mileage.toLocaleString()} mi</span>}
                        {r.cost != null && <span className="text-[12px] text-slate-400">${r.cost.toFixed(2)}</span>}
                        {r.vendor && <span className="text-[12px] text-slate-400">{r.vendor}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteRecord(r.id)} disabled={isPending} className="p-1.5 rounded hover:bg-red-50 transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LOG MAINTENANCE MODAL ── */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Log Maintenance</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Record completed maintenance work</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 transition-all">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Truck</label>
                <select value={logTruck} onChange={e => setLogTruck(e.target.value)} className={INPUT}>
                  <option value="">Select truck…</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.unitNumber}>{v.unitNumber}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Service Date</label>
                <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className={INPUT} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {RECORD_TYPES.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setLogType(t)}
                      className={`py-2 px-3 rounded-lg border text-[12px] font-semibold transition-all text-left ${
                        logType === t ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-400"
                      }`}
                    >
                      {RECORD_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Description <span className="text-slate-300 normal-case font-normal">(optional)</span>
                </label>
                <input type="text" value={logDesc} onChange={e => setLogDesc(e.target.value)} placeholder="e.g. 5W-30 Mobil 1, 6 qts" className={INPUT} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Odometer <span className="text-slate-300 normal-case font-normal">(mi)</span>
                  </label>
                  <input type="number" value={logMileage} onChange={e => setLogMileage(e.target.value)} placeholder="145000" min="0" className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Cost <span className="text-slate-300 normal-case font-normal">($)</span>
                  </label>
                  <input type="number" value={logCost} onChange={e => setLogCost(e.target.value)} placeholder="0.00" min="0" step="0.01" className={INPUT} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Shop / Vendor <span className="text-slate-300 normal-case font-normal">(optional)</span>
                </label>
                <input type="text" value={logVendor} onChange={e => setLogVendor(e.target.value)} placeholder="e.g. Jiffy Lube" className={INPUT} />
              </div>

              {logError && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{logError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowLogModal(false)}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLogSave}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-slate-900 text-white hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
