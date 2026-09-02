"use client";

import { useState, useEffect, useRef } from "react";
import AppShell from "@/components/app-shell";
import {
  TrendingUp, TrendingDown, Minus, Star, Trophy,
  ChevronUp, ChevronDown, Loader2, RefreshCw, ChevronDown as ChevronDownIcon,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type SphDriverData = {
  driverId: string;
  name: string;
  data: { date: string; sph: number; routeName: string }[];
};

type SphHistory = {
  dates: string[];
  drivers: SphDriverData[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
  "#06b6d4","#a855f7",
];

const DAY_OPTIONS = [7, 14, 30];

// ── Helper components ─────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: string | null; delta?: number | null }) {
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

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── SPH Chart ─────────────────────────────────────────────────────────────────

function SphChart() {
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState<SphHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string> | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function fetchHistory(d: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/drivers/sph-history?days=${d}`);
      const data: SphHistory = await res.json();
      setHistory(data);
      // Default: all drivers selected
      if (selectedDriverIds === null && data.drivers.length > 0) {
        setSelectedDriverIds(new Set(data.drivers.map((d) => d.driverId)));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchHistory(days); }, [days]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleDriver(id: string) {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!history) return;
    const all = history.drivers.map((d) => d.driverId);
    setSelectedDriverIds((prev) => {
      if (prev && prev.size === all.length) return new Set();
      return new Set(all);
    });
  }

  // Build chart data: array of { date, [driverId]: sph, ... }
  const visibleDriverIds = selectedDriverIds ?? new Set<string>();
  const visibleDrivers = history?.drivers.filter((d) => visibleDriverIds.has(d.driverId)) ?? [];

  const chartData = (history?.dates ?? []).map((date) => {
    const entry: Record<string, any> = { date };
    for (const driver of visibleDrivers) {
      const point = driver.data.find((p) => p.date === date);
      if (point) entry[driver.driverId] = point.sph;
    }
    return entry;
  });

  const hasData = chartData.some((row) => {
    const { date, ...rest } = row;
    return Object.values(rest).some((v) => v != null);
  });

  const allSelected = history && selectedDriverIds && selectedDriverIds.size === history.drivers.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">SPH Over Time</h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Day range buttons */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors
                  ${days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Driver filter dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Drivers ({visibleDriverIds.size}/{history?.drivers.length ?? 0})
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px] py-1.5 max-h-64 overflow-y-auto">
                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-[12px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!allSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                  All drivers
                </label>
                <div className="border-t border-slate-100 my-1" />
                {(history?.drivers ?? []).map((driver, i) => (
                  <label
                    key={driver.driverId}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-[12px] text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={visibleDriverIds.has(driver.driverId)}
                      onChange={() => toggleDriver(driver.driverId)}
                      className="rounded"
                    />
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    {driver.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchHistory(days)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="space-y-2 w-full">
            <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
            <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6" />
            <div className="h-3 bg-slate-100 rounded animate-pulse w-4/6" />
            <div className="h-48 bg-slate-50 rounded-xl animate-pulse w-full mt-4" />
          </div>
        </div>
      ) : !hasData ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-[13px]">
          No SPH data for the selected period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              label={{ value: "Stops/hr", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11, fill: "#94a3b8" } }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value: any, name: any) => {
                const driver = visibleDrivers.find((d) => d.driverId === name);
                return [Number(value).toFixed(1), driver?.name ?? name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => {
                const driver = visibleDrivers.find((d) => d.driverId === value);
                return driver?.name ?? value;
              }}
            />
            {visibleDrivers.map((driver, i) => (
              <Line
                key={driver.driverId}
                type="monotone"
                dataKey={driver.driverId}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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

        {/* ── SPH History Chart ── */}
        <SphChart />

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
