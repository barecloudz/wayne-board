"use client";

import { useState, useEffect, useRef } from "react";
import AppShell from "@/components/app-shell";
import {
  TrendingUp, TrendingDown, Minus, Star, Trophy,
  ChevronUp, ChevronDown, Loader2, RefreshCw,
  ChevronDown as ChevronDownIcon, Info, AlertCircle,
  Zap, Users, BarChart2, Shield, Target,
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
  avg_ils_30d:     number | null;
  avg_ppod_30d:    number | null;
};

type SortKey = "rank" | "avg_sph_30d" | "avg_sph_90d" | "ryde_score" | "days_worked_30d" | "trend_delta" | "avg_ils_30d" | "avg_ppod_30d";

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

const DRIVER_GLOW_COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

// ── Composite score ────────────────────────────────────────────────────────────

function compositeScore(d: Driver): number | null {
  const parts: number[] = [];
  if (d.avg_sph_30d != null) parts.push(Math.min((d.avg_sph_30d / 22) * 100, 100));
  if (d.avg_ils_30d != null) parts.push(d.avg_ils_30d);
  if (d.avg_ppod_30d != null) parts.push(d.avg_ppod_30d);
  if (d.ryde_score != null) parts.push((d.ryde_score / 5) * 100);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

// ── Animated SVG ring ─────────────────────────────────────────────────────────

function ScoreRing({
  score, size, strokeWidth, color, label, value,
}: {
  score: number | null; size: number; strokeWidth: number;
  color: string; label?: string; value?: string;
}) {
  const r = (size / 2) - strokeWidth;
  const circumference = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circumference);
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    const target = score ?? 0;
    const timer = setTimeout(() => {
      setOffset(circumference - (target / 100) * circumference);
    }, 100);

    // count-up animation
    const duration = 900;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayVal(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    const rafTimer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 100);

    return () => {
      clearTimeout(timer);
      clearTimeout(rafTimer);
      cancelAnimationFrame(raf);
    };
  }, [score, circumference]);

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={score != null ? color : "#1e293b"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ transform: "none" }}
        >
          {score != null ? (
            <span className="font-black leading-none" style={{ fontSize: size * 0.18, color }}>
              {value ?? `${displayVal}%`}
            </span>
          ) : (
            <span className="text-slate-600 font-bold" style={{ fontSize: size * 0.14 }}>—</span>
          )}
        </div>
      </div>
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      )}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info className="w-3 h-3 text-slate-600 cursor-help" />
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-slate-900 border border-slate-700 text-slate-200 text-[11px] leading-snug rounded-lg px-3 py-2 shadow-xl pointer-events-none max-w-[220px] text-center whitespace-normal">
          {text}
        </span>
      )}
    </span>
  );
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-600" />;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm leading-none">🥇</span>;
  if (rank === 2) return <span className="text-sm leading-none">🥈</span>;
  if (rank === 3) return <span className="text-sm leading-none">🥉</span>;
  return <span className="text-[12px] font-bold text-slate-500 w-5 text-center leading-none">#{rank}</span>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pctColor(val: number | null, invert = false): string {
  if (val == null) return "text-slate-500";
  const good = invert ? val < 50 : val >= 99;
  const warn = invert ? val < 70 : val >= 95;
  if (good) return "text-emerald-400";
  if (warn) return "text-amber-400";
  return "text-red-400";
}

// ── Dark chart tooltip ─────────────────────────────────────────────────────────

