"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, Star, AlertCircle } from "lucide-react";

type ScoreRow = {
  id: number;
  driverId: string;
  driverName: string;
  score: number;
  week: string;
  deliveries: number;
  positiveReviews: number;
};

type Status = {
  scores: ScoreRow[];
  lastSynced: string;
  lastSyncResult: { success: boolean; error?: string; drivers?: number; weeks?: number; reviews?: number; completedAt?: string } | null;
  autoEnabled: boolean;
  autoTime: string;
};

function starBg(score: number | null) {
  if (!score) return "bg-slate-50 text-slate-400";
  if (score >= 4.5) return "bg-emerald-50 text-emerald-700";
  if (score >= 4.0) return "bg-green-50 text-green-700";
  if (score >= 3.5) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-600";
}

const CARD = "bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6";

export default function AutoSpotlightClient() {
  const [data,        setData]        = useState<Status | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTime,    setAutoTime]    = useState("09:00");
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedSaved,  setSchedSaved]  = useState(false);
  const [pollUntil,   setPollUntil]   = useState<number | null>(null);
  const triggeredAt = useRef<number>(0);

  // Latest week for display
  const latestWeek = data?.scores[0]?.week ?? null;

  async function loadStatus() {
    const res = await fetch("/api/auto-spotlight/status");
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
            setSyncResult({
              ok: true,
              msg: `Sync complete — ${d.lastSyncResult.drivers} driver scores, ${d.lastSyncResult.reviews} reviews across ${d.lastSyncResult.weeks} weeks`,
            });
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
        setSyncResult({ ok: false, msg: "Sync timed out — check Netlify function logs." });
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
      const res = await fetch("/.netlify/functions/spotlight-sync-background", { method: "POST" });
      if (res.status === 202 || res.ok) {
        setPollUntil(Date.now() + 10 * 60 * 1000); // poll for up to 10 min (OTP wait)
        setSyncResult({ ok: true, msg: "Syncing… OTP sent to your FedEx email. Checking every 10s." });
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
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "spotlight_auto_sync_enabled", value: String(autoEnabled) }) }),
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "spotlight_auto_sync_time", value: autoTime }) }),
    ]);
    setSchedSaving(false);
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 3000);
  }

  const lastSynced    = data?.lastSynced ? new Date(data.lastSynced) : null;
  const latestScores  = data?.scores.filter(s => s.week === latestWeek) ?? [];
  const hasData       = latestScores.length > 0;
  const avgScore      = hasData
    ? latestScores.reduce((s, r) => s + r.score, 0) / latestScores.length
    : null;

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">

      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          MyGroundOps · Admin
        </p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Auto Spotlight</h1>
            <p className="text-[12px] text-slate-400 mt-1">
              {lastSynced
                ? `Last synced ${lastSynced.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${lastSynced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : "FedEx Spotlight — RYDE customer ratings"
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
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium mb-6 border ${
          syncResult.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {syncResult.ok ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <div>
            {syncResult.msg}
            {syncing && (
              <p className="text-[11px] mt-1 opacity-75">
                OTP email goes to your FedEx-registered address. If not caught automatically, forward it to spotlight@742logistics.com
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">

        {/* Summary tiles */}
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "WEEK",          val: latestWeek ?? "—" },
              { label: "DRIVERS",       val: latestScores.length.toString() },
              { label: "AVG RYDE SCORE",val: avgScore ? avgScore.toFixed(2) + " ★" : "—" },
            ].map(({ label, val }) => (
              <div key={label} className={`${CARD} p-5 text-center`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                <p className="text-[28px] font-extrabold text-slate-900 leading-none">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* RYDE Score Leaderboard */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-5">
            <Star className="w-4 h-4 text-slate-400" />
            <h2 className="text-[14px] font-extrabold text-slate-900">RYDE Scores</h2>
            {latestWeek && <span className="text-[11px] text-slate-400 ml-1">{latestWeek}</span>}
            <span className="ml-auto text-[11px] text-slate-400">FedEx Spotlight data</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-[14px] font-semibold text-slate-400">No data yet</p>
              <p className="text-[12px] text-slate-300 mt-1">Click Sync Now to pull RYDE scores from FedEx Spotlight.</p>
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left max-w-md">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700">
                  An OTP will be emailed to your FedEx-registered address. If it doesn&apos;t arrive automatically,
                  forward it to <strong>spotlight@742logistics.com</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["#", "Driver", "Avg Stars", "Ratings", "Positive"].map(h => (
                      <th key={h} className="pb-3 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latestScores.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4">
                        <span className="text-[12px] font-bold text-slate-400">{i + 1}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-[13px] font-semibold text-slate-800">{r.driverName}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] font-bold ${starBg(r.score)}`}>
                          {r.score.toFixed(2)} ★
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[13px] text-slate-600">{r.deliveries}</td>
                      <td className="py-3 text-[13px] text-slate-600">
                        {r.deliveries > 0 ? `${Math.round((r.positiveReviews / r.deliveries) * 100)}%` : "—"}
                      </td>
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
            Pulls RYDE scores from FedEx Spotlight each morning. Requires OTP delivery to your FedEx email.
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
