"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, Star, AlertCircle, KeyRound, Eye, EyeOff, X } from "lucide-react";

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
  syncStatus: "idle" | "launching" | "logging_in" | "detecting_mfa" | "choosing_mfa" | "waiting_for_otp" | "otp_failed" | "pulling_data";
  mfaOptions: string[];
  otpError: string | null;
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
  const [syncStatus,  setSyncStatus]  = useState<"idle" | "launching" | "logging_in" | "detecting_mfa" | "choosing_mfa" | "waiting_for_otp" | "otp_failed" | "pulling_data">("idle");
  const [mfaOptions,  setMfaOptions]  = useState<string[]>([]);
  const [otpError,    setOtpError]    = useState<string | null>(null);
  const [otpInput,    setOtpInput]    = useState("");
  const [otpSaving,   setOtpSaving]   = useState(false);
  const [mfaChosen,   setMfaChosen]   = useState<string | null>(null);
  const [showOtpPanel, setShowOtpPanel] = useState(false);
  const triggeredAt = useRef<number>(0);

  const [credUsername,  setCredUsername]  = useState("");
  const [credPassword,  setCredPassword]  = useState("");
  const [credCsaId,     setCredCsaId]     = useState("");
  const [showPassword,  setShowPassword]  = useState(false);
  const [credSaving,    setCredSaving]    = useState(false);
  const [credSaved,     setCredSaved]     = useState(false);
  const [credConfigured, setCredConfigured] = useState(false);

  const [lookbackWeeks, setLookbackWeeks] = useState("0");
  const [lookbackSaving, setLookbackSaving] = useState(false);
  const [lookbackSaved,  setLookbackSaved]  = useState(false);

  // Latest week for display
  const latestWeek = data?.scores[0]?.week ?? null;

  async function loadStatus() {
    const res = await fetch("/api/auto-spotlight/status");
    if (res.ok) {
      const d: Status = await res.json();
      setData(d);
      setAutoEnabled(d.autoEnabled);
      setAutoTime(d.autoTime);
      setSyncStatus(d.syncStatus ?? "idle");
      setMfaOptions(d.mfaOptions ?? []);
      setOtpError(d.otpError ?? null);
      if (d.syncStatus === "waiting_for_otp" || d.syncStatus === "otp_failed") setShowOtpPanel(true);
      if (triggeredAt.current) {
        // Sync finished with a result
        if (d.lastSyncResult?.completedAt) {
          const resultTime = new Date(d.lastSyncResult.completedAt).getTime();
          if (resultTime > triggeredAt.current) {
            setPollUntil(null);
            setSyncing(false);
            setMfaChosen(null);
            if (d.lastSyncResult.success) {
              setSyncResult({
                ok: true,
                msg: `Sync complete · ${d.lastSyncResult.drivers} driver scores, ${d.lastSyncResult.reviews} reviews across ${d.lastSyncResult.weeks} weeks`,
              });
            } else {
              setSyncResult({ ok: false, msg: d.lastSyncResult.error ?? "Sync failed" });
            }
          }
        }
        // Status returned to idle without a result (crash / timeout / bad creds)
        if ((d.syncStatus ?? "idle") === "idle" && syncing) {
          setPollUntil(null);
          setSyncing(false);
          setMfaChosen(null);
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
    fetch("/api/settings?key=spotlight_username").then(r => r.json()).then(d => {
      if (d.value) { setCredUsername(d.value); setCredConfigured(true); }
    });
    fetch("/api/settings?key=spotlight_csa_id").then(r => r.json()).then(d => {
      if (d.value) setCredCsaId(d.value);
    });
    fetch("/api/settings?key=spotlight_lookback_weeks").then(r => r.json()).then(d => {
      if (d.value) setLookbackWeeks(d.value);
    });
  }, []);

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
    }, 5000);
    return () => clearInterval(interval);
  }, [pollUntil]);

  async function submitMfaChoice(method: "EMAIL" | "PHONE") {
    setMfaChosen(method);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "spotlight_mfa_method", value: method }),
    });
    setSyncResult({ ok: true, msg: `Sending code to your ${method === "EMAIL" ? "email" : "phone"}…` });
  }

  async function submitOtp() {
    if (!otpInput.trim()) return;
    setOtpSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "spotlight_otp", value: otpInput.trim() }),
    });
    setOtpInput("");
    setOtpSaving(false);
    setShowOtpPanel(false);
    setSyncResult({ ok: true, msg: "Code submitted · finishing sync…" });
  }

  async function cancelSync() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "spotlight_sync_status", value: "idle" }),
    });
    setPollUntil(null);
    setSyncing(false);
    setSyncStatus("idle");
    setMfaChosen(null);
    setShowOtpPanel(false);
    setSyncResult(null);
  }

  async function handleSync() {
    setShowOtpPanel(false);
    setMfaChosen(null);
    setSyncing(true);
    setSyncResult(null);
    triggeredAt.current = Date.now();
    try {
      const res = await fetch("/.netlify/functions/spotlight-sync-background", { method: "POST" });
      if (res.status === 202 || res.ok) {
        setPollUntil(Date.now() + 10 * 60 * 1000);
        setSyncResult({ ok: true, msg: "Logging in to FedEx Spotlight… you'll be asked how to receive your verification code." });
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

  async function saveCreds() {
    setCredSaving(true);
    await Promise.all([
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "spotlight_username", value: credUsername.trim() }) }),
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "spotlight_csa_id", value: credCsaId.trim() }) }),
      credPassword
        ? fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "spotlight_password", value: credPassword }) })
        : Promise.resolve(),
    ]);
    setCredSaving(false);
    setCredSaved(true);
    setCredConfigured(true);
    if (credPassword) setCredPassword("");
    setTimeout(() => setCredSaved(false), 3000);
  }

  async function saveLookback() {
    setLookbackSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "spotlight_lookback_weeks", value: lookbackWeeks }),
    });
    setLookbackSaving(false);
    setLookbackSaved(true);
    setTimeout(() => setLookbackSaved(false), 3000);
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
                : "FedEx Spotlight · RYDE customer ratings"
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {syncing && (
              <button
                onClick={cancelSync}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold
                  bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            )}
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

      {syncResult && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium mb-4 border ${
          syncResult.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {syncResult.ok ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{syncResult.msg}</span>
        </div>
      )}

      {/* Sync progress bar · shown during active sync stages */}
      {syncStatus !== "idle" && syncStatus !== "choosing_mfa" && syncStatus !== "waiting_for_otp" && syncStatus !== "otp_failed" && (() => {
        const STAGES: { key: string; label: string; pct: number }[] = [
          { key: "launching",     label: "Starting browser",          pct: 15 },
          { key: "logging_in",    label: "Logging in to FedEx",       pct: 35 },
          { key: "detecting_mfa", label: "Detecting verification options", pct: 55 },
          { key: "pulling_data",  label: "Pulling Ryde data",         pct: 80 },
        ];
        const stage = STAGES.find(s => s.key === syncStatus) ?? STAGES[0];
        return (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                <p className="text-[13px] font-semibold text-slate-700">{stage.label}</p>
              </div>
              <span className="text-[12px] font-bold text-slate-400">{stage.pct}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${stage.pct}%` }}
              />
            </div>
            <div className="flex gap-4 mt-3">
              {STAGES.map((s, i) => {
                const currentIdx = STAGES.findIndex(x => x.key === syncStatus);
                const isDone = i < currentIdx;
                const isActive = i === currentIdx;
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${isDone ? "bg-indigo-400" : isActive ? "bg-indigo-600" : "bg-slate-300"}`} />
                    <span className={`text-[10px] font-medium ${isActive ? "text-indigo-700" : isDone ? "text-slate-400" : "text-slate-300"}`}>
                      {s.label.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* MFA method choice · shown when multiple delivery options exist */}
      {syncStatus === "choosing_mfa" && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
            <p className="text-[14px] font-bold text-indigo-900">Where should FedEx send your verification code?</p>
          </div>
          <p className="text-[12px] text-indigo-700 mb-4">
            Choose how you want to receive the code. Check that source once it arrives, then enter it here.
          </p>
          <div className="flex gap-3">
            {(mfaOptions.length > 0 ? mfaOptions : ["EMAIL", "PHONE"]).map((method) => {
              const chosen = mfaChosen === method;
              return (
                <button
                  key={method}
                  onClick={() => submitMfaChoice(method as "EMAIL" | "PHONE")}
                  disabled={!!mfaChosen}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold border transition-all ${
                    chosen
                      ? "bg-indigo-700 text-white border-indigo-700 scale-95"
                      : mfaChosen
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                      : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {chosen && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {method === "EMAIL" ? "Send to Email" : "Send to Phone"}
                  {chosen && <span className="text-indigo-300 text-[11px]">Sending…</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* OTP entry · waiting for code */}
      {showOtpPanel && (
        <div className={`mb-6 rounded-2xl p-5 border ${syncStatus === "otp_failed" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {syncStatus === "otp_failed"
              ? <XCircle className="w-4 h-4 text-red-500" />
              : <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            <p className={`text-[14px] font-bold ${syncStatus === "otp_failed" ? "text-red-900" : "text-blue-900"}`}>
              {syncStatus === "otp_failed" ? "Incorrect code — try again" : "Enter your verification code"}
            </p>
          </div>
          {syncStatus === "otp_failed" && otpError && (
            <p className="text-[11px] text-red-600 mb-2">{otpError}</p>
          )}
          <p className={`text-[12px] mb-4 ${syncStatus === "otp_failed" ? "text-red-700" : "text-blue-700"}`}>
            {syncStatus === "otp_failed"
              ? "The code you entered wasn't accepted. Enter the correct code and press Enter."
              : "FedEx sent a one-time code. Find it in your email or phone, enter it below, and press Enter."}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={otpInput}
              onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && submitOtp()}
              placeholder="123456"
              className={`flex-1 px-4 py-2.5 rounded-xl border bg-white text-[16px] font-bold text-slate-900 tracking-widest outline-none transition
                ${syncStatus === "otp_failed"
                  ? "border-red-200 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                  : "border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"}`}
              autoFocus
            />
            <button
              onClick={submitOtp}
              disabled={otpSaving || !otpInput.trim()}
              className={`px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50 transition-colors
                ${syncStatus === "otp_failed" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {otpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">

        {/* Summary tiles */}
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "WEEK",          val: latestWeek ?? "-" },
              { label: "DRIVERS",       val: latestScores.length.toString() },
              { label: "AVG RYDE SCORE",val: avgScore ? avgScore.toFixed(2) + " ★" : "-" },
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
                  Enter your credentials above, then click Sync Now. You&apos;ll be asked whether to receive the verification code by email or phone, then prompted to enter it here.
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
                        {r.deliveries > 0 ? `${Math.round((r.positiveReviews / r.deliveries) * 100)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Credentials */}
        <div className={`${CARD} max-w-md`}>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-4 h-4 text-slate-400" />
            <h2 className="text-[15px] font-extrabold text-slate-900">Spotlight Credentials</h2>
            {credConfigured && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" /> Configured
              </span>
            )}
          </div>
          <p className="text-[12px] text-slate-400 mb-5">
            Your FedEx MyBiz / Spotlight login. Each organization sets their own. Password is stored securely and never displayed.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Username / FedEx ID</label>
              <input
                type="text"
                value={credUsername}
                onChange={e => setCredUsername(e.target.value)}
                placeholder="e.g. 6367044"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                CSA ID <span className="text-slate-400 font-normal">(Contract Service Area — find it in Spotlight)</span>
              </label>
              <input
                type="text"
                value={credCsaId}
                onChange={e => setCredCsaId(e.target.value)}
                placeholder="e.g. 304169"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Password {credConfigured && <span className="text-slate-400 font-normal">(leave blank to keep existing)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={credPassword}
                  onChange={e => setCredPassword(e.target.value)}
                  placeholder={credConfigured ? "••••••••" : "Enter password"}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={saveCreds}
              disabled={credSaving || !credUsername.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {credSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : credSaved ? <><CheckCircle className="w-4 h-4 text-emerald-400" /> Saved</>
                : "Save Credentials"}
            </button>
          </div>
        </div>

        {/* Data Lookback */}
        <div className={`${CARD} max-w-md`}>
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-slate-400" />
            <h2 className="text-[15px] font-extrabold text-slate-900">Data Range</h2>
          </div>
          <p className="text-[12px] text-slate-400 mb-5">
            How far back to pull RYDE data on each sync. &quot;All available&quot; fetches everything FedEx has stored — use a shorter range for weekly syncs to keep it fast.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-2">Lookback period</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "All available", value: "0" },
                  { label: "52 weeks",      value: "52" },
                  { label: "26 weeks",      value: "26" },
                  { label: "12 weeks",      value: "12" },
                  { label: "8 weeks",       value: "8" },
                  { label: "4 weeks",       value: "4" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLookbackWeeks(opt.value)}
                    className={`py-2 rounded-lg text-[12px] font-semibold border transition-colors ${
                      lookbackWeeks === opt.value
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={saveLookback}
              disabled={lookbackSaving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {lookbackSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : lookbackSaved ? <><CheckCircle className="w-4 h-4 text-emerald-400" /> Saved</>
                : "Save"}
            </button>
          </div>
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
