"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  RefreshCw, CheckCircle, XCircle, Eye, EyeOff,
  Clock, KeyRound, Map, BarChart3, Loader2,
} from "lucide-react";

// Leaflet must be loaded client-side only
const DroMap = dynamic(() => import("./dro-map"), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-full bg-slate-50 rounded-xl">
    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
  </div>
) });

// ── Types ──────────────────────────────────────────────────────────────────────
type DroRoute = {
  id: number;
  workAreaName: string;
  workAreaNumber: string;
  routeType: string;
  stops: number;
  packages: number;
  distance: number;
  timeHours: number;
  sortDate: string;
};

type AnchorArea = {
  anchorAreaId: number;
  name: string;
  shapeJson: string;
  enabledRoutePlans: string;
  wktPoly?: string | null;
  hexCode?: string | null;
};

type StopCoord = {
  lat: number | null;
  lng: number | null;
  actualRoute: string;
  workAreaNumber: string;
};

type Status = {
  routes:        DroRoute[];
  anchorAreas:   AnchorArea[];
  stopCoords:    StopCoord[];
  totalStops:    number;
  totalPackages: number;
  lastSynced:    string;
  autoEnabled:   boolean;
  autoTime:      string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtHours(h: number) {
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

// GroundSwell hexCodes per work area number (mirrors dro-map.tsx)
const GS_HEX: Record<string, string> = {
  "0211": "#9b1b9d", "0247": "#F032E6", "0255": "#AA6E28", "0275": "#E6194B",
  "0314": "#AA6E28", "0326": "#808000", "0351": "#E6BEFF", "0354": "#AAFFC3",
  "0418": "#73ff00", "0426": "#3CB44B", "0442": "#F58231", "0446": "#E6194B",
  "0454": "#F58231", "0470": "#3CB44B", "5104": "#911EB4", "5108": "#E6194B",
  "7757": "#1a1a1a", "7763": "#0082C8", "7764": "#0082C8", "7773": "#911EB4",
  "7779": "#808000", "7783": "#00ff11", "910":  "#00ff11",
};
const FALLBACK_COLORS = [
  "#E91E8C","#9C27B0","#3F51B5","#2196F3","#00897B",
  "#43A047","#8BC34A","#9E9D24","#F57C00","#E53935",
];
function routeColor(wan: string, idx: number): string {
  if (GS_HEX[wan]) return GS_HEX[wan];
  const padded = wan.padStart(4, "0");
  if (GS_HEX[padded]) return GS_HEX[padded];
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const CARD = "bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6";
const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

// ── Component ──────────────────────────────────────────────────────────────────
export default function AutoDroClient() {
  const [data,          setData]          = useState<Status | null>(null);
  const [loading,       setLoading]       = useState(true);

  // Credentials
  const [username,      setUsername]      = useState("");
  const [password,      setPassword]      = useState("");
  const [showPw,        setShowPw]        = useState(false);
  const [credsSaving,   setCredsSaving]   = useState(false);
  const [credsSaved,    setCredsSaved]    = useState(false);

  // Sync
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  // Schedule
  const [autoEnabled,   setAutoEnabled]   = useState(false);
  const [autoTime,      setAutoTime]      = useState("23:55");
  const [schedSaving,   setSchedSaving]   = useState(false);
  const [schedSaved,    setSchedSaved]    = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/auto-dro/status");
    if (res.ok) {
      const d: Status = await res.json();
      setData(d);
      setAutoEnabled(d.autoEnabled);
      setAutoTime(d.autoTime);
    }
    setLoading(false);
  }

  async function loadCreds() {
    const res = await fetch("/api/auto-dro/credentials");
    if (res.ok) {
      const d = await res.json();
      setUsername(d.username ?? "");
    }
  }

  useEffect(() => {
    loadStatus();
    loadCreds();
  }, []);

  async function saveCreds() {
    setCredsSaving(true);
    await fetch("/api/auto-dro/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setCredsSaving(false);
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 3000);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch("/api/auto-dro/sync", { method: "POST" });
    const r   = await res.json();
    setSyncing(false);
    if (r.success) {
      setSyncResult({ ok: true, msg: `${r.routes} routes · ${r.stops} stops loaded for ${r.sortDate}${r.stopsWithCoords ? ` · ${r.stopsWithCoords} with GPS` : ""}` });
      await loadStatus();
    } else {
      setSyncResult({ ok: false, msg: r.error ?? "Sync failed" });
    }
  }

  async function saveSchedule() {
    setSchedSaving(true);
    await Promise.all([
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "dro_auto_sync_enabled", value: String(autoEnabled) }) }),
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "dro_auto_sync_time", value: autoTime }) }),
    ]);
    setSchedSaving(false);
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 3000);
  }

  const routes      = data?.routes      ?? [];
  const anchorAreas = data?.anchorAreas ?? [];
  const stopCoords  = data?.stopCoords  ?? [];
  const hasData     = routes.length > 0;
  const lastSynced  = data?.lastSynced ? new Date(data.lastSynced) : null;
  const totalStops  = data?.totalStops    ?? 0;
  const totalPkgs   = data?.totalPackages ?? 0;
  const dateLabel   = routes[0]?.sortDate
    ? new Date(routes[0].sortDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Wayne Board · Admin
        </p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Auto DRO
            </h1>
            {lastSynced && (
              <p className="text-[12px] text-slate-400 mt-1">
                Last synced {lastSynced.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at{" "}
                {lastSynced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold
              bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* ── Sync result banner ── */}
      {syncResult && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium mb-6 border ${
          syncResult.ok
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {syncResult.ok
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          {syncResult.msg}
        </div>
      )}

      <div className="flex flex-col gap-6">

        {/* ── Map + Stats row ── */}
        <div className="flex gap-6">

          {/* Map */}
          <div className={`${CARD} flex-1 p-0 overflow-hidden`} style={{ minHeight: 480 }}>
            <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-slate-100">
              <Map className="w-4 h-4 text-slate-400" />
              <h2 className="text-[14px] font-extrabold text-slate-900">Route Map</h2>
              {dateLabel && (
                <span className="ml-1 text-[11px] text-slate-400">{dateLabel}</span>
              )}
              {anchorAreas.length > 0 && (
                <span className="ml-auto text-[11px] text-slate-400">
                  {anchorAreas.length} anchor areas
                </span>
              )}
            </div>
            <div style={{ height: 432 }}>
              {!hasData && !loading ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <Map className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-[14px] font-semibold text-slate-400">No data yet</p>
                  <p className="text-[12px] text-slate-300 mt-1">
                    Set your DRO credentials below and click Sync Now
                  </p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                </div>
              ) : (
                <DroMap
                  anchorAreas={anchorAreas}
                  stopCoords={stopCoords}
                  routes={routes}
                />
              )}
            </div>
          </div>

          {/* Stats sidebar */}
          {hasData && (
            <div className="flex flex-col gap-4 w-[180px] shrink-0">
              {[
                { label: "ROUTES",   val: routes.length },
                { label: "STOPS",    val: totalStops.toLocaleString() },
                { label: "PACKAGES", val: totalPkgs.toLocaleString() },
              ].map(({ label, val }) => (
                <div key={label} className={`${CARD} p-5 text-center`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                  <p className="text-[32px] font-extrabold text-slate-900 leading-none">{val}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Route cards ── */}
        {hasData && (
          <div className={CARD}>
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h2 className="text-[14px] font-extrabold text-slate-900">Routes</h2>
              <span className="text-[11px] text-slate-400 ml-1">{dateLabel}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {routes.map((r, i) => {
                const color = routeColor(r.workAreaNumber, i);
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-100 p-4 hover:shadow-sm transition-shadow"
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <p className="text-[12px] font-bold text-slate-800 leading-tight truncate">
                      {r.workAreaName || "—"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 mb-3">
                      {r.workAreaNumber}
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {[
                        { label: "Stops", val: r.stops },
                        { label: "Pkgs",  val: r.packages },
                        { label: "Est",   val: fmtHours(r.timeHours) },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-slate-50 rounded-lg py-1.5">
                          <p className="text-[13px] font-extrabold text-slate-800 leading-none">{val}</p>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-300 text-right mt-2 font-mono">
                      {r.distance.toFixed(1)} mi
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bottom row: Credentials + Schedule ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Credentials */}
          <div className={CARD}>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-slate-400" />
              <h2 className="text-[15px] font-extrabold text-slate-900">DRO Credentials</h2>
            </div>
            <p className="text-[12px] text-slate-400 mb-5">
              Used to log into dro.routesmart.com. Stored securely in your database.
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. 6367044"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="DRO password"
                    className={INPUT + " pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={saveCreds}
                disabled={credsSaving}
                className="mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold
                  bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {credsSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : credsSaved
                  ? <><CheckCircle className="w-4 h-4 text-emerald-400" /> Saved</>
                  : "Save Credentials"
                }
              </button>
            </div>
          </div>

          {/* Auto-sync schedule */}
          <div className={CARD}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <h2 className="text-[15px] font-extrabold text-slate-900">Auto-Sync Schedule</h2>
            </div>
            <p className="text-[12px] text-slate-400 mb-5">
              Automatically pulls routes once per night. Planning window is 8 PM – midnight.
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Auto-Sync</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Run sync automatically each night</p>
                </div>
                <button
                  onClick={() => setAutoEnabled(v => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                    transition-colors duration-200 focus:outline-none
                    ${autoEnabled ? "bg-slate-900" : "bg-slate-200"}`}
                  role="switch"
                  aria-checked={autoEnabled}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
                    transform transition duration-200 ${autoEnabled ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-slate-600 font-medium">Run at</span>
                <input
                  type="time"
                  value={autoTime}
                  onChange={e => setAutoTime(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800
                    outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                />
              </div>
              <button
                onClick={saveSchedule}
                disabled={schedSaving}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold
                  bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {schedSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : schedSaved
                  ? <><CheckCircle className="w-4 h-4 text-emerald-400" /> Saved</>
                  : "Save Schedule"
                }
              </button>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
