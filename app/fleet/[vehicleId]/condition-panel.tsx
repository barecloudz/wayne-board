"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Loader2, X, Check, ChevronDown } from "lucide-react";
import {
  addCondition, updateCondition, deleteCondition,
  type Severity, type CondStatus,
} from "@/lib/actions/vehicle-conditions";

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

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high:     "bg-orange-50 text-orange-700 border-orange-200",
  medium:   "bg-amber-50 text-amber-700 border-amber-200",
  low:      "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_STYLE: Record<string, string> = {
  open:        "bg-red-50 text-red-600 border-red-100",
  in_progress: "bg-blue-50 text-blue-700 border-blue-100",
  resolved:    "bg-emerald-50 text-emerald-700 border-emerald-100",
};


const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

const BLANK = {
  description: "", severity: "high" as Severity, status: "open" as CondStatus,
  repairEstimate: "", note: "",
};

export default function ConditionPanel({ vehicleId, initial }: { vehicleId: number; initial: Condition[] }) {
  const [conditions, setConditions] = useState<Condition[]>(initial);
  const [showAdd, setShowAdd]   = useState(false);
  const [editId, setEditId]     = useState<number | null>(null);
  const [form, setForm]         = useState(BLANK);
  const [isPending, startTransition] = useTransition();
  const [showResolved, setShowResolved] = useState(false);

  const open     = conditions.filter((c) => c.status !== "resolved");
  const resolved = conditions.filter((c) => c.status === "resolved");

  function openAdd() {
    setForm(BLANK);
    setEditId(null);
    setShowAdd(true);
  }

  function openEdit(c: Condition) {
    setForm({
      description: c.description,
      severity:    c.severity as Severity,
      status:      c.status as CondStatus,
      repairEstimate: c.repairEstimate?.toString() ?? "",
      note:        c.note ?? "",
    });
    setEditId(c.id);
    setShowAdd(true);
  }

  function handleSave() {
    if (!form.description.trim()) return;
    const estimate = form.repairEstimate ? parseFloat(form.repairEstimate) : null;
    startTransition(async () => {
      if (editId) {
        await updateCondition(editId, vehicleId, {
          description:    form.description,
          severity:       form.severity,
          status:         form.status,
          repairEstimate: estimate,
          note:           form.note || undefined,
        });
        setConditions((prev) => prev.map((c) =>
          c.id === editId ? { ...c, description: form.description, severity: form.severity,
            status: form.status, repairEstimate: estimate, note: form.note || null } : c
        ));
      } else {
        await addCondition({
          vehicleId, description: form.description, severity: form.severity,
          repairEstimate: estimate, note: form.note || undefined,
        });
        // Refresh optimistically with a placeholder · revalidatePath will sync
        setConditions((prev) => [{
          id: Date.now(), vehicleId, description: form.description, severity: form.severity,
          status: "open", routeStatus: "confirm", repairEstimate: estimate,
          note: form.note || null, reportedAt: new Date(),
        }, ...prev]);
      }
      setShowAdd(false);
      setEditId(null);
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteCondition(id, vehicleId);
      setConditions((prev) => prev.filter((c) => c.id !== id));
    });
  }

  const hasCritical = open.some((c) => c.severity === "critical");

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[16px] font-extrabold text-slate-900">Condition Issues</h2>
          {open.length > 0 && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
              hasCritical ? SEVERITY_STYLE.critical : open.some((c) => c.severity === "high") ? SEVERITY_STYLE.high : SEVERITY_STYLE.medium
            }`}>
              {open.length} open
            </span>
          )}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold
            bg-slate-900 text-white hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Report Issue
        </button>
      </div>

      {/* Critical safety banner */}
      {hasCritical && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-red-500 font-bold text-[13px] shrink-0">⚠ Safety Alert</span>
          <p className="text-[12px] text-red-700">
            This vehicle has critical issues · review before dispatching.
          </p>
        </div>
      )}

      {/* Add/edit form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-extrabold text-slate-900">
              {editId ? "Edit Issue" : "Report New Issue"}
            </h3>
            <button onClick={() => { setShowAdd(false); setEditId(null); }}
              className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description</label>
              <textarea
                rows={2}
                placeholder="Describe the issue in detail..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={INPUT + " resize-none"}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Severity</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))} className={INPUT}>
                <option value="critical">Critical · do not dispatch</option>
                <option value="high">High · repair soon</option>
                <option value="medium">Medium · monitor</option>
                <option value="low">Low · note for next service</option>
              </select>
            </div>

            {editId && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CondStatus }))} className={INPUT}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Fixed ✓</option>
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Repair Estimate ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 950"
                value={form.repairEstimate}
                onChange={(e) => setForm((f) => ({ ...f, repairEstimate: e.target.value }))}
                className={INPUT}
              />
            </div>

            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. quote sent to Rich, parts ordered..."
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-5">
            <button onClick={() => { setShowAdd(false); setEditId(null); }}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.description.trim() || isPending}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editId ? "Save Changes" : "Add Issue"}
            </button>
          </div>
        </div>
      )}

      {/* Open issues */}
      {open.length === 0 && !showAdd ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 px-6 py-10 text-center
          shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-slate-400">No open issues. Use "Report Issue" to log a problem.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden
          shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
          <div className="divide-y divide-slate-100">
            {open.map((c, i) => (
              <div key={c.id} className="px-6 py-4 flex items-start gap-4">
                <span className="text-[11px] font-bold text-slate-300 w-4 shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${SEVERITY_STYLE[c.severity] ?? SEVERITY_STYLE.medium}`}>
                      {c.severity}
                    </span>
                    {c.repairEstimate && (
                      <span className="text-[11px] font-semibold text-slate-500">
                        ~${c.repairEstimate.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-800 leading-relaxed">{c.description}</p>
                  {c.note && <p className="text-[12px] text-slate-400 italic mt-1">{c.note}</p>}
                  {c.reportedAt && (
                    <p className="text-[11px] text-slate-300 mt-1">
                      Reported {new Date(c.reportedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(c)}
                    className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} disabled={isPending}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved issues collapsible */}
      {resolved.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowResolved((p) => !p)}
            className="flex items-center gap-2 text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showResolved ? "rotate-180" : ""}`} />
            {resolved.length} resolved issue{resolved.length !== 1 ? "s" : ""}
          </button>
          {showResolved && (
            <div className="mt-2 bg-white rounded-2xl border border-slate-200/80 overflow-hidden divide-y divide-slate-100">
              {resolved.map((c, i) => (
                <div key={c.id} className="px-6 py-3 flex items-start gap-4 opacity-60">
                  <span className="text-[11px] font-bold text-slate-300 w-4 shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-100">
                        Resolved
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${SEVERITY_STYLE[c.severity] ?? SEVERITY_STYLE.medium}`}>
                        {c.severity}
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-600 line-through">{c.description}</p>
                  </div>
                  <button onClick={() => handleDelete(c.id)} disabled={isPending}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
