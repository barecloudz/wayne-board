"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, MapPin, Plus, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type AdvancedVehicle = {
  vehicleSetId: number;
  vehicleId: number;
  vehicleName: string;
  anchorAreas: AnchorAreaRef[];
  [key: string]: unknown;
};

type AnchorAreaRef = {
  anchorAreaId: number;
  name: string;
  [key: string]: unknown;
};

type AvailableAnchor = {
  anchorAreaId: number;
  name: string;
  [key: string]: unknown;
};

const DEFAULT_PLAN_ID = 2352850;

const CHIP_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-purple-100 text-purple-700 border-purple-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-orange-100 text-orange-700 border-orange-200",
  "bg-pink-100 text-pink-700 border-pink-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-red-100 text-red-700 border-red-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
];

function chipColor(nameOrIdx: string | number): string {
  const idx = typeof nameOrIdx === "number"
    ? nameOrIdx
    : nameOrIdx.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CHIP_COLORS[idx % CHIP_COLORS.length];
}

async function droManage(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/auto-dro/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DroAnchorsTab() {
  const [planId, setPlanId] = useState<number>(DEFAULT_PLAN_ID);
  const [planInput, setPlanInput] = useState<string>(String(DEFAULT_PLAN_ID));
  const [vehicles, setVehicles] = useState<AdvancedVehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<AdvancedVehicle | null>(null);
  const [availableAnchors, setAvailableAnchors] = useState<AvailableAnchor[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingAnchors, setLoadingAnchors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectingMsg, setConnectingMsg] = useState(false);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadVehicles = useCallback(async (pid: number) => {
    setLoadingVehicles(true);
    setConnectingMsg(true);
    setSelectedVehicle(null);
    setAvailableAnchors([]);
    try {
      const res = await droManage("getAdvancedVehicleSet", { planId: pid });
      setConnectingMsg(false);
      if (Array.isArray(res?.data)) {
        setVehicles(res.data as AdvancedVehicle[]);
      } else if (res?.error) {
        showToast(false, res.error);
      }
    } catch {
      showToast(false, "Failed to load vehicle set");
    } finally {
      setLoadingVehicles(false);
      setConnectingMsg(false);
    }
  }, [showToast]);

  useEffect(() => { loadVehicles(planId); }, [planId, loadVehicles]);

  async function selectVehicle(vehicle: AdvancedVehicle) {
    setSelectedVehicle(vehicle);
    setLoadingAnchors(true);
    try {
      const res = await droManage("getAvailableAnchors", {
        planId,
        vehicleSetId: vehicle.vehicleSetId,
      });
      if (Array.isArray(res?.data)) {
        setAvailableAnchors(res.data as AvailableAnchor[]);
      } else if (res?.error) {
        showToast(false, res.error);
      }
    } catch {
      showToast(false, "Failed to load available anchors");
    } finally {
      setLoadingAnchors(false);
    }
  }

  async function saveAnchors(vehicle: AdvancedVehicle) {
    setSaving(true);
    try {
      const res = await droManage("updateVehicleAnchors", {
        planId,
        vehicleData: vehicle,
      });
      if (res?.error) {
        showToast(false, res.error);
      } else {
        showToast(true, "Anchors saved");
        // Update local vehicles state
        setVehicles(prev => prev.map(v => v.vehicleSetId === vehicle.vehicleSetId ? vehicle : v));
      }
    } catch {
      showToast(false, "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function removeAnchor(anchorAreaId: number) {
    if (!selectedVehicle) return;
    const updated: AdvancedVehicle = {
      ...selectedVehicle,
      anchorAreas: selectedVehicle.anchorAreas.filter(a => a.anchorAreaId !== anchorAreaId),
    };
    setSelectedVehicle(updated);
    saveAnchors(updated);
  }

  function addAnchor(anchor: AvailableAnchor) {
    if (!selectedVehicle) return;
    if (selectedVehicle.anchorAreas.some(a => a.anchorAreaId === anchor.anchorAreaId)) return;
    const updated: AdvancedVehicle = {
      ...selectedVehicle,
      anchorAreas: [...selectedVehicle.anchorAreas, { anchorAreaId: anchor.anchorAreaId, name: anchor.name }],
    };
    setSelectedVehicle(updated);
    saveAnchors(updated);
  }

  const assignedIds = new Set(selectedVehicle?.anchorAreas?.map(a => a.anchorAreaId) ?? []);
  const unassignedAnchors = availableAnchors.filter(a => !assignedIds.has(a.anchorAreaId));

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
          {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
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
      </div>

      {connectingMsg && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-700 font-medium">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting to DRO… (first login takes ~15 seconds)
        </div>
      )}

      {/* Vehicle selector row */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Select a Vehicle
        </p>
        {loadingVehicles ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shrink-0 w-36 h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <p className="text-[13px] text-slate-400">No vehicles found on this plan</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {vehicles.map(v => {
              const isSelected = selectedVehicle?.vehicleSetId === v.vehicleSetId;
              return (
                <button
                  key={v.vehicleSetId}
                  onClick={() => selectVehicle(v)}
                  className={`shrink-0 w-40 rounded-xl border-2 p-4 text-left transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300"
                      : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                >
                  <MapPin className={`w-4 h-4 mb-1.5 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                  <p className={`text-[12px] font-bold leading-tight ${isSelected ? "text-blue-900" : "text-slate-700"}`}>
                    {v.vehicleName}
                  </p>
                  <p className={`text-[10px] mt-1 ${isSelected ? "text-blue-500" : "text-slate-400"}`}>
                    {v.anchorAreas?.length ?? 0} anchors
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Anchor management */}
      {selectedVehicle && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current anchors */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5">
            <h3 className="text-[14px] font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Assigned Anchors
              <span className="text-[12px] text-slate-400 font-normal ml-1">
                {selectedVehicle.anchorAreas?.length ?? 0} areas
              </span>
            </h3>
            {!selectedVehicle.anchorAreas?.length ? (
              <p className="text-[13px] text-slate-400 text-center py-4">No anchor areas assigned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedVehicle.anchorAreas.map((area, idx) => (
                  <div
                    key={area.anchorAreaId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-bold ${chipColor(area.name || idx)}`}
                  >
                    <span>{area.name || `Area ${area.anchorAreaId}`}</span>
                    <button
                      onClick={() => removeAnchor(area.anchorAreaId)}
                      disabled={saving}
                      className="hover:opacity-70 transition-opacity disabled:opacity-40 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available anchors */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5">
            <h3 className="text-[14px] font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              Available Anchors
              {loadingAnchors && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </h3>
            {loadingAnchors ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 w-24 bg-slate-100 rounded-full animate-pulse" />
                ))}
              </div>
            ) : unassignedAnchors.length === 0 ? (
              <p className="text-[13px] text-slate-400 text-center py-4">All available anchors are assigned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unassignedAnchors.map(area => (
                  <button
                    key={area.anchorAreaId}
                    onClick={() => addAnchor(area)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed
                      border-slate-300 text-[12px] font-bold text-slate-600
                      hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50
                      disabled:opacity-40 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    {area.name || `Area ${area.anchorAreaId}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
