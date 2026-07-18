"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Loader2, Save, Zap, X, CheckCircle, AlertCircle } from "lucide-react";
import type { MapArea, RouteSlot } from "./route-planner-map";

// ── Dynamic import for Leaflet map (no SSR) ────────────────────────────────────
const RoutePlannerMap = dynamic(() => import("./route-planner-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-50 rounded-xl">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  ),
});

// ── Slot color palette ─────────────────────────────────────────────────────────
const SLOT_COLORS: Record<number, string> = {
  1:  "#E53935",
  2:  "#F57C00",
  3:  "#FBC02D",
  4:  "#388E3C",
  5:  "#0097A7",
  6:  "#1976D2",
  7:  "#7B1FA2",
  8:  "#C2185B",
  9:  "#5D4037",
  10: "#455A64",
  11: "#00796B",
  12: "#F06292",
  13: "#689F38",
};

function slotColor(slot: number): string {
  return SLOT_COLORS[slot] ?? "#94a3b8";
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Template = {
  id: number;
  name: string;
  dro_plan_id: number | null;
  dro_plan_name: string | null;
  driver_count: number;
  day_of_week: string | null;
  is_default: boolean;
  notes: string | null;
};

type RouteGroup = {
  slot: number;
  label: string;
  work_area_number: string;
  areas: {
    id: number;
    anchor_area_name: string;
    shape_json: string;
    wkt_poly: string | null;
    dro_vehicle_name: string | null;
  }[];
};

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

// ── Toast helpers ─────────────────────────────────────────────────────────────
let toastCounter = 0;

// ── Component ──────────────────────────────────────────────────────────────────
export default function RoutePlannerClient({
  templates,
}: {
  templates: Template[];
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? null
  );

  const [routes, setRoutes] = useState<RouteGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // Track reassignments: areaId → { route_slot, route_label, work_area_number }
  const [changes, setChanges] = useState<
    Map<number, { route_slot: number; route_label: string; work_area_number: string }>
  >(new Map());

  const [expandedSlots, setExpandedSlots] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showDroModal, setShowDroModal] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{
    success: boolean;
    sortDate?: string;
    activePlan?: { id: number; name: string };
    routesSent?: number;
    totalStops?: number;
    skippedStops?: number;
    solveOk?: boolean;
    solveJobId?: number;
    routes?: { route: string; stops: number; ok: boolean }[];
    error?: string;
    hint?: string;
  } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Fetch template areas ─────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedTemplateId == null) return;
    setLoading(true);
    setChanges(new Map());

    fetch(`/api/route-templates/${selectedTemplateId}/areas`)
      .then((r) => r.json())
      .then((data) => {
        setRoutes(data.routes ?? []);
      })
      .catch(() => addToast("Failed to load template areas", "error"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

  // ── Toast helpers ─────────────────────────────────────────────────────────────
  function addToast(message: string, type: Toast["type"] = "info") {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  // ── Build flat areas list for map (applying in-memory changes) ────────────────
  const flatAreas: MapArea[] = routes.flatMap((r) =>
    r.areas.map((a) => {
      const change = changes.get(a.id);
      return {
        id: a.id,
        anchor_area_name: a.anchor_area_name,
        route_slot: change?.route_slot ?? r.slot,
        route_label: change?.route_label ?? r.label,
        shape_json: a.shape_json,
        wkt_poly: a.wkt_poly,
      };
    })
  );

  const routeSlots: RouteSlot[] = routes.map((r) => ({
    slot: r.slot,
    label: r.label,
    work_area_number: r.work_area_number,
  }));

  // ── Handle reassign from map ──────────────────────────────────────────────────
  const handleReassign = useCallback(
    (
      areaId: number,
      newSlot: number,
      newLabel: string,
      newWorkAreaNumber: string
    ) => {
      setChanges((prev) => {
        const next = new Map(prev);
        // Find original slot for this area
        const originalRoute = routes.find((r) => r.areas.some((a) => a.id === areaId));
        const originalSlot = originalRoute?.slot;
        // If moved back to original, remove the change
        if (newSlot === originalSlot) {
          next.delete(areaId);
        } else {
          next.set(areaId, {
            route_slot: newSlot,
            route_label: newLabel,
            work_area_number: newWorkAreaNumber,
          });
        }
        return next;
      });
    },
    [routes]
  );

  // ── Effective area count per slot (after changes) ────────────────────────────
  function effectiveSlotAreas(slot: number): { id: number; name: string }[] {
    const movedIn = Array.from(changes.entries())
      .filter(([, c]) => c.route_slot === slot)
      .map(([areaId]) => {
        const allAreas = routes.flatMap((r) => r.areas);
        const area = allAreas.find((a) => a.id === areaId);
        return area ? { id: area.id, name: area.anchor_area_name } : null;
      })
      .filter(Boolean) as { id: number; name: string }[];

    const route = routes.find((r) => r.slot === slot);
    if (!route) return movedIn;

    const originalAreas = route.areas
      .filter((a) => !changes.has(a.id))
      .map((a) => ({ id: a.id, name: a.anchor_area_name }));

    return [...originalAreas, ...movedIn];
  }

  // ── Save changes ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedTemplateId || changes.size === 0) return;
    setSaving(true);

    const payload = Array.from(changes.entries()).map(([id, c]) => ({
      id,
      route_slot: c.route_slot,
      route_label: c.route_label,
      work_area_number: c.work_area_number,
    }));

    try {
      const res = await fetch(`/api/route-templates/${selectedTemplateId}/areas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areas: payload }),
      });
      if (!res.ok) throw new Error("Save failed");

      // Re-fetch to sync state
      const data = await fetch(`/api/route-templates/${selectedTemplateId}/areas`).then(
        (r) => r.json()
      );
      setRoutes(data.routes ?? []);
      setChanges(new Map());
      addToast("Changes saved successfully", "success");
    } catch {
      addToast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  // ── Push to DRO ───────────────────────────────────────────────────────────────
  async function handleDroConfirm() {
    if (!selectedTemplateId) return;
    setShowDroModal(false);
    setPushing(true);
    setPushResult(null);

    try {
      const res = await fetch("/api/dro/push-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });
      const data = await res.json();
      setPushResult(data);
      if (data.success) {
        addToast(`Pushed ${data.routesSent} routes, ${data.totalStops} stops — solve ${data.solveOk ? "triggered ✓" : "failed"}`, "success");
      } else {
        addToast(data.error ?? "Push failed", "error");
      }
    } catch (err: any) {
      setPushResult({ success: false, error: err?.message ?? "Network error" });
      addToast("Push failed — check console", "error");
    } finally {
      setPushing(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  function toggleSlot(slot: number) {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-slate-200 bg-white h-full overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Auto DRO
          </p>
          <h1 className="text-[18px] font-extrabold text-slate-900 tracking-tight leading-none">
            Route Planner
          </h1>
        </div>

        {/* Template selector */}
        <div className="px-4 py-3 border-b border-slate-100">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Template
          </label>
          {templates.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No templates found</p>
          ) : (
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) => setSelectedTemplateId(parseInt(e.target.value, 10))}
              className="w-full text-[12px] font-semibold text-slate-800 bg-slate-50 border border-slate-200
                rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? " ★" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Route list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : routes.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic text-center py-10">
              No routes in this template
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {routes.map((route) => {
                const color = slotColor(route.slot);
                const effectiveAreas = effectiveSlotAreas(route.slot);
                const isExpanded = expandedSlots.has(route.slot);
                const hasChange = effectiveAreas.some((a) => changes.has(a.id)) ||
                  route.areas.some((a) => changes.has(a.id));

                return (
                  <div key={route.slot} className="rounded-lg border border-slate-100 overflow-hidden">
                    <button
                      onClick={() => toggleSlot(route.slot)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-slate-800 truncate leading-tight">
                          {route.label || `Slot ${route.slot}`}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {effectiveAreas.length} area{effectiveAreas.length !== 1 ? "s" : ""}
                          {hasChange && (
                            <span className="ml-1 text-amber-500 font-semibold">· edited</span>
                          )}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3 text-slate-300 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-slate-300 shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-2 border-t border-slate-100 bg-slate-50/50">
                        {effectiveAreas.length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic py-2">No areas</p>
                        ) : (
                          <div className="flex flex-col gap-0.5 pt-1.5">
                            {effectiveAreas.map((a) => (
                              <div key={a.id} className="flex items-center gap-1.5 py-0.5">
                                <div
                                  className="w-1 h-1 rounded-full shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <p className="text-[11px] text-slate-600 truncate">
                                  {a.name}
                                  {changes.has(a.id) && (
                                    <span className="ml-1 text-amber-400 text-[9px]">●</span>
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom action buttons */}
        <div className="px-4 py-4 border-t border-slate-100 flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={changes.size === 0 || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-bold
              tracking-wide transition-all
              bg-slate-900 text-white hover:bg-slate-700
              disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Changes
            {changes.size > 0 && (
              <span className="ml-1 bg-amber-400 text-slate-900 text-[9px] font-extrabold
                rounded-full w-4 h-4 flex items-center justify-center">
                {changes.size}
              </span>
            )}
          </button>

          <button
            onClick={() => { setPushResult(null); setShowDroModal(true); }}
            disabled={!selectedTemplate || pushing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-bold
              tracking-wide transition-all border border-slate-200
              bg-white text-slate-700 hover:bg-slate-50
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pushing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {pushing ? "Pushing…" : "Push to DRO"}
          </button>

          {/* Push result summary */}
          {pushResult && !pushing && (
            <div className={`rounded-lg px-3 py-2 text-[11px] border
              ${pushResult.success
                ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                : "bg-red-50 border-red-100 text-red-700"}`}>
              {pushResult.success ? (
                <>
                  <p className="font-bold">✓ Routes pushed</p>
                  <p>{pushResult.routesSent} routes · {pushResult.totalStops} stops</p>
                  <p>Sort date: {pushResult.sortDate}</p>
                  <p>Plan: {pushResult.activePlan?.name}</p>
                  <p>Solve: {pushResult.solveOk ? "triggered ✓" : "⚠ failed (outside window?)"}</p>
                  {(pushResult.skippedStops ?? 0) > 0 && (
                    <p className="text-emerald-600">{pushResult.skippedStops} stops kept as-is (no WAN)</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-bold">✗ {pushResult.error}</p>
                  {pushResult.hint && <p className="mt-0.5 text-red-600">{pushResult.hint}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Map panel ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 h-full min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-full bg-slate-50">
            <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
          </div>
        ) : (
          <RoutePlannerMap
            areas={flatAreas}
            routes={routeSlots}
            onReassign={handleReassign}
          />
        )}
      </div>

      {/* ── Push to DRO confirmation modal ────────────────────────────────────── */}
      {showDroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[380px] mx-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Confirm Action
                </p>
                <h2 className="text-[16px] font-extrabold text-slate-900 leading-tight">
                  Push to DRO
                </h2>
              </div>
              <button
                onClick={() => setShowDroModal(false)}
                className="text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
              This will push{" "}
              <strong className="text-slate-900">{selectedTemplate?.name}</strong> to
              the currently active DRO plan and trigger a solve.
            </p>
            <ul className="text-[11px] text-slate-500 mb-5 space-y-0.5 pl-3 list-disc">
              <li>Stops are assigned by anchor area → route (not geometry)</li>
              <li>Stops without a work area number stay where they are</li>
              <li>Solve runs immediately after — takes ~1 min</li>
              <li>Takes ~60–90 seconds total (login + push + solve)</li>
            </ul>

            <div className="flex gap-2">
              <button
                onClick={() => setShowDroModal(false)}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-bold border border-slate-200
                  text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDroConfirm}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-bold
                  bg-slate-900 text-white hover:bg-slate-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notifications ───────────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-[12px] font-semibold
              pointer-events-auto animate-in fade-in slide-in-from-bottom-2
              ${
                t.type === "success"
                  ? "bg-white border-emerald-200 text-emerald-800"
                  : t.type === "error"
                  ? "bg-white border-red-200 text-red-800"
                  : "bg-white border-slate-200 text-slate-700"
              }`}
          >
            {t.type === "success" && (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            {t.type === "error" && <X className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            {t.type === "info" && <Zap className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
