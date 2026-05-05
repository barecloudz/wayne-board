"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, Printer, ChevronUp, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import AppShell from "@/components/app-shell";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
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

function Td({ children, mono, right, bold }: { children: React.ReactNode; mono?: boolean; right?: boolean; bold?: boolean }) {
  return (
    <td className={`py-3 px-5 border-b border-slate-50 group-hover/row:bg-indigo-50/30 transition-colors text-[13px] ${mono ? "font-mono text-[12px] tabular-nums" : ""} ${right ? "text-right" : ""} ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      {children}
    </td>
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type FleetRow = {
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  lastInspection: string | null;
  status: string;
};

export type DriverRow = {
  name: string;
  driverId: string;
  role: string;
  active: boolean;
  createdAt: string;
};

// ─── Fleet ────────────────────────────────────────────────────────────────────

function statusColor(status: string): StatusColor {
  if (status === "Complete") return "green";
  if (status === "Defects Pending Repair") return "amber";
  if (status === "Out of Service") return "red";
  return "slate";
}

function FleetReport({ vehicles }: { vehicles: FleetRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

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
    let rows = vehicles.filter(r =>
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
  }, [search, sortCol, sortDir, vehicles]);

  const inspected = vehicles.filter(v => v.status !== "No Inspection").length;
  const oos = vehicles.filter(v => v.status === "Out of Service").length;

  const chartData = vehicles.map(v => ({
    name: v.unitNumber.replace("Truck ", "T"),
    value: v.status === "Complete" ? 2 : v.status === "Defects Pending Repair" ? 1 : v.status === "Out of Service" ? 0 : -1,
    status: v.status,
  }));

  function barColor(status: string) {
    if (status === "Complete") return "#10b981";
    if (status === "Defects Pending Repair") return "#f59e0b";
    if (status === "Out of Service") return "#ef4444";
    return "#e2e8f0";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Trucks" value={vehicles.length.toString()} />
        <KpiCard label="Inspected Q2" value={inspected.toString()} sub={`of ${vehicles.length}`} />
        <KpiCard label="Out of Service" value={oos.toString()} />
        <KpiCard label="Pending" value={(vehicles.length - inspected).toString()} />
      </div>

      {vehicles.length > 0 && (
        <ChartCard title="Inspection Status by Truck">
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[-1, 2]} />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="bg-slate-900 text-white text-[11px] px-2 py-1 rounded-lg shadow-xl">
                        {payload[0].payload.name}: {payload[0].payload.status}
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={barColor(d.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-5 mt-3">
            {[
              ["#10b981", "Complete"],
              ["#f59e0b", "Defects Pending"],
              ["#ef4444", "Out of Service"],
              ["#e2e8f0", "No Inspection"],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </ChartCard>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[13px] font-bold text-slate-900">Vehicle Roster</p>
        </div>
        <TableSearch value={search} onChange={setSearch} count={data.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <SortTh colKey="unitNumber" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Unit #</SortTh>
                <SortTh colKey="make" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Make / Model</SortTh>
                <SortTh colKey="year" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Year</SortTh>
                <SortTh colKey="mileage" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} right>Mileage</SortTh>
                <SortTh colKey="lastInspection" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Last Inspection</SortTh>
                <SortTh colKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.unitNumber} className="group/row">
                  <Td bold>{v.unitNumber}</Td>
                  <Td>{v.make} {v.model}</Td>
                  <Td mono right>{v.year}</Td>
                  <Td mono right>{v.mileage.toLocaleString()}</Td>
                  <Td>{v.lastInspection ?? "—"}</Td>
                  <Td><StatusCell color={statusColor(v.status)} label={v.status} /></Td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[12px] text-slate-400">No records match your filter</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

function DriversReport({ drivers }: { drivers: DriverRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : d === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else { setSortCol(col); setSortDir("asc"); }
  }

  const active = drivers.filter(d => d.active).length;

  const data = useMemo(() => {
    let rows = drivers.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())));
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortCol];
        const bv = (b as Record<string, unknown>)[sortCol];
        const cmp = typeof av === "boolean"
          ? (av === bv ? 0 : av ? -1 : 1)
          : typeof av === "number"
          ? (av as number) - (bv as number)
          : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [search, sortCol, sortDir, drivers]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Accounts" value={drivers.length.toString()} />
        <KpiCard label="Active" value={active.toString()} />
        <KpiCard label="Inactive" value={(drivers.length - active).toString()} />
        <KpiCard label="Ryde Score Avg" value="—" sub="No data yet" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[13px] font-bold text-slate-900">Driver Roster</p>
        </div>
        <TableSearch value={search} onChange={setSearch} count={data.length} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <SortTh colKey="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Name</SortTh>
                <SortTh colKey="driverId" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Driver ID</SortTh>
                <SortTh colKey="role" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Role</SortTh>
                <SortTh colKey="active" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Status</SortTh>
                <SortTh colKey="createdAt" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>Added</SortTh>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.driverId} className="group/row">
                  <Td bold>{d.name}</Td>
                  <Td mono>{d.driverId}</Td>
                  <Td>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      d.role === "management"
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}>
                      {d.role}
                    </span>
                  </Td>
                  <Td>
                    <StatusCell
                      color={d.active ? "green" : "slate"}
                      label={d.active ? "Active" : "Inactive"}
                    />
                  </Td>
                  <Td>{d.createdAt}</Td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[12px] text-slate-400">
                    {drivers.length === 0 ? "No driver accounts yet — add drivers via Driver Accounts" : "No records match your filter"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

function PayrollReport() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Weekly Total" value="$—" />
        <KpiCard label="Drivers Paid" value="—" />
        <KpiCard label="Avg Stops / Day" value="—" />
        <KpiCard label="Period" value="—" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <p className="text-[15px] font-semibold text-slate-500 mb-2">No payroll data yet</p>
        <p className="text-[13px] text-slate-400">Payroll tracking will be available in a future update.</p>
      </div>
    </div>
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function RoutesReport() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Routes" value="—" />
        <KpiCard label="Coverage" value="—" />
        <KpiCard label="Avg Stops" value="—" />
        <KpiCard label="On-Time Dispatch" value="—" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.05)]">
        <p className="text-[15px] font-semibold text-slate-500 mb-2">No route data yet</p>
        <p className="text-[13px] text-slate-400">Route tracking will be available in a future update.</p>
      </div>
    </div>
  );
}

// ─── View ─────────────────────────────────────────────────────────────────────

export type ReportViewProps = {
  slug: string;
  title: string;
  period: string;
  fleetData: FleetRow[];
  driverData: DriverRow[];
};

export default function ReportView({ slug, title, period, fleetData, driverData }: ReportViewProps) {
  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto flex flex-col gap-6">
        <Link href="/wayne-board" className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1.5">
              742 Logistics · FedEx Ground
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              {title}
            </h1>
            <p className="text-[13px] text-slate-400 mt-1.5">{period}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <GlassSecondaryButton onClick={() => alert("Print coming soon.")}>
              <Printer className="w-3.5 h-3.5" /> Print
            </GlassSecondaryButton>
            <GlassPrimaryButton onClick={() => alert("PDF export coming soon.")}>
              <FileDown className="w-3.5 h-3.5" /> Export PDF
            </GlassPrimaryButton>
          </div>
        </div>

        {slug === "fleet"   && <FleetReport vehicles={fleetData} />}
        {slug === "drivers" && <DriversReport drivers={driverData} />}
        {slug === "payroll" && <PayrollReport />}
        {slug === "routes"  && <RoutesReport />}
      </main>
    </AppShell>
  );
}
