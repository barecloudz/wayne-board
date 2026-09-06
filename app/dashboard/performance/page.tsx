"use client";

import { useState, useEffect, useRef } from "react";
import AppShell from "@/components/app-shell";
import {
  TrendingUp, TrendingDown, Minus, Star, Trophy,
  ChevronUp, ChevronDown, Loader2, RefreshCw,
  ChevronDown as ChevronDownIcon, Info, AlertCircle,
  Zap, Users, BarChart2,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Driver = {
  rank:            number;
  driver_id:       string;
  name:            string;
  avg_sph_30d:     number | null;
  avg_sph_90d:     number | null;
  stddev_sph_30d:  number | null;
  days_worked_30d: number | null;
  days_worked_90d: number | null;
  sph_trend:       string | null;
  trend_delta:     number | null;
  best_sph:        number | null;
  best_date:       string | null;
  worst_sph:       number | null;
  worst_date:      string | null;
  last_worked:     string | null;
  avg_miles_30d:   number | null;
  ryde_score:      number | null;
  ryde_week:       string | null;
};

type SortKey = "rank" | "avg_sph_30d" | "avg_sph_90d" | "ryde_score" | "days_worked_30d" | "trend_delta";

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
  "#06b6d4","#a855f7","#f43f5e","#0ea5e9","#22d3ee","#fb923c",
];

const DAY_OPTIONS = [7, 14, 30, 90];

const SPH_TIERS = [
  { min: 18, label: "Elite", color: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500" },
  { min: 14, label: "Good",  color: "text-blue-600",    bg: "bg-blue-50",    bar: "bg-blue-500" },
  { min: 10, label: "OK",    color: "text-amber-600",   bg: "bg-amber-50",   bar: "bg-amber-400" },
  { min: 0,  label: "Low",   color: "text-red-500",     bg: "bg-red-50",     bar: "bg-red-400" },
];

function sphTier(sph: number | null) {
  if (!sph) return null;
  return SPH_TIERS.find((t) => sph >= t.min) ?? SPH_TIERS[SPH_TIERS.length - 1];
}

// ── Helper components ─────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info className="w-3 h-3 text-slate-300 cursor-help" />
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-slate-900 text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-xl pointer-events-none max-w-[220px] text-center whitespace-normal">
          {text}
        </span>
      )}
    </span>
  );
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (trend === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-300" />;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm leading-none">🥇</span>;
  if (rank === 2) return <span className="text-sm leading-none">🥈</span>;
  if (rank === 3) return <span className="text-sm leading-none">🥉</span>;
  return <span className="text-[12px] font-bold text-slate-400 w-5 text-center leading-none">#{rank}</span>;
}

