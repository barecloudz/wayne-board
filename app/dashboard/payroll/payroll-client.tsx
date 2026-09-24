"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer, Settings, Upload } from "lucide-react";
import type { PayrollWeekData, PayrollDriverRow, AttendanceStatus } from "@/lib/actions/attendance";
import type { DswDayRow } from "@/lib/actions/dsw-data";
import PayWeekModal from "./pay-week-modal";
import PayrollEditModal, { type PayrollEditTarget } from "./payroll-edit-modal";
import { useLocationContext } from "@/components/location-context";

const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function StatusCell({ status, note }: { status: AttendanceStatus | undefined; note?: string | null }) {
  if (!status || status === "day_off") {
    return <span className="text-slate-200 text-[11px]">—</span>;
  }
  if (status === "work") {
    return (
      <div className="flex flex-col items-center gap-0.5" title={note ?? undefined}>
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)] inline-block" />
        {note && <span className="text-[8px] text-slate-400 leading-none">✎</span>}
      </div>
    );
  }
  if (status === "half_day") {
    return (
      <div className="flex flex-col items-center gap-0.5" title={note ?? undefined}>
        <span className="text-[11px] font-black text-amber-500 leading-none">½</span>
        {note && <span className="text-[8px] text-slate-400 leading-none">✎</span>}
      </div>
    );
  }
  if (status === "cut") {
    return (
      <div className="flex flex-col items-center gap-0.5" title={note ?? undefined}>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100/80 text-slate-500 border border-slate-200/60 backdrop-blur-sm">Cut</span>
        {note && <span className="text-[8px] text-slate-400 leading-none">✎</span>}
      </div>
    );
  }
  if (status === "call_out") {
    return (
      <div className="flex flex-col items-center gap-0.5" title={note ?? undefined}>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-red-50/80 text-red-500 border border-red-200/60 backdrop-blur-sm">Out</span>
        {note && <span className="text-[8px] text-slate-400 leading-none">✎</span>}
      </div>
    );
  }
  if (status === "holiday") {
    return (
      <div className="flex flex-col items-center gap-0.5" title={note ?? undefined}>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-50/80 text-violet-500 border border-violet-200/60 backdrop-blur-sm">Hol</span>
        {note && <span className="text-[8px] text-slate-400 leading-none">✎</span>}
      </div>
    );
  }
  if (status === "trainee") {
    return (
      <div className="flex flex-col items-center gap-0.5" title={note ?? undefined}>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-sky-50/80 text-sky-500 border border-sky-200/60 backdrop-blur-sm">T</span>
        {note && <span className="text-[8px] text-slate-400 leading-none">✎</span>}
      </div>
    );
  }
  return <span className="text-slate-200 text-[11px]">—</span>;
}

function computeRowTotals(attendance: Record<string, AttendanceStatus>) {
  let workDays = 0;
  let traineeDays = 0;
  for (const status of Object.values(attendance)) {
    if (status === "work") workDays += 1;
    else if (status === "half_day") workDays += 0.5;
    else if (status === "trainee") traineeDays += 1;
  }
  return { workDays, traineeDays };
}

function matchDswName(driverName: string, dswNameRaw: string): boolean {
  const dswParts = dswNameRaw.toUpperCase().replace(",", " ").split(/\s+/).filter(Boolean);
  const driverParts = driverName.toUpperCase().split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const p of driverParts) {
    if (dswParts.some(d => d === p)) matches++;
  }
  return matches >= 2;
}

