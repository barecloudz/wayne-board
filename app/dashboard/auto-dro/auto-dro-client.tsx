"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, CheckCircle, XCircle, Eye, EyeOff,
  Clock, KeyRound, Map, BarChart3, Loader2,
  ChevronDown, ChevronUp, AlertTriangle, Layers,
  Package, TrendingUp, Calendar, GitBranch, Truck, MapPin,
} from "lucide-react";

// Leaflet must be loaded client-side only
const DroMap = dynamic(() => import("./dro-map"), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-full bg-slate-50 rounded-xl">
    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
  </div>
) });

// Tab components — all client-side API calls, no SSR needed
const DroScheduleTab  = dynamic(() => import("./dro-schedule-tab"),  { ssr: false, loading: () => <TabLoader /> });
const DroPlansTab     = dynamic(() => import("./dro-plans-tab"),     { ssr: false, loading: () => <TabLoader /> });
const DroVehiclesTab  = dynamic(() => import("./dro-vehicles-tab"),  { ssr: false, loading: () => <TabLoader /> });
const DroAnchorsTab   = dynamic(() => import("./dro-anchors-tab"),   { ssr: false, loading: () => <TabLoader /> });
const DroFleetTab     = dynamic(() => import("./dro-fleet-tab"),     { ssr: false, loading: () => <TabLoader /> });

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );
}

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
  lpStops: number;
  lpPackages: number;
  smStops: number;
  smPackages: number;
  bulkStops: number;
  bulkPackages: number;
  regStops: number;
  regPackages: number;
  exceededTargetDuration: boolean;
  timeCriticalStops: number;
};

type RoutePlan = {
  id: number;
  planId: number;
  name: string;
  totalRoutes: number;
  lpRoutes: number;
  bulkRoutes: number;
  regRoutes: number;
  smallRoutes: number;
  isActive: boolean;
  lastUsedDate: string;
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

type UnroutableStop = {
  stopId: string;
  firmName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  packages: number;
  isSmallStop: boolean;
  isHazardous: boolean;
  isHeavyweight: boolean;
  isCdoStop: boolean;
  reasonCode: string;
  pickupType: string;
  windowOpen: string;
  windowClose: string;
  overflowedRoute: string;
  lat: number | null;
  lng: number | null;
};

type Status = {
  routes:            DroRoute[];
  anchorAreas:       AnchorArea[];
  stopCoords:        StopCoord[];
  totalStops:        number;
  totalPackages:     number;
  lastSynced:        string;
  autoEnabled:       boolean;
  autoTime:          string;
  routePlans:        RoutePlan[];
  planningWindowOpen: boolean;
  stopOverridesCount: number;
  unroutableCount:   number;
  lastSyncResult:    { success: boolean; error?: string; routes?: number; stops?: number; sortDate?: string; completedAt?: string } | null;
};

// ── Tab config ─────────────────────────────────────────────────────────────────

type TabId = "overview" | "schedule" | "plans" | "vehicles" | "anchors" | "fleet";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview",  label: "Overview",     icon: <BarChart3 className="w-4 h-4" /> },
  { id: "schedule",  label: "Schedule",     icon: <Calendar className="w-4 h-4" /> },
  { id: "plans",     label: "Route Plans",  icon: <GitBranch className="w-4 h-4" /> },
  { id: "vehicles",  label: "Vehicles",     icon: <Truck className="w-4 h-4" /> },
  { id: "anchors",   label: "Anchor Areas", icon: <MapPin className="w-4 h-4" /> },
  { id: "fleet",     label: "Fleet",        icon: <Package className="w-4 h-4" /> },
];

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

