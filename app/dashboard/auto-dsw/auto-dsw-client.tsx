"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, Award } from "lucide-react";

type DswRow = {
  id: number;
  date: string;
  driverId: string | null;
  driverNameRaw: string;
  waName: string;
  waNumber: string;
  ilsPct: number | null;
  actDelStps: number | null;
  actDelPkgs: number | null;
  nonDelvdStps: number | null;
  allStatusCodePkgs: number | null;
  miles: number | null;
  onRoadHours: string | null;
  onDutyHours: string | null;
  vscanPkgs: number | null;
  delStpsPlanned: number | null;
};

type Status = {
  rows: DswRow[];
  lastSynced: string;
  autoEnabled: boolean;
  autoTime: string;
  lastSyncResult: { success: boolean; error?: string; rows?: number; date?: string; completedAt?: string } | null;
};

function ilsBg(pct: number | null) {
  if (!pct) return "bg-slate-50 text-slate-400";
  if (pct >= 99) return "bg-emerald-50 text-emerald-700";
  if (pct >= 97) return "bg-green-50 text-green-700";
  if (pct >= 95) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-600";
}

function formatDriverName(raw: string) {
  if (!raw) return "-";
  const [last, ...rest] = raw.split(",");
  const first = rest.join(" ").trim();
  if (!first) return raw;
  const cap = (s: string) => s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return `${cap(first)} ${cap(last)}`;
}

const CARD  = "bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6";