function SphBar({ value, max }: { value: number | null; max: number }) {
  if (!value) return <div className="h-1 rounded-full bg-slate-100 w-full" />;
  const pct = Math.min((value / max) * 100, 100);
  const tier = sphTier(value);
  return (
    <div className="h-1 rounded-full bg-slate-100 w-full overflow-hidden">
      <div className={`h-full rounded-full ${tier?.bar ?? "bg-slate-400"} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SphBadge({ value }: { value: number | null }) {
  if (!value) return <span className="text-[11px] text-slate-300">—</span>;
  const tier = sphTier(value);
  return (
    <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md ${tier?.bg} ${tier?.color}`}>
      {tier?.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

function ChartTooltipContent({ active, payload, label, driverMap }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[160px]">
      <p className="text-[11px] font-bold text-slate-400 mb-2">{formatDate(String(label))}</p>
      {sorted.map((entry: any) => {
        const driver = driverMap?.get(entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-[12px] text-slate-700">{driver?.name ?? entry.dataKey}</span>
            </div>
            <span className="text-[12px] font-bold text-slate-900">{Number(entry.value).toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── SPH Chart ─────────────────────────────────────────────────────────────────

function SphChart({ allDrivers }: { allDrivers: Driver[] }) {
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
      if (selectedDriverIds === null && data.drivers.length > 0) {
        const top8ids = allDrivers
          .filter((d) => d.avg_sph_30d)
          .slice(0, 8)
          .map((d) => d.driver_id);
        const matched = data.drivers.filter((d) => top8ids.includes(d.driverId)).map((d) => d.driverId);
        setSelectedDriverIds(new Set(matched.length > 0 ? matched : data.drivers.slice(0, 8).map((d) => d.driverId)));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchHistory(days); }, [days]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleDriverIds = selectedDriverIds ?? new Set<string>();
  const allDriverCount = history?.drivers.length ?? 0;

  const sortedHistoryDrivers = history
    ? [...history.drivers].sort((a, b) => {
        const ra = allDrivers.find((d) => d.driver_id === a.driverId)?.rank ?? 999;
        const rb = allDrivers.find((d) => d.driver_id === b.driverId)?.rank ?? 999;
        return ra - rb;
      })
    : [];

  const visibleDrivers = sortedHistoryDrivers.filter((d) => visibleDriverIds.has(d.driverId));
  const driverMap = new Map(visibleDrivers.map((d) => [d.driverId, d]));

  const chartData = (history?.dates ?? []).map((date) => {
    const entry: Record<string, any> = { date };
    for (const driver of visibleDrivers) {
      const point = driver.data.find((p) => p.date === date);
      if (point) entry[driver.driverId] = parseFloat(point.sph.toFixed(2));
    }
    return entry;
  });

  const hasData = chartData.some((row) => {
    const { date, ...rest } = row;
    return Object.values(rest).some((v) => v != null);
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Stops Per Hour — Trend</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">How many packages each driver delivers per hour of active route time</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Drivers ({visibleDriverIds.size}/{allDriverCount})
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[200px] py-1.5 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Drivers</span>
                  <button
                    onClick={() => {
                      if (!history) return;
                      const all = history.drivers.map((d) => d.driverId);
                      setSelectedDriverIds((prev) => prev && prev.size === all.length ? new Set() : new Set(all));
                    }}
                    className="text-[11px] text-indigo-500 font-semibold hover:text-indigo-700"
                  >
                    {selectedDriverIds?.size === allDriverCount ? "None" : "All"}
                  </button>
                </div>
                {sortedHistoryDrivers.map((driver) => {
                  const rank = allDrivers.find((d) => d.driver_id === driver.driverId)?.rank;
                  const colorIdx = sortedHistoryDrivers.indexOf(driver);
                  return (
                    <label key={driver.driverId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleDriverIds.has(driver.driverId)}
                        onChange={() => {
                          setSelectedDriverIds((prev) => {
                            const next = new Set(prev ?? []);
                            if (next.has(driver.driverId)) next.delete(driver.driverId);
                            else next.add(driver.driverId);
                            return next;
                          });
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[colorIdx % COLORS.length] }} />
                      <span className="text-[12px] text-slate-700 flex-1 truncate">{driver.name}</span>
                      {rank && <span className="text-[10px] text-slate-400">#{rank}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => fetchHistory(days)}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[280px]">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center h-[280px] gap-3">
          <BarChart2 className="w-8 h-8 text-slate-200" />
          <p className="text-[13px] font-medium text-slate-400">No SPH data for this period</p>
          <Link href="/dashboard/auto-gc" className="text-[12px] text-indigo-500 hover:underline">
            Run a sync or backfill from Auto GC →
          </Link>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
              />
              <ReferenceLine y={18} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Elite 18", fontSize: 9, fill: "#10b981", position: "insideTopRight" }} />
              <ReferenceLine y={14} stroke="#3b82f6" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Good 14", fontSize: 9, fill: "#3b82f6", position: "insideTopRight" }} />
              <Tooltip content={<ChartTooltipContent driverMap={driverMap} />} />
              {visibleDrivers.map((driver) => {
                const colorIdx = sortedHistoryDrivers.indexOf(driver);
                return (
                  <Line
                    key={driver.driverId}
                    type="monotone"
                    dataKey={driver.driverId}
                    stroke={COLORS[colorIdx % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>

          {visibleDrivers.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-slate-50">
              {visibleDrivers.map((driver) => {
                const colorIdx = sortedHistoryDrivers.indexOf(driver);
                const info = allDrivers.find((d) => d.driver_id === driver.driverId);
                return (
                  <div key={driver.driverId} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[colorIdx % COLORS.length] }} />
                    <span className="text-[11px] text-slate-600">{driver.name}</span>
                    {info?.avg_sph_30d && <span className="text-[10px] text-slate-400">{info.avg_sph_30d.toFixed(1)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Driver detail panel ───────────────────────────────────────────────────────

function DriverDetail({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const tier = sphTier(driver.avg_sph_30d);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[15px] ${tier?.bg ?? "bg-slate-100"} ${tier?.color ?? "text-slate-400"}`}>
            {driver.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <RankBadge rank={driver.rank} />
              <h2 className="text-[16px] font-black text-slate-900">{driver.name}</h2>
              <TrendIcon trend={driver.sph_trend} />
            </div>
            {driver.sph_trend && (
              <p className={`text-[11px] font-semibold
                ${driver.sph_trend === "improving" ? "text-emerald-600" : driver.sph_trend === "declining" ? "text-red-400" : "text-slate-400"}`}>
                {driver.sph_trend === "improving" ? "Improving" : driver.sph_trend === "declining" ? "Declining" : "Stable"}
                {driver.trend_delta != null ? ` · ${driver.trend_delta > 0 ? "+" : ""}${driver.trend_delta.toFixed(1)} SPH vs prior 14d` : ""}
              </p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors">
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "SPH — 30 Day",
            tip: "Average stops delivered per hour over the last 30 working days",
            value: driver.avg_sph_30d?.toFixed(1) ?? "—",
            sub: <SphBadge value={driver.avg_sph_30d} />,
          },
          {
            label: "SPH — 90 Day",
            tip: "Average stops delivered per hour over the last 90 working days — longer-term baseline",
            value: driver.avg_sph_90d?.toFixed(1) ?? "—",
            sub: <span className="text-[10px] text-slate-400">longer-term avg</span>,
          },
          {
            label: "Consistency",
            tip: "Standard deviation of daily SPH. Lower = more predictable. Above 4 = high variability.",
            value: driver.stddev_sph_30d?.toFixed(2) ?? "—",
            sub: <span className="text-[10px] text-slate-400">{driver.stddev_sph_30d ? (driver.stddev_sph_30d < 2 ? "Very consistent" : driver.stddev_sph_30d < 4 ? "Moderate" : "Variable") : "no data"}</span>,
          },
          {
            label: "Days Worked",
            tip: "Number of days with a GroundCloud route record in the time period",
            value: String(driver.days_worked_30d ?? "—"),
            sub: <span className="text-[10px] text-slate-400">{driver.days_worked_90d ?? "—"} last 90 days</span>,
          },
          {
            label: "Best Day",
            tip: "Single highest SPH recorded",
            value: driver.best_sph?.toFixed(1) ?? "—",
            sub: <span className="text-[10px] text-slate-400">{driver.best_date ? formatDate(driver.best_date) : "—"}</span>,
          },
          {
            label: "Worst Day",
            tip: "Single lowest SPH recorded",
            value: driver.worst_sph?.toFixed(1) ?? "—",
            sub: <span className="text-[10px] text-slate-400">{driver.worst_date ? formatDate(driver.worst_date) : "—"}</span>,
          },
          {
            label: "Avg Miles / Day",
            tip: "Average route distance driven per working day, last 30 days",
            value: driver.avg_miles_30d?.toFixed(0) ?? "—",
            sub: <span className="text-[10px] text-slate-400">miles, last 30 days</span>,
          },
          {
            label: "Ryde Score",
            tip: "FedEx safety & service score from the Ryde platform. Scored weekly — higher is better.",
            value: driver.ryde_score?.toFixed(2) ?? "—",
            sub: <span className="text-[10px] text-slate-400">{driver.ryde_week ? `week of ${driver.ryde_week}` : "no data"}</span>,
          },
        ].map(({ label, tip, value, sub }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <InfoTip text={tip} />
            </div>
            <p className="text-[22px] font-black text-slate-900 leading-tight">{value}</p>
            <div className="mt-0.5">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoData, setShowNoData] = useState(false);

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
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const withData    = drivers.filter((d) => d.avg_sph_30d != null);
  const withoutData = drivers.filter((d) => d.avg_sph_30d == null);

  const teamAvgSph = withData.length
    ? withData.reduce((sum, d) => sum + (d.avg_sph_30d ?? 0), 0) / withData.length
    : null;

  const sorted = [...drivers].sort((a, b) => {
    const aVal = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    const bVal = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const sortedWithData    = sorted.filter((d) => d.avg_sph_30d != null);
  const sortedWithoutData = sorted.filter((d) => d.avg_sph_30d == null);
  const maxSph = Math.max(...withData.map((d) => d.avg_sph_30d ?? 0), 1);

  function SortBtn({ col, label, tip }: { col: SortKey; label: string; tip?: string }) {
    const active = sortKey === col;
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleSort(col)}
          className={`flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors
            ${active ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
        >
          {label}
          {active ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
        </button>
        {tip && <InfoTip text={tip} />}
      </div>
    );
  }

  const top3 = sortedWithData.slice(0, 3);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Driver Performance
            </h1>
            <p className="text-[12px] text-slate-400 mt-0.5">
              SPH (Stops Per Hour) · sourced from GroundCloud · synced nightly
            </p>
          </div>
          <button
            onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Missing data notice */}
        {!loading && withoutData.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-amber-800">
                {withoutData.length} driver{withoutData.length !== 1 ? "s" : ""} have no GroundCloud data
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {withoutData.map((d) => d.name).join(", ")}
                {" · "}
                <Link href="/dashboard/auto-gc" className="underline font-semibold hover:text-amber-900">
                  Fix name mappings in Auto GC →
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Team summary stats */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Team Avg SPH</p>
                <InfoTip text="Average stops per hour across all drivers with GroundCloud data, last 30 days" />
              </div>
              <p className="text-[28px] font-black text-slate-900 leading-none">{teamAvgSph ? teamAvgSph.toFixed(1) : "—"}</p>
              <div className="mt-1.5"><SphBadge value={teamAvgSph} /></div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Drivers</p>
              </div>
              <p className="text-[28px] font-black text-slate-900 leading-none">{drivers.length}</p>
              <p className="text-[11px] text-slate-400 mt-1.5">{withData.length} with GC data · {withoutData.length} unmatched</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top Performer</p>
              </div>
              {withData[0] ? (
                <>
                  <p className="text-[15px] font-black text-slate-900 leading-tight truncate">{withData[0].name}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">{withData[0].avg_sph_30d?.toFixed(1)} SPH avg · 30 days</p>
                </>
              ) : (
                <p className="text-[13px] text-slate-300 mt-1">—</p>
              )}
            </div>
          </div>
        )}

        {/* Top 3 podium */}
        {!loading && top3.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {top3.map((d) => {
              const tier = sphTier(d.avg_sph_30d);
              const isSelected = selected?.driver_id === d.driver_id;
              return (
                <button
                  key={d.driver_id}
                  onClick={() => setSelected(isSelected ? null : d)}
                  className={`bg-white rounded-2xl border p-4 text-left hover:shadow-sm transition-all
                    ${isSelected ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <RankBadge rank={d.rank} />
                    <div className="flex items-center gap-1.5">
                      {tier && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${tier.bg} ${tier.color}`}>{tier.label}</span>}
                      <TrendIcon trend={d.sph_trend} />
                    </div>
                  </div>
                  <p className="text-[14px] font-bold text-slate-900 truncate">{d.name}</p>
                  <p className="text-[30px] font-black text-slate-900 leading-none mt-1">
                    {d.avg_sph_30d?.toFixed(1)}
                    <span className="text-[12px] font-medium text-slate-400 ml-1">sph</span>
                  </p>
                  <div className="mt-3">
                    <SphBar value={d.avg_sph_30d} max={maxSph} />
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    {d.ryde_score ? (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-[11px] font-semibold text-slate-600">{d.ryde_score.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400">Ryde</span>
                      </div>
                    ) : <span />}
                    <span className="text-[10px] text-slate-400">{d.days_worked_30d ?? "—"} days worked</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* SPH History Chart */}
        <SphChart allDrivers={drivers} />

        {/* Full leaderboard table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-slate-800">Full Leaderboard</h2>
            <span className="text-[11px] text-slate-400">{withData.length} drivers · 30-day averages</span>
          </div>

          <div className="grid grid-cols-[36px_1fr_110px_90px_70px_72px_80px] gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/80">
            <SortBtn col="rank" label="#" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver</span>
            <SortBtn col="avg_sph_30d" label="SPH 30d" tip="Stops per hour, last 30 days" />
            <SortBtn col="avg_sph_90d" label="SPH 90d" tip="Stops per hour, last 90 days" />
            <SortBtn col="ryde_score" label="Ryde" tip="FedEx Ryde safety & service score (weekly)" />
            <SortBtn col="days_worked_30d" label="Days" tip="Days with route data in last 30 days" />
            <SortBtn col="trend_delta" label="Trend" tip="SPH change vs prior 14-day window" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-16">
              <BarChart2 className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-[13px] font-medium text-slate-400">No driver data yet</p>
              <Link href="/dashboard/auto-gc" className="text-[12px] text-indigo-500 hover:underline">
                Set up Auto GC to pull SPH data →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {sortedWithData.map((d) => {
                const tier = sphTier(d.avg_sph_30d);
                const isSelected = selected?.driver_id === d.driver_id;
                return (
                  <button
                    key={d.driver_id}
                    onClick={() => setSelected(isSelected ? null : d)}
                    className={`w-full grid grid-cols-[36px_1fr_110px_90px_70px_72px_80px] gap-2 px-4 py-3 text-left transition-colors
                      ${isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/60"}`}
                  >
                    <div className="flex items-center"><RankBadge rank={d.rank} /></div>

                    <div className="flex flex-col justify-center min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900 truncate">{d.name}</p>
                      {d.last_worked && (
                        <p className="text-[10px] text-slate-400">Last: {formatDate(d.last_worked)}</p>
                      )}
                    </div>

                    <div className="flex flex-col justify-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-slate-900">{d.avg_sph_30d!.toFixed(1)}</span>
                        {tier && <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${tier.bg} ${tier.color}`}>{tier.label}</span>}
                      </div>
                      <SphBar value={d.avg_sph_30d} max={maxSph} />
                    </div>

                    <div className="flex items-center">
                      <span className="text-[12px] text-slate-500">{d.avg_sph_90d?.toFixed(1) ?? "—"}</span>
                    </div>

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

                    <div className="flex items-center">
                      <span className="text-[12px] font-medium text-slate-600">{d.days_worked_30d ?? "—"}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <TrendIcon trend={d.sph_trend} />
                      {d.trend_delta != null && (
                        <span className={`text-[11px] font-semibold
                          ${d.trend_delta > 0 ? "text-emerald-600" : d.trend_delta < 0 ? "text-red-400" : "text-slate-400"}`}>
                          {d.trend_delta > 0 ? "+" : ""}{d.trend_delta.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Collapsible no-data section */}
              {sortedWithoutData.length > 0 && (
                <>
                  <button
                    onClick={() => setShowNoData((v) => !v)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 transition-colors"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showNoData ? "rotate-180" : ""}`} />
                    <span className="text-[11px] font-semibold text-slate-500">
                      {sortedWithoutData.length} driver{sortedWithoutData.length !== 1 ? "s" : ""} with no GroundCloud data
                    </span>
                    <span className="text-[10px] text-slate-400">· check name mappings</span>
                  </button>
                  {showNoData && sortedWithoutData.map((d) => (
                    <div key={d.driver_id} className="grid grid-cols-[36px_1fr_110px_90px_70px_72px_80px] gap-2 px-4 py-2.5 opacity-40">
                      <div />
                      <p className="text-[12px] font-medium text-slate-600 truncate col-span-1 flex items-center">{d.name}</p>
                      <p className="text-[11px] text-slate-400 italic col-span-5 flex items-center">No data — unmatched in GroundCloud</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Driver detail */}
        {selected && <DriverDetail driver={selected} onClose={() => setSelected(null)} />}

        {/* Metric guide */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Metric Guide</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {[
              { term: "SPH", def: "Stops Per Hour — packages delivered per hour of active driving. The core delivery efficiency metric." },
              { term: "Ryde Score", def: "FedEx safety & service rating from the Ryde platform. Scored weekly, higher is better." },
              { term: "Trend", def: "Your 14-day SPH average compared to the prior 14-day window. Green = improving, red = declining." },
              { term: "Consistency", def: "Standard deviation of daily SPH. Lower = steadier. High variability means good and bad days vary widely." },
              { term: "Days Worked", def: "Days in the period that had a GroundCloud route record (excludes Sundays)." },
              { term: "Tiers", def: "Elite ≥18 · Good ≥14 · OK ≥10 · Below 10 needs attention." },
            ].map(({ term, def }) => (
              <div key={term} className="flex gap-2">
                <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap min-w-[90px]">{term}:</span>
                <span className="text-[11px] text-slate-500 leading-snug">{def}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