// Stacked proportion bar for LP/SM/Bulk/Reg
function PackageTypeBar({ route }: { route: DroRoute }) {
  const total = route.lpPackages + route.smPackages + route.bulkPackages + route.regPackages;
  if (total === 0) return null;
  const segments = [
    { key: "LP",   val: route.lpPackages,   color: "#6366f1" },
    { key: "SM",   val: route.smPackages,   color: "#f59e0b" },
    { key: "Bulk", val: route.bulkPackages, color: "#10b981" },
    { key: "Reg",  val: route.regPackages,  color: "#94a3b8" },
  ].filter(s => s.val > 0);

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {segments.map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.val / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {segments.map(s => (
          <span key={s.key} className="flex items-center gap-1 text-[9px] text-slate-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            {s.key} {s.val}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function AutoDroClient() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [data,          setData]          = useState<Status | null>(null);
  const [loading,       setLoading]       = useState(true);

  // Credentials
  const [username,      setUsername]      = useState("");
  const [password,      setPassword]      = useState("");
  const [showPw,        setShowPw]        = useState(false);
  const [credsSaving,   setCredsSaving]   = useState(false);
  const [credsSaved,    setCredsSaved]    = useState(false);

  // Connect (Puppeteer login / session warm-up)
  const [connecting,    setConnecting]    = useState(false);
  const [connectResult, setConnectResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Sync
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState<{ ok: boolean; msg: string } | null>(null);
  const [pollUntil,     setPollUntil]     = useState<number | null>(null);
  const triggeredAt = useRef<number>(0);

  // Diagnose
  const [diagnosing,    setDiagnosing]    = useState(false);
  const [diagResult,    setDiagResult]    = useState<{ allOk: boolean; checks: { label: string; ok: boolean; detail: string }[] } | null>(null);

  // Schedule
  const [autoEnabled,   setAutoEnabled]   = useState(false);
  const [autoTime,      setAutoTime]      = useState("23:55");
  const [schedSaving,   setSchedSaving]   = useState(false);
  const [schedSaved,    setSchedSaved]    = useState(false);

  // Unroutable panel
  const [unroutableOpen,  setUnroutableOpen]  = useState(false);
  const [unroutableStops, setUnroutableStops] = useState<UnroutableStop[]>([]);
  const [unroutableLoading, setUnroutableLoading] = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/auto-dro/status");
    if (res.ok) {
      const d: Status = await res.json();
      setData(d);
      setAutoEnabled(d.autoEnabled);
      setAutoTime(d.autoTime);
      if (triggeredAt.current && d.lastSyncResult?.completedAt) {
        const resultTime = new Date(d.lastSyncResult.completedAt).getTime();
        if (resultTime > triggeredAt.current) {
          setPollUntil(null);
          setSyncing(false);
          if (d.lastSyncResult.success) {
            setSyncResult({ ok: true, msg: `Sync complete — ${d.lastSyncResult.routes} routes · ${d.lastSyncResult.stops} stops for ${d.lastSyncResult.sortDate}` });
          } else {
            setSyncResult({ ok: false, msg: d.lastSyncResult.error ?? "Sync failed" });
          }
        }
      }
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

  useEffect(() => {
    if (!pollUntil) return;
    const interval = setInterval(async () => {
      if (Date.now() > pollUntil) {
        clearInterval(interval);
        setPollUntil(null);
        setSyncing(false);
        setSyncResult({ ok: false, msg: "Sync timed out — check Netlify function logs." });
        return;
      }
      await loadStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [pollUntil]);

  async function toggleUnroutable() {
    if (!unroutableOpen && unroutableStops.length === 0) {
      setUnroutableLoading(true);
      const res = await fetch("/api/auto-dro/unroutable");
      if (res.ok) {
        const d = await res.json();
        setUnroutableStops(d.stops ?? []);
      }
      setUnroutableLoading(false);
    }
    setUnroutableOpen(v => !v);
  }

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

  async function handleConnect() {
    setConnecting(true);
    setConnectResult(null);
    try {
      const res = await fetch("/.netlify/functions/dro-login-background", { method: "POST" });
      if (res.status === 202 || res.ok) {
        setConnectResult({ ok: true, msg: "Login started — takes 2-3 minutes. Once complete, click Sync." });
      } else {
        setConnectResult({ ok: false, msg: `Unexpected response (${res.status})` });
      }
    } catch (e: any) {
      setConnectResult({ ok: false, msg: e?.message ?? "Connection failed" });
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    triggeredAt.current = Date.now();
    try {
      const res = await fetch("/.netlify/functions/dro-sync-background", { method: "POST" });
      if (res.status === 202 || res.ok) {
        setPollUntil(Date.now() + 8 * 60 * 1000); // poll for up to 8 min
        setSyncResult({ ok: true, msg: "Syncing… logging in fresh and pulling DRO data. Checking every 10 seconds." });
      } else {
        setSyncResult({ ok: false, msg: `Unexpected response (${res.status})` });
        setSyncing(false);
      }
    } catch (e: any) {
      setSyncResult({ ok: false, msg: e?.message ?? "Sync failed" });
      setSyncing(false);
    }
  }

  async function handleDiagnose() {
    setDiagnosing(true);
    setDiagResult(null);
    try {
      const res = await fetch("/api/auto-dro/diagnose");
      const json = await res.json();
      setDiagResult(json);
    } catch (e: any) {
      setDiagResult({ allOk: false, checks: [{ label: "Request failed", ok: false, detail: e?.message ?? String(e) }] });
    } finally {
      setDiagnosing(false);
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

  const routes             = data?.routes      ?? [];
  const anchorAreas        = data?.anchorAreas ?? [];
  const stopCoords         = data?.stopCoords  ?? [];
  const routePlans         = data?.routePlans  ?? [];
  const hasData            = routes.length > 0;
  const lastSynced         = data?.lastSynced ? new Date(data.lastSynced) : null;
  const totalStops         = data?.totalStops    ?? 0;
  const totalPkgs          = data?.totalPackages ?? 0;
  const unroutableCount    = data?.unroutableCount   ?? 0;
  const stopOverridesCount = data?.stopOverridesCount ?? 0;
  const planningWindowOpen = data?.planningWindowOpen ?? false;
  const dateLabel          = routes[0]?.sortDate
    ? new Date(routes[0].sortDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          MyGroundOps · Admin
        </p>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
                Auto DRO
              </h1>
              {!loading && data && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  planningWindowOpen
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${planningWindowOpen ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {planningWindowOpen ? "Window Open" : "Window Closed"}
                </span>
              )}
            </div>
            {lastSynced && (
              <p className="text-[12px] text-slate-400 mt-1">
                Last synced {lastSynced.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at{" "}
                {lastSynced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiagnose}
              disabled={diagnosing || syncing || connecting}
              title="Run a step-by-step check to see exactly what's failing"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold
                bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${diagnosing ? "animate-spin" : ""}`} />
              {diagnosing ? "Diagnosing…" : "Diagnose"}
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting || syncing || loading}
              title="Run once per day to establish a DRO login session. Required before syncing."
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold
                bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              <KeyRound className={`w-4 h-4 ${connecting ? "animate-pulse" : ""}`} />
              {connecting ? "Connecting…" : "Connect to DRO"}
            </button>
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
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3.5 text-[13px] font-bold whitespace-nowrap
              border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600 bg-blue-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Connect result banner ── */}
      {connectResult && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium mb-3 border ${
          connectResult.ok
            ? "bg-violet-50 text-violet-700 border-violet-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {connectResult.ok
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          {connectResult.msg}
          <button onClick={() => setConnectResult(null)} className="ml-auto text-current opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Diagnose results ── */}
      {diagResult && (
        <div className="mb-4 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className={`px-4 py-2.5 flex items-center justify-between ${diagResult.allOk ? "bg-emerald-50 border-b border-emerald-100" : "bg-red-50 border-b border-red-100"}`}>
            <p className={`text-[13px] font-bold ${diagResult.allOk ? "text-emerald-700" : "text-red-700"}`}>
              {diagResult.allOk ? "✓ All systems go" : "✗ Issues found — see below"}
            </p>
            <button onClick={() => setDiagResult(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
          </div>
          <div className="divide-y divide-slate-50">
            {diagResult.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span className={`mt-0.5 text-[13px] shrink-0 ${c.ok ? "text-emerald-500" : "text-red-500"}`}>{c.ok ? "✓" : "✗"}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800">{c.label}</p>
                  <p className={`text-[11px] mt-0.5 break-words ${c.ok ? "text-slate-400" : "text-red-600 font-medium"}`}>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sync result banner ── */}
      {syncResult && activeTab === "overview" && (
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
          {!syncResult.ok && syncResult.msg.includes("Connect to DRO") && (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="ml-auto flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              <KeyRound className="w-3 h-3" />
              {connecting ? "Connecting…" : "Connect Now"}
            </button>
          )}
        </div>
      )}

      {/* ── Tab content ── */}

      {activeTab === "schedule" && <DroScheduleTab />}
      {activeTab === "plans"    && <DroPlansTab />}
      {activeTab === "vehicles" && <DroVehiclesTab />}
      {activeTab === "anchors"  && <DroAnchorsTab />}
      {activeTab === "fleet"    && <DroFleetTab />}

      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">

          {/* ── Stats strip ── */}
          {hasData && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "ROUTES",     val: routes.length,                  color: "" },
                { label: "STOPS",      val: totalStops.toLocaleString(),     color: "" },
                { label: "PACKAGES",   val: totalPkgs.toLocaleString(),      color: "" },
                { label: "UNROUTABLE", val: unroutableCount.toLocaleString(), color: "amber" },
                { label: "OVERRIDES",  val: stopOverridesCount.toLocaleString(), color: "" },
              ].map(({ label, val, color }) => (
                <div key={label} className={`${CARD} p-4 text-center`}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
                    color === "amber" ? "text-amber-500" : "text-slate-400"
                  }`}>{label}</p>
                  <p className={`text-[22px] font-extrabold leading-none ${
                    color === "amber" && unroutableCount > 0 ? "text-amber-600" : "text-slate-900"
                  }`}>{val}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Route Plan Switcher ── */}
          {routePlans.length > 0 && (
            <div className={CARD}>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-slate-400" />
                <h2 className="text-[14px] font-extrabold text-slate-900">Route Plans</h2>
                <span className="text-[11px] text-slate-400 ml-1">{routePlans.length} plans</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
                {routePlans.map(plan => (
                  <div
                    key={plan.id}
                    className={`rounded-xl border p-3 transition-all ${
                      plan.isActive
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <p className={`text-[11px] font-bold leading-tight ${plan.isActive ? "text-white" : "text-slate-800"}`}>
                        {plan.name || `Plan ${plan.planId}`}
                      </p>
                      {plan.isActive && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className={`text-[13px] font-extrabold leading-none mb-2 ${plan.isActive ? "text-white" : "text-slate-900"}`}>
                      {plan.totalRoutes} routes
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {plan.lpRoutes > 0 && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                          plan.isActive ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-600"
                        }`}>LP {plan.lpRoutes}</span>
                      )}
                      {plan.bulkRoutes > 0 && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                          plan.isActive ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"
                        }`}>Bulk {plan.bulkRoutes}</span>
                      )}
                      {plan.smallRoutes > 0 && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                          plan.isActive ? "bg-white/20 text-white" : "bg-amber-50 text-amber-700"
                        }`}>SM {plan.smallRoutes}</span>
                      )}
                      {plan.regRoutes > 0 && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                          plan.isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                        }`}>Reg {plan.regRoutes}</span>
                      )}
                    </div>
                    {plan.lastUsedDate && (
                      <p className={`text-[9px] mt-2 ${plan.isActive ? "text-white/60" : "text-slate-400"}`}>
                        {plan.lastUsedDate}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Map ── */}
          <div className={`${CARD} p-0 overflow-hidden`}>
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
            <div className="h-[320px] md:h-[480px]">
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
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <p className="text-[12px] font-bold text-slate-800 leading-tight truncate">
                          {r.workAreaName || "—"}
                        </p>
                        {r.exceededTargetDuration && (
                          <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                            <TrendingUp className="w-2.5 h-2.5" />
                            Over
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mb-3">
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
                      <PackageTypeBar route={r} />
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-slate-300 font-mono">
                          {r.distance.toFixed(1)} mi
                        </p>
                        {r.timeCriticalStops > 0 && (
                          <span className="text-[9px] text-red-500 font-semibold">
                            ⏱ {r.timeCriticalStops} critical
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Unroutable Stops Panel ── */}
          {hasData && unroutableCount > 0 && (
            <div className={CARD}>
              <button
                onClick={toggleUnroutable}
                className="w-full flex items-center gap-2 text-left"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-[14px] font-extrabold text-slate-900">Unroutable Stops</h2>
                <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                  {unroutableCount}
                </span>
                <span className="ml-auto text-slate-400">
                  {unroutableOpen
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />
                  }
                </span>
              </button>

              {unroutableOpen && (
                <div className="mt-5">
                  {unroutableLoading ? (
                    <div className="flex items-center gap-2 text-[13px] text-slate-400 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading stops…
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2 pr-3">Address</th>
                            <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2 pr-3">Postal</th>
                            <th className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2 pr-3">Pkgs</th>
                            <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2 pr-3">Reason</th>
                            <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2">Flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unroutableStops.map(s => (
                            <tr key={s.stopId} className="border-b border-slate-50 hover:bg-slate-50/50">
                              <td className="py-2 pr-3">
                                <p className="font-medium text-slate-700">{s.firmName || s.address}</p>
                                {s.firmName && <p className="text-[11px] text-slate-400">{s.address}</p>}
                                <p className="text-[11px] text-slate-400">{s.city}{s.city && s.state ? ", " : ""}{s.state}</p>
                              </td>
                              <td className="py-2 pr-3 font-mono text-slate-600">{s.postalCode}</td>
                              <td className="py-2 pr-3 text-center font-bold text-slate-800">{s.packages}</td>
                              <td className="py-2 pr-3">
                                {s.reasonCode ? (
                                  <span className="font-mono text-[11px] text-slate-500">{s.reasonCode}</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                                {s.overflowedRoute && (
                                  <p className="text-[11px] text-slate-400">from {s.overflowedRoute}</p>
                                )}
                              </td>
                              <td className="py-2">
                                <div className="flex flex-wrap gap-1">
                                  {s.isHazardous && (
                                    <span className="text-[9px] font-bold bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-200">HAZ</span>
                                  )}
                                  {s.isHeavyweight && (
                                    <span className="text-[9px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-200">HVY</span>
                                  )}
                                  {s.isSmallStop && (
                                    <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-200">SM</span>
                                  )}
                                  {s.isCdoStop && (
                                    <span className="text-[9px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200">CDO</span>
                                  )}
                                  {s.windowOpen && (
                                    <span className="text-[9px] text-slate-400">{s.windowOpen}–{s.windowClose}</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
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
      )}
    </main>
  );
}