export default function AutoDswClient() {
  const [data,        setData]        = useState<Status | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTime,    setAutoTime]    = useState("07:00");
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedSaved,  setSchedSaved]  = useState(false);
  const [pollUntil,   setPollUntil]   = useState<number | null>(null);
  const triggeredAt = useRef<number>(0);

  async function loadStatus() {
    const res = await fetch("/api/auto-dsw/status");
    if (res.ok) {
      const d: Status = await res.json();
      setData(d);
      setAutoEnabled(d.autoEnabled);
      setAutoTime(d.autoTime);
      // If we're polling and a result arrived after we triggered, stop polling and show it
      if (triggeredAt.current && d.lastSyncResult?.completedAt) {
        const resultTime = new Date(d.lastSyncResult.completedAt).getTime();
        if (resultTime > triggeredAt.current) {
          setPollUntil(null);
          setSyncing(false);
          if (d.lastSyncResult.success) {
            setSyncResult({ ok: true, msg: `Sync complete · ${d.lastSyncResult.rows} rows for ${d.lastSyncResult.date}` });
          } else {
            setSyncResult({ ok: false, msg: d.lastSyncResult.error ?? "Sync failed" });
          }
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    if (!pollUntil) return;
    const interval = setInterval(async () => {
      if (Date.now() > pollUntil) {
        clearInterval(interval);
        setPollUntil(null);
        setSyncing(false);
        setSyncResult({ ok: false, msg: "Sync timed out · check Netlify function logs." });
        return;
      }
      await loadStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [pollUntil]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    triggeredAt.current = Date.now();
    try {
      const res = await fetch("/.netlify/functions/dsw-sync-background", { method: "POST" });
      if (res.status === 202 || res.ok) {
        setPollUntil(Date.now() + 6 * 60 * 1000); // poll for up to 6 min
        setSyncResult({ ok: true, msg: "Syncing… checking for result every 10 seconds." });
      } else {
        const body = await res.json().catch(() => ({}));
        setSyncResult({ ok: false, msg: body?.error ?? `Unexpected response (${res.status})` });
        setSyncing(false);
      }
    } catch (err: any) {
      setSyncResult({ ok: false, msg: err?.message ?? "Network error" });
      setSyncing(false);
    }
  }

  async function saveSchedule() {
    setSchedSaving(true);
    await Promise.all([
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "dsw_auto_sync_enabled", value: String(autoEnabled) }) }),
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "dsw_auto_sync_time", value: autoTime }) }),
    ]);
    setSchedSaving(false);
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 3000);
  }

  const rows       = data?.rows ?? [];
  const hasData    = rows.length > 0;
  const lastSynced = data?.lastSynced ? new Date(data.lastSynced) : null;
  const latestDate = rows[0]?.date ?? null;
  const latestRows = rows.filter(r => r.date === latestDate).filter(r => r.driverNameRaw);
  const dateLabel  = latestDate
    ? new Date(latestDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;

  const withIls   = latestRows.filter(r => r.ilsPct != null);
  const avgIls    = withIls.length ? withIls.reduce((s, r) => s + (r.ilsPct ?? 0), 0) / withIls.length : null;
  const matched   = latestRows.filter(r => r.driverId).length;
  const totalStps = latestRows.reduce((s, r) => s + (r.actDelStps ?? 0), 0);

  // Sort by ILS% descending for leaderboard
  const sorted = [...latestRows].sort((a, b) => (b.ilsPct ?? 0) - (a.ilsPct ?? 0));

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">

      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          MyGroundOps · Admin
        </p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Auto DSW</h1>
            <p className="text-[12px] text-slate-400 mt-1">
              {lastSynced
                ? `Last synced ${lastSynced.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${lastSynced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : "FedEx Daily Service Worksheet · real delivery data"
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

      {syncResult && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium mb-6 border ${
          syncResult.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {syncResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {syncResult.msg}
        </div>
      )}

      <div className="flex flex-col gap-6">

        {/* Summary tiles */}
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "ROUTES",      val: latestRows.length.toString() },
              { label: "AVG ILS%",    val: avgIls ? avgIls.toFixed(1) + "%" : "-" },
              { label: "TOTAL STOPS", val: totalStps.toLocaleString() },
              { label: "WB MATCHED",  val: `${matched}/${latestRows.length}` },
            ].map(({ label, val }) => (
              <div key={label} className={`${CARD} p-5 text-center`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                <p className="text-[28px] font-extrabold text-slate-900 leading-none">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* ILS% Leaderboard table */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-5">
            <Award className="w-4 h-4 text-slate-400" />
            <h2 className="text-[14px] font-extrabold text-slate-900">ILS% Performance</h2>
            {dateLabel && <span className="text-[11px] text-slate-400 ml-1">{dateLabel}</span>}
            <span className="ml-auto text-[11px] text-slate-400">FedEx verified data</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Award className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-[14px] font-semibold text-slate-400">No data yet</p>
              <p className="text-[12px] text-slate-300 mt-1">Uses your DRO credentials. Click Sync Now to pull yesterday&apos;s DSW.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["#", "Driver", "Route", "ILS%", "Del Stps", "Del Pkgs", "Non Delvd", "Miles", "On Road"].map(h => (
                      <th key={h} className="pb-3 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4">
                        <span className="text-[12px] font-bold text-slate-400">{i + 1}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {r.driverId
                            ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Matched" />
                            : <span className="w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0" />
                          }
                          <span className="text-[13px] font-semibold text-slate-800">{formatDriverName(r.driverNameRaw)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-[12px] text-slate-500">{r.waName || "-"}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {r.ilsPct != null ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] font-bold ${ilsBg(r.ilsPct)}`}>
                            {r.ilsPct.toFixed(1)}%
                          </span>
                        ) : <span className="text-[12px] text-slate-300">-</span>}
                      </td>
                      <td className="py-3 pr-4 text-[13px] text-slate-600">{r.actDelStps ?? "-"}</td>
                      <td className="py-3 pr-4 text-[13px] text-slate-600">{r.actDelPkgs ?? "-"}</td>
                      <td className="py-3 pr-4 text-[13px] text-slate-600">{r.nonDelvdStps ?? "-"}</td>
                      <td className="py-3 pr-4 text-[13px] text-slate-600">{r.miles ?? "-"}</td>
                      <td className="py-3 text-[13px] text-slate-600">{r.onRoadHours || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className={`${CARD} max-w-md`}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-[15px] font-extrabold text-slate-900">Auto-Sync Schedule</h2>
          </div>
          <p className="text-[12px] text-slate-400 mb-5">
            Pulls yesterday&apos;s DSW each morning. Uses your DRO credentials · no separate login needed.
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Auto-Sync</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Run sync automatically each morning</p>
              </div>
              <button
                onClick={() => setAutoEnabled(v => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${autoEnabled ? "bg-slate-900" : "bg-slate-200"}`}
                role="switch" aria-checked={autoEnabled}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ${autoEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-slate-600 font-medium">Run at</span>
              <input
                type="time" value={autoTime} onChange={e => setAutoTime(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
            </div>
            <button
              onClick={saveSchedule} disabled={schedSaving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {schedSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : schedSaved ? <><CheckCircle className="w-4 h-4 text-emerald-400" /> Saved</>
                : "Save Schedule"}
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