function ChartTooltipContent({ active, payload, label, driverMap }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-[#0d1424] border border-[#1e293b] rounded-xl shadow-xl p-3 min-w-[160px]">
      <p className="text-[11px] font-bold text-slate-500 mb-2">{formatDate(String(label))}</p>
      {sorted.map((entry: any) => {
        const driver = driverMap?.get(entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-[12px] text-slate-300">{driver?.name ?? entry.dataKey}</span>
            </div>
            <span className="text-[12px] font-bold text-white">{Number(entry.value).toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── SPH Chart (dark) ──────────────────────────────────────────────────────────

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
    <div className="bg-[#0d1424] rounded-2xl border border-[#1e293b] p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-100">Stops Per Hour · Trend</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Packages delivered per hour of active route time</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#111827] rounded-lg p-0.5 border border-[#1e293b]">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors
                  ${days === d ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
              >
                {d}d
              </button>
            ))}
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e293b] text-[12px] font-medium text-slate-400 hover:bg-[#111827] transition-colors"
            >
              Drivers ({visibleDriverIds.size}/{allDriverCount})
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 z-20 bg-[#0d1424] border border-[#1e293b] rounded-xl shadow-lg min-w-[200px] py-1.5 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e293b] mb-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filter Drivers</span>
                  <button
                    onClick={() => {
                      if (!history) return;
                      const all = history.drivers.map((d) => d.driverId);
                      setSelectedDriverIds((prev) => prev && prev.size === all.length ? new Set() : new Set(all));
                    }}
                    className="text-[11px] text-indigo-400 font-semibold hover:text-indigo-300"
                  >
                    {selectedDriverIds?.size === allDriverCount ? "None" : "All"}
                  </button>
                </div>
                {sortedHistoryDrivers.map((driver) => {
                  const rank = allDrivers.find((d) => d.driver_id === driver.driverId)?.rank;
                  const colorIdx = sortedHistoryDrivers.indexOf(driver);
                  return (
                    <label key={driver.driverId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#111827] cursor-pointer">
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
                        className="rounded text-indigo-600 focus:ring-indigo-500 bg-[#1e293b] border-[#334155]"
                      />
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[colorIdx % COLORS.length] }} />
                      <span className="text-[12px] text-slate-300 flex-1 truncate">{driver.name}</span>
                      {rank && <span className="text-[10px] text-slate-500">#{rank}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => fetchHistory(days)}
            disabled={loading}
            className="p-1.5 rounded-lg border border-[#1e293b] text-slate-500 hover:bg-[#111827] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[280px]">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center h-[280px] gap-3">
          <BarChart2 className="w-8 h-8 text-slate-700" />
          <p className="text-[13px] font-medium text-slate-500">No SPH data for this period</p>
          <Link href="/dashboard/auto-gc" className="text-[12px] text-indigo-400 hover:underline">
            Run a sync or backfill from Auto GC →
          </Link>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
              />
              <ReferenceLine y={18} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Elite 18", fontSize: 9, fill: "#10b981", position: "insideTopRight" }} />
              <ReferenceLine y={14} stroke="#3b82f6" strokeDasharray="4 4" strokeOpacity={0.3} label={{ value: "Good 14", fontSize: 9, fill: "#3b82f6", position: "insideTopRight" }} />
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
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-[#1e293b]">
              {visibleDrivers.map((driver) => {
                const colorIdx = sortedHistoryDrivers.indexOf(driver);
                const info = allDrivers.find((d) => d.driver_id === driver.driverId);
                return (
                  <div key={driver.driverId} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[colorIdx % COLORS.length] }} />
                    <span className="text-[11px] text-slate-400">{driver.name}</span>
                    {info?.avg_sph_30d && <span className="text-[10px] text-slate-600">{info.avg_sph_30d.toFixed(1)}</span>}
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

// ── Driver selector card ──────────────────────────────────────────────────────

function DriverCard({
  driver, index, selected, onClick,
}: {
  driver: Driver; index: number; selected: boolean; onClick: () => void;
}) {
  const initials = driver.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const glowColor = DRIVER_GLOW_COLORS[index % DRIVER_GLOW_COLORS.length];
  const score = compositeScore(driver);

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-[110px] flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
        ${selected
          ? "bg-[#111827] border-indigo-500 ring-1 ring-indigo-500/50"
          : "bg-[#111827] border-[#1e293b] hover:border-slate-600"
        }`}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black"
        style={{
          backgroundColor: glowColor + "22",
          color: glowColor,
          boxShadow: selected ? `0 0 12px ${glowColor}55` : "none",
        }}
      >
        {initials}
      </div>
      <p className="text-[11px] font-semibold text-slate-300 truncate w-full text-center leading-tight">
        {driver.name.split(" ")[0]}
      </p>
      <ScoreRing score={score} size={40} strokeWidth={4} color={glowColor} />
    </button>
  );
}

// ── Selected driver stage ─────────────────────────────────────────────────────

function DriverStage({ driver }: { driver: Driver }) {
  const score = compositeScore(driver);
  const initials = driver.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="bg-[#0d1424] border border-[#1e293b] rounded-2xl p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-[20px] font-black"
          style={{ backgroundColor: "#8b5cf622", color: "#8b5cf6", boxShadow: "0 0 20px #8b5cf644" }}
        >
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[22px] font-black text-white">{driver.name}</h2>
            <RankBadge rank={driver.rank} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <TrendIcon trend={driver.sph_trend} />
            {driver.sph_trend && (
              <span className={`text-[12px] font-semibold
                ${driver.sph_trend === "improving" ? "text-emerald-400" : driver.sph_trend === "declining" ? "text-red-400" : "text-slate-500"}`}>
                {driver.sph_trend === "improving" ? "Improving" : driver.sph_trend === "declining" ? "Declining" : "Stable"}
                {driver.trend_delta != null ? ` · ${driver.trend_delta > 0 ? "+" : ""}${driver.trend_delta.toFixed(1)} SPH` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rings row */}
      <div className="flex items-center justify-center gap-6 flex-wrap mb-8">
        <ScoreRing score={score}       size={180} strokeWidth={12} color="#8b5cf6" label="Composite" />
        <div className="flex gap-6 flex-wrap justify-center">
          <ScoreRing score={driver.avg_ils_30d}  size={120} strokeWidth={9}  color="#10b981" label="ILS 30d" />
          <ScoreRing score={driver.ryde_score != null ? (driver.ryde_score / 5) * 100 : null}
                     size={120} strokeWidth={9}  color="#f59e0b" label="Ryde"
                     value={driver.ryde_score != null ? driver.ryde_score.toFixed(2) : undefined} />
          <ScoreRing score={driver.avg_ppod_30d} size={120} strokeWidth={9}  color="#06b6d4" label="PPOD 30d" />
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "SPH 30d",
            value: driver.avg_sph_30d?.toFixed(1) ?? "—",
            sub: driver.avg_sph_30d ? `${((driver.avg_sph_30d / 22) * 100).toFixed(0)}% of elite` : "no data",
            color: "text-indigo-400",
          },
          {
            label: "SPH 90d",
            value: driver.avg_sph_90d?.toFixed(1) ?? "—",
            sub: "longer-term avg",
            color: "text-indigo-300",
          },
          {
            label: "Days Worked",
            value: String(driver.days_worked_30d ?? "—"),
            sub: `${driver.days_worked_90d ?? "—"} last 90d`,
            color: "text-slate-300",
          },
          {
            label: "Avg Miles",
            value: driver.avg_miles_30d?.toFixed(0) ?? "—",
            sub: "miles / day · 30d",
            color: "text-slate-300",
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-[#111827] border border-[#1e293b] rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">{label}</p>
            <p className={`text-[26px] font-black leading-none ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Team summary card ─────────────────────────────────────────────────────────

function TeamCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color }}>{icon}</div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className="text-[26px] font-black leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-slate-600 mt-1">{sub}</p>}
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

  const withIls = drivers.filter((d) => d.avg_ils_30d != null);
  const teamAvgIls = withIls.length
    ? withIls.reduce((sum, d) => sum + (d.avg_ils_30d ?? 0), 0) / withIls.length
    : null;

  const withPpod = drivers.filter((d) => d.avg_ppod_30d != null);
  const teamAvgPpod = withPpod.length
    ? withPpod.reduce((sum, d) => sum + (d.avg_ppod_30d ?? 0), 0) / withPpod.length
    : null;

  const withRyde = drivers.filter((d) => d.ryde_score != null);
  const teamAvgRyde = withRyde.length
    ? withRyde.reduce((sum, d) => sum + (d.ryde_score ?? 0), 0) / withRyde.length
    : null;

  const sorted = [...drivers].sort((a, b) => {
    const aVal = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    const bVal = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const sortedWithData    = sorted.filter((d) => d.avg_sph_30d != null);
  const sortedWithoutData = sorted.filter((d) => d.avg_sph_30d == null);

  function SortBtn({ col, label, tip }: { col: SortKey; label: string; tip?: string }) {
    const active = sortKey === col;
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleSort(col)}
          className={`flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors
            ${active ? "text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
        >
          {label}
          {active ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
        </button>
        {tip && <InfoTip text={tip} />}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-[#0a0f1a] p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-black text-white tracking-tight flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Driver Performance Command Center
              </h1>
              <p className="text-[12px] text-slate-500 mt-0.5">
                SPH · ILS · PPOD · Ryde — synced nightly
              </p>
            </div>
            <button
              onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e293b] text-[12px] font-medium text-slate-400 hover:bg-[#111827] transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Missing data notice */}
          {!loading && withoutData.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-800/50 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-amber-300">
                  {withoutData.length} driver{withoutData.length !== 1 ? "s" : ""} have no GroundCloud data
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  {withoutData.map((d) => d.name).join(", ")}
                  {" · "}
                  <Link href="/dashboard/auto-gc" className="underline font-semibold hover:text-amber-400">
                    Fix name mappings in Auto GC →
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* Team summary bar */}
          {!loading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TeamCard
                icon={<Zap className="w-4 h-4" />}
                label="Team SPH"
                value={teamAvgSph ? teamAvgSph.toFixed(1) : "—"}
                sub="30d avg · stops/hr"
                color="#6366f1"
              />
              <TeamCard
                icon={<Shield className="w-4 h-4" />}
                label="Team ILS"
                value={teamAvgIls ? `${teamAvgIls.toFixed(1)}%` : "—"}
                sub="30d avg · on-time scan"
                color="#10b981"
              />
              <TeamCard
                icon={<Target className="w-4 h-4" />}
                label="Team PPOD"
                value={teamAvgPpod ? `${teamAvgPpod.toFixed(1)}%` : "—"}
                sub="30d avg · package proof"
                color="#06b6d4"
              />
              <TeamCard
                icon={<Star className="w-4 h-4" />}
                label="Team Ryde"
                value={teamAvgRyde ? teamAvgRyde.toFixed(2) : "—"}
                sub="latest weekly avg"
                color="#f59e0b"
              />
            </div>
          )}

          {/* Driver selector row */}
          {!loading && drivers.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Select Driver</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {drivers.map((d, i) => (
                  <DriverCard
                    key={d.driver_id}
                    driver={d}
                    index={i}
                    selected={selected?.driver_id === d.driver_id}
                    onClick={() => setSelected((prev) => prev?.driver_id === d.driver_id ? null : d)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Selected driver stage */}
          {selected && <DriverStage driver={selected} />}

          {/* SPH Chart */}
          <SphChart allDrivers={drivers} />

          {/* Leaderboard table */}
          <div className="bg-[#0d1424] rounded-2xl border border-[#1e293b] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] flex items-center justify-between">
              <h2 className="text-[13px] font-bold text-slate-200">Full Leaderboard</h2>
              <span className="text-[11px] text-slate-600">{withData.length} drivers · 30-day averages</span>
            </div>

            <div className="grid grid-cols-[36px_1fr_90px_70px_70px_60px_70px_70px] gap-2 px-4 py-2 border-b border-[#1e293b] bg-[#111827]/60">
              <SortBtn col="rank" label="#" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Driver</span>
              <SortBtn col="avg_sph_30d"  label="SPH 30d"  tip="Stops per hour, last 30 days" />
              <SortBtn col="avg_sph_90d"  label="SPH 90d"  tip="Stops per hour, last 90 days" />
              <SortBtn col="avg_ils_30d"  label="ILS 30d"  tip="ILS % average, last 30 days (from DSW)" />
              <SortBtn col="avg_ppod_30d" label="PPOD"     tip="PPOD % average, last 30 days" />
              <SortBtn col="ryde_score"   label="Ryde"     tip="FedEx Ryde safety & service score (weekly)" />
              <SortBtn col="trend_delta"  label="Trend"    tip="SPH change vs prior 14-day window" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
              </div>
            ) : drivers.length === 0 ? (
              <div className="text-center py-16">
                <BarChart2 className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-[13px] font-medium text-slate-500">No driver data yet</p>
                <Link href="/dashboard/auto-gc" className="text-[12px] text-indigo-400 hover:underline">
                  Set up Auto GC to pull SPH data →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#1e293b]">
                {sortedWithData.map((d) => {
                  const isSelected = selected?.driver_id === d.driver_id;
                  return (
                    <button
                      key={d.driver_id}
                      onClick={() => setSelected(isSelected ? null : d)}
                      className={`w-full grid grid-cols-[36px_1fr_90px_70px_70px_60px_70px_70px] gap-2 px-4 py-3 text-left transition-colors
                        ${isSelected ? "bg-indigo-950/40" : "bg-[#0d1424] hover:bg-[#111827]"}`}
                    >
                      <div className="flex items-center"><RankBadge rank={d.rank} /></div>

                      <div className="flex flex-col justify-center min-w-0">
                        <p className="text-[13px] font-semibold text-slate-200 truncate">{d.name}</p>
                        {d.last_worked && (
                          <p className="text-[10px] text-slate-600">Last: {formatDate(d.last_worked)}</p>
                        )}
                      </div>

                      <div className="flex items-center">
                        <span className="text-[13px] font-bold text-indigo-300">{d.avg_sph_30d!.toFixed(1)}</span>
                      </div>

                      <div className="flex items-center">
                        <span className="text-[12px] text-slate-500">{d.avg_sph_90d?.toFixed(1) ?? "—"}</span>
                      </div>

                      <div className="flex items-center">
                        <span className={`text-[12px] font-semibold ${pctColor(d.avg_ils_30d)}`}>
                          {d.avg_ils_30d != null ? `${d.avg_ils_30d.toFixed(1)}%` : "—"}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className={`text-[12px] font-semibold ${pctColor(d.avg_ppod_30d)}`}>
                          {d.avg_ppod_30d != null ? `${d.avg_ppod_30d.toFixed(1)}%` : "—"}
                        </span>
                      </div>

                      <div className="flex items-center">
                        {d.ryde_score ? (
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span className="text-[12px] font-semibold text-yellow-300">{d.ryde_score.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-slate-600">—</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <TrendIcon trend={d.sph_trend} />
                        {d.trend_delta != null && (
                          <span className={`text-[11px] font-semibold
                            ${d.trend_delta > 0 ? "text-emerald-400" : d.trend_delta < 0 ? "text-red-400" : "text-slate-500"}`}>
                            {d.trend_delta > 0 ? "+" : ""}{d.trend_delta.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {sortedWithoutData.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowNoData((v) => !v)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#111827]/40 hover:bg-[#111827] transition-colors"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform ${showNoData ? "rotate-180" : ""}`} />
                      <span className="text-[11px] font-semibold text-slate-600">
                        {sortedWithoutData.length} driver{sortedWithoutData.length !== 1 ? "s" : ""} with no GroundCloud data
                      </span>
                      <span className="text-[10px] text-slate-700">· check name mappings</span>
                    </button>
                    {showNoData && sortedWithoutData.map((d) => (
                      <div key={d.driver_id} className="grid grid-cols-[36px_1fr_90px_70px_70px_60px_70px_70px] gap-2 px-4 py-2.5 opacity-30">
                        <div />
                        <p className="text-[12px] font-medium text-slate-500 truncate col-span-1 flex items-center">{d.name}</p>
                        <p className="text-[11px] text-slate-600 italic col-span-6 flex items-center">No data · unmatched in GroundCloud</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Metric guide */}
          <div className="bg-[#0d1424] rounded-xl border border-[#1e293b] p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-3">Metric Guide</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {[
                { term: "SPH",        def: "Stops Per Hour · packages delivered per hour of active driving. The core delivery efficiency metric." },
                { term: "ILS%",       def: "In-Line Scan percentage from DSW · measures proper scan sequencing. 99%+ = Elite." },
                { term: "PPOD%",      def: "Proof of Delivery percentage · confirmation scans per delivery attempt." },
                { term: "Ryde Score", def: "FedEx safety & service rating from the Ryde platform. Scored weekly, higher is better (max 5.0)." },
                { term: "Trend",      def: "Your 14-day SPH average compared to the prior 14-day window." },
                { term: "Composite",  def: "Weighted avg of SPH (capped at 22), ILS%, PPOD%, and Ryde (scaled to 100)." },
              ].map(({ term, def }) => (
                <div key={term} className="flex gap-2">
                  <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap min-w-[90px]">{term}:</span>
                  <span className="text-[11px] text-slate-600 leading-snug">{def}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
