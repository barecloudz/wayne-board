"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, Plus, X, Truck } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type VehicleSetItem = {
  vehicleSetId: number;
  vehicleId: number;
  vehicleName: string;
  routeType: string;
  loadProfile?: string;
  wave?: number;
  vehicleOrder?: number;
  [key: string]: unknown;
};

type FleetVehicle = {
  vehId: number;
  vehicleName: string;
  route_type?: string;
  routeType?: string;
  loadProfile?: string;
  capacity?: number;
  [key: string]: unknown;
};

const DEFAULT_PLAN_ID = 2352850;

async function droManage(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/auto-dro/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DroVehiclesTab() {
  const [planId, setPlanId] = useState<number>(DEFAULT_PLAN_ID);
  const [planInput, setPlanInput] = useState<string>(String(DEFAULT_PLAN_ID));
  const [vehicleSet, setVehicleSet] = useState<VehicleSetItem[]>([]);
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectingMsg, setConnectingMsg] = useState(false);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async (pid: number) => {
    setLoading(true);
    setConnectingMsg(true);
    try {
      const [vsRes, fleetRes] = await Promise.all([
        droManage("getVehicleSet", { planId: pid }),
        droManage("getFleet"),
      ]);
      setConnectingMsg(false);
      if (Array.isArray(vsRes?.data)) setVehicleSet(vsRes.data as VehicleSetItem[]);
      else if (vsRes?.error) showToast(false, `Vehicle set: ${vsRes.error}`);

      if (Array.isArray(fleetRes?.data)) setFleet(fleetRes.data as FleetVehicle[]);
      else if (fleetRes?.error) showToast(false, `Fleet: ${fleetRes.error}`);
    } catch {
      showToast(false, "Failed to load vehicle data");
    } finally {
      setLoading(false);
      setConnectingMsg(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(planId); }, [planId, loadData]);

  async function handleRemove(item: VehicleSetItem) {
    setActingId(item.vehicleSetId);
    // Optimistic update
    setVehicleSet(prev => prev.filter(v => v.vehicleSetId !== item.vehicleSetId));
    try {
      const res = await droManage("removeVehicles", {
        planId,
        vehicleSetIds: [item.vehicleSetId],
      });
      if (res?.error) {
        showToast(false, res.error);
        // Revert on error
        setVehicleSet(prev => [...prev, item]);
      } else {
        showToast(true, `${item.vehicleName} removed from plan`);
      }
    } catch {
      showToast(false, "Remove failed");
      setVehicleSet(prev => [...prev, item]);
    } finally {
      setActingId(null);
    }
  }

  async function handleAdd(vehicle: FleetVehicle) {
    setActingId(vehicle.vehId);
    const newVehicle = {
      wave: 1,
      vehicleId: vehicle.vehId,
      driverId: null,
      loadProfile: vehicle.loadProfile ?? "",
      routeType: vehicle.route_type ?? vehicle.routeType ?? "REG",
      vehicleOrder: vehicleSet.length + 1,
    };
    // Optimistic update · add placeholder
    const optimisticItem: VehicleSetItem = {
      vehicleSetId: -vehicle.vehId, // temp id
      vehicleId: vehicle.vehId,
      vehicleName: vehicle.vehicleName,
      routeType: vehicle.route_type ?? vehicle.routeType ?? "REG",
      loadProfile: vehicle.loadProfile,
      wave: 1,
      vehicleOrder: vehicleSet.length + 1,
    };
    setVehicleSet(prev => [...prev, optimisticItem]);
    try {
      const res = await droManage("addVehicles", {
        planId,
        vehicles: [newVehicle],
      });
      if (res?.error) {
        showToast(false, res.error);
        setVehicleSet(prev => prev.filter(v => v.vehicleSetId !== optimisticItem.vehicleSetId));
      } else {
        showToast(true, `${vehicle.vehicleName} added to plan`);
        // Refresh to get real vehicleSetId
        await loadData(planId);
      }
    } catch {
      showToast(false, "Add failed");
      setVehicleSet(prev => prev.filter(v => v.vehicleSetId !== optimisticItem.vehicleSetId));
    } finally {
      setActingId(null);
    }
  }

  const onPlanVehicleIds = new Set(vehicleSet.map(v => v.vehicleId));
  const availableFleet = fleet.filter(v => !onPlanVehicleIds.has(v.vehId));

  function routeTypeBadge(rt: string) {
    const map: Record<string, string> = {
      LP: "bg-indigo-100 text-indigo-700",
      BULK: "bg-emerald-100 text-emerald-700",
      SM: "bg-amber-100 text-amber-700",
      REG: "bg-slate-100 text-slate-600",
    };
    return map[rt?.toUpperCase()] ?? "bg-slate-100 text-slate-600";
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

      {/* Plan selector */}
      <div className="flex items-center gap-3">
        <label className="text-[13px] font-bold text-slate-600 uppercase tracking-widest shrink-0">
          Plan ID
        </label>
        <input
          type="number"
          value={planInput}
          onChange={e => setPlanInput(e.target.value)}
          className="w-40 px-3 py-2.5 rounded-xl border-2 border-slate-200 text-[14px] font-mono
            text-slate-800 outline-none focus:border-blue-400 transition"
        />
        <button
          onClick={() => {
            const pid = Number(planInput);
            if (pid > 0) setPlanId(pid);
          }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Load
        </button>
        <span className="text-[12px] text-slate-400">(default: AUTO plan)</span>
      </div>

      {connectingMsg && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-700 font-medium">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting to DRO… (first login takes ~15 seconds)
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map(col => (
            <div key={col} className="space-y-3">
              <div className="h-8 bg-slate-200 rounded-xl w-1/3 animate-pulse" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {/* On Plan */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-[14px] font-extrabold text-slate-900">
                On Plan
              </h3>
              <span className="text-[12px] text-slate-400 ml-1">{vehicleSet.length} vehicles</span>
            </div>
            <div className="space-y-2.5">
              {vehicleSet.length === 0 && (
                <p className="text-[13px] text-slate-400 py-4 text-center">No vehicles on this plan</p>
              )}
              {vehicleSet.map(v => {
                const isActing = actingId === v.vehicleSetId || actingId === v.vehicleId;
                return (
                  <div
                    key={v.vehicleSetId}
                    className="flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/50"
                  >
                    <Truck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-slate-800 truncate">
                        {v.vehicleName}
                      </p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${routeTypeBadge(v.routeType)}`}>
                        {v.routeType}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemove(v)}
                      disabled={isActing}
                      className="p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600
                        disabled:opacity-50 transition-colors shrink-0"
                      title="Remove from plan"
                    >
                      {isActing
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <X className="w-4 h-4" />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Separator */}
          <div className="hidden md:flex flex-col items-center justify-center pt-10 text-slate-300 self-stretch">
            <div className="flex-1 w-px bg-slate-200" />
            <span className="text-[20px] py-3">⇄</span>
            <div className="flex-1 w-px bg-slate-200" />
          </div>

          {/* Available */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <h3 className="text-[14px] font-extrabold text-slate-900">
                Available Fleet
              </h3>
              <span className="text-[12px] text-slate-400 ml-1">{availableFleet.length} vehicles</span>
            </div>
            <div className="space-y-2.5">
              {availableFleet.length === 0 && (
                <p className="text-[13px] text-slate-400 py-4 text-center">All fleet vehicles are on the plan</p>
              )}
              {availableFleet.map(v => {
                const isActing = actingId === v.vehId;
                return (
                  <div
                    key={v.vehId}
                    className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 bg-white"
                  >
                    <Truck className="w-5 h-5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-slate-700 truncate">
                        {v.vehicleName}
                      </p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${routeTypeBadge(v.route_type ?? v.routeType ?? "")}`}>
                        {v.route_type ?? v.routeType ?? "-"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleAdd(v)}
                      disabled={isActing}
                      className="p-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700
                        disabled:opacity-50 transition-colors shrink-0"
                      title="Add to plan"
                    >
                      {isActing
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Plus className="w-4 h-4" />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
