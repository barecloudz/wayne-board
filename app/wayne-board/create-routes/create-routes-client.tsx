"use client";

import { useEffect, useState } from "react";
import { Users, Package, Route, ChevronRight, Minus, Plus, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

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

type Step = "review" | "confirm" | "done";

export default function CreateRoutesClient() {
  const [data, setData]       = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cut, setCut]         = useState(0);
  const [step, setStep]       = useState<Step>("review");
  const [running, setRunning] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

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

  async function handleCreateRoutes() {
    if (!data) return;
    setRunning(true);
    setResultMsg("");
    try {
      // Trigger DRO sync to pull latest stop data first
      const syncRes  = await fetch("/api/auto-dro/sync", { method: "POST" });
      const syncData = await syncRes.json();

      if (!syncRes.ok || !syncData.success) {
        setResultMsg(`DRO sync failed: ${syncData.error ?? "Unknown error"}`);
        setRunning(false);
        return;
      }

      // Reload data with fresh stop count
      await load();
      setResultMsg(
        `✅ DRO synced: ${syncData.routes} routes · ${syncData.stops} stops loaded.\n` +
        `Route plan for ${finalDrivers} drivers is ready. ` +
        `Send to DRO dispatch to apply.`
      );
      setStep("done");
    } catch (e: any) {
      setResultMsg(`Error: ${e?.message ?? String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading route data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-red-500">Failed to load route data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Create Routes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateLabel}</p>
        </div>
        <button
          onClick={() => { setStep("review"); load(); }}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* ── Step: Review ── */}
      {step === "review" && (
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
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-1">Routes in DRO</p>
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

          {/* Cut Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
            <h2 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-4">
              How many drivers do you want to cut?
            </h2>

            <div className="flex items-center justify-center gap-6 mb-5">
              <button
                onClick={() => setCut(c => Math.max(0, c - 1))}
                disabled={cut === 0}
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
                disabled={cut >= data.maxCut}
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
                Can&apos;t cut anyone — routes are already at or near 120 stops
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep("confirm")}
              disabled={data.totalStops === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[14px] py-3.5 rounded-xl transition-colors"
            >
              {cut === 0 ? "Continue with all" : `Cut ${cut} · Run with`} {finalDrivers} drivers
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* ── Step: Confirm ── */}
      {step === "confirm" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            stopsOk ? "bg-emerald-100" : "bg-amber-100"
          }`}>
            <Route className={`w-8 h-8 ${stopsOk ? "text-emerald-600" : "text-amber-600"}`} />
          </div>

          <h2 className="text-xl font-extrabold text-slate-900 mb-1">
            {finalDrivers} routes · ~{stopsPerRoute} stops each
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {data.totalStops} total stops · {cut > 0 ? `${cut} driver${cut > 1 ? "s" : ""} cut` : "no cuts"}
          </p>

          <div className="bg-slate-50 rounded-xl p-4 text-left mb-6">
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide mb-2">Scheduled drivers ({finalDrivers})</p>
            <div className="grid grid-cols-2 gap-1.5">
              {data.scheduledDrivers.slice(0, finalDrivers).map(d => (
                <div key={d.driverId} className="text-[13px] text-slate-700 font-medium">
                  {d.name}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("review")}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCreateRoutes}
              disabled={running}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {running
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Syncing DRO...</>
                : "Create Routes"}
            </button>
          </div>

          {resultMsg && (
            <div className="mt-4 p-3 bg-slate-50 rounded-xl text-left text-[12px] text-slate-600 whitespace-pre-line">
              {resultMsg}
            </div>
          )}
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === "done" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Ready to dispatch</h2>
          <p className="text-sm text-slate-500 mb-4">
            {finalDrivers} routes · ~{stopsPerRoute} stops each
          </p>
          {resultMsg && (
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[12px] text-slate-600 whitespace-pre-line mb-6">
              {resultMsg}
            </div>
          )}
          <button
            onClick={() => { setStep("review"); setCut(0); load(); }}
            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
