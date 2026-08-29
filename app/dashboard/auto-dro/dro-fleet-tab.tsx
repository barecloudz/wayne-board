"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, Truck, Edit2, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type FleetVehicle = {
  vehId: number;
  vehicleName: string;
  capacity?: number;
  fedExVehicleId?: string;
  route_type?: string;
  routeType?: string;
  hasShelves?: boolean;
  hasBulkhead?: boolean;
  loadProfile?: string;
  [key: string]: unknown;
};

type EditState = {
  capacity: number;
  hasShelves: boolean;
};

async function droManage(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/auto-dro/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DroFleetTab() {
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVehId, setEditVehId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ capacity: 0, hasShelves: false });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectingMsg, setConnectingMsg] = useState(false);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setConnectingMsg(true);
    try {
      const res = await droManage("getFleet");
      setConnectingMsg(false);
      if (Array.isArray(res?.data)) {
        setFleet(res.data as FleetVehicle[]);
      } else if (res?.error) {
        showToast(false, res.error);
      }
    } catch {
      showToast(false, "Failed to load fleet");
    } finally {
      setLoading(false);
      setConnectingMsg(false);
    }
  }, [showToast]);

  useEffect(() => { loadFleet(); }, [loadFleet]);

  function openEdit(vehicle: FleetVehicle) {
    setEditVehId(vehicle.vehId);
    setEditState({
      capacity: vehicle.capacity ?? 0,
      hasShelves: vehicle.hasShelves ?? false,
    });
  }

  function closeEdit() {
    setEditVehId(null);
  }

  async function saveVehicle(vehicle: FleetVehicle) {
    setSaving(true);
    try {
      const updated: FleetVehicle = {
        ...vehicle,
        capacity: editState.capacity,
        hasShelves: editState.hasShelves,
      };
      const res = await droManage("updateFleetVehicle", { vehicle: updated });
      if (res?.error) {
        showToast(false, res.error);
      } else {
        showToast(true, `${vehicle.vehicleName} updated`);
        setFleet(prev => prev.map(v => v.vehId === vehicle.vehId ? updated : v));
        closeEdit();
      }
    } catch {
      showToast(false, "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function routeTypeBadge(rt: string | undefined) {
    const type = rt?.toUpperCase() ?? "";
    const map: Record<string, string> = {
      LP: "bg-indigo-100 text-indigo-700",
      BULK: "bg-emerald-100 text-emerald-700",
      SM: "bg-amber-100 text-amber-700",
      REG: "bg-slate-100 text-slate-600",
    };
    return map[type] ?? "bg-slate-100 text-slate-600";
  }

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="space-y-4">
        {connectingMsg && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-700 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting to DRO… (first login takes ~15 seconds)
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-6 animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 rounded w-2/3" />
              <div className="h-10 bg-slate-100 rounded w-1/3" />
              <div className="flex gap-2">
                <div className="h-6 bg-slate-100 rounded w-16" />
                <div className="h-6 bg-slate-100 rounded w-16" />
              </div>
              <div className="h-10 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium border ${
          toast.ok
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {toast.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {fleet.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Truck className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-[15px] font-semibold text-slate-500">No fleet vehicles found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {fleet.map(vehicle => {
            const isEditing = editVehId === vehicle.vehId;
            const rt = vehicle.route_type ?? vehicle.routeType ?? "";

            return (
              <div
                key={vehicle.vehId}
                className={`rounded-2xl border-2 p-5 bg-white transition-all ${
                  isEditing ? "border-amber-400 shadow-amber-100 shadow-md" : "border-slate-200 shadow-sm"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className="text-[14px] font-extrabold text-slate-800 truncate">
                      {vehicle.vehicleName}
                    </p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => openEdit(vehicle)}
                      className="shrink-0 p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                      title="Edit capacity"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Capacity */}
                <div className="mb-4">
                  <span className="text-[40px] font-extrabold text-slate-900 leading-none">
                    {vehicle.capacity ?? "—"}
                  </span>
                  <span className="text-[13px] text-slate-400 ml-2">stops</span>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {rt && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${routeTypeBadge(rt)}`}>
                      {rt}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    vehicle.hasShelves ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-400"
                  }`}>
                    {vehicle.hasShelves ? "Shelves ✓" : "No Shelves"}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    vehicle.hasBulkhead ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-400"
                  }`}>
                    {vehicle.hasBulkhead ? "Bulkhead ✓" : "No Bulkhead"}
                  </span>
                  {vehicle.fedExVehicleId && (
                    <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded-md bg-slate-50">
                      {vehicle.fedExVehicleId}
                    </span>
                  )}
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                        Capacity (stops)
                      </label>
                      <input
                        type="number"
                        value={editState.capacity}
                        onChange={e => setEditState(prev => ({ ...prev, capacity: Number(e.target.value) }))}
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-[15px] font-bold
                          text-slate-800 outline-none focus:border-amber-400 transition"
                        min={0}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-[13px] font-semibold text-slate-700">Has Shelves</label>
                      <button
                        onClick={() => setEditState(prev => ({ ...prev, hasShelves: !prev.hasShelves }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                          transition-colors duration-200 focus:outline-none
                          ${editState.hasShelves ? "bg-emerald-500" : "bg-slate-200"}`}
                        role="switch"
                        aria-checked={editState.hasShelves}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
                          transform transition duration-200 ${editState.hasShelves ? "translate-x-5" : "translate-x-0"}`}
                        />
                      </button>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveVehicle(vehicle)}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                          text-[13px] font-bold bg-amber-500 hover:bg-amber-600 text-white
                          disabled:opacity-50 transition-colors"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Save
                      </button>
                      <button
                        onClick={closeEdit}
                        disabled={saving}
                        className="p-2.5 rounded-xl border-2 border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit button (bottom) when not editing */}
                {!isEditing && (
                  <button
                    onClick={() => openEdit(vehicle)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                      text-[13px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-700
                      transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Capacity
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
