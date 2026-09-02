"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

const INTERVAL_OPTIONS = [
  { label: "Daily (6 AM)", value: "daily" },
  { label: "Every 2 days", value: "every2days" },
  { label: "Weekly", value: "weekly" },
];

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function GcSyncSettings({ initialInterval }: { initialInterval?: string }) {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [interval, setInterval_] = useState(initialInterval || "daily");
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings?key=gc_last_synced_at")
      .then((r) => r.json())
      .then((d) => setLastSynced(d.value ?? null))
      .catch(() => {});
  }, []);

  async function handleIntervalChange(val: string) {
    setInterval_(val);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "gc_sync_interval", value: val }),
    });
  }

  async function handleSyncNow() {
    setSyncing(true);
    setToast(null);
    try {
      const res = await fetch("/api/auto-gc/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ type: "success", msg: `Synced ${data.matched ?? 0} drivers for ${data.date ?? "yesterday"}` });
        setLastSynced(new Date().toISOString());
      } else {
        setToast({ type: "error", msg: data.error ?? "Sync failed" });
      }
    } catch (e: any) {
      setToast({ type: "error", msg: e?.message ?? "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-4 h-4 text-slate-500" />
        <h2 className="text-[15px] font-bold text-slate-900">GroundCloud Sync</h2>
      </div>

      <div className="flex flex-col gap-4">
        {/* Last synced */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Last Synced</p>
          <p className="text-[13px] text-slate-700">{relativeTime(lastSynced)}</p>
        </div>

        {/* Sync interval */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 block">
            Sync Interval
          </label>
          <select
            value={interval}
            onChange={(e) => handleIntervalChange(e.target.value)}
            className="text-[13px] border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Sync now button + toast */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors w-fit"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? "Syncing…" : "Sync Now"}
          </button>

          {toast && (
            <p className={`text-[12px] font-medium ${toast.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
              {toast.msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