export default function PayrollClient({
  weekData,
  currentOffset,
  payWeekStart,
  dswRows,
  driverLocationMap,
}: {
  weekData: PayrollWeekData;
  currentOffset: number;
  payWeekStart: number;
  dswRows: DswDayRow[];
  driverLocationMap: Record<string, number[]>;
}) {
  const router = useRouter();
  const { locations, selectedLocationIds, allSelected } = useLocationContext();
  const [showPayWeekModal, setShowPayWeekModal] = useState(false);
  const [editTarget, setEditTarget] = useState<PayrollEditTarget | null>(null);
  const weekDates = getWeekDates(weekData.weekStart);
  const weekLabel = `${formatShortDate(weekData.weekStart)} – ${formatShortDate(weekData.weekEnd)}`;

  function navigate(newOffset: number) {
    router.push(`/dashboard/payroll?offset=${newOffset}`);
  }

  // Filter DSW rows by selected location (null = legacy/untagged, always shown)
  const filteredDswRows = (allSelected || locations.length <= 1)
    ? dswRows
    : dswRows.filter(r => r.locationId == null || selectedLocationIds.includes(r.locationId));

  // Build DSW map: driverId -> Map<date, DswDayRow>
  const dswByDriverDate = new Map<string, Map<string, DswDayRow>>();
  for (const driver of weekData.drivers) {
    const driverDsw = new Map<string, DswDayRow>();
    for (const row of filteredDswRows) {
      if (matchDswName(driver.name, row.driverNameRaw)) {
        driverDsw.set(row.date, row);
      }
    }
    if (driverDsw.size > 0) dswByDriverDate.set(driver.driverId, driverDsw);
  }

  // Compute per-day team ILS% from filtered DSW rows (weighted by actDelStps)
  const teamIlsByDate = new Map<string, { pct: number; passes: boolean }>();
  for (const date of weekDates) {
    const dayRows = filteredDswRows.filter(r => r.date === date && r.ilsPct != null);
    if (dayRows.length === 0) continue;
    const totalStops = dayRows.reduce((s, r) => s + (r.actDelStps ?? 0), 0);
    const teamPct = totalStops > 0
      ? dayRows.reduce((s, r) => s + (r.ilsPct ?? 0) * (r.actDelStps ?? 0), 0) / totalStops
      : dayRows.reduce((s, r) => s + (r.ilsPct ?? 0), 0) / dayRows.length;
    teamIlsByDate.set(date, { pct: teamPct, passes: teamPct >= 99 });
  }
  const daysWithData = teamIlsByDate.size;
  const daysPassed = [...teamIlsByDate.values()].filter(v => v.passes).length;

  function matchesLocation(driver: PayrollDriverRow): boolean {
    if (allSelected || locations.length <= 1) return true;
    if (driver.allLocations) return true;
    const assigned = driverLocationMap[driver.driverId] ?? [];
    return assigned.some(id => selectedLocationIds.includes(id));
  }

  const activeDrivers    = weekData.drivers.filter(d => !d.isTerminated && matchesLocation(d));
  const terminatedDrivers = weekData.drivers.filter(d => d.isTerminated && matchesLocation(d));

  return (
    <main className="flex-1 px-6 py-8 max-w-[1280px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8 print:hidden">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">MyGroundOps · Payroll</p>
          <h1 className="text-[32px] font-black text-slate-900 tracking-tight leading-none">Payroll</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">Weekly attendance summary</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/payroll/upload"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold
              bg-white/70 backdrop-blur-sm border border-slate-200/80 text-slate-600
              hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <Upload className="w-3.5 h-3.5" /> DSW Upload
          </Link>
          <button
            onClick={() => setShowPayWeekModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold
              bg-white/70 backdrop-blur-sm border border-slate-200/80 text-slate-600
              hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <Settings className="w-3.5 h-3.5" /> Pay Week
          </button>
          <button
            onClick={() => { window.location.href = `/api/payroll-pdf?offset=${currentOffset}`; }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold
              bg-slate-900 text-white hover:bg-slate-700 shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" /> Download PDF
          </button>
        </div>
      </div>

      {showPayWeekModal && (
        <PayWeekModal initialDay={payWeekStart} onClose={() => setShowPayWeekModal(false)} />
      )}

      {editTarget && (
        <PayrollEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); router.refresh(); }}
        />
      )}

      {/* ── Week nav ── */}
      <div className="flex items-center gap-3 mb-6 print:mb-4">
        <button
          onClick={() => navigate(currentOffset + 1)}
          className="p-2 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200/80 hover:bg-white hover:shadow-sm transition-all print:hidden"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-[17px] font-black text-slate-900">{weekLabel}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {currentOffset === 0 ? "Most recent completed week" : `${currentOffset} week${currentOffset > 1 ? "s" : ""} ago`}
          </p>
        </div>
        <button
          onClick={() => navigate(Math.max(0, currentOffset - 1))}
          disabled={currentOffset === 0}
          className="p-2 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200/80 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all print:hidden"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      <div className="hidden print:block mb-4">
        <p className="text-[18px] font-extrabold">Payroll · {weekLabel}</p>
      </div>

      {locations.length > 1 && !allSelected && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Showing:</span>
          {locations.filter(l => selectedLocationIds.includes(l.id)).map(l => (
            <span key={l.id} className="px-2.5 py-1 rounded-full bg-white/70 text-[11px] font-semibold text-slate-600 border border-slate-200 backdrop-blur-sm">
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* ── Weekly Service Summary ── */}
      {daysWithData > 0 && (
        <div className="mb-5 bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Team Service — {weekLabel}</p>
            <span className={`text-[12px] font-black px-3 py-1 rounded-full ${
              daysPassed === daysWithData ? "bg-emerald-100 text-emerald-700" :
              daysPassed >= daysWithData * 0.8 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            }`}>
              {daysPassed === daysWithData
                ? `${daysPassed}/${daysWithData} ✓ Perfect week`
                : `${daysPassed}/${daysWithData} days ≥99%`}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {weekDates.map(date => {
              const d = new Date(date + "T00:00:00");
              const entry = teamIlsByDate.get(date);
              if (!entry) return (
                <div key={date} className="flex flex-col items-center gap-1 min-w-[52px]">
                  <div className="text-[10px] font-bold text-slate-300 uppercase">{DAY_ABBREVS[d.getDay()]}</div>
                  <div className="text-[10px] text-slate-200">—</div>
                </div>
              );
              const color = entry.pct >= 100 ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                : entry.pct >= 99 ? "text-amber-600 bg-amber-50 border-amber-200"
                : "text-red-600 bg-red-50 border-red-200";
              return (
                <div key={date} className="flex flex-col items-center gap-1 min-w-[52px]">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">{DAY_ABBREVS[d.getDay()]}</div>
                  <div className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${color}`}>
                    {entry.pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weekData.drivers.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/80 p-16 text-center shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
          <p className="text-[15px] font-semibold text-slate-500">No attendance records for this week</p>
          <p className="text-[13px] text-slate-400 mt-1">Log attendance from the Scheduling page to start tracking.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <PayrollTable
            drivers={activeDrivers}
            weekDates={weekDates}
            dswByDriverDate={dswByDriverDate}
            deductionAmount={weekData.deductionAmount}
            onCellClick={setEditTarget}
          />
          {terminatedDrivers.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mt-2">Terminated</p>
              <PayrollTable
                drivers={terminatedDrivers}
                weekDates={weekDates}
                dswByDriverDate={dswByDriverDate}
                deductionAmount={weekData.deductionAmount}
                onCellClick={setEditTarget}
                dimmed
              />
            </>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      {weekData.drivers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 print:hidden">
          {[
            { dot: <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />, label: "Work" },
            { dot: <span className="text-[11px] font-black text-amber-500">½</span>, label: "Half Day" },
            { dot: <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100/80 text-slate-500 border border-slate-200/60">Cut</span>, label: "Cut" },
            { dot: <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-red-50/80 text-red-500 border border-red-200/60">Out</span>, label: "Called out" },
            { dot: <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-sky-50/80 text-sky-500 border border-sky-200/60">T</span>, label: "Trainee" },
            { dot: <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-50/80 text-violet-500 border border-violet-200/60">Hol</span>, label: "Holiday" },
          ].map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200/60 text-[11px] text-slate-500 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              {dot}
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          @page { size: landscape; margin: 0.5in; }
          .print\\:hidden { display: none !important; }
          .print\\:mb-4 { margin-bottom: 1rem !important; }
          .print\\:block { display: block !important; }
          body { font-size: 11px; }
          tr { page-break-inside: avoid; }
          /* Unclip AppShell scroll containers so the full table prints */
          html, body { overflow: visible !important; height: auto !important; }
          .flex.h-screen { height: auto !important; overflow: visible !important; }
          .overflow-y-auto { overflow: visible !important; height: auto !important; }
          aside { display: none !important; }
          /* Force background colors on code breakdown badges */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </main>
  );
}

// ── Payroll table sub-component ───────────────────────────────────────────────

function PayrollTable({
  drivers,
  weekDates,
  dswByDriverDate,
  deductionAmount,
  dimmed = false,
  onCellClick,
}: {
  drivers: PayrollDriverRow[];
  weekDates: string[];
  dswByDriverDate: Map<string, Map<string, DswDayRow>>;
  deductionAmount: number;
  dimmed?: boolean;
  onCellClick?: (target: import("./payroll-edit-modal").PayrollEditTarget) => void;
}) {
  if (drivers.length === 0) return null;

  return (
    <div className={`rounded-2xl overflow-hidden border border-slate-200/70 shadow-[0_2px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] ${dimmed ? "opacity-60" : ""}`}>
      {/* Glass header */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/60">
              <th className="text-left px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-[180px]">Driver</th>
              {weekDates.map((dateStr) => {
                const d = new Date(dateStr + "T00:00:00");
                return (
                  <th key={dateStr} className="px-2 py-3.5 text-center min-w-[52px]">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{DAY_ABBREVS[d.getDay()]}</div>
                    <div className="text-[9px] font-normal text-slate-300 mt-0.5">{formatShortDate(dateStr)}</div>
                  </th>
                );
              })}
              <th className="px-3 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center min-w-[52px]">Days</th>
              <th className="px-3 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center min-w-[52px]">T</th>
              <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left min-w-[140px]">Notes</th>
            </tr>
          </thead>
          <tbody className="bg-white/80 backdrop-blur-sm divide-y divide-slate-100/80">
            {drivers.map((driver) => {
              const { workDays, traineeDays } = computeRowTotals(driver.attendance);
              const showDeduction = driver.isTerminated && driver.terminationType === "notice";
              const driverDsw = dswByDriverDate.get(driver.driverId);
              const hasDsw = driverDsw && driverDsw.size > 0;

              return (
                <>
                  {/* Main attendance row */}
                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[13px] text-slate-800">{driver.name}</span>
                        {showDeduction && (
                          <span className="text-[10px] font-bold text-red-500">−${deductionAmount} · No Notice</span>
                        )}
                        {driver.terminationNote && (
                          <span className="text-[10px] text-slate-400 italic">{driver.terminationNote}</span>
                        )}
                      </div>
                    </td>
                    {weekDates.map((dateStr) => {
                      const status = driver.attendance[dateStr];
                      const bg =
                        status === "call_out" ? "bg-red-50/60"
                        : status === "half_day" ? "bg-amber-50/60"
                        : status === "cut" ? "bg-slate-100/60"
                        : status === "holiday" ? "bg-violet-50/40"
                        : status === "trainee" ? "bg-sky-50/60"
                        : "";
                      return (
                        <td
                          key={dateStr}
                          className={`px-2 py-3 text-center ${bg} ${onCellClick ? "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-slate-300 hover:bg-slate-50/80 transition-all" : ""}`}
                          onClick={() => onCellClick?.({
                            driverId: driver.driverId,
                            driverName: driver.name,
                            date: dateStr,
                            currentStatus: status,
                            currentNote: driver.notes[dateStr],
                            isInferred: driver.inferredDates.includes(dateStr),
                            isDriverTrainee: driver.isTrainee,
                          })}
                        >
                          <StatusCell status={status} note={driver.notes[dateStr]} />
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className="text-[14px] font-black text-slate-800">
                        {workDays % 1 === 0 ? workDays : workDays.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {traineeDays > 0
                        ? <span className="text-[13px] font-bold text-sky-500">{traineeDays}</span>
                        : <span className="text-slate-200">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5">
                        {weekDates.map((dateStr) => {
                          const note = driver.notes[dateStr];
                          if (!note) return null;
                          const status = driver.attendance[dateStr];
                          const d = new Date(dateStr + "T00:00:00");
                          return (
                            <span key={dateStr} className="text-[11px] text-slate-500 leading-snug">
                              <span className="font-semibold text-slate-600">{DAY_ABBREVS[d.getDay()]}: </span>
                              {note}{status === "half_day" && " (½)"}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>

                  {/* DSW sub-row: ILS% + impact packages */}
                  {hasDsw && (
                    <tr className="bg-slate-50/40">
                      <td className="px-5 py-1 pl-6">
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">ILS%</span>
                      </td>
                      {weekDates.map((dateStr) => {
                        const dsw = driverDsw.get(dateStr);
                        if (!dsw || dsw.ilsPct == null) {
                          return <td key={dateStr} className="px-2 py-1 text-center"><span className="text-slate-200 text-[9px]">—</span></td>;
                        }
                        const color = dsw.ilsPct >= 100 ? "text-emerald-500" : dsw.ilsPct >= 99 ? "text-amber-500" : "text-red-500";
                        const impact = dsw.pldImpactPkgs ?? 0;
                        const ghost  = dsw.pldGhostPkgs  ?? 0;
                        const tipParts = [`ILS: ${dsw.ilsPct}%`];
                        if (impact > 0) tipParts.push(`${impact} impact pkg${impact !== 1 ? "s" : ""}`);
                        if (ghost > 0)  tipParts.push(`${ghost} never scanned`);
                        if (dsw.codeBreakdown) tipParts.push(Object.entries(dsw.codeBreakdown).map(([k, v]) => `${v}×${k}`).join(", "));
                        const breakdown = dsw.codeBreakdown ? Object.entries(dsw.codeBreakdown) : [];
                        return (
                          <td key={dateStr} className="px-2 py-1 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-[10px] font-bold ${color}`}>{dsw.ilsPct}%</span>
                              {impact > 0 && (
                                <span className="text-[8px] font-bold text-red-400 leading-none">
                                  {impact}pkg{ghost > 0 ? ` +${ghost}👻` : ""}
                                </span>
                              )}
                              {breakdown.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                                  {breakdown.map(([code, count]) => (
                                    <span key={code} className="text-[8px] font-black text-red-500 bg-red-50 border border-red-200 rounded px-0.5 leading-tight">
                                      {count}×{code}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-1 text-center">
                        {(() => {
                          const vals = weekDates.map(d => driverDsw.get(d)?.ilsPct).filter((v): v is number => v != null);
                          if (!vals.length) return null;
                          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                          const totalImpact = weekDates.reduce((s, d) => s + (driverDsw.get(d)?.pldImpactPkgs ?? 0), 0);
                          const color = avg >= 100 ? "text-emerald-500" : avg >= 99 ? "text-amber-500" : "text-red-500";
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-[10px] font-bold ${color}`}>{avg.toFixed(1)}%</span>
                              {totalImpact > 0 && <span className="text-[8px] font-bold text-red-400 leading-none">{totalImpact}pkg</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td /><td />
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
