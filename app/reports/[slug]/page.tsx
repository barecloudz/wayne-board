"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, Printer, ChevronUp, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import AppShell from "@/components/app-shell";
import { notFound } from "next/navigation";
import { use, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
} from "recharts";

// ─── Glass Buttons ─────────────────────────────────────────────────────────────

function GlassPrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "rgba(79,70,229,0.9)",
        backdropFilter: "blur(16px) saturate(200%)",
        WebkitBackdropFilter: "blur(16px) saturate(200%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 16px rgba(79,70,229,0.32), 0 1px 3px rgba(0,0,0,0.12)",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
      className="flex items-center gap-1.5 text-white text-[12px] font-semibold h-8 px-4 rounded-lg transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

function GlassSecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95), 0 2px 8px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.07)",
      }}
      className="flex items-center gap-1.5 text-slate-600 text-[12px] font-semibold h-8 px-4 rounded-lg transition-all duration-150 hover:bg-white active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

type StatusColor = "green" | "amber" | "red" | "indigo" | "slate";

const dotColors: Record<StatusColor, string> = {
  green:  "bg-emerald-500",
  amber:  "bg-amber-400",
  red:    "bg-red-500",
  indigo: "bg-indigo-500",
  slate:  "bg-slate-400",
};

const labelColors: Record<StatusColor, string> = {
  green:  "text-emerald-700",
  amber:  "text-amber-700",
  red:    "text-red-600",
  indigo: "text-indigo-700",
  slate:  "text-slate-500",
};

