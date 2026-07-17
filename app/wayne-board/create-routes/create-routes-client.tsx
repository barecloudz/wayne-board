"use client";

import { useEffect, useState } from "react";
import {
  Users, Package, Route, ChevronRight, Minus, Plus,
  RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, MapPin,
  Hash, ListChecks, Send, PartyPopper,
} from "lucide-react";

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

type RouteData = {
  today: string;
  driverCount: number;
  scheduledDrivers: { driverId: string; name: string }[];
  totalStops: number;
  totalPackages: number;
  droRoutes: { workAreaName: string; workAreaNumber: string; stops: number; packages: number }[];
  droRouteCount: number;
  maxCut: number;
  minRoutes: number;
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
  const [data, setData]         = useState<RouteData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [cut, setCut]           = useState(0);
  const [step, setStep]         = useState<Step>("review");
  const [plan, setPlan]         = useState<PlanResult | null>(null);
  const [planError, setPlanError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pushError, setPushError] = useState("");
  const [pushResult, setPushResult] = useState<{ jobId?: string; transferCount?: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/create-routes");
      setData(await res.json());
      setCut(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const dateLabel = (() => {
    if (!data) return "";
    try {
      const [y, m, d] = data.today.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return data.today; }
  })();

  const finalDrivers  = data ? data.driverCount - cut : 0;
  const stopsPerRoute = data && finalDrivers > 0 ? Math.ceil(data.totalStops / finalDrivers) : 0;
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
        body: JSON.stringify({ driverCount: finalDrivers }),
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Create Routes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateLabel}</p>
        </div>
        <button
          onClick={() => { setStep("review"); setPlan(null); load(); }}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

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

      {/* ── Step: Review / Select Cut ── */}
      {(step === "review" || step === "planning") && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <Package className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-[28px] font-extrabold text-slate-900 leading-none">{data.totalStops}</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-1">Stops Today</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <Users className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-[28px] font-extrabold text-slate-900 leading-none">{data.driverCount}</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-1">Drivers Scheduled</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <Route className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-[28px] font-extrabold text-slate-900 leading-none">{data.droRouteCount}</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-1">Current DRO Routes</p>
            </div>
          </div>

          {data.totalStops === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No stops loaded from DRO yet</p>
                <p className="text-sm text-amber-700 mt-0.5">Run an Auto DRO sync first to pull today&apos;s stop data.</p>
              </div>
            </div>
          )}

          {planError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{planError}</p>
            </div>
          )}

          {/* Cut Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
            <h2 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-4">
              How many drivers do you want to cut?
            </h2>

            <div className="flex items-center justify-center gap-6 mb-5">
              <button
                onClick={() => setCut(c => Math.max(0, c - 1))}
                disabled={cut === 0 || step === "planning"}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4 text-slate-700" />
              </button>

              <div className="text-center min-w-[120px]">
                <p className="text-[52px] font-extrabold text-slate-900 leading-none">{cut}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  {cut === 0 ? "no cuts" : cut === 1 ? "driver cut" : "drivers cut"}
                </p>
              </div>

              <button
                onClick={() => setCut(c => Math.min(data.maxCut, c + 1))}
                disabled={cut >= data.maxCut || step === "planning"}
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4 text-slate-700" />
              </button>
            </div>

            {/* Stops per driver preview */}
            <div className={`rounded-xl p-4 text-center transition-colors ${
              stopsOk ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
            }`}>
              <p className={`text-[28px] font-extrabold leading-none ${stopsOk ? "text-emerald-700" : "text-red-600"}`}>
                ~{stopsPerRoute}
              </p>
              <p className={`text-[12px] font-semibold mt-1 ${stopsOk ? "text-emerald-600" : "text-red-500"}`}>
                stops per driver
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {data.totalStops} stops ÷ {finalDrivers} drivers
                {!stopsOk && " — over 120 stop limit"}
              </p>
            </div>

            {data.maxCut > 0 && (
              <p className="text-[11px] text-slate-400 text-center mt-3">
                Max cut: {data.maxCut} {data.maxCut === 1 ? "driver" : "drivers"} (keeps each route ≤ 120 stops)
              </p>
            )}
            {data.maxCut === 0 && data.totalStops > 0 && (
              <p className="text-[11px] text-amber-500 text-center mt-3">
                Can&apos;t cut anyone — routes are already at capacity
              </p>
            )}
          </div>

          {/* Build Plan Button */}
          <button
            onClick={handleBuildPlan}
            disabled={data.totalStops === 0 || step === "planning"}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[14px] py-3.5 rounded-xl transition-colors"
          >
            {step === "planning"
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Building route plan...</>
              : <>{cut === 0 ? "Build Plan — All" : `Build Plan — Cut ${cut} ·`} {finalDrivers} routes <ChevronRight className="w-4 h-4" /></>
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
            <div className="ml-auto flex gap-2">
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

          {/* Route Cards */}
          <div className="space-y-2">
            {plan.routes.map((r) => {
              const isOpen = expanded === r.routeIndex;
              const loadPct = r.cubePct;
              const loadColor =
                loadPct >= 90 ? "bg-red-400" :
                loadPct >= 70 ? "bg-amber-400" : "bg-emerald-400";

              return (
                <div key={r.routeIndex} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Route header */}
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

                  {/* Stop list */}
                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-80 overflow-y-auto">
                      {r.stops.map((s) => (
                        <div key={s.waypointId} className="px-4 py-2 flex items-start gap-3">
                          <span className="text-[11px] font-bold text-slate-300 w-6 shrink-0 pt-0.5 text-right">
                            {s.seq}
                          </span>
                          <MapPin className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            {s.firmName && (
                              <p className="text-[11px] font-semibold text-slate-500 truncate">{s.firmName}</p>
                            )}
                            <p className="text-[13px] font-semibold text-slate-800 truncate">{s.address}</p>
                            <p className="text-[11px] text-slate-400">{s.city}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`text-[11px] font-bold ${s.isBulk ? "text-amber-500" : "text-slate-400"}`}>
                              {s.packages} pkg{s.packages !== 1 ? "s" : ""}
                              {s.isBulk ? " •bulk" : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
            onClick={() => { setStep("review"); setPlan(null); setCut(0); setPushResult(null); load(); }}
            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
