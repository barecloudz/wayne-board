"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/app-shell";
import { notFound } from "next/navigation";
import { use } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
} from "recharts";

// ─── Shared primitives ────────────────────────────────────────────────────────

type BadgeVariant = "green" | "yellow" | "slate" | "indigo" | "red";

function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  const s: Record<BadgeVariant, string> = {
    green:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
    yellow: "bg-amber-50 text-amber-700 border border-amber-200",
    slate:  "bg-slate-100 text-slate-600 border border-slate-200",
    indigo: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    red:    "bg-red-50 text-red-600 border border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s[variant]}`}>
      {children}
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

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
      <div className="px-6 py-4 border-b border-slate-100">
        <p className="text-[13px] font-bold text-slate-900">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          {children}
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider py-3 px-5 border-b border-slate-100 whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, mono, right, bold }: { children: React.ReactNode; mono?: boolean; right?: boolean; bold?: boolean }) {
  return (
    <td className={`py-3 px-5 border-b border-slate-50 text-slate-700 group-hover/row:bg-slate-50/60 transition-colors ${mono ? "font-mono text-[12px]" : ""} ${right ? "text-right" : ""} ${bold ? "font-semibold text-slate-900" : ""}`}>
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
      <span className="text-[12px] font-mono text-slate-600 w-10 text-right">{value}%</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) => {
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
  const vehicles = [
    { id: "VH-01", lastPM: "Oct 3, 2025",  nextPM: "Nov 3, 2025",  mileage: "82,140",  health: 92, status: "On Track" },
    { id: "VH-02", lastPM: "Oct 10, 2025", nextPM: "Nov 10, 2025", mileage: "91,320",  health: 85, status: "On Track" },
    { id: "VH-03", lastPM: "Sep 18, 2025", nextPM: "Oct 18, 2025", mileage: "103,500", health: 58, status: "Overdue" },
    { id: "VH-04", lastPM: "Oct 22, 2025", nextPM: "Nov 22, 2025", mileage: "74,800",  health: 97, status: "On Track" },
    { id: "VH-05", lastPM: "Oct 28, 2025", nextPM: "Nov 28, 2025", mileage: "68,410",  health: 71, status: "Due Soon" },
    { id: "VH-06", lastPM: "Oct 15, 2025", nextPM: "Nov 15, 2025", mileage: "88,720",  health: 89, status: "On Track" },
    { id: "VH-07", lastPM: "Oct 5, 2025",  nextPM: "Nov 5, 2025",  mileage: "79,100",  health: 74, status: "Due Soon" },
    { id: "VH-08", lastPM: "Oct 19, 2025", nextPM: "Nov 19, 2025", mileage: "95,650",  health: 95, status: "On Track" },
  ];

  const statusVariant: Record<string, BadgeVariant> = {
    "On Track": "green", "Due Soon": "yellow", "Overdue": "red",
  };

  function barColor(h: number) {
    if (h >= 85) return "#6366f1";
    if (h >= 70) return "#f59e0b";
    return "#ef4444";
  }

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
            <BarChart data={vehicles} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="id" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
              <Bar dataKey="health" radius={[6, 6, 0, 0]}>
                {vehicles.map((v, i) => <Cell key={i} fill={barColor(v.health)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <TableCard title="Vehicle Status">
        <thead>
          <tr>
            <Th>Vehicle</Th>
            <Th>Last PM</Th>
            <Th>Next PM Due</Th>
            <Th>Mileage</Th>
            <Th>Health</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id} className="group/row">
              <Td bold>{v.id}</Td>
              <Td>{v.lastPM}</Td>
              <Td>{v.nextPM}</Td>
              <Td mono right>{v.mileage}</Td>
              <Td><MiniBar value={v.health} color={v.health >= 85 ? "bg-indigo-500" : v.health >= 70 ? "bg-amber-400" : "bg-red-400"} /></Td>
              <Td><Badge variant={statusVariant[v.status]}>{v.status}</Badge></Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

function PayrollReport() {
  const drivers = [
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
    { day: "Mon", stops: 102 },
    { day: "Tue", stops: 115 },
    { day: "Wed", stops: 108 },
    { day: "Thu", stops: 121 },
    { day: "Fri", stops: 118 },
    { day: "Sat", stops: 94  },
    { day: "Sun", stops: 98  },
  ];

  const maxStops = Math.max(...drivers.map(d => d.stops));

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

      <TableCard title="Driver Payroll Breakdown">
        <thead>
          <tr>
            <Th>Driver</Th>
            <Th>Days</Th>
            <Th>Total Stops</Th>
            <Th>Stop Volume</Th>
            <Th right>Daily Rate</Th>
            <Th right>Weekly Total</Th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.name} className="group/row">
              <Td bold>{d.name}</Td>
              <Td mono>{d.days}</Td>
              <Td mono>{d.stops.toLocaleString()}</Td>
              <Td>
                <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(d.stops / maxStops) * 100}%` }} />
                </div>
              </Td>
              <Td mono right>${d.rate.toLocaleString()}</Td>
              <Td mono right bold>${d.total.toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

function DriversReport() {
  const drivers = [
    { name: "A. Patel",    ils: 99.8, safety: 100, attendance: 100, customer: 100, status: "Top Performer" },
    { name: "L. Martinez", ils: 99.7, safety: 100, attendance: 100, customer: 100, status: "Top Performer" },
    { name: "M. Carter",   ils: 99.6, safety: 100, attendance: 100, customer: 99,  status: "Top Performer" },
    { name: "R. Nguyen",   ils: 99.5, safety: 100, attendance: 100, customer: 99,  status: "Top Performer" },
    { name: "J. Reyes",    ils: 99.4, safety: 100, attendance: 100, customer: 98,  status: "Top Performer" },
    { name: "C. Davis",    ils: 99.3, safety: 100, attendance: 100, customer: 98,  status: "Top Performer" },
    { name: "D. Brooks",   ils: 99.2, safety: 100, attendance: 100, customer: 97,  status: "Top Performer" },
    { name: "K. Johnson",  ils: 99.0, safety: 98,  attendance: 100, customer: 96,  status: "Standard" },
    { name: "T. Williams", ils: 98.1, safety: 96,  attendance: 80,  customer: 95,  status: "Coaching" },
    { name: "B. Thompson", ils: 97.8, safety: 94,  attendance: 80,  customer: 92,  status: "In Training" },
  ];

  const statusVariant: Record<string, BadgeVariant> = {
    "Top Performer": "green", "Standard": "slate", "Coaching": "yellow", "In Training": "indigo",
  };

  const chartData = drivers.map(d => ({ name: d.name.split(".")[1]?.trim() ?? d.name, ils: d.ils }));

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

      <TableCard title="Driver Performance Detail">
        <thead>
          <tr>
            <Th>Driver</Th>
            <Th>ILS Score</Th>
            <Th>Safety</Th>
            <Th>Attendance</Th>
            <Th>Customer</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.name} className="group/row">
              <Td bold>{d.name}</Td>
              <Td><MiniBar value={parseFloat(d.ils.toFixed(1))} max={100} color={d.ils >= 99.5 ? "bg-indigo-500" : d.ils >= 99 ? "bg-indigo-300" : "bg-amber-400"} /></Td>
              <Td><MiniBar value={d.safety} color={d.safety === 100 ? "bg-emerald-500" : "bg-amber-400"} /></Td>
              <Td><MiniBar value={d.attendance} color={d.attendance === 100 ? "bg-emerald-500" : "bg-amber-400"} /></Td>
              <Td><MiniBar value={d.customer} color={d.customer >= 99 ? "bg-emerald-500" : "bg-indigo-400"} /></Td>
              <Td><Badge variant={statusVariant[d.status]}>{d.status}</Badge></Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function RoutesReport() {
  const routes = [
    { route: "RT-01", driver: "M. Carter",          stops: 112, status: "Active",          coverage: "Primary" },
    { route: "RT-02", driver: "J. Reyes",            stops: 108, status: "Active",          coverage: "Primary" },
    { route: "RT-03", driver: "A. Patel",            stops: 115, status: "Completed",       coverage: "Primary" },
    { route: "RT-04", driver: "D. Brooks",           stops: 104, status: "Active",          coverage: "Primary" },
    { route: "RT-05", driver: "R. Nguyen",           stops: 110, status: "Completed",       coverage: "Primary" },
    { route: "RT-06", driver: "K. Johnson",          stops: 106, status: "Active",          coverage: "Primary" },
    { route: "RT-07", driver: "L. Martinez",         stops: 118, status: "Active",          coverage: "Primary" },
    { route: "RT-08", driver: "C. Davis",            stops: 109, status: "Completed",       coverage: "Primary" },
    { route: "RT-09", driver: "B. Thompson",         stops: 98,  status: "Active",          coverage: "Backup" },
    { route: "RT-10", driver: "M. Carter (backup)",  stops: 102, status: "Active",          coverage: "Backup" },
    { route: "RT-11", driver: "T. Williams",         stops: 105, status: "Active",          coverage: "Primary" },
    { route: "RT-12", driver: "J. Reyes (backup)",   stops: 101, status: "Active",          coverage: "Primary" },
  ];

  const statusVariant: Record<string, BadgeVariant> = {
    Active: "indigo", Completed: "green", Backup: "yellow",
  };

  const maxStops = Math.max(...routes.map(r => r.stops));

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
            <BarChart data={routes} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="route" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[80, 130]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
              <Bar dataKey="stops" radius={[6, 6, 0, 0]}>
                {routes.map((r, i) => (
                  <Cell key={i} fill={r.coverage === "Backup" ? "#f59e0b" : "#6366f1"} opacity={r.status === "Completed" ? 0.5 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Primary</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Backup</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 inline-block" /> Completed</span>
        </div>
      </ChartCard>

      <TableCard title="Route Assignments">
        <thead>
          <tr>
            <Th>Route</Th>
            <Th>Assigned Driver</Th>
            <Th>Stops Planned</Th>
            <Th>Volume</Th>
            <Th>Status</Th>
            <Th>Coverage</Th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.route} className="group/row">
              <Td bold>{r.route}</Td>
              <Td>{r.driver}</Td>
              <Td mono>{r.stops}</Td>
              <Td>
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(r.stops / maxStops) * 100}%` }} />
                </div>
              </Td>
              <Td><Badge variant={statusVariant[r.status]}>{r.status}</Badge></Td>
              <Td><span className={`text-[11px] font-medium ${r.coverage === "Backup" ? "text-amber-600" : "text-slate-500"}`}>{r.coverage}</span></Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

const reportConfig: Record<string, { title: string; period: string; component: React.ReactNode }> = {
  fleet:   { title: "Fleet & Maintenance Report",  period: "November 2025",          component: <FleetReport />   },
  payroll: { title: "Payroll Report",               period: "November 18–24, 2025",   component: <PayrollReport /> },
  drivers: { title: "Driver Performance Report",   period: "November 2025",          component: <DriversReport /> },
  routes:  { title: "Route Coverage Report",        period: "November 25, 2025",      component: <RoutesReport />  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const report = reportConfig[slug];
  if (!report) notFound();

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto flex flex-col gap-6">
        {/* Back */}
        <Link href="/" className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>

        {/* Report header */}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => alert("PDF export coming soon.")}
              className="flex items-center gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 text-[12px] h-8"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button
              size="sm"
              onClick={() => alert("PDF export coming soon.")}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-8"
            >
              <FileDown className="w-3.5 h-3.5" /> Export PDF
            </Button>
          </div>
        </div>

        {/* Content */}
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
