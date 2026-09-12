"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer, Settings, Upload } from "lucide-react";
import type { PayrollWeekData, AttendanceStatus } from "@/lib/actions/attendance";
import type { DswDayRow } from "@/lib/actions/dsw-data";
import PayWeekModal from "./pay-week-modal";

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
}: {
  weekData: PayrollWeekData;
  currentOffset: number;
  payWeekStart: number;
  dswRows: DswDayRow[];
}) {
  const router = useRouter();
  const [showPayWeekModal, setShowPayWeekModal] = useState(false);
  const weekDates = getWeekDates(weekData.weekStart);
  const weekLabel = `${formatShortDate(weekData.weekStart)} – ${formatShortDate(weekData.weekEnd)}`;

  function navigate(newOffset: number) {
    router.push(`/dashboard/payroll?offset=${newOffset}`);
  }

  // Build DSW map: driverId -> Map<date, DswDayRow>
  const dswByDriverDate = new Map<string, Map<string, DswDayRow>>();
  for (const driver of weekData.drivers) {
    const driverDsw = new Map<string, DswDayRow>();
    for (const row of dswRows) {
      if (matchDswName(driver.name, row.driverNameRaw)) {
        driverDsw.set(row.date, row);
      }
    }
    if (driverDsw.size > 0) dswByDriverDate.set(driver.driverId, driverDsw);
  }

  const activeDrivers    = weekData.drivers.filter(d => !d.isTerminated);
  const terminatedDrivers = weekData.drivers.filter(d => d.isTerminated);

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
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold
              bg-slate-900 text-white hover:bg-slate-700 shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {showPayWeekModal && (
        <PayWeekModal initialDay={payWeekStart} onClose={() => setShowPayWeekModal(false)} />
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
          />
          {terminatedDrivers.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mt-2">Terminated</p>
              <PayrollTable
                drivers={terminatedDrivers}
                weekDates={weekDates}
                dswByDriverDate={dswByDriverDate}
                deductionAmount={weekData.deductionAmount}
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
        }
      `}</style>
    </main>
  );
}

// ── Payroll table sub-component ───────────────────────────────────────────────

import type { PayrollDriverRow } from "@/lib/actions/attendance";

function PayrollTable({
  drivers,
  weekDates,
  dswByDriverDate,
  deductionAmount,
  dimmed = false,
}: {
  drivers: PayrollDriverRow[];
  weekDates: string[];
  dswByDriverDate: Map<string, Map<string, DswDayRow>>;
  deductionAmount: number;
  dimmed?: boolean;
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
                        <td key={dateStr} className={`px-2 py-3 text-center ${bg}`}>
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

                  {/* DSW ILS% sub-row */}
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
                        const tip = dsw.codeBreakdown
                          ? `ILS: ${dsw.ilsPct}% · ${Object.entries(dsw.codeBreakdown).map(([k, v]) => `${v}×${k}`).join(", ")}`
                          : `ILS: ${dsw.ilsPct}%`;
                        return (
                          <td key={dateStr} className="px-2 py-1 text-center" title={tip}>
                            <span className={`text-[10px] font-bold ${color}`}>{dsw.ilsPct}%</span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-1 text-center">
                        {(() => {
                          const vals = weekDates.map(d => driverDsw.get(d)?.ilsPct).filter((v): v is number => v != null);
                          if (!vals.length) return null;
                          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                          const color = avg >= 100 ? "text-emerald-500" : avg >= 99 ? "text-amber-500" : "text-red-500";
                          return <span className={`text-[10px] font-bold ${color}`}>{avg.toFixed(1)}%</span>;
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
