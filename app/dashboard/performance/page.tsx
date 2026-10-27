"use client";

import { useState, useEffect, useRef } from "react";
import AppShell from "@/components/app-shell";
import {
  TrendingUp, TrendingDown, Minus, Star,
  ChevronUp, ChevronDown, Loader2, RefreshCw,
  AlertCircle,
  BarChart2, X,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Driver = {
  rank:                    number;
  driver_id:               string;
  name:                    string;
  avg_sph_30d:             number | null;
  avg_sph_90d:             number | null;
  stddev_sph_30d:          number | null;
  days_worked_30d:         number | null;
  days_worked_90d:         number | null;
  sph_trend:               string | null;
  trend_delta:             number | null;
  best_sph:                number | null;
  best_date:               string | null;
  worst_sph:               number | null;
  worst_date:              string | null;
  last_worked:             string | null;
  avg_miles_30d:           number | null;
  ryde_score:              number | null;
  ryde_count:              number | null;
  avg_ils_30d:             number | null;
  avg_ppod_30d:            number | null;
  avg_photo_no_pkg_pct:    number | null;
  avg_photo_sensitive_pct: number | null;
  avg_photo_other_pct:     number | null;
  avg_loc_good_pct:        number | null;
  avg_loc_poor_pct:        number | null;
  avg_loc_over_mile_pct:   number | null;
  avg_dtc_pct:             number | null;
  total_code85:            number | null;
  total_dna:               number | null;
  total_non_delvd:         number | null;
  total_act_del:           number | null;
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

const CHART_COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
  "#06b6d4","#a855f7","#f43f5e","#0ea5e9","#22d3ee","#fb923c",
];

const DAY_OPTIONS = [7, 14, 30, 90];

const AVATAR_COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function sphTier(sph: number | null): { label: string; color: string; bg: string } {
  if (sph == null) return { label: "No Data", color: "text-slate-400", bg: "bg-slate-100" };
  if (sph >= 18)   return { label: "Elite",   color: "text-emerald-700", bg: "bg-emerald-100" };
  if (sph >= 14)   return { label: "Good",    color: "text-indigo-700",  bg: "bg-indigo-100" };
  if (sph >= 10)   return { label: "OK",      color: "text-amber-700",   bg: "bg-amber-100" };
  return               { label: "Low",    color: "text-red-700",     bg: "bg-red-100" };
}

function ilsColor(val: number | null): string {
  if (val == null) return "text-slate-400";
  if (val >= 99) return "text-emerald-600";
  if (val >= 95) return "text-amber-600";
  return "text-red-600";
}

function ppodColor(val: number | null): string {
  if (val == null) return "text-slate-400";
  if (val >= 99) return "text-emerald-600";
  if (val >= 95) return "text-amber-600";
  return "text-red-600";
}

// ── PPOD helpers ───────────────────────────────────────────────────────────────

function ppodRiskFlags(d: Driver): { label: string; color: string; bg: string }[] {
  const flags: { label: string; color: string; bg: string }[] = [];
  if (d.avg_loc_over_mile_pct != null && d.avg_loc_over_mile_pct > 30)
    flags.push({ label: `${d.avg_loc_over_mile_pct.toFixed(0)}% off-location`, color: "text-orange-700", bg: "bg-orange-100" });
  if (d.avg_photo_sensitive_pct != null && d.avg_photo_sensitive_pct > 1)
    flags.push({ label: `${d.avg_photo_sensitive_pct.toFixed(1)}% sensitive info`, color: "text-red-700", bg: "bg-red-100" });
  if (d.avg_photo_other_pct != null && d.avg_photo_other_pct > 10)
    flags.push({ label: `${d.avg_photo_other_pct.toFixed(0)}% photo issue`, color: "text-red-700", bg: "bg-red-100" });
  if (d.avg_loc_poor_pct != null && d.avg_loc_poor_pct > 60)
    flags.push({ label: `${d.avg_loc_poor_pct.toFixed(0)}% poor location`, color: "text-orange-700", bg: "bg-orange-100" });
  return flags;
}

function StackedBar({
  segments,
  height = "h-2",
}: {
  segments: { pct: number | null; color: string; title: string }[];
  height?: string;
}) {
  const total = segments.reduce((s, seg) => s + (seg.pct ?? 0), 0);
  if (total === 0) return <div className={`w-full ${height} bg-slate-100 rounded-full`} />;
  return (
    <div className={`flex w-full ${height} rounded-full overflow-hidden gap-px`}>
      {segments.map((seg, i) =>
        seg.pct != null && seg.pct > 0 ? (
          <div
            key={i}
            title={`${seg.title}: ${seg.pct.toFixed(1)}%`}
            style={{ width: `${seg.pct}%`, backgroundColor: seg.color, flexShrink: 0 }}
          />
        ) : null
      )}
    </div>
  );
}

function consistencyScore(d: Driver): number | null {
  if (d.stddev_sph_30d == null || d.avg_sph_30d == null || d.avg_sph_30d === 0) return null;
  const cv = d.stddev_sph_30d / d.avg_sph_30d;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

// ── Rank badge ─────────────────────────────────────────────────────────────────

function RankBadge({ rank, size = "sm" }: { rank: number; size?: "sm" | "md" }) {
  const base = size === "md" ? "w-8 h-8 text-sm" : "w-6 h-6 text-xs";
  if (rank === 1) return (
    <span className={`${base} rounded-full bg-amber-100 flex items-center justify-center font-black text-amber-600`}>1</span>
  );
  if (rank === 2) return (
    <span className={`${base} rounded-full bg-slate-200 flex items-center justify-center font-black text-slate-600`}>2</span>
  );
  if (rank === 3) return (
    <span className={`${base} rounded-full bg-orange-100 flex items-center justify-center font-black text-orange-600`}>3</span>
  );
  return (
    <span className={`${base} rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300`}>{rank}</span>
  );
}

// ── Trend icon ─────────────────────────────────────────────────────────────────

function TrendIcon({ trend, delta }: { trend: string | null; delta?: number | null }) {
  if (trend === "improving") return (
    <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-semibold">
      <TrendingUp className="w-3.5 h-3.5" />
      {delta != null && `+${delta.toFixed(1)}`}
    </span>
  );
  if (trend === "declining") return (
    <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold">
      <TrendingDown className="w-3.5 h-3.5" />
      {delta != null && delta.toFixed(1)}
    </span>
  );
  if (trend === "stable") return (
    <span className="flex items-center gap-0.5 text-slate-400 text-xs">
      <Minus className="w-3.5 h-3.5" />
    </span>
  );
  return <span className="text-slate-300 text-xs">—</span>;
}

// ── Chart tooltip ──────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, driverMap }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 min-w-[160px]">
      <p className="text-[11px] font-bold text-slate-400 mb-2">{formatDate(String(label))}</p>
      {sorted.map((entry: any) => {
        const driver = driverMap?.get(entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-[12px] text-slate-600">{driver?.name ?? entry.dataKey}</span>
            </div>
            <span className="text-[12px] font-bold text-slate-800">{Number(entry.value).toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── SPH Chart ──────────────────────────────────────────────────────────────────

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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-800">Stops Per Hour · Trend</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Packages delivered per hour of active route time</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors
                  ${days === d ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
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
              <ChevronDown className="w-3.5 h-3.5" />
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
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length] }} />
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
            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-40"
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
              <ReferenceLine y={14} stroke="#6366f1" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Good 14", fontSize: 9, fill: "#6366f1", position: "insideTopRight" }} />
              <Tooltip content={<ChartTooltip driverMap={driverMap} />} />
              {visibleDrivers.map((driver) => {
                const colorIdx = sortedHistoryDrivers.indexOf(driver);
                return (
                  <Line
                    key={driver.driverId}
                    type="monotone"
                    dataKey={driver.driverId}
                    stroke={CHART_COLORS[colorIdx % CHART_COLORS.length]}
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
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-slate-100">
              {visibleDrivers.map((driver) => {
                const colorIdx = sortedHistoryDrivers.indexOf(driver);
                const info = allDrivers.find((d) => d.driver_id === driver.driverId);
                return (
                  <div key={driver.driverId} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length] }} />
                    <span className="text-[11px] text-slate-500">{driver.name}</span>
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

// ── Driver Card ────────────────────────────────────────────────────────────────

function DriverCard({
  driver, index, selected, onClick,
}: {
  driver: Driver; index: number; selected: boolean; onClick: () => void;
}) {
  const color = avatarColor(index);

  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border p-4 shadow-lg shadow-slate-900/20 cursor-pointer text-left transition-all hover:from-slate-700 hover:to-slate-800 hover:shadow-xl w-full
        ${selected ? "ring-2 ring-indigo-400 border-slate-700/50" : "border-slate-700/50"}`}
    >
      {/* Top row: rank + name + trend */}
      <div className="flex items-center gap-2 mb-2">
        <RankBadge rank={driver.rank} />
        <p className="flex-1 text-[13px] font-semibold text-white truncate leading-tight">{driver.name}</p>
        <TrendIcon trend={driver.sph_trend} delta={driver.trend_delta} />
      </div>

      {/* ILS% hero */}
      <div className="flex items-end gap-1.5 mb-1">
        <span className={`text-3xl font-black leading-none ${
          driver.avg_ils_30d == null ? "text-slate-500"
          : driver.avg_ils_30d >= 99 ? "text-emerald-400"
          : driver.avg_ils_30d >= 95 ? "text-amber-400"
          : "text-red-400"
        }`}>
          {driver.avg_ils_30d != null ? `${driver.avg_ils_30d.toFixed(1)}%` : "—"}
        </span>
        <span className="text-[10px] font-bold text-slate-500 mb-1">ILS</span>
      </div>

      {/* ILS progress bar */}
      <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div className="h-1 rounded-full transition-all" style={{
          width: `${driver.avg_ils_30d != null ? Math.min(100, driver.avg_ils_30d) : 0}%`,
          backgroundColor: driver.avg_ils_30d == null ? "#475569"
            : driver.avg_ils_30d >= 99 ? "#10b981"
            : driver.avg_ils_30d >= 95 ? "#f59e0b"
            : "#ef4444",
        }} />
      </div>

      {/* Mini stats row: Ryde · PPOD · SPH */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] font-semibold flex items-center gap-0.5 text-amber-500">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          {driver.ryde_score != null ? driver.ryde_score.toFixed(1) : <span className="text-slate-500">—</span>}
        </span>
        <span className={`text-[11px] font-semibold flex items-center gap-1 ${ppodColor(driver.avg_ppod_30d)}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${driver.avg_ppod_30d == null ? "bg-slate-600" : driver.avg_ppod_30d >= 99 ? "bg-emerald-500" : driver.avg_ppod_30d >= 95 ? "bg-amber-400" : "bg-red-400"}`} />
          {driver.avg_ppod_30d != null ? `${driver.avg_ppod_30d.toFixed(1)}%` : "—"}
        </span>
        <span className="text-[11px] text-slate-500 font-medium">
          {driver.avg_sph_30d != null ? `${driver.avg_sph_30d.toFixed(1)} sph` : "—"}
        </span>
      </div>

    </button>
  );
}

// ── Driver Detail Panel ────────────────────────────────────────────────────────

function ilsStatusMsg(ils: number | null): { headline: string; detail: string; color: string; bg: string } {
  if (ils == null) return { headline: "No data yet", detail: "ILS data comes from DSW uploads. This will populate once a DSW file has been uploaded.", color: "text-slate-400", bg: "bg-slate-700/40" };
  if (ils >= 99)   return { headline: "Passing — on target", detail: "All packages are being delivered and closed out correctly. Target is 99% and above. Keep it up.", color: "text-emerald-400", bg: "bg-emerald-900/30" };
  if (ils >= 95)   return { headline: "Below target", detail: `${(100 - ils).toFixed(1)}% of packages were either returned to the station undelivered or closed out with an incorrect status code. This affects the team's FedEx service score. Every package on the truck needs to be delivered or have a legitimate reason documented. A coaching session is required — let's work through it together.`, color: "text-amber-400", bg: "bg-amber-900/30" };
  return { headline: "Significantly below target", detail: `${(100 - ils).toFixed(1)}% of packages were either returned to the station undelivered or closed out with an incorrect status code. This directly impacts the entire team's FedEx service score. Every package on the truck needs to be delivered or have a legitimate reason documented. Immediate coaching is required.`, color: "text-red-400", bg: "bg-red-900/30" };
}

function photoQualityMsg(d: Driver): { headline: string; detail: string; color: string } {
  const ppod      = d.avg_ppod_30d;
  const sensitive = d.avg_photo_sensitive_pct ?? 0;
  const noPkg     = d.avg_photo_no_pkg_pct ?? 0;
  const other     = d.avg_photo_other_pct ?? 0;
  if (ppod == null) return { headline: "No photo data", detail: "PPOD data comes from DSW uploads.", color: "text-slate-400" };
  if (sensitive > 3)  return { headline: "Exposing sensitive information", detail: `${sensitive.toFixed(1)}% of photos show sensitive info — license plates, mail labels, door codes. Driver must angle the camera away from these items on every delivery.`, color: "text-red-400" };
  if (noPkg > 8)      return { headline: "Package not in the frame", detail: `${noPkg.toFixed(1)}% of photos don't show the package. Every delivery photo must clearly show the package at the door — driver needs to be retrained on this.`, color: "text-orange-400" };
  if (other > 10)     return { headline: "Photo quality issues", detail: `${other.toFixed(1)}% of photos have quality problems. Pull recent delivery photos and review them directly with this driver.`, color: "text-amber-400" };
  if (ppod < 95)      return { headline: "Missing delivery photos", detail: `Only ${ppod.toFixed(1)}% of deliveries have a confirmation photo. Driver must photograph every single stop — no exceptions.`, color: "text-red-400" };
  if (ppod >= 99)     return { headline: "Photos look great", detail: "Consistent, clean delivery confirmation shots. No issues here.", color: "text-emerald-400" };
  return { headline: "Photos are mostly good", detail: `${ppod.toFixed(1)}% confirmation rate. A few gaps — remind the driver to photo every stop.`, color: "text-amber-400" };
}

function DriverDetail({ driver, index, onClose, days }: { driver: Driver; index: number; onClose: () => void; days: number }) {
  const color = avatarColor(index);
  const hasPpod = driver.avg_ppod_30d != null;
  const hasLoc  = driver.avg_loc_good_pct != null;
  const ilsMsg  = ilsStatusMsg(driver.avg_ils_30d);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 md:p-6 text-white relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
      >
        <X className="w-4 h-4 text-slate-300" />
      </button>

      {/* Avatar + name + rank */}
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black flex-shrink-0"
          style={{ backgroundColor: color + "33", color }}
        >
          {initials(driver.name)}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-white truncate">{driver.name}</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <RankBadge rank={driver.rank} size="sm" />
            <span className="text-[11px] text-slate-400">Team rank #{driver.rank}</span>
            {driver.last_worked && (
              <span className="text-[11px] text-slate-500">· Last worked {formatDate(driver.last_worked)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ILS hero + status */}
      <div className={`rounded-xl p-4 mb-4 ${ilsMsg.bg}`}>
        <div className="flex items-end gap-3 mb-2">
          <span className={`text-5xl font-black leading-none ${ilsMsg.color}`}>
            {driver.avg_ils_30d != null ? `${driver.avg_ils_30d.toFixed(1)}%` : "—"}
          </span>
          <div className="mb-1">
            <p className={`text-[13px] font-bold ${ilsMsg.color}`}>{ilsMsg.headline}</p>
            <p className="text-[11px] text-slate-400">In-Line Scan % · last {days} days</p>
          </div>
        </div>
        {/* ILS bar */}
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
          <div className="h-2 rounded-full" style={{
            width: `${driver.avg_ils_30d != null ? Math.min(100, driver.avg_ils_30d) : 0}%`,
            backgroundColor: driver.avg_ils_30d == null ? "#475569"
              : driver.avg_ils_30d >= 99 ? "#10b981"
              : driver.avg_ils_30d >= 95 ? "#f59e0b"
              : "#ef4444",
          }} />
        </div>
        <p className="text-[11px] text-slate-400">{ilsMsg.detail}</p>
      </div>

      {/* Key metrics — plain English labels */}
      {(() => {
        const photoMsg = photoQualityMsg(driver);
        const daysWorked = days <= 30 ? driver.days_worked_30d : driver.days_worked_90d;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ryde Score</p>
              <p className="text-xl font-black text-white leading-none flex items-center gap-1">
                {driver.ryde_score != null ? (
                  <><Star className="w-4 h-4 fill-amber-400 text-amber-400 inline" /> {driver.ryde_score.toFixed(2)}</>
                ) : "—"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {driver.ryde_count != null ? `customer rating · ${driver.ryde_count} review${driver.ryde_count !== 1 ? "s" : ""}` : "no Ryde data"}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Stops Per Hour</p>
              <p className="text-xl font-black text-white leading-none">{driver.avg_sph_30d?.toFixed(1) ?? "—"}</p>
              <p className="text-[10px] text-slate-500 mt-1">
                {driver.avg_sph_90d != null ? `${driver.avg_sph_90d.toFixed(1)} over 90 days` : "90d: no data"}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Proof of Delivery</p>
              <p className={`text-xl font-black leading-none ${ppodColor(driver.avg_ppod_30d)}`}>
                {driver.avg_ppod_30d != null ? `${driver.avg_ppod_30d.toFixed(1)}%` : "—"}
              </p>
              <p className={`text-[10px] mt-1 font-semibold ${photoMsg.color}`}>{photoMsg.headline}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Days Worked</p>
              <p className="text-xl font-black text-white leading-none">{daysWorked ?? "—"}</p>
              <p className="text-[10px] text-slate-500 mt-1">shifts in last {days} days</p>
            </div>
          </div>
        );
      })()}

      {/* SPH trend + best day */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-white/10 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">SPH Trend</p>
          <div className="flex items-center gap-2">
            <TrendIcon trend={driver.sph_trend} delta={driver.trend_delta} />
            <p className="text-[12px] text-slate-300">
              {driver.sph_trend === "improving" ? "Getting faster"
                : driver.sph_trend === "declining" ? "Slowing down"
                : driver.sph_trend === "stable" ? "Holding steady"
                : "Not enough data"}
            </p>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">compared to prior {days / 2 | 0}-day window</p>
        </div>
        <div className="bg-white/10 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Best Day</p>
          <p className="text-xl font-black text-white leading-none">{driver.best_sph?.toFixed(1) ?? "—"}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {driver.best_date ? `on ${formatDate(driver.best_date)}` : "—"}
          </p>
        </div>
      </div>

      {/* PPOD breakdown — only shown when data exists */}
      {(hasPpod || hasLoc) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Photo quality */}
          {hasPpod && (
            <div className="bg-white/8 rounded-xl p-4 border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Photo Quality Breakdown</p>
              {(() => { const m = photoQualityMsg(driver); return <p className={`text-[12px] font-semibold mb-3 ${m.color}`}>{m.detail}</p>; })()}
              <StackedBar
                height="h-3"
                segments={[
                  { pct: driver.avg_ppod_30d,            color: "#10b981", title: "Good" },
                  { pct: driver.avg_photo_no_pkg_pct,    color: "#f59e0b", title: "No Package Visible" },
                  { pct: driver.avg_photo_sensitive_pct, color: "#f97316", title: "Sensitive Info" },
                  { pct: driver.avg_photo_other_pct,     color: "#ef4444", title: "Other Issue" },
                ]}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                {[
                  { label: "Good",             pct: driver.avg_ppod_30d,            color: "#10b981" },
                  { label: "No package shown", pct: driver.avg_photo_no_pkg_pct,    color: "#f59e0b" },
                  { label: "Sensitive info",   pct: driver.avg_photo_sensitive_pct, color: "#f97316" },
                  { label: "Other",            pct: driver.avg_photo_other_pct,     color: "#ef4444" },
                ].map(({ label, pct, color: c }) => pct != null && (
                  <div key={label} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                    <span className="text-[11px] text-slate-400">{label}</span>
                    <span className="text-[11px] font-bold text-white">{pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location quality */}
          {hasLoc && (
            <div className="bg-white/8 rounded-xl p-4 border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Delivery Location Accuracy</p>
              <StackedBar
                height="h-3"
                segments={[
                  { pct: driver.avg_loc_good_pct,      color: "#06b6d4", title: "Good" },
                  { pct: driver.avg_loc_poor_pct,      color: "#f97316", title: "Poor" },
                  { pct: driver.avg_loc_over_mile_pct, color: "#ef4444", title: "Over 1 Mile Away" },
                ]}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                {[
                  { label: "On target",       pct: driver.avg_loc_good_pct,      color: "#06b6d4" },
                  { label: "Poor accuracy",   pct: driver.avg_loc_poor_pct,      color: "#f97316" },
                  { label: "Over 1 mile off", pct: driver.avg_loc_over_mile_pct, color: "#ef4444" },
                ].map(({ label, pct, color: c }) => pct != null && (
                  <div key={label} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                    <span className="text-[11px] text-slate-400">{label}</span>
                    <span className="text-[11px] font-bold text-white">{pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Code 85 / DNA coaching — only shown when data exists */}
      {(driver.total_code85 != null && driver.total_code85 > 0) || (driver.total_dna != null && driver.total_dna > 0) || (driver.total_non_delvd != null && driver.total_non_delvd > 0) ? (
        <div className="mt-3 rounded-xl p-4 border border-red-900/60 bg-red-950/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-3">Scan & Delivery Accountability</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {driver.total_code85 != null && driver.total_code85 > 0 && (
              <div className="bg-black/30 rounded-xl p-3 border border-red-900/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1">Code 85 Packages</p>
                <p className="text-2xl font-black text-red-300 leading-none">{driver.total_code85}</p>
                <p className="text-[10px] text-slate-500 mt-1">last {days} days</p>
              </div>
            )}
            {driver.total_dna != null && driver.total_dna > 0 && (
              <div className="bg-black/30 rounded-xl p-3 border border-amber-900/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mb-1">DNA Packages</p>
                <p className="text-2xl font-black text-amber-300 leading-none">{driver.total_dna}</p>
                <p className="text-[10px] text-slate-500 mt-1">did not attempt</p>
              </div>
            )}
            {driver.total_non_delvd != null && driver.total_non_delvd > 0 && (
              <div className="bg-black/30 rounded-xl p-3 border border-orange-900/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-orange-400 mb-1">Undelivered Stops</p>
                <p className="text-2xl font-black text-orange-300 leading-none">{driver.total_non_delvd}</p>
                <p className="text-[10px] text-slate-500 mt-1">returned to station</p>
              </div>
            )}
          </div>
          {driver.total_code85 != null && driver.total_code85 > 0 && (
            <div className="rounded-lg px-4 py-3 bg-black/30 border border-red-900/30">
              <p className="text-[11px] font-bold text-red-400 mb-1">⚠ Code 85 — Unscanned Packages</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Code 85 means a package was delivered without being scanned by the driver&apos;s scanner or the vehicle&apos;s VSA.
                This could happen if the scanner died mid-route, but it also means the station has no record of where that package
                went. If the customer says it wasn&apos;t delivered — there&apos;s no scan to prove otherwise.
                Any Code 85 count above zero needs to be addressed with this driver immediately.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoData, setShowNoData] = useState(false);
  const [expandedTile, setExpandedTile] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  async function load(d: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/drivers/leaderboard?days=${d}`);
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(days); }, []);

  useEffect(() => { load(days); }, [days]);

  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selected]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const withData    = drivers.filter((d) => d.avg_sph_30d != null);
  const withoutData = drivers.filter((d) => d.avg_sph_30d == null);

  const teamAvgSph = withData.length
    ? withData.reduce((sum, d) => sum + (d.avg_sph_30d ?? 0), 0) / withData.length
    : null;
  const teamMaxSph = withData.length
    ? Math.max(...withData.map((d) => d.avg_sph_30d ?? 0))
    : 0;
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

  function SortBtn({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap
          ${active ? "text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
      >
        {label}
        {active ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
      </button>
    );
  }

  // Summary pills
  const summaryPills = [
    {
      label: "Team SPH",
      value: teamAvgSph ? teamAvgSph.toFixed(1) : "—",
      sub: `${days}d avg · stops/hr`,
      border: "border-l-indigo-500",
    },
    {
      label: "Team ILS",
      value: teamAvgIls ? `${teamAvgIls.toFixed(1)}%` : "—",
      sub: `${days}d avg · on-time scan`,
      border: "border-l-emerald-500",
    },
    {
      label: "Team PPOD",
      value: teamAvgPpod ? `${teamAvgPpod.toFixed(1)}%` : "—",
      sub: `${days}d avg · proof of delivery`,
      border: "border-l-emerald-500",
    },
    {
      label: "Team Ryde",
      value: teamAvgRyde ? `${teamAvgRyde.toFixed(2)} ★` : "—",
      sub: `${days}d avg · stars`,
      border: "border-l-amber-500",
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">MyGroundOps · Performance</p>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Driver Performance</h1>
              <p className="text-[12px] text-slate-400 mt-0.5">{days}-day averages · sourced from GC, DSW, Ryde</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {[7, 14, 30, 90].map(d => (
                  <button key={d} onClick={() => setDays(d)}
                    className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors
                      ${days === d ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <button
                onClick={async () => { setRefreshing(true); await load(days); setRefreshing(false); }}
                disabled={refreshing || loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Team summary bar */}
          {!loading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {summaryPills.map(({ label, value, sub, border }) => {
                  const isExpanded = expandedTile === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setExpandedTile((v) => v === label ? null : label)}
                      className={`bg-white rounded-xl border border-slate-200 shadow-sm pl-4 pr-3 py-4 border-l-4 ${border} cursor-pointer text-left transition-all hover:shadow-md hover:border-slate-300 w-full ${isExpanded ? "ring-2 ring-indigo-300" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                      <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
                    </button>
                  );
                })}
              </div>

              {/* Expanded tile chart panel */}
              {expandedTile && (() => {
                type TileConfig = {
                  key: keyof Driver;
                  color: string;
                  fmt: (v: number) => string;
                  refLine?: number;
                };
                const tileConfig: Record<string, TileConfig> = {
                  "Team SPH":  { key: "avg_sph_30d",  color: "#6366f1", fmt: (v) => v.toFixed(1) },
                  "Team ILS":  { key: "avg_ils_30d",  color: "#10b981", fmt: (v) => `${v.toFixed(1)}%`, refLine: 99 },
                  "Team PPOD": { key: "avg_ppod_30d", color: "#06b6d4", fmt: (v) => `${v.toFixed(1)}%`, refLine: 99 },
                  "Team Ryde": { key: "ryde_score",   color: "#f59e0b", fmt: (v) => v.toFixed(1),        refLine: 4.5 },
                };
                const cfg = tileConfig[expandedTile];
                if (!cfg) return null;
                const chartData = drivers
                  .filter((d) => d[cfg.key] != null)
                  .map((d) => ({ name: d.name.split(" ")[0], fullName: d.name, value: d[cfg.key] as number }))
                  .sort((a, b) => b.value - a.value);
                if (chartData.length === 0) return null;
                const barHeight = 28;
                const chartHeight = Math.max(160, chartData.length * barHeight + 40);
                return (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[13px] font-bold text-slate-700">{expandedTile} · All Drivers</h3>
                      <button
                        onClick={() => setExpandedTile(null)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                        <XAxis
                          type="number"
                          domain={["auto", "auto"]}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={72}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(val: any) => [cfg.fmt(Number(val)), expandedTile]}
                          labelFormatter={(label: any) => {
                            const d = chartData.find((x) => x.name === String(label));
                            return d?.fullName ?? String(label);
                          }}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        />
                        {cfg.refLine != null && (
                          <ReferenceLine
                            x={cfg.refLine}
                            stroke={cfg.color}
                            strokeDasharray="4 4"
                            strokeOpacity={0.6}
                            label={{ value: String(cfg.refLine), fontSize: 9, fill: cfg.color, position: "insideTopRight" }}
                          />
                        )}
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {chartData.map((_, i) => (
                            <Cell key={i} fill={cfg.color} fillOpacity={1 - i * 0.04} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          )}

          {/* Driver cards grid */}
          {!loading && withData.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Driver Cards · tap to view details
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {drivers.filter((d) => d.avg_sph_30d != null).map((d, i) => (
                  <DriverCard
                    key={d.driver_id}
                    driver={d}
                    index={i}
                    selected={selected?.driver_id === d.driver_id}
                    onClick={() => {
                      if (selected?.driver_id === d.driver_id) {
                        setSelected(null);
                      } else {
                        setSelected(d);
                        setSelectedIndex(i);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Driver detail panel */}
          {selected && (
            <div ref={detailRef} className="scroll-mt-4">
              <DriverDetail
                driver={selected}
                index={selectedIndex}
                onClose={() => setSelected(null)}
                days={days}
              />
            </div>
          )}

          {/* SPH Trend chart */}
          <SphChart allDrivers={drivers} />

          {/* Full leaderboard table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-slate-800">Full Leaderboard</h2>
              <span className="text-[11px] text-slate-400">{withData.length} drivers · {days}-day averages</span>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[28px_1fr_60px_60px_72px] md:grid-cols-[32px_1fr_80px_80px_68px_90px_68px] gap-2 px-4 md:px-5 py-2.5 border-b border-slate-100 bg-slate-50 text-left">
              <div className="flex items-center"><SortBtn col="rank" label="#" /></div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Driver</span>
              <SortBtn col="avg_sph_30d"  label="SPH" />
              <div className="hidden md:flex items-center"><SortBtn col="avg_sph_90d" label="SPH 90d" /></div>
              <SortBtn col="avg_ils_30d"  label="ILS%" />
              <SortBtn col="ryde_score"   label="Ryde" />
              <div className="hidden md:flex items-center"><SortBtn col="avg_ppod_30d" label="PPOD" /></div>
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
              <div className="divide-y divide-slate-100">
                {sortedWithData.map((d) => {
                  const isSelected = selected?.driver_id === d.driver_id;
                  return (
                    <button
                      key={d.driver_id}
                      onClick={() => {
                        const idx = drivers.findIndex((dr) => dr.driver_id === d.driver_id);
                        if (selected?.driver_id === d.driver_id) {
                          setSelected(null);
                        } else {
                          setSelected(d);
                          setSelectedIndex(Math.max(0, idx));
                        }
                      }}
                      className={`w-full grid grid-cols-[28px_1fr_60px_60px_72px] md:grid-cols-[32px_1fr_80px_80px_68px_90px_68px] gap-2 px-4 md:px-5 py-3 text-left transition-colors min-h-[52px]
                        ${isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center"><RankBadge rank={d.rank} /></div>

                      <div className="flex flex-col justify-center min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 truncate">{d.name}</p>
                        {d.last_worked && (
                          <p className="text-[10px] text-slate-400">Last: {formatDate(d.last_worked)}</p>
                        )}
                      </div>

                      <div className="flex items-center">
                        <span className="text-[13px] font-bold text-indigo-600">{d.avg_sph_30d!.toFixed(1)}</span>
                      </div>

                      <div className="hidden md:flex items-center">
                        <span className="text-[12px] text-slate-400">{d.avg_sph_90d?.toFixed(1) ?? "—"}</span>
                      </div>

                      <div className="flex items-center">
                        <span className={`text-[12px] font-semibold ${ilsColor(d.avg_ils_30d)}`}>
                          {d.avg_ils_30d != null ? `${d.avg_ils_30d.toFixed(1)}%` : "—"}
                        </span>
                      </div>

                      <div className="flex items-center">
                        {d.ryde_score != null ? (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-[12px] font-semibold text-amber-600">{d.ryde_score.toFixed(2)}</span>
                            {d.ryde_count != null && (
                              <span className="hidden md:inline text-[10px] text-slate-400">({d.ryde_count})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12px] text-slate-400">—</span>
                        )}
                      </div>

                      <div className="hidden md:flex items-center">
                        <span className={`text-[12px] font-semibold ${ppodColor(d.avg_ppod_30d)}`}>
                          {d.avg_ppod_30d != null ? `${d.avg_ppod_30d.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {sortedWithoutData.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowNoData((v) => !v)}
                      className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition-colors min-h-[44px]"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showNoData ? "rotate-180" : ""}`} />
                      <span className="text-[12px] font-semibold text-slate-500">
                        {sortedWithoutData.length} driver{sortedWithoutData.length !== 1 ? "s" : ""} with no GroundCloud data
                      </span>
                      <span className="text-[11px] text-slate-400">· check name mappings</span>
                    </button>
                    {showNoData && sortedWithoutData.map((d) => (
                      <div key={d.driver_id} className="flex items-center gap-3 px-5 py-3 opacity-40">
                        <span className="w-8" />
                        <p className="text-[12px] font-medium text-slate-500 truncate flex-1">{d.name}</p>
                        <p className="text-[11px] text-slate-400 italic">No data · unmatched in GroundCloud</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Missing data notice */}
          {!loading && withoutData.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-amber-800">
                  {withoutData.length} driver{withoutData.length !== 1 ? "s" : ""} have no GroundCloud data
                </p>
                <p className="text-[12px] text-amber-700 mt-0.5">
                  {withoutData.map((d) => d.name).join(", ")}
                  {" · "}
                  <Link href="/dashboard/auto-gc" className="underline font-semibold hover:text-amber-900">
                    Fix name mappings in Auto GC →
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* Metric guide */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Metric Guide</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {[
                { term: "SPH",         def: "Stops Per Hour · packages delivered per hour of active driving. The core delivery efficiency metric." },
                { term: "ILS%",        def: "In-Line Scan % from DSW · measures proper scan sequencing. 99%+ = Elite." },
                { term: "PPOD%",       def: "Proof of Delivery % · confirmation scans per delivery attempt." },
                { term: "Ryde",        def: "FedEx safety & service star rating averaged over the last 30 days of reviews. Max 5.0." },
                { term: "Trend",       def: "SPH change: your 14-day avg vs the prior 14-day window." },
                { term: "Consistency", def: "Low coefficient of variation in SPH — high = reliably steady performer." },
              ].map(({ term, def }) => (
                <div key={term} className="flex gap-2">
                  <span className="text-[12px] font-bold text-slate-600 whitespace-nowrap min-w-[90px]">{term}:</span>
                  <span className="text-[12px] text-slate-400 leading-snug">{def}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
