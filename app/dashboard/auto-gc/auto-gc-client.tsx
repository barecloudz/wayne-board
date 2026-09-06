"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, CheckCircle, XCircle, Eye, EyeOff,
  Clock, KeyRound, Activity, Loader2, TrendingUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type RouteDay = {
  id: number;
  gcRouteDayId: number;
  driverId: string | null;
  driverName: string;
  routeName: string;
  date: string;
  stopsPerHour: number | null;
  milesTotal: number | null;
  milesTraveled: number | null;
  driveTime: number | null;
  status: string;
  syncedAt: string;
};

type Status = {
  rows: RouteDay[];
  lastSynced: string;
  autoEnabled: boolean;
  autoTime: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDriveTime(secs: number | null) {
  if (!secs) return "-";
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function sphColor(sph: number | null) {
  if (!sph) return "text-slate-400";
  if (sph >= 12) return "text-emerald-600 font-bold";
  if (sph >= 10) return "text-green-600 font-semibold";
  if (sph >= 8)  return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function sphBg(sph: number | null) {
  if (!sph) return "bg-slate-50 text-slate-400";
  if (sph >= 12) return "bg-emerald-50 text-emerald-700";
  if (sph >= 10) return "bg-green-50 text-green-700";
  if (sph >= 8)  return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-600";
}

function statusBadge(s: string) {
  switch (s?.toUpperCase()) {
    case "COMPLETE": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "STARTED":  return "bg-blue-50 text-blue-700 border-blue-200";
    case "PENDING":  return "bg-slate-50 text-slate-500 border-slate-200";
    default:         return "bg-slate-50 text-slate-400 border-slate-200";
  }
}

const CARD  = "bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6";
const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

// ── Component ──────────────────────────────────────────────────────────────────
export default function AutoGcClient() {
  const [data,        setData]        = useState<Status | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [wbDrivers,   setWbDrivers]   = useState<{ driver_id: string; name: string }[]>([]);
  const [matching,    setMatching]    = useState<Record<string, boolean>>({});
  const [matchSelect, setMatchSelect] = useState<Record<string, string>>({});

  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [credsSaving, setCredsSaving] = useState(false);
  const [credsSaved,  setCredsSaved]  = useState(false);

  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  const [backfillDate,     setBackfillDate]     = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [backfilling,      setBackfilling]      = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ current: number; total: number; date: string } | null>(null);
  const [backfillDone,     setBackfillDone]     = useState<{ totalRoutes: number; totalMatched: number; errors: number; days: number } | null>(null);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedSaved,  setSchedSaved]  = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/auto-gc/status");
    if (res.ok) {
      const d: Status = await res.json();
      setData(d);
      setAutoEnabled(d.autoEnabled);
    }
    setLoading(false);
  }

  async function loadCreds() {
    const res = await fetch("/api/auto-gc/credentials");
    if (res.ok) {
      const d = await res.json();
      setUsername(d.username ?? "");
    }
  }

  useEffect(() => {
    loadStatus();
    loadCreds();
    fetch("/api/drivers/active").then(r => r.ok ? r.json() : []).then(d => {
      if (Array.isArray(d)) setWbDrivers(d);
    }).catch(() => {});
  }, []);

  async function saveCreds() {
    setCredsSaving(true);
    await fetch("/api/auto-gc/credentials", {
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
    const res = await fetch("/api/auto-gc/sync", { method: "POST" });
    const r   = await res.json();
    setSyncing(false);
    if (r.success) {
      setSyncResult({ ok: true, msg: `${r.routeDays} routes pulled for ${r.date} · ${r.matched} matched to MyGroundOps drivers` });
      await loadStatus();
    } else {
      setSyncResult({ ok: false, msg: r.error ?? "Sync failed" });
    }
  }

  async function handleMatch(gcName: string) {
    const driverId = matchSelect[gcName];
    if (!driverId) return;
    setMatching(prev => ({ ...prev, [gcName]: true }));
    await fetch("/api/auto-gc/map-driver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gcName, driverId }),
    });
    setMatching(prev => ({ ...prev, [gcName]: false }));
    await loadStatus();
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillProgress(null);
    setBackfillDone(null);

    // Build date list client-side · skip Sundays
    const dates: string[] = [];
    const cursor = new Date(backfillDate + "T12:00:00Z");
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(23, 59, 59, 0);
    while (cursor <= yesterday) {
      if (cursor.getUTCDay() !== 0) dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    let totalRoutes = 0;
    let totalMatched = 0;
    let errors = 0;

    // Call sync once per day · each request is short, no server timeout issues
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      setBackfillProgress({ current: i + 1, total: dates.length, date });
      try {
        const res = await fetch("/api/auto-gc/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });
        const r = await res.json();
        if (r.success) {
          totalRoutes  += r.routeDays ?? 0;
          totalMatched += r.matched   ?? 0;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    setBackfillProgress(null);
    setBackfillDone({ totalRoutes, totalMatched, errors, days: dates.length });
    setBackfilling(false);
    await loadStatus();
  }

  async function saveSchedule() {
    setSchedSaving(true);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "gc_auto_sync_enabled", value: String(autoEnabled) }) });
    setSchedSaving(false);
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 3000);
  }

  const [showUnmatched, setShowUnmatched] = useState(false);

  const rows       = data?.rows ?? [];
  const hasData    = rows.length > 0;
  const lastSynced = data?.lastSynced ? new Date(data.lastSynced) : null;

  // Group rows by date, show most recent date's data prominently
  const latestDate     = rows[0]?.date ?? null;
  const latestRows     = rows.filter(r => r.date === latestDate);
  const matchedRows    = latestRows.filter(r => r.driverId);
  const unmatchedRows  = latestRows.filter(r => !r.driverId);
  const visibleRows    = showUnmatched ? unmatchedRows : matchedRows;
  const dateLabel      = latestDate
    ? new Date(latestDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;

  // Summary stats for latest date (matched only)
  const avgSph = matchedRows.length
    ? matchedRows.reduce((s, r) => s + (r.stopsPerHour ?? 0), 0) / matchedRows.filter(r => r.stopsPerHour).length
    : null;
  const totalMiles = matchedRows.reduce((s, r) => s + (r.milesTotal ?? 0), 0);
  const matched    = matchedRows.length;

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          MyGroundOps · Admin
        </p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Auto GC
            </h1>
            <p className="text-[12px] text-slate-400 mt-1">
              {lastSynced
                ? `Last synced ${lastSynced.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${lastSynced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : "GroundCloud performance data"
              }
            </p>
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

        {/* ── Summary stat tiles ── */}
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "ROUTES",        val: latestRows.length.toString() },
              { label: "AVG STOPS/HR",  val: avgSph ? avgSph.toFixed(1) : "-" },
              { label: "TOTAL MILES",   val: totalMiles > 0 ? totalMiles.toFixed(0) : "-" },
              { label: "WB MATCHED",    val: `${matched}/${latestRows.length}` },
            ].map(({ label, val }) => (
              <div key={label} className={`${CARD} p-5 text-center`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                <p className="text-[28px] font-extrabold text-slate-900 leading-none">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Performance table ── */}
        <div className={CARD}>
          <div className="flex items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <h2 className="text-[14px] font-extrabold text-slate-900">Driver Performance</h2>
              {dateLabel && <span className="text-[11px] text-slate-400 ml-1">{dateLabel}</span>}
            </div>
            {unmatchedRows.length > 0 && (
              <button
                onClick={() => setShowUnmatched(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                  showUnmatched
                    ? "bg-amber-50 text-amber-700 border-amber-300"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {showUnmatched ? "← Back to Matched" : `Unmatched (${unmatchedRows.length})`}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-[14px] font-semibold text-slate-400">No data yet</p>
              <p className="text-[12px] text-slate-300 mt-1">
                Set your GroundCloud credentials below and click Sync Now
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Driver", "Route", "Stops/hr", "Miles", "Drive Time", showUnmatched ? "Match to Driver" : "Status"].map(h => (
                      <th key={h} className="pb-3 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {r.driverId ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          )}
                          <span className="text-[13px] font-semibold text-slate-800">{r.driverName || "-"}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-[12px] font-mono text-slate-500">{r.routeName || "-"}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {r.stopsPerHour ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] font-bold ${sphBg(r.stopsPerHour)}`}>
                            {r.stopsPerHour.toFixed(1)}
                          </span>
                        ) : <span className="text-[12px] text-slate-300">-</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-[13px] text-slate-600">{r.milesTotal ? r.milesTotal.toFixed(1) : "-"}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-[13px] text-slate-600">{fmtDriveTime(r.driveTime)}</span>
                      </td>
                      <td className="py-3">
                        {showUnmatched && !r.driverId ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={matchSelect[r.driverName] ?? ""}
                              onChange={e => setMatchSelect(prev => ({ ...prev, [r.driverName]: e.target.value }))}
                              className="text-[12px] border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-slate-400 bg-white"
                            >
                              <option value="">Select driver…</option>
                              {wbDrivers.map(d => (
                                <option key={d.driver_id} value={d.driver_id}>{d.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleMatch(r.driverName)}
                              disabled={!matchSelect[r.driverName] || matching[r.driverName]}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors whitespace-nowrap flex items-center gap-1"
                            >
                              {matching[r.driverName] ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              Match
                            </button>
                          </div>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${statusBadge(r.status)}`}>
                            {r.status || "-"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Bottom row: Credentials + Schedule ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Credentials */}
          <div className={CARD}>
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-slate-400" />
              <h2 className="text-[15px] font-extrabold text-slate-900">GroundCloud Credentials</h2>
            </div>
            <p className="text-[12px] text-slate-400 mb-5">
              Used to log into groundcloud.io. Stored securely in your database.
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
                  placeholder="e.g. Blake742Logistics"
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
                    placeholder="GroundCloud password"
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
              Automatically pulls yesterday&apos;s SPH data each morning. No login required · runs server-side.
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Auto-Sync</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Enabled runs every day at 2:00 AM Eastern</p>
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
              <div className="px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[12px] text-slate-500">
                Runs daily at <span className="font-semibold text-slate-700">6:00 AM UTC (2:00 AM Eastern)</span> · skips Sundays automatically.
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
                  : "Save"
                }
              </button>
            </div>
          </div>

        </div>

        {/* ── Backfill ── */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-slate-400" />
            <h2 className="text-[15px] font-extrabold text-slate-900">Backfill Historical Data</h2>
          </div>
          <p className="text-[12px] text-slate-400 mb-5">
            Pull stops-per-hour history from a past date up to yesterday. Safe to re-run · duplicates are overwritten.
          </p>

          <div className="flex items-end gap-3 mb-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={backfillDate}
                onChange={e => setBackfillDate(e.target.value)}
                disabled={backfilling}
                className={INPUT}
              />
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold
                bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {backfilling
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
                : <><RefreshCw className="w-4 h-4" /> Start Backfill</>
              }
            </button>
          </div>

          {/* Live progress */}
          {backfillProgress && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-500">
                  Pulling <span className="font-semibold text-slate-700">{backfillProgress.date}</span>
                </span>
                <span className="text-slate-400">{backfillProgress.current} / {backfillProgress.total}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-900 rounded-full transition-all duration-300"
                  style={{ width: `${(backfillProgress.current / backfillProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Done summary */}
          {backfillDone && (
            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-[13px]">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-800">Backfill complete</p>
                <p className="text-emerald-700 mt-0.5">
                  {backfillDone.days} days pulled · {backfillDone.totalRoutes} routes · {backfillDone.totalMatched} matched to drivers
                  {backfillDone.errors > 0 && <span className="text-amber-600"> · {backfillDone.errors} days had errors</span>}
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
