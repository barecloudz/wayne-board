"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import type { PayrollWeekData, AttendanceStatus } from "@/lib/actions/attendance";

const WEEK_DAY_LABELS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

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
  if (!status || status === "day_off") return <span className="text-slate-300 text-[11px]">—</span>;
  if (status === "work") return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-emerald-500 text-[16px] font-bold leading-none" title={note ?? undefined}>●</span>
      {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
    </div>
  );
  if (status === "half_day") return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-yellow-600 text-[13px] font-extrabold leading-none" title={note ?? undefined}>½</span>
      {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
    </div>
  );
  if (status === "cut") return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200" title={note ?? undefined}>Cut</span>
      {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
    </div>
  );
  if (status === "call_out") return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200" title={note ?? undefined}>Out</span>
      {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
    </div>
  );
  if (status === "trainee") return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200" title={note ?? undefined}>T</span>
      {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
    </div>
  );
  return <span className="text-slate-300 text-[11px]">—</span>;
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

export default function PayrollClient({ weekData, currentOffset }: { weekData: PayrollWeekData; currentOffset: number }) {
  const router = useRouter();
  const weekDates = getWeekDates(weekData.weekStart);
  const weekLabel = `${formatShortDate(weekData.weekStart)} – ${formatShortDate(weekData.weekEnd)}`;

  function navigate(newOffset: number) {
    router.push(`/dashboard/payroll?offset=${newOffset}`);
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">
      <div className="flex items-start justify-between mb-8 print:hidden">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Payroll</h1>
          <p className="text-[14px] text-slate-400 mt-2">Weekly attendance for payroll processing. Print this page and review with your records.</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6 print:mb-4">
        <button onClick={() => navigate(currentOffset + 1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors print:hidden" title="Previous week">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-[16px] font-extrabold text-slate-900">{weekLabel}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {currentOffset === 0 ? "Most recent completed week" : `${currentOffset} week${currentOffset > 1 ? "s" : ""} ago`}
          </p>
        </div>
        <button onClick={() => navigate(Math.max(0, currentOffset - 1))} disabled={currentOffset === 0} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors print:hidden" title="Next week">
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      <div className="hidden print:block mb-4">
        <p className="text-[18px] font-extrabold">Payroll · {weekLabel}</p>
      </div>

      {weekData.drivers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[15px] font-semibold text-slate-500">No attendance records for this week</p>
          <p className="text-[13px] text-slate-400 mt-1">Log Cut, Call Out, or Half Day from the Scheduling page to start tracking attendance.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider min-w-[160px]">Driver</th>
                  {WEEK_DAY_LABELS.map((day, i) => (
                    <th key={day} className="px-3 py-3 text-center min-w-[56px]">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{day}</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">{formatShortDate(weekDates[i])}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center min-w-[60px]">Days</th>
                  <th className="px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center min-w-[60px]">Trainee</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left min-w-[120px]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {weekData.drivers.map((driver) => {
                  const { workDays, traineeDays } = computeRowTotals(driver.attendance);
                  const showDeduction = driver.isTerminated && driver.terminationType === "notice";
                  return (
                    <tr key={driver.driverId} className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/40">
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">{driver.name}</span>
                            {driver.isTerminated && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100">Terminated</span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{driver.driverId}</span>
                          {driver.terminationNote && <span className="text-[11px] text-slate-400 italic">{driver.terminationNote}</span>}
                          {showDeduction && <span className="text-[11px] font-bold text-red-600 mt-0.5">−${weekData.deductionAmount} · No Notice</span>}
                        </div>
                      </td>
                      {weekDates.map((dateStr) => (
                        <td key={dateStr} className="px-3 py-3 text-center">
                          <StatusCell status={driver.attendance[dateStr]} note={driver.notes[dateStr]} />
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        <span className="text-[13px] font-bold text-slate-800">{workDays % 1 === 0 ? workDays : workDays.toFixed(1)}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {traineeDays > 0 ? <span className="text-[13px] font-bold text-blue-600">{traineeDays}</span> : <span className="text-slate-300 text-[11px]">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          {weekDates.map((dateStr, i) => {
                            const note = driver.notes[dateStr];
                            if (!note) return null;
                            const status = driver.attendance[dateStr];
                            return (
                              <span key={dateStr} className="text-[11px] text-slate-500">
                                <span className="font-semibold text-slate-600 mr-1">{WEEK_DAY_LABELS[i]}:</span>
                                {note}{status === "half_day" && " (half day)"}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-500 print:hidden">
            <span className="flex items-center gap-1.5"><span className="text-emerald-500 font-bold text-[14px] leading-none">●</span> Work</span>
            <span className="flex items-center gap-1.5"><span className="font-extrabold text-yellow-600">½</span> Half Day (0.5)</span>
            <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold">Cut</span> Management cut</span>
            <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-bold">Out</span> Called out</span>
            <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200 font-bold">T</span> Trainee day</span>
            <span className="flex items-center gap-1.5">📝 Note — hover to read</span>
          </div>
        </div>
      )}

      <style>{`
        @media print {
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
