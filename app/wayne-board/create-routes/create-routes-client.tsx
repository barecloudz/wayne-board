"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Users, Package, Route, ChevronRight,
  RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, MapPin,
  Hash, ListChecks, Send, PartyPopper, Map, List, Loader2,
} from "lucide-react";

const CreateRoutesMap = dynamic(() => import("./create-routes-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[420px] bg-slate-50 rounded-2xl border border-slate-200">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  ),
});

// ── Wizard Step Bar ─────────────────────────────────────────────────────────
const WIZARD_STEPS = [
  { id: "review",  short: "Pick Cuts",   label: "Step 1 — Pick your cuts" },
  { id: "plan",    short: "Review Plan", label: "Step 2 — Review the plan" },
  { id: "confirm", short: "Confirm",     label: "Step 3 — Confirm & send" },
  { id: "done",    short: "Done",        label: "All done!" },
] as const;

function WizardBar({ step }: { step: Step }) {
  const activeIdx = step === "planning" ? 0 : WIZARD_STEPS.findIndex(s => s.id === step);
  return (
    <div className="flex items-center gap-0 mb-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-1 overflow-hidden">
      {WIZARD_STEPS.map((s, i) => {
        const done    = i < activeIdx;
        const active  = i === activeIdx;
        return (
          <div
            key={s.id}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-[12px] font-semibold transition-all ${
              active  ? "bg-slate-900 text-white"
              : done  ? "text-emerald-600"
              :         "text-slate-400"
            }`}
          >
            {done ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
              }`}>{i + 1}</span>
            )}
            <span className="hidden sm:inline truncate">{s.short}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-step helper callout ──────────────────────────────────────────────────
const STEP_HELP: Record<string, { icon: React.ElementType; headline: string; body: string }> = {
  review: {
    icon: Hash,
    headline: "How many drivers are you cutting today?",
    body: "Look at your driver count. If someone called out or you're short-staffed, dial down the number of routes here. The system will automatically spread the stops across fewer drivers. Aim to keep each driver under 120 stops.",
  },
  plan: {
    icon: ListChecks,
    headline: "Does the plan look right?",
    body: "Scroll through the routes below. Each card shows how many stops and packages a driver will have. Green bar = light load, amber = getting full, red = heavy. If a route looks off, hit Back and adjust your cut number.",
  },
  confirm: {
    icon: Send,
    headline: "Ready to send this to DRO?",
    body: "When you click Apply, the system will log into DRO, load these routes, and trigger a solve. This takes 30–60 seconds. The stops will be sequenced automatically — you don't need to do anything else in DRO.",
  },
  done: {
    icon: PartyPopper,
    headline: "Routes are in DRO!",
    body: "The solve has been triggered. Give it a minute or two, then check DRO to confirm all routes are sequenced. You're done here.",
  },
};

type AnchorAreaData = {
  anchorAreaId: number;
  name: string;
  shapeJson: string;
  wktPoly?: string | null;
  hexCode?: string | null;
};

type RouteData = {
  today: string;
  driverCount: number;
  scheduledDrivers: { driverId: string; name: string; workArea?: string | null }[];
  coveredWorkAreas: string[];
  totalStops: number;
  totalPackages: number;
  droRoutes: { workAreaName: string; workAreaNumber: string; stops: number; packages: number }[];
  droRouteCount: number;
  maxCut: number;
  minRoutes: number;
  predictedStops: number | null;
  suggestedDrivers: number | null;
  historicalSampleSize: number;
  anchorAreas: AnchorAreaData[];
};

type PlannedStop = {
  seq: number;
  address: string;
  city: string;
  firmName: string | null;
  lat: number;
  lng: number;
  packages: number;
  isBulk: boolean;
  waypointId: string;
};

type PlannedRoute = {
  routeIndex: number;
  name: string;
  stopCount: number;
  packages: number;
  bulkStops: number;
  totalCube: number;
  vehicleCapacity: number;
  cubePct: number;
  estMiles: number;
  centLat: number;
  centLng: number;
  stops: PlannedStop[];
};

type PlanResult = {
  depot: { lat: number; lng: number };
  totalStops: number;
  totalPackages: number;
  totalEstMiles: number;
  routeCount: number;
  originalRouteCount: number;
  merged: number;
  cappedAt: string | null;
  routes: PlannedRoute[];
};

type Step = "review" | "planning" | "plan" | "confirm" | "pushing" | "done";

export default function CreateRoutesClient() {
  const [data, setData]           = useState<RouteData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [syncPhase, setSyncPhase] = useState<"connecting" | "syncing" | null>(null);
  const [syncMsg, setSyncMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [activeWorkAreas, setActiveWorkAreas] = useState<Set<string>>(new Set());
  const [step, setStep]           = useState<Step>("review");
  const [plan, setPlan]           = useState<PlanResult | null>(null);
  const [planError, setPlanError] = useState("");
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [planView, setPlanView]   = useState<"list" | "map">("map");
  const [pushError, setPushError] = useState("");
  const [pushResult, setPushResult] = useState<{ jobId?: string; transferCount?: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/create-routes");
      const json = await res.json() as RouteData;
      setData(json);
      // Default active routes from schedule: only routes that have a driver working today.
      // Falls back to all routes if no driver↔route assignments exist yet.
      const covered = json.coveredWorkAreas ?? [];
      const defaultActive = covered.length > 0
        ? new Set(covered)
        : new Set(json.droRoutes.map(r => r.workAreaName));
      setActiveWorkAreas(defaultActive);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncPhase("syncing");
    setSyncMsg(null);
    try {
      // Attempt sync
      let res  = await fetch("/api/auto-dro/sync", { method: "POST" });
      let json: any = await res.json().catch(() => null);

      // If session expired, direct user to reconnect from Auto DRO
      if (json?.error?.includes("session expired") || json?.error?.includes("SESSION_EXPIRED")) {
        setSyncMsg({ ok: false, text: "DRO session expired — go to Auto DRO → Connect to DRO, wait 2-3 min, then come back and sync." });
        return;
      }

      if (!json) {
        setSyncMsg({ ok: false, text: "Sync timed out or returned an invalid response." });
        return;
      }
      if (!res.ok || json.error) {
        setSyncMsg({ ok: false, text: json.error ?? "Sync failed" });
      } else {
        setSyncMsg({ ok: true, text: `Synced — ${json.stops} stops, ${json.routes} routes` });
        await load();
      }
    } catch (e: any) {
      setSyncMsg({ ok: false, text: e?.message ?? "Sync failed" });
    } finally {
      setSyncing(false);
      setSyncPhase(null);
    }
  }

  const dateLabel = (() => {
    if (!data) return "";
    try {
      const [y, m, d] = data.today.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return data.today; }
  })();

  const activeCount   = activeWorkAreas.size;
  const stopsPerRoute = data && activeCount > 0 ? Math.ceil(data.totalStops / activeCount) : 0;
  const stopsOk       = stopsPerRoute <= 120;

  async function handleBuildPlan() {
    if (!data) return;
    setStep("planning");
    setPlanError("");
    setPlan(null);
    try {
      const res = await fetch("/api/create-routes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeWorkAreaNames: [...activeWorkAreas] }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setPlanError(json.error ?? "Failed to build plan");
        setStep("review");
        return;
      }
      setPlan(json);
      setStep("plan");
    } catch (e: any) {
      setPlanError(e?.message ?? String(e));
      setStep("review");
    }
  }

  async function handlePush() {
    if (!plan || !data) return;
    setStep("pushing");
    setPushError("");
    setPushResult(null);
    try {
      const routes = plan.routes.map(r => ({
        name:  r.name,
        stops: r.stops.map(s => ({ waypointId: s.waypointId })),
      }));
      const res = await fetch("/api/create-routes/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes, sortDate: data.today }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setPushError(json.error ?? "Push to DRO failed");
        setStep("confirm");
        return;
      }
      setPushResult({ jobId: json.jobId, transferCount: json.transferCount });
      setStep("done");
    } catch (e: any) {
      setPushError(e?.message ?? String(e));
      setStep("confirm");
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading route data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-red-500">Failed to load route data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Create Routes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStep("review"); setPlan(null); setPlanError(""); load(); }}
            disabled={loading || syncing}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncPhase === "connecting" ? "Connecting…" : syncPhase === "syncing" ? "Syncing…" : "Sync DRO"}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncMsg && (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-4 text-sm font-semibold ${
          syncMsg.ok
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {syncMsg.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
          {syncMsg.text}
          <button onClick={() => setSyncMsg(null)} className="ml-auto text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Wizard progress bar */}
      {step !== "planning" && <WizardBar step={step} />}
      {step === "planning" && <WizardBar step="review" />}

      {/* Per-step help callout */}
      {(() => {
        const helpKey = step === "planning" ? "review" : step;
        const help = STEP_HELP[helpKey];
        if (!help) return null;
        const Icon = help.icon;
        return (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-blue-900">{help.headline}</p>
              <p className="text-[12px] text-blue-700 mt-0.5 leading-relaxed">{help.body}</p>
            </div>
          </div>
        );
      })()}

      {/* ── Step: Review / Select Work Areas ── */}
      {(step === "review" || step === "planning") && (
        <>
          {/* Stop Count Cards — Predicted vs Live */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Predicted */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Predicted Stops</p>
              <p className="text-[40px] font-extrabold text-violet-600 leading-none">
                {data.predictedStops != null ? `~${data.predictedStops}` : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {data.historicalSampleSize > 0
                  ? `avg of last ${data.historicalSampleSize} ${dateLabel.split(",")[0]}s`
                  : "no history yet"}
              </p>
              {data.suggestedDrivers && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                  <Users className="w-3 h-3 text-violet-500" />
                  <span className="text-[12px] font-bold text-violet-700">
                    Suggest {data.suggestedDrivers} drivers
                  </span>
                </div>
              )}
            </div>

            {/* Live synced */}
            <div className={`rounded-2xl border p-5 shadow-sm ${
              data.totalStops > 0 ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200"
            }`}>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Live Synced Stops</p>
              <p className={`text-[40px] font-extrabold leading-none ${
                data.totalStops > 0 ? "text-slate-900" : "text-slate-300"
              }`}>
                {data.totalStops > 0 ? data.totalStops : "—"}
              </p>
              <p className="text-[11px] text-amber-600 font-semibold mt-1">
                {data.totalStops > 0 ? "Grows until midnight" : "Sync DRO to load stops"}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {data.totalPackages > 0 ? `${data.totalPackages} packages` : ""}
              </p>
            </div>
          </div>

          {/* Stops-per-driver preview bar */}
          {data.totalStops > 0 && activeCount > 0 && (
            <div className={`rounded-xl p-3 mb-3 flex items-center gap-3 ${
              stopsOk ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
            }`}>
              <p className={`text-[26px] font-extrabold leading-none shrink-0 ${stopsOk ? "text-emerald-700" : "text-red-600"}`}>
                ~{stopsPerRoute}
              </p>
              <div>
                <p className={`text-[13px] font-bold ${stopsOk ? "text-emerald-700" : "text-red-600"}`}>
                  stops per driver
                </p>
                <p className="text-[11px] text-slate-500">
                  {data.totalStops} stops ÷ {activeCount} active routes
                  {!stopsOk && " — over 120 stop limit!"}
                </p>
              </div>
            </div>
          )}

          {data.totalStops === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No stops synced from DRO yet</p>
                <p className="text-sm text-amber-700 mt-0.5">Run an Auto DRO sync first to pull today&apos;s stop data.</p>
              </div>
            </div>
          )}

          {planError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{planError}</p>
            </div>
          )}

          {/* Schedule-based pre-selection notice */}
          {data.coveredWorkAreas.length > 0 && data.coveredWorkAreas.length < data.droRouteCount && (
            <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-3">
              <Users className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-violet-800">
                <span className="font-bold">{data.coveredWorkAreas.length} routes pre-selected</span> based on today&apos;s schedule.{" "}
                {data.droRouteCount - data.coveredWorkAreas.length} route{data.droRouteCount - data.coveredWorkAreas.length !== 1 ? "s" : ""} have no assigned driver and are marked cut.
              </p>
            </div>
          )}
          {data.coveredWorkAreas.length === 0 && data.droRouteCount > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800">
                <span className="font-bold">No driver↔route assignments found.</span> Assign work areas to drivers in the Scheduling page to enable auto-detection.
              </p>
            </div>
          )}

          {/* Work Area Checkbox List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-extrabold text-slate-900">Which trucks are running today?</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Checked = running today. Unchecked stops get spread to active routes.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setActiveWorkAreas(new Set(data.droRoutes.map(r => r.workAreaName)))}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                >
                  All On
                </button>
                <button
                  onClick={() => setActiveWorkAreas(new Set())}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  All Off
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-50">
              {data.droRoutes.length === 0 && (
                <p className="px-5 py-6 text-[13px] text-slate-400 text-center">No routes loaded — sync DRO first</p>
              )}
              {data.droRoutes.map(r => {
                const isActive = activeWorkAreas.has(r.workAreaName);
                // Find which scheduled driver covers this route
                const assignedDriver = data.scheduledDrivers.find(
                  d => d.workArea?.trim() === r.workAreaName.trim()
                );
                return (
                  <label
                    key={r.workAreaName}
                    className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer select-none transition-colors ${
                      isActive ? "hover:bg-slate-50" : "bg-slate-50/60 opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      disabled={step === "planning"}
                      onChange={() => {
                        setActiveWorkAreas(prev => {
                          const next = new Set(prev);
                          if (next.has(r.workAreaName)) next.delete(r.workAreaName);
                          else next.add(r.workAreaName);
                          return next;
                        });
                      }}
                      className="w-5 h-5 rounded accent-emerald-600 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-bold truncate ${isActive ? "text-slate-900" : "text-slate-400"}`}>
                        {r.workAreaName}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        #{r.workAreaNumber}
                        {assignedDriver && (
                          <span className="ml-2 text-emerald-600 font-semibold">· {assignedDriver.name}</span>
                        )}
                        {!assignedDriver && isActive && (
                          <span className="ml-2 text-amber-500 font-semibold">· no driver assigned</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[15px] font-extrabold ${isActive ? "text-slate-900" : "text-slate-300"}`}>
                        {r.stops}
                      </p>
                      <p className="text-[10px] text-slate-400">stops</p>
                    </div>
                    {!isActive && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
                        CUT
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Summary footer */}
            {data.droRoutes.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-[12px] text-slate-500">
                  <span className="font-bold text-slate-800">{activeCount}</span> of {data.droRoutes.length} routes active
                  {activeCount < data.droRoutes.length && (
                    <span className="text-red-500 font-semibold"> · {data.droRoutes.length - activeCount} cut</span>
                  )}
                </span>
                {data.suggestedDrivers && activeCount !== data.suggestedDrivers && (
                  <span className={`text-[11px] font-semibold ${
                    activeCount < data.suggestedDrivers ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    {activeCount < data.suggestedDrivers
                      ? `⚠ Suggested: ${data.suggestedDrivers} drivers`
                      : `✓ Above suggested ${data.suggestedDrivers}`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Build Plan Button */}
          <button
            onClick={handleBuildPlan}
            disabled={data.totalStops === 0 || activeCount === 0 || step === "planning"}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[15px] py-4 rounded-xl transition-colors"
          >
            {step === "planning"
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Building route plan...</>
              : <>Build Plan — {activeCount} routes <ChevronRight className="w-4 h-4" /></>
            }
          </button>
        </>
      )}

      {/* ── Step: Plan Results ── */}
      {step === "plan" && plan && (
        <>
          {/* Summary Bar */}
          <div className="bg-slate-900 rounded-2xl p-5 mb-5 flex flex-wrap items-center gap-5">
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Routes</p>
              <p className="text-[32px] font-extrabold text-white leading-none">{plan.routeCount}</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Total Stops</p>
              <p className="text-[32px] font-extrabold text-white leading-none">{plan.totalStops}</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Packages</p>
              <p className="text-[32px] font-extrabold text-white leading-none">{plan.totalPackages}</p>
            </div>
              <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Est. Miles</p>
              <p className="text-[32px] font-extrabold text-white leading-none">{Math.round(plan.totalEstMiles)}</p>
            </div>
            {plan.merged > 0 && (
              <>
                <div className="w-px h-10 bg-white/10" />
                <div className="text-center">
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Merged</p>
                  <p className="text-[32px] font-extrabold text-emerald-400 leading-none">{plan.merged}</p>
                  <p className="text-[9px] text-white/40">routes cut</p>
                </div>
              </>
            )}
            <div className="ml-auto flex gap-2 flex-wrap justify-end">
              {/* Map / List toggle */}
              <div className="flex gap-1 bg-white/10 rounded-xl p-1">
                <button
                  onClick={() => setPlanView("map")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    planView === "map" ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
                  }`}
                >
                  <Map className="w-3.5 h-3.5" /> Map
                </button>
                <button
                  onClick={() => setPlanView("list")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    planView === "list" ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> List
                </button>
              </div>
              <button
                onClick={() => setStep("review")}
                className="px-4 py-2 rounded-xl border border-white/20 text-white/70 hover:text-white text-sm font-semibold transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors"
              >
                Looks Good →
              </button>
            </div>
          </div>

          {/* Cap warning */}
          {plan.cappedAt && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">{plan.cappedAt}</p>
            </div>
          )}

          {/* Map view */}
          {planView === "map" && data && (
            <div className="mb-4">
              <CreateRoutesMap
                plan={plan}
                anchorAreas={data.anchorAreas}
                activeWorkAreas={activeWorkAreas}
              />
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Each colored dot is a planned stop. Shaded polygons are anchor area territories. Verify stops land in the right zones before applying.
              </p>
            </div>
          )}

          {/* Route Cards (list view) */}
          {planView === "list" && (
            <div className="space-y-2">
              {plan.routes.map((r) => {
                const isOpen = expanded === r.routeIndex;
                const loadPct = r.cubePct;
                const loadColor =
                  loadPct >= 90 ? "bg-red-400" :
                  loadPct >= 70 ? "bg-amber-400" : "bg-emerald-400";

                return (
                  <div key={r.routeIndex} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.routeIndex)}
                      className="w-full px-4 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-extrabold text-white">{r.routeIndex}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-slate-800 truncate">{r.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[120px]">
                            <div className={`h-full rounded-full ${loadColor}`} style={{ width: `${Math.min(100, loadPct)}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-400">{r.stopCount} stops · {r.packages} pkgs · {r.cubePct}% full · ~{r.estMiles}mi</span>
                          {r.bulkStops > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                              {r.bulkStops} bulk
                            </span>
                          )}
                        </div>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      }
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-80 overflow-y-auto">
                        {r.stops.map((s) => (
                          <div key={s.waypointId} className="px-4 py-2 flex items-start gap-3">
                            <span className="text-[11px] font-bold text-slate-300 w-6 shrink-0 pt-0.5 text-right">{s.seq}</span>
                            <MapPin className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              {s.firmName && <p className="text-[11px] font-semibold text-slate-500 truncate">{s.firmName}</p>}
                              <p className="text-[13px] font-semibold text-slate-800 truncate">{s.address}</p>
                              <p className="text-[11px] text-slate-400">{s.city}</p>
                            </div>
                            <span className={`text-[11px] font-bold shrink-0 ${s.isBulk ? "text-amber-500" : "text-slate-400"}`}>
                              {s.packages} pkg{s.packages !== 1 ? "s" : ""}{s.isBulk ? " •bulk" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom confirm */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setStep("review")}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep("confirm")}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
            >
              Confirm & Apply →
            </button>
          </div>
        </>
      )}

      {/* ── Step: Confirm ── */}
      {step === "confirm" && plan && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Route className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">
            {plan.routeCount} routes · {plan.totalStops} stops
          </h2>
          <p className="text-sm text-slate-500 mb-2">
            ~{Math.ceil(plan.totalStops / plan.routeCount)} stops per driver
          </p>
          {plan.merged > 0 && (
            <p className="text-sm font-semibold text-emerald-600 mb-6">
              {plan.merged} route{plan.merged > 1 ? "s" : ""} merged — saving {plan.merged} driver{plan.merged > 1 ? "s" : ""}
            </p>
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-left mb-6">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Route Summary</p>
            {plan.routes.map(r => (
              <div key={r.routeIndex} className="flex justify-between py-1 text-sm">
                <span className="font-medium text-slate-700">Route {r.routeIndex} — {r.name}</span>
                <span className="text-slate-400">{r.stopCount} stops</span>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-slate-400 mb-4">
            This plan has been calculated and sequenced. Clicking Apply will log into DRO, transfer all stops, and trigger a solve.
          </p>

          {pushError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-left">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{pushError}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("plan")}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handlePush}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
            >
              Apply to DRO →
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Pushing ── */}
      {step === "pushing" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Pushing to DRO…</h2>
          <p className="text-sm text-slate-500">Logging in, transferring stops, and triggering solve. This may take 30–60 seconds.</p>
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === "done" && plan && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Routes applied to DRO</h2>
          <p className="text-sm text-slate-500 mb-2">
            {plan.routeCount} routes · {plan.totalStops} stops transferred
          </p>
          {pushResult?.jobId && (
            <p className="text-[11px] text-slate-400 mb-6">Solve job ID: {pushResult.jobId}</p>
          )}
          <button
            onClick={() => { setStep("review"); setPlan(null); setPushResult(null); load(); }}
            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
