"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/app-shell";
import { RefreshCw, Loader2, BarChart2, AlertCircle, TrendingDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusColor = "GOLD" | "RED" | "YELLOW" | null;

type DriverRow = {
  driverId: string;
  name: string;
  daysWorked: number;
  delPkgs: number;
  delStps: number;
  delStpsPlanned: number;
  avgIls: number | null;
  dna: number;
  code85: number;
  miles: number;
  hours: number;
  ppodPct: number | null;
  rydeAvg: number | null;
  rydeCount: number;
  actDelPct: number | null;
  ilsStatus: StatusColor;
  actDelStatus: StatusColor;
  ppodStatus: StatusColor;
  rydeStatus: StatusColor;
};

type Totals = {
  delPkgs: number;
  delStps: number;
  delStpsPlanned: number;
  dna: number;
  code85: number;
  miles: number;
  hours: number;
  driversWorked: number;
  avgIls: number | null;
  avgPpod: number | null;
  avgRyde: number | null;
  actDelPct: number | null;
  ilsStatus: StatusColor;
  actDelStatus: StatusColor;
  ppodStatus: StatusColor;
  rydeStatus: StatusColor;
};

type CoachPriority = {
  metric: string;
  status: string;
  message: string;
  drivers: Array<{ name: string; value: number | null }>;
};

type ScorecardData = {
  weekEnding: string;
  weekStart: string;
  drivers: DriverRow[];
  totals: Totals | null;
  coachingPriorities: CoachPriority[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMostRecentSaturday(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun … 6=Sat
  const diff = day === 6 ? 0 : day + 1;
  const sat = new Date(today);
  sat.setDate(today.getDate() - diff);
  return sat.toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtPct(v: number | null, decimals = 1) {
  if (v === null) return "—";
  return v.toFixed(decimals) + "%";
}

function fmtNum(v: number | null, decimals = 0) {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: StatusColor }) {
  if (!status) return null;
  if (status === "GOLD") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700 ml-1">
        GOLD
      </span>
    );
  }
  if (status === "RED") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 ml-1">
        RED
      </span>
    );
  }
  if (status === "YELLOW") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 ml-1">
        FAIR
      </span>
    );
  }
  return null;
}

// ── Metric cell ────────────────────────────────────────────────────────────────

function MetricCell({
  value,
  status,
  formatter,
}: {
  value: number | null;
  status: StatusColor;
  formatter: (v: number | null) => string;
}) {
  return (
    <td className="px-3 py-2.5 text-center whitespace-nowrap">
      <span className={`text-[13px] font-semibold ${
        status === "RED" ? "text-red-700" :
        status === "GOLD" ? "text-emerald-700" :
        "text-slate-700"
      }`}>
        {formatter(value)}
      </span>
      <StatusPill status={status} />
    </td>
  );
}

// ── Summary tile ───────────────────────────────────────────────────────────────

function SummaryTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-1">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-[28px] font-extrabold text-slate-900 leading-none">{value.toLocaleString()}</p>
      {sub && <p className="text-[12px] text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScorecardPage() {
  const [weekEnding, setWeekEnding] = useState(getMostRecentSaturday());
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScorecard = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scorecard?weekEnding=${date}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScorecard(weekEnding);
  }, [weekEnding, fetchScorecard]);

  const drivers = data?.drivers ?? [];
  const totals = data?.totals ?? null;
  const priorities = data?.coachingPriorities ?? [];

  return (
    <AppShell>
      <div className="flex-1 bg-slate-50 min-h-screen">
        <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">MyGroundOps · Reports</p>
              <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none flex items-center gap-3">
                <BarChart2 className="w-7 h-7 text-slate-400" />
                Weekly Report
              </h1>
              {data && (
                <p className="text-[14px] text-slate-500 mt-1.5">
                  Week of {fmtDate(data.weekStart)} — {fmtDate(data.weekEnding)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Week Ending</label>
                <input
                  type="date"
                  value={weekEnding}
                  onChange={(e) => {
                    if (e.target.value) setWeekEnding(e.target.value);
                  }}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <button
                onClick={() => fetchScorecard(weekEnding)}
                disabled={loading}
                className="mt-5 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-[13px] text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* ── Loading skeleton ── */}
          {loading && !data && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          )}

          {/* ── No data ── */}
          {!loading && data && drivers.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
              <BarChart2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-[15px] font-semibold text-slate-500">No DSW data for this week</p>
              <p className="text-[13px] text-slate-400 mt-1">Upload DSW reports for {fmtDate(weekEnding)} or pick a different week.</p>
            </div>
          )}

          {data && drivers.length > 0 && (
            <>
              {/* ── Team Summary Bar ── */}
              {totals && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryTile
                    label="Total Packages"
                    value={totals.delPkgs.toLocaleString()}
                    sub="delivered"
                  />
                  <SummaryTile
                    label="Total Stops"
                    value={totals.delStps.toLocaleString()}
                    sub={`of ${totals.delStpsPlanned.toLocaleString()} planned`}
                  />
                  <SummaryTile
                    label="Total Miles"
                    value={totals.miles.toLocaleString()}
                    sub="driven this week"
                  />
                  <SummaryTile
                    label="Drivers Worked"
                    value={totals.driversWorked}
                    sub="with DSW data"
                  />
                </div>
              )}

              {/* ── Coaching Priorities ── */}
              {priorities.length > 0 && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-red-400 shrink-0" />
                    <h2 className="text-[15px] font-extrabold text-white">
                      Immediate Priorities This Week
                    </h2>
                    <span className="ml-auto text-[11px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                      {priorities.length} metric{priorities.length !== 1 ? "s" : ""} below standard
                    </span>
                  </div>
                  <div className="space-y-3">
                    {priorities.map((p, i) => (
                      <div key={i} className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-900/60 text-red-300 shrink-0">
                            {p.metric}
                          </span>
                          <p className="text-[13px] text-slate-300">{p.message}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 ml-0.5">
                          {p.drivers.map((d, j) => (
                            <span
                              key={j}
                              className="text-[12px] font-semibold text-white bg-slate-700 px-2.5 py-1 rounded-lg"
                            >
                              {d.name}
                              {d.value !== null && (
                                <span className="ml-1.5 text-red-400 font-bold">
                                  {p.metric === "DNA" || p.metric === "Code 85"
                                    ? d.value.toFixed(0)
                                    : d.value.toFixed(1) + (p.metric === "Ryde" ? "" : "%")}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Performance Table ── */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-[15px] font-extrabold text-slate-900">Driver Scorecard</h2>
                  <p className="text-[12px] text-slate-400 mt-0.5">Sorted by ILS% ascending — worst performers first. All metrics for the 7-day window.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left sticky left-0 bg-slate-50">
                          Driver
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">ILS%</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Act Del%</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">PPOD%</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Ryde</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">DNA</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Code 85</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Days</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Miles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drivers.map((d) => (
                        <tr
                          key={d.driverId}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-[13px] font-semibold text-slate-800 whitespace-nowrap sticky left-0 bg-white">
                            {d.name}
                          </td>
                          <MetricCell value={d.avgIls} status={d.ilsStatus} formatter={(v) => fmtPct(v)} />
                          <MetricCell value={d.actDelPct} status={d.actDelStatus} formatter={(v) => fmtPct(v)} />
                          <MetricCell value={d.ppodPct} status={d.ppodStatus} formatter={(v) => fmtPct(v)} />
                          <MetricCell
                            value={d.rydeAvg}
                            status={d.rydeStatus}
                            formatter={(v) => v === null ? "—" : v.toFixed(2) + (d.rydeCount > 0 ? ` (${d.rydeCount})` : "")}
                          />
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[13px] font-semibold ${d.dna > 0 ? "text-orange-700" : "text-slate-400"}`}>
                              {d.dna}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[13px] font-semibold ${d.code85 > 0 ? "text-orange-700" : "text-slate-400"}`}>
                              {d.code85}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-[13px] text-slate-600">{d.daysWorked}</td>
                          <td className="px-3 py-2.5 text-center text-[13px] text-slate-600">{fmtNum(d.miles, 1)}</td>
                        </tr>
                      ))}

                      {/* TOTALS row */}
                      {totals && (
                        <tr className="bg-slate-900 border-t-2 border-slate-300">
                          <td className="px-4 py-3 text-[12px] font-extrabold text-white uppercase tracking-widest sticky left-0 bg-slate-900">
                            Team Total
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-[13px] font-bold ${totals.ilsStatus === "RED" ? "text-red-400" : totals.ilsStatus === "GOLD" ? "text-emerald-400" : "text-slate-300"}`}>
                              {fmtPct(totals.avgIls)}
                            </span>
                            {totals.ilsStatus && (
                              <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                totals.ilsStatus === "GOLD" ? "bg-yellow-900/50 text-yellow-300" :
                                totals.ilsStatus === "RED"  ? "bg-red-900/50 text-red-300" :
                                "bg-slate-700 text-slate-300"
                              }`}>
                                {totals.ilsStatus}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-[13px] font-bold ${totals.actDelStatus === "RED" ? "text-red-400" : totals.actDelStatus === "GOLD" ? "text-emerald-400" : "text-slate-300"}`}>
                              {fmtPct(totals.actDelPct)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-[13px] font-bold ${totals.ppodStatus === "RED" ? "text-red-400" : totals.ppodStatus === "GOLD" ? "text-emerald-400" : "text-slate-300"}`}>
                              {fmtPct(totals.avgPpod)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-[13px] font-bold ${totals.rydeStatus === "RED" ? "text-red-400" : totals.rydeStatus === "GOLD" ? "text-emerald-400" : "text-slate-300"}`}>
                              {fmtNum(totals.avgRyde, 2)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center text-[13px] font-bold text-white">{totals.dna}</td>
                          <td className="px-3 py-3 text-center text-[13px] font-bold text-white">{totals.code85}</td>
                          <td className="px-3 py-3 text-center text-[13px] font-bold text-white">{totals.driversWorked}</td>
                          <td className="px-3 py-3 text-center text-[13px] font-bold text-white">{fmtNum(totals.miles, 1)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
