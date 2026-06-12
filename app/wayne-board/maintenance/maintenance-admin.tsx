"use client";

import { useState, useTransition } from "react";
import { Clock, AlertTriangle, CheckCircle2, Trash2, Loader2, ChevronDown, Pencil, X, Check } from "lucide-react";
import { updateRequestStatus, deleteRequest } from "@/lib/actions/maintenance";
import type { RequestStatus } from "@/lib/actions/maintenance";

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

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cell: string; badge: string }> = {
  pending:     { label: "Pending",     icon: Clock,         cell: "text-amber-700",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  in_progress: { label: "In Progress", icon: AlertTriangle, cell: "text-blue-700",    badge: "bg-blue-50 text-blue-700 border-blue-200" },
  resolved:    { label: "Resolved",    icon: CheckCircle2,  cell: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const INPUT = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

export default function MaintenanceAdmin({ initial }: { initial: Request[] }) {
  const [requests, setRequests] = useState<Request[]>(initial);
  const [editId, setEditId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<RequestStatus>("pending");
  const [editNote, setEditNote] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "resolved">("all");
  const [showResolved, setShowResolved] = useState(false);
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

  const pending     = requests.filter((r) => r.status === "pending");
  const inProgress  = requests.filter((r) => r.status === "in_progress");
  const resolved    = requests.filter((r) => r.status === "resolved");

  const visible = filter === "all"
    ? requests.filter((r) => r.status !== "resolved")
    : requests.filter((r) => r.status === filter);

  return (
    <main className="flex-1 px-6 py-8 max-w-[1100px] w-full mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Wayne Board · Admin</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Maintenance Requests</h1>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Pending",     value: pending.length,    color: "text-amber-600" },
          { label: "In Progress", value: inProgress.length, color: "text-blue-600" },
          { label: "Resolved",    value: resolved.length,   color: "text-emerald-600" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
            <span className={`text-[24px] font-extrabold leading-none ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
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

      {/* Request list */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-[13px]">
            No {filter === "all" ? "open" : filter.replace("_", " ")} requests.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((r) => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const isEditing = editId === r.id;
              return (
                <div key={r.id} className={`px-6 py-5 ${r.status === "pending" ? "bg-amber-50/30" : ""}`}>
                  <div className="flex items-start gap-4">
                    {/* Left content */}
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

                      {/* Edit form */}
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

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(r)}
                          className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} disabled={isPending}
                          className="p-1.5 rounded hover:bg-red-50 transition-colors">
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

      {/* Resolved collapsible (when viewing "all open") */}
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
                  <button onClick={() => handleDelete(r.id)} disabled={isPending}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
