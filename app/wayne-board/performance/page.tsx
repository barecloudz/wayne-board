"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app-shell";
import {
  TrendingUp, TrendingDown, Minus, Star, Trophy,
  ChevronUp, ChevronDown, Loader2, RefreshCw,
} from "lucide-react";

type Driver = {
  rank:           number;
  driver_id:      string;
  name:           string;
  avg_sph_30d:    number | null;
  avg_sph_90d:    number | null;
  stddev_sph_30d: number | null;
  days_worked_30d: number | null;
  days_worked_90d: number | null;
  sph_trend:      string | null;
  trend_delta:    number | null;
  best_sph:       number | null;
  best_date:      string | null;
  worst_sph:      number | null;
  worst_date:     string | null;
  last_worked:    string | null;
  avg_miles_30d:  number | null;
  ryde_score:     number | null;
  ryde_week:      string | null;
};

type SortKey = "rank" | "avg_sph_30d" | "ryde_score" | "days_worked_30d" | "trend_delta";

function TrendIcon({ trend, delta }: { trend: string | null; delta: number | null }) {
  if (trend === "improving") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (trend === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-500 font-black text-sm">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 font-black text-sm">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm">🥉</span>;
  return <span className="text-[12px] font-bold text-slate-400 w-6 text-center">#{rank}</span>;
}

function SphBar({ value, max }: { value: number | null; max: number }) {
  if (!value) return <div className="h-1.5 rounded-full bg-slate-100 w-full" />;
  const pct = Math.min((value / max) * 100, 100);
  const color = value >= 18 ? "bg-emerald-500" : value >= 14 ? "bg-blue-500" : value >= 10 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="h-1.5 rounded-full bg-slate-100 w-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function PerformancePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey]   = useState<SortKey>("rank");
  const [sortAsc, setSortAsc]   = useState(false);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/drivers/leaderboard");
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...drivers].sort((a, b) => {
    const aVal = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    const bVal = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const maxSph = Math.max(...drivers.map(d => d.avg_sph_30d ?? 0), 1);
  const withData = drivers.filter(d => d.avg_sph_30d);

  function SortBtn({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors
          ${active ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
      >
        {label}
        {active ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
      </button>
    );
  }

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Driver Performance
            </h1>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {withData.length} drivers · 30-day rolling averages · updates nightly
            </p>
          </div>
          <button
            onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Top 3 cards ── */}
        {!loading && sorted.slice(0, 3).filter(d => d.avg_sph_30d).length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {sorted.slice(0, 3).filter(d => d.avg_sph_30d).map((d) => (
              <button
                key={d.driver_id}
                onClick={() => setSelected(d)}
                className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <RankBadge rank={d.rank} />
                  <TrendIcon trend={d.sph_trend} delta={d.trend_delta} />
                </div>
                <p className="text-[14px] font-bold text-slate-900">{d.name}</p>
                <p className="text-[28px] font-black text-slate-900 leading-none mt-1">
                  {d.avg_sph_30d?.toFixed(1)}
                  <span className="text-[12px] font-medium text-slate-400 ml-1">sph</span>
                </p>
                <div className="mt-3">
                  <SphBar value={d.avg_sph_30d} max={maxSph} />
                </div>
                {d.ryde_score && (
                  <div className="flex items-center gap-1 mt-2">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    <span className="text-[11px] font-semibold text-slate-600">{d.ryde_score.toFixed(2)} Ryde</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Full table ── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_120px_80px_80px_80px_60px] gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <SortBtn col="rank" label="#" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver</span>
            <SortBtn col="avg_sph_30d" label="SPH 30d" />
            <SortBtn col="ryde_score" label="Ryde" />
            <SortBtn col="days_worked_30d" label="Days" />
            <SortBtn col="trend_delta" label="Trend" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Best</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-[13px]">No driver data yet</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {sorted.map((d) => (
                <button
                  key={d.driver_id}
                  onClick={() => setSelected(selected?.driver_id === d.driver_id ? null : d)}
                  className={`w-full grid grid-cols-[40px_1fr_120px_80px_80px_80px_60px] gap-2 px-4 py-3 text-left transition-colors
                    ${selected?.driver_id === d.driver_id ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
                >
                  {/* Rank */}
                  <div className="flex items-center"><RankBadge rank={d.rank} /></div>

                  {/* Name */}
                  <div className="flex flex-col justify-center min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900 truncate">{d.name}</p>
                    {d.last_worked && (
                      <p className="text-[10px] text-slate-400">Last: {d.last_worked}</p>
                    )}
                  </div>

                  {/* SPH 30d */}
                  <div className="flex flex-col justify-center gap-1">
                    <span className="text-[13px] font-bold text-slate-900">
                      {d.avg_sph_30d ? d.avg_sph_30d.toFixed(1) : "—"}
                    </span>
                    <SphBar value={d.avg_sph_30d} max={maxSph} />
                  </div>

                  {/* Ryde */}
                  <div className="flex items-center">
                    {d.ryde_score ? (
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-[12px] font-semibold text-slate-700">{d.ryde_score.toFixed(2)}</span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-slate-300">—</span>
                    )}
                  </div>

                  {/* Days worked */}
                  <div className="flex items-center">
                    <span className="text-[12px] font-medium text-slate-600">
                      {d.days_worked_30d ?? "—"}
                    </span>
                  </div>

                  {/* Trend */}
                  <div className="flex items-center gap-1">
                    <TrendIcon trend={d.sph_trend} delta={d.trend_delta} />
                    {d.trend_delta != null && (
                      <span className={`text-[11px] font-semibold
                        ${d.trend_delta > 0 ? "text-emerald-600" : d.trend_delta < 0 ? "text-red-400" : "text-slate-400"}`}>
                        {d.trend_delta > 0 ? "+" : ""}{d.trend_delta.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Best SPH */}
                  <div className="flex items-center">
                    <span className="text-[12px] font-medium text-slate-500">
                      {d.best_sph ? d.best_sph.toFixed(1) : "—"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Driver detail panel ── */}
        {selected && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <RankBadge rank={selected.rank} />
                  <h2 className="text-[18px] font-black text-slate-900">{selected.name}</h2>
                  <TrendIcon trend={selected.sph_trend} delta={selected.trend_delta} />
                </div>
                {selected.sph_trend && (
                  <p className={`text-[11px] font-semibold mt-0.5
                    ${selected.sph_trend === "improving" ? "text-emerald-600" : selected.sph_trend === "declining" ? "text-red-400" : "text-slate-400"}`}>
                    {selected.sph_trend.charAt(0).toUpperCase() + selected.sph_trend.slice(1)}
                    {selected.trend_delta != null ? ` (${selected.trend_delta > 0 ? "+" : ""}${selected.trend_delta.toFixed(2)} vs prior 14d)` : ""}
                  </p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-[11px] text-slate-400 hover:text-slate-600">Close</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "SPH — 30 Day Avg",  value: selected.avg_sph_30d?.toFixed(2)    ?? "—", sub: "stops per hour" },
                { label: "SPH — 90 Day Avg",  value: selected.avg_sph_90d?.toFixed(2)    ?? "—", sub: "stops per hour" },
                { label: "Consistency",       value: selected.stddev_sph_30d?.toFixed(2)  ?? "—", sub: "std dev (lower = steadier)" },
                { label: "Days Worked",       value: `${selected.days_worked_30d ?? "—"} / 30d`, sub: `${selected.days_worked_90d ?? "—"} last 90 days` },
                { label: "Best Day",          value: selected.best_sph?.toFixed(2)        ?? "—", sub: selected.best_date ?? "" },
                { label: "Worst Day",         value: selected.worst_sph?.toFixed(2)       ?? "—", sub: selected.worst_date ?? "" },
                { label: "Avg Miles / Day",   value: selected.avg_miles_30d?.toFixed(1)   ?? "—", sub: "last 30 days" },
                { label: "Ryde Score",        value: selected.ryde_score?.toFixed(2)      ?? "—", sub: selected.ryde_week ? `week ${selected.ryde_week}` : "no data" },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="text-[22px] font-black text-slate-900 leading-tight mt-0.5">{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