function StatusCell({ color, label }: { color: StatusColor; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[color]}`} />
      <span className={`text-[12px] font-medium ${labelColors[color]}`}>{label}</span>
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-[24px] font-extrabold text-slate-900 leading-none tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
      <p className="text-[13px] font-bold text-slate-900 mb-4">{title}</p>
      {children}
    </div>
  );
}

type SortDir = "asc" | "desc" | null;

function SortTh({
  children, colKey, sortCol, sortDir, onSort, right,
}: {
  children: React.ReactNode;
  colKey: string;
  sortCol: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
  right?: boolean;
}) {
  const active = sortCol === colKey;
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`bg-slate-50 text-[10px] font-semibold text-slate-500 uppercase tracking-wider py-3 px-5 border-b border-slate-100 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 transition-colors ${right ? "text-right" : "text-left"}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "justify-end w-full" : ""}`}>
        {children}
        {active
          ? sortDir === "asc"
            ? <ChevronUp className="w-3 h-3 text-indigo-500" />
            : <ChevronDown className="w-3 h-3 text-indigo-500" />
          : <ChevronsUpDown className="w-3 h-3 text-slate-300" />}
      </span>
    </th>
  );
}

function PlainTh({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`bg-slate-50 text-[10px] font-semibold text-slate-500 uppercase tracking-wider py-3 px-5 border-b border-slate-100 whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, mono, right, bold }: { children: React.ReactNode; mono?: boolean; right?: boolean; bold?: boolean }) {
  return (
    <td className={`py-3 px-5 border-b border-slate-50 group-hover/row:bg-indigo-50/30 transition-colors text-[13px] ${mono ? "font-mono text-[12px] tabular-nums" : ""} ${right ? "text-right" : ""} ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      {children}
    </td>
  );
}

function MiniBar({ value, max = 100, color = "bg-indigo-500" }: { value: number; max?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-[11px] font-mono text-slate-500 w-10 text-right tabular-nums">{value}%</span>
    </div>
  );
}

function TableSearch({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
  return (
    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Filter rows…"
          className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/15 transition-all placeholder:text-slate-400"
        />
      </div>
      <span className="text-[11px] text-slate-400 ml-auto">{count} records</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-[11px] px-3 py-2 rounded-xl shadow-xl">
      <p className="font-semibold">{label}</p>
      <p className="text-slate-300 mt-0.5">{payload[0].value}</p>
    </div>
  );
};

// ─── Fleet ────────────────────────────────────────────────────────────────────

function FleetReport() {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const raw = [
    { id: "VH-01", lastPM: "Oct 3, 2025",  nextPM: "Nov 3, 2025",  mileage: 82140,  health: 92, status: "On Track",  statusColor: "green"  as StatusColor },
    { id: "VH-02", lastPM: "Oct 10, 2025", nextPM: "Nov 10, 2025", mileage: 91320,  health: 85, status: "On Track",  statusColor: "green"  as StatusColor },
    { id: "VH-03", lastPM: "Sep 18, 2025", nextPM: "Oct 18, 2025", mileage: 103500, health: 58, status: "Overdue",   statusColor: "red"    as StatusColor },
    { id: "VH-04", lastPM: "Oct 22, 2025", nextPM: "Nov 22, 2025", mileage: 74800,  health: 97, status: "On Track",  statusColor: "green"  as StatusColor },
    { id: "VH-05", lastPM: "Oct 28, 2025", nextPM: "Nov 28, 2025", mileage: 68410,  health: 71, status: "Due Soon",  statusColor: "amber"  as StatusColor },
    { id: "VH-06", lastPM: "Oct 15, 2025", nextPM: "Nov 15, 2025", mileage: 88720,  health: 89, status: "On Track",  statusColor: "green"  as StatusColor },
    { id: "VH-07", lastPM: "Oct 5, 2025",  nextPM: "Nov 5, 2025",  mileage: 79100,  health: 74, status: "Due Soon",  statusColor: "amber"  as StatusColor },
    { id: "VH-08", lastPM: "Oct 19, 2025", nextPM: "Nov 19, 2025", mileage: 95650,  health: 95, status: "On Track",  statusColor: "green"  as StatusColor },
  ];

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : d === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const data = useMemo(() => {
    let rows = raw.filter(r =>
      Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
    );
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortCol];
        const bv = (b as Record<string, unknown>)[sortCol];
        const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [search, sortCol, sortDir]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Vehicles" value="12" />
        <KpiCard label="PMs This Month" value="4" />
        <KpiCard label="Inspections Passed" value="12 / 12" />
        <KpiCard label="Avg Mileage" value="84,200" sub="miles" />
      </div>
      <ChartCard title="Vehicle Health Scores">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={raw} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="id" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
              <Bar dataKey="health" radius={[6, 6, 0, 0]}>
                {raw.map((v, i) => <Cell key={i} fill={v.health >= 85 ? "#6366f1" : v.health >= 70 ? "#f59e0b" : "#ef4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[13px] font-bold text-slate-900">Vehicle Status</p>
        </div>
        <TableSearch value={search} onChange={setSearch} count={data.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <SortTh colKey="id" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Vehicle</SortTh>
                <SortTh colKey="lastPM" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Last PM</SortTh>
                <SortTh colKey="nextPM" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Next PM Due</SortTh>
                <SortTh colKey="mileage" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Mileage</SortTh>
                <SortTh colKey="health" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Health</SortTh>
                <SortTh colKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id} className="group/row">
                  <Td bold>{v.id}</Td>
                  <Td>{v.lastPM}</Td>
                  <Td>{v.nextPM}</Td>
                  <Td mono right>{v.mileage.toLocaleString()}</Td>
                  <Td><MiniBar value={v.health} color={v.health >= 85 ? "bg-indigo-500" : v.health >= 70 ? "bg-amber-400" : "bg-red-400"} /></Td>
                  <Td><StatusCell color={v.statusColor} label={v.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

function PayrollReport() {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const raw = [
    { name: "M. Carter",   days: 5, stops: 545, rate: 210, total: 1050 },
    { name: "J. Reyes",    days: 5, stops: 530, rate: 210, total: 1050 },
    { name: "T. Williams", days: 4, stops: 420, rate: 210, total: 840  },
    { name: "A. Patel",    days: 5, stops: 560, rate: 210, total: 1050 },
    { name: "D. Brooks",   days: 5, stops: 510, rate: 210, total: 1050 },
    { name: "R. Nguyen",   days: 5, stops: 540, rate: 210, total: 1050 },
    { name: "K. Johnson",  days: 5, stops: 525, rate: 210, total: 1050 },
    { name: "L. Martinez", days: 5, stops: 555, rate: 210, total: 1050 },
    { name: "B. Thompson", days: 4, stops: 400, rate: 210, total: 840  },
    { name: "C. Davis",    days: 5, stops: 535, rate: 210, total: 1050 },
  ];

  const dailyStops = [
    { day: "Mon", stops: 102 }, { day: "Tue", stops: 115 }, { day: "Wed", stops: 108 },
    { day: "Thu", stops: 121 }, { day: "Fri", stops: 118 }, { day: "Sat", stops: 94  }, { day: "Sun", stops: 98 },
  ];

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : d === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else { setSortCol(col); setSortDir("asc"); }
  }

  const maxStops = Math.max(...raw.map(d => d.stops));

  const data = useMemo(() => {
    let rows = raw.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())));
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortCol];
        const bv = (b as Record<string, unknown>)[sortCol];
        const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [search, sortCol, sortDir]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Weekly Payroll" value="$14,280" />
        <KpiCard label="Drivers Paid" value="12" />
        <KpiCard label="Avg Stops / Day" value="108" />
        <KpiCard label="Period" value="Nov 18–24" />
      </div>
      <ChartCard title="Daily Fleet Stops — Week of Nov 18">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyStops}>
              <defs>
                <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[80, 130]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Area type="monotone" dataKey="stops" stroke="#f59e0b" strokeWidth={2.5} fill="url(#payGrad)" dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[13px] font-bold text-slate-900">Driver Payroll Breakdown</p>
        </div>
        <TableSearch value={search} onChange={setSearch} count={data.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <SortTh colKey="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Driver</SortTh>
                <SortTh colKey="days" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Days</SortTh>
                <SortTh colKey="stops" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Total Stops</SortTh>
                <PlainTh>Volume</PlainTh>
                <SortTh colKey="rate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Daily Rate</SortTh>
                <SortTh colKey="total" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Weekly Total</SortTh>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.name} className="group/row">
                  <Td bold>{d.name}</Td>
                  <Td mono right>{d.days}</Td>
                  <Td mono right>{d.stops.toLocaleString()}</Td>
                  <Td>
                    <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(d.stops / maxStops) * 100}%` }} />
                    </div>
                  </Td>
                  <Td mono right>${d.rate}</Td>
                  <Td mono right bold>${d.total.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

function DriversReport() {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const raw = [
    { name: "A. Patel",    ils: 99.8, safety: 100, attendance: 100, customer: 100, status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "L. Martinez", ils: 99.7, safety: 100, attendance: 100, customer: 100, status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "M. Carter",   ils: 99.6, safety: 100, attendance: 100, customer: 99,  status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "R. Nguyen",   ils: 99.5, safety: 100, attendance: 100, customer: 99,  status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "J. Reyes",    ils: 99.4, safety: 100, attendance: 100, customer: 98,  status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "C. Davis",    ils: 99.3, safety: 100, attendance: 100, customer: 98,  status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "D. Brooks",   ils: 99.2, safety: 100, attendance: 100, customer: 97,  status: "Top Performer", statusColor: "green" as StatusColor },
    { name: "K. Johnson",  ils: 99.0, safety: 98,  attendance: 100, customer: 96,  status: "Standard",      statusColor: "slate" as StatusColor },
    { name: "T. Williams", ils: 98.1, safety: 96,  attendance: 80,  customer: 95,  status: "Coaching",      statusColor: "amber" as StatusColor },
    { name: "B. Thompson", ils: 97.8, safety: 94,  attendance: 80,  customer: 92,  status: "In Training",   statusColor: "indigo" as StatusColor },
  ];

  const chartData = raw.map(d => ({ name: d.name.split(".")[1]?.trim() ?? d.name, ils: d.ils }));

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : d === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else { setSortCol(col); setSortDir("asc"); }
  }

  const data = useMemo(() => {
    let rows = raw.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())));
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortCol];
        const bv = (b as Record<string, unknown>)[sortCol];
        const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [search, sortCol, sortDir]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Active Drivers" value="12" />
        <KpiCard label="Fleet ILS Avg" value="99.2%" sub="↑ 0.3% vs last week" />
        <KpiCard label="Top Performers" value="10" />
        <KpiCard label="In Training" value="1" />
      </div>
      <ChartCard title="ILS Score by Driver">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[95, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
              <Bar dataKey="ils" radius={[0, 6, 6, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.ils >= 99.5 ? "#6366f1" : d.ils >= 99 ? "#818cf8" : d.ils >= 98 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[13px] font-bold text-slate-900">Driver Performance Detail</p>
        </div>
        <TableSearch value={search} onChange={setSearch} count={data.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <SortTh colKey="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Driver</SortTh>
                <SortTh colKey="ils" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>ILS Score</SortTh>
                <SortTh colKey="safety" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Safety</SortTh>
                <SortTh colKey="attendance" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Attendance</SortTh>
                <SortTh colKey="customer" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Customer</SortTh>
                <SortTh colKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.name} className="group/row">
                  <Td bold>{d.name}</Td>
                  <Td><MiniBar value={parseFloat(d.ils.toFixed(1))} color={d.ils >= 99.5 ? "bg-indigo-500" : d.ils >= 99 ? "bg-indigo-300" : "bg-amber-400"} /></Td>
                  <Td><MiniBar value={d.safety} color={d.safety === 100 ? "bg-emerald-500" : "bg-amber-400"} /></Td>
                  <Td><MiniBar value={d.attendance} color={d.attendance === 100 ? "bg-emerald-500" : "bg-amber-400"} /></Td>
                  <Td><MiniBar value={d.customer} color={d.customer >= 99 ? "bg-emerald-500" : "bg-indigo-400"} /></Td>
                  <Td><StatusCell color={d.statusColor} label={d.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function RoutesReport() {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const raw = [
    { route: "RT-01", driver: "M. Carter",         stops: 112, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
    { route: "RT-02", driver: "J. Reyes",           stops: 108, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
    { route: "RT-03", driver: "A. Patel",           stops: 115, status: "Completed", statusColor: "green"  as StatusColor, coverage: "Primary" },
    { route: "RT-04", driver: "D. Brooks",          stops: 104, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
    { route: "RT-05", driver: "R. Nguyen",          stops: 110, status: "Completed", statusColor: "green"  as StatusColor, coverage: "Primary" },
    { route: "RT-06", driver: "K. Johnson",         stops: 106, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
    { route: "RT-07", driver: "L. Martinez",        stops: 118, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
    { route: "RT-08", driver: "C. Davis",           stops: 109, status: "Completed", statusColor: "green"  as StatusColor, coverage: "Primary" },
    { route: "RT-09", driver: "B. Thompson",        stops: 98,  status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Backup"  },
    { route: "RT-10", driver: "M. Carter (backup)", stops: 102, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Backup"  },
    { route: "RT-11", driver: "T. Williams",        stops: 105, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
    { route: "RT-12", driver: "J. Reyes (backup)",  stops: 101, status: "Active",    statusColor: "indigo" as StatusColor, coverage: "Primary" },
  ];

  const maxStops = Math.max(...raw.map(r => r.stops));

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : d === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else { setSortCol(col); setSortDir("asc"); }
  }

  const data = useMemo(() => {
    let rows = raw.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())));
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortCol];
        const bv = (b as Record<string, unknown>)[sortCol];
        const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [search, sortCol, sortDir]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Routes" value="12" />
        <KpiCard label="Coverage" value="100%" sub="12 of 12 assigned" />
        <KpiCard label="Avg Stops" value="108" />
        <KpiCard label="On-Time Dispatch" value="100%" />
      </div>
      <ChartCard title="Stops Planned per Route">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={raw} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="route" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[80, 130]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
              <Bar dataKey="stops" radius={[6, 6, 0, 0]}>
                {raw.map((r, i) => <Cell key={i} fill={r.coverage === "Backup" ? "#f59e0b" : "#6366f1"} opacity={r.status === "Completed" ? 0.45 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-5 mt-3">
          {[["#6366f1","Primary"],["#f59e0b","Backup"],["rgba(99,102,241,0.4)","Completed"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} />{l}
            </span>
          ))}
        </div>
      </ChartCard>
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[13px] font-bold text-slate-900">Route Assignments</p>
        </div>
        <TableSearch value={search} onChange={setSearch} count={data.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <SortTh colKey="route" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Route</SortTh>
                <SortTh colKey="driver" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Driver</SortTh>
                <SortTh colKey="stops" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Stops</SortTh>
                <PlainTh>Volume</PlainTh>
                <SortTh colKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Status</SortTh>
                <SortTh colKey="coverage" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Coverage</SortTh>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.route} className="group/row">
                  <Td bold>{r.route}</Td>
                  <Td>{r.driver}</Td>
                  <Td mono right>{r.stops}</Td>
                  <Td>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(r.stops / maxStops) * 100}%` }} />
                    </div>
                  </Td>
                  <Td><StatusCell color={r.statusColor} label={r.status} /></Td>
                  <Td>
                    <StatusCell
                      color={r.coverage === "Backup" ? "amber" : "slate"}
                      label={r.coverage}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

const reportConfig: Record<string, { title: string; period: string; component: React.ReactNode }> = {
  fleet:   { title: "Fleet & Maintenance Report", period: "November 2025",        component: <FleetReport />   },
  payroll: { title: "Payroll Report",              period: "November 18–24, 2025", component: <PayrollReport /> },
  drivers: { title: "Driver Performance Report",   period: "November 2025",        component: <DriversReport /> },
  routes:  { title: "Route Coverage Report",       period: "November 25, 2025",    component: <RoutesReport />  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const report = reportConfig[slug];
  if (!report) notFound();

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto flex flex-col gap-6">
        <Link href="/" className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1.5">
              742 Logistics · FedEx Ground
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              {report.title}
            </h1>
            <p className="text-[13px] text-slate-400 mt-1.5">{report.period}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <GlassSecondaryButton onClick={() => alert("PDF export coming soon.")}>
              <Printer className="w-3.5 h-3.5" /> Print
            </GlassSecondaryButton>
            <GlassPrimaryButton onClick={() => alert("PDF export coming soon.")}>
              <FileDown className="w-3.5 h-3.5" /> Export PDF
            </GlassPrimaryButton>
          </div>
        </div>

        {report.component}
      </main>

      <footer className="border-t border-slate-200 py-5 px-6">
        <p className="text-center text-[11px] text-slate-400">
          Wayne Board · Operations reporting prototype · Built by Blake Nardoni
        </p>
      </footer>
    </AppShell>
  );
}
