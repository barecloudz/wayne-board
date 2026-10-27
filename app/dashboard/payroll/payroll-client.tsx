"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer, Settings, Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
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
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500 text-white border border-emerald-600">ON</span>
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
    if (dswParts.some(d =>
      d === p ||
      (p.length >= 3 && d.startsWith(p)) ||
      (d.length >= 3 && p.startsWith(d))
    )) matches++;
  }
  return matches >= 2;
}

type RydeRow = { driverId: string; stars: number | null; reviewDate: string | null };
type PpodRow = { driverId: string | null; driverNameRaw: string; date: string | Date; ppodPct: number | null };

export default function PayrollClient({
  weekData,
  currentOffset,
  payWeekStart,
  dswRows,
  driverLocationMap,
  rydeRows = [],
  ppodRows = [],
}: {
  weekData: PayrollWeekData;
  currentOffset: number;
  payWeekStart: number;
  dswRows: DswDayRow[];
  driverLocationMap: Record<string, number[]>;
  rydeRows?: RydeRow[];
  ppodRows?: PpodRow[];
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

  function exportXlsx() {
    const STATUS_LABELS: Record<string, string> = {
      work: "Work", half_day: "Half Day", cut: "Cut",
      call_out: "Called Out", holiday: "Holiday", trainee: "Trainee", day_off: "",
    };

    const headers = ["Driver", "FedEx ID",
      ...weekDates.map(d => { const dt = new Date(d + "T00:00:00"); return `${DAY_ABBREVS[dt.getDay()]} ${formatShortDate(d)}`; }),
      "Days", "Trainee Days", "Notes",
    ];

    const allDrivers = [...weekData.drivers.filter(d => !d.isTerminated && matchesLocation(d)),
                        ...weekData.drivers.filter(d => d.isTerminated && matchesLocation(d))];

    const rows = allDrivers.map(driver => {
      const { workDays, traineeDays } = computeRowTotals(driver.attendance);
      const dayCells = weekDates.map(date => STATUS_LABELS[driver.attendance[date] ?? ""] ?? "");
      const noteText = weekDates
        .filter(date => driver.notes[date])
        .map(date => { const dt = new Date(date + "T00:00:00"); return `${DAY_ABBREVS[dt.getDay()]}: ${driver.notes[date]}`; })
        .join(" | ");
      return [driver.name, driver.driverId, ...dayCells,
        workDays % 1 === 0 ? workDays : parseFloat(workDays.toFixed(1)),
        traineeDays || "",
        noteText,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 22 }, { wch: 10 }, ...weekDates.map(() => ({ wch: 12 })), { wch: 7 }, { wch: 7 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll_${weekData.weekStart}.xlsx`);
  }

  // Filter DSW rows by selected location (null = legacy/untagged, always shown)
  const filteredDswRows = (allSelected || locations.length <= 1)
    ? dswRows
    : dswRows.filter(r => r.locationId == null || selectedLocationIds.includes(r.locationId));

  // Build DSW map: driverId -> Map<date, DswDayRow>
  // Use stored driverId first (set at upload); fall back to name matching for legacy rows without one.
  const dswByDriverDate = new Map<string, Map<string, DswDayRow>>();
  for (const driver of weekData.drivers) {
    const driverDsw = new Map<string, DswDayRow>();
    for (const row of filteredDswRows) {
      const matched = row.driverId
        ? row.driverId === driver.driverId
        : matchDswName(driver.name, row.driverNameRaw);
      if (matched) driverDsw.set(row.date, row);
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

  // Build ryde map: driverId -> date -> { ones, fives, total }
  const rydeByDriverDate = new Map<string, Map<string, { ones: number; fives: number; total: number }>>();
  for (const r of rydeRows) {
    if (!r.reviewDate) continue;
    const date = r.reviewDate.slice(0, 10);
    if (!rydeByDriverDate.has(r.driverId)) rydeByDriverDate.set(r.driverId, new Map());
    const dm = rydeByDriverDate.get(r.driverId)!;
    const cur = dm.get(date) ?? { ones: 0, fives: 0, total: 0 };
    cur.total++;
    if (r.stars === 1) cur.ones++;
    if (r.stars === 5) cur.fives++;
    dm.set(date, cur);
  }

  // Build PPOD map: driverId -> date -> ppodPct
  const ppodByDriverDate = new Map<string, Map<string, number>>();
  for (const driver of weekData.drivers) {
    const driverPpod = new Map<string, number>();
    for (const row of ppodRows) {
      const rowDate = typeof row.date === "string" ? row.date.slice(0, 10) : (row.date as Date).toISOString().slice(0, 10);
      const matched = row.driverId
        ? row.driverId === driver.driverId
        : matchDswName(driver.name, row.driverNameRaw);
      if (matched && row.ppodPct != null) driverPpod.set(rowDate, row.ppodPct);
    }
    if (driverPpod.size > 0) ppodByDriverDate.set(driver.driverId, driverPpod);
  }

  const activeDrivers    = weekData.drivers.filter(d => !d.isTerminated && matchesLocation(d));
  const terminatedDrivers = weekData.drivers.filter(d => d.isTerminated && matchesLocation(d));

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalWorkDays = activeDrivers.reduce((sum, d) => sum + computeRowTotals(d.attendance).workDays, 0);
  const teamIlsAvg = teamIlsByDate.size > 0
    ? [...teamIlsByDate.values()].reduce((s, v) => s + v.pct, 0) / teamIlsByDate.size
    : null;
  const rydeFives = rydeRows.filter(r => r.stars === 5).length;
  const rydeOnes  = rydeRows.filter(r => r.stars === 1).length;

  return (
    <main className="flex-1 px-6 py-8 max-w-[1400px] w-full mx-auto">

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

      {/* ── Dark hero banner ── */}
      <div className="print:hidden relative rounded-2xl overflow-hidden mb-6 bg-slate-900 shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:"repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)"}} />
        <div className="relative px-7 py-6 flex items-center justify-between gap-6">
          {/* Left: title + week nav */}
          <div className="flex items-center gap-5 min-w-0">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">MyGroundOps · Payroll</p>
              <h1 className="text-[26px] font-black text-white tracking-tight leading-none">Payroll</h1>
            </div>
            <div className="w-px h-10 bg-slate-700" />
            {/* Week navigator */}
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(currentOffset + 1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all">
                <ChevronLeft className="w-4 h-4 text-slate-300" />
              </button>
              <div className="text-center min-w-[160px]">
                <p className="text-[15px] font-black text-white leading-tight">{weekLabel}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {currentOffset === 0 ? "Most recent week" : `${currentOffset}w ago`}
                </p>
              </div>
              <button onClick={() => navigate(Math.max(0, currentOffset - 1))} disabled={currentOffset === 0}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all disabled:opacity-30">
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            </div>
          </div>
          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/dashboard/payroll/upload"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all">
              <Upload className="w-3.5 h-3.5" /> DSW
            </Link>
            <button onClick={() => setShowPayWeekModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all">
              <Settings className="w-3.5 h-3.5" /> Pay Week
            </button>
            <button onClick={exportXlsx}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.3)] transition-all">
              <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
            </button>
            <button onClick={() => { window.location.href = `/api/payroll-pdf?offset=${currentOffset}`; }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold bg-white text-slate-900 hover:bg-slate-100 shadow-sm transition-all">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <p className="text-[18px] font-extrabold">Payroll · {weekLabel}</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 print:hidden">
        {/* Drivers */}
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Drivers</p>
          <p className="text-[32px] font-black text-slate-900 leading-none">{activeDrivers.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">active this week</p>
        </div>
        {/* Work days */}
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Work Days</p>
          <p className="text-[32px] font-black text-slate-900 leading-none">{totalWorkDays % 1 === 0 ? totalWorkDays : totalWorkDays.toFixed(1)}</p>
          <p className="text-[11px] text-slate-400 mt-1">total across team</p>
        </div>
        {/* Team ILS */}
        <div className={`rounded-2xl border px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)] ${
          teamIlsAvg == null ? "bg-white border-slate-100" :
          teamIlsAvg >= 99 ? "bg-emerald-50 border-emerald-100" :
          teamIlsAvg >= 97 ? "bg-amber-50 border-amber-100" :
          "bg-red-50 border-red-100"
        }`}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Team ILS</p>
          {teamIlsAvg != null ? (
            <>
              <p className={`text-[32px] font-black leading-none ${
                teamIlsAvg >= 99 ? "text-emerald-600" : teamIlsAvg >= 97 ? "text-amber-600" : "text-red-600"
              }`}>{teamIlsAvg.toFixed(1)}%</p>
              <p className="text-[11px] text-slate-400 mt-1">{daysPassed}/{daysWithData} days ≥99%</p>
            </>
          ) : (
            <><p className="text-[32px] font-black text-slate-200 leading-none">—</p><p className="text-[11px] text-slate-400 mt-1">no data uploaded</p></>
          )}
        </div>
        {/* Ryde */}
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ryde Reviews</p>
          <p className="text-[32px] font-black text-slate-900 leading-none">{rydeRows.length}</p>
          <div className="flex items-center gap-2 mt-1">
            {rydeFives > 0 && <span className="text-[11px] font-bold text-emerald-600">{rydeFives}×★5</span>}
            {rydeOnes  > 0 && <span className="text-[11px] font-bold text-red-500">{rydeOnes}×★1</span>}
            {rydeRows.length === 0 && <span className="text-[11px] text-slate-400">this week</span>}
          </div>
        </div>
      </div>

      {locations.length > 1 && !allSelected && (
        <div className="flex items-center gap-2 mb-4 flex-wrap print:hidden">
          <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Showing:</span>
          {locations.filter(l => selectedLocationIds.includes(l.id)).map(l => (
            <span key={l.id} className="px-2.5 py-1 rounded-full bg-white/70 text-[11px] font-semibold text-slate-600 border border-slate-200 backdrop-blur-sm">
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* ── Team ILS day-by-day ── */}
      {daysWithData > 0 && (
        <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.05)] overflow-hidden print:hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-50">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Team ILS — Day by Day</p>
            <span className={`text-[11px] font-black px-3 py-1 rounded-full ${
              daysPassed === daysWithData ? "bg-emerald-100 text-emerald-700" :
              daysPassed >= daysWithData * 0.8 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            }`}>
              {daysPassed === daysWithData ? `✓ Perfect — ${daysPassed}/${daysWithData}` : `${daysPassed}/${daysWithData} days ≥99%`}
            </span>
          </div>
          <div className="px-5 py-4 flex gap-3">
            {weekDates.map(date => {
              const d = new Date(date + "T00:00:00");
              const entry = teamIlsByDate.get(date);
              if (!entry) return (
                <div key={date} className="flex-1 flex flex-col items-center gap-2 min-w-[48px]">
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">{DAY_ABBREVS[d.getDay()]}</p>
                  <div className="w-full h-1.5 rounded-full bg-slate-100" />
                  <p className="text-[10px] text-slate-300">—</p>
                </div>
              );
              const barColor = entry.pct >= 100 ? "bg-emerald-500" : entry.pct >= 99 ? "bg-amber-400" : "bg-red-500";
              const textColor = entry.pct >= 100 ? "text-emerald-600" : entry.pct >= 99 ? "text-amber-600" : "text-red-600";
              const barPct = Math.min(100, Math.max(0, (entry.pct - 95) / 5 * 100));
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-2 min-w-[48px]">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{DAY_ABBREVS[d.getDay()]}</p>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{width:`${barPct}%`}} />
                  </div>
                  <p className={`text-[12px] font-black ${textColor}`}>{entry.pct.toFixed(1)}%</p>
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
            rydeByDriverDate={rydeByDriverDate}
            ppodByDriverDate={ppodByDriverDate}
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
                rydeByDriverDate={rydeByDriverDate}
                ppodByDriverDate={ppodByDriverDate}
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
            { dot: <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500 text-white border border-emerald-600">ON</span>, label: "Work" },
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
  rydeByDriverDate,
  ppodByDriverDate,
  deductionAmount,
  dimmed = false,
  onCellClick,
}: {
  drivers: PayrollDriverRow[];
  weekDates: string[];
  dswByDriverDate: Map<string, Map<string, DswDayRow>>;
  rydeByDriverDate: Map<string, Map<string, { ones: number; fives: number; total: number }>>;
  ppodByDriverDate: Map<string, Map<string, number>>;
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
            {drivers.map((driver, driverIdx) => {
              const { workDays, traineeDays } = computeRowTotals(driver.attendance);
              const showDeduction = driver.isTerminated && driver.terminationType === "notice";
              const driverDsw = dswByDriverDate.get(driver.driverId);
              const hasDsw = driverDsw && driverDsw.size > 0;
              const driverRyde = rydeByDriverDate.get(driver.driverId);
              const hasRyde = driverRyde && driverRyde.size > 0;
              const driverPpod = ppodByDriverDate.get(driver.driverId);
              const hasPpod = driverPpod && driverPpod.size > 0;

              return (
                <>
                  {/* Spacer between driver groups */}
                  {driverIdx > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={20} className="py-1.5 bg-slate-100/60 border-t border-b border-slate-200/60" />
                    </tr>
                  )}
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
                        const color = dsw.ilsPct >= 100 ? "text-emerald-600" : dsw.ilsPct >= 99 ? "text-amber-600" : "text-red-600";
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
                              <span className={`text-[11px] font-black ${color}`}>{dsw.ilsPct}%</span>
                              {impact > 0 && (
                                <span className="text-[8px] font-bold text-red-400 leading-none">
                                  {impact}pkg{ghost > 0 ? ` +${ghost}✗` : ""}
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
                          const color = avg >= 100 ? "text-emerald-600" : avg >= 99 ? "text-amber-600" : "text-red-600";
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-[11px] font-black ${color}`}>{avg.toFixed(1)}%</span>
                              {totalImpact > 0 && <span className="text-[8px] font-bold text-red-400 leading-none">{totalImpact}pkg</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td /><td />
                    </tr>
                  )}

                  {/* Ryde sub-row: per-day star breakdown */}
                  {hasRyde && (
                    <tr className="bg-amber-50/30">
                      <td className="px-5 py-1 pl-6">
                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Ryde</span>
                      </td>
                      {weekDates.map((dateStr) => {
                        const r = driverRyde!.get(dateStr);
                        if (!r) return <td key={dateStr} className="px-2 py-1 text-center"><span className="text-slate-200 text-[9px]">—</span></td>;
                        return (
                          <td key={dateStr} className="px-2 py-1 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              {r.fives > 0 && (
                                <span className="text-[9px] font-black text-emerald-600 leading-none">
                                  {r.fives}★5
                                </span>
                              )}
                              {r.ones > 0 && (
                                <span className="text-[9px] font-black text-red-500 leading-none">
                                  {r.ones}★1
                                </span>
                              )}
                              {r.ones === 0 && r.fives === 0 && r.total > 0 && (
                                <span className="text-[9px] font-bold text-slate-400 leading-none">{r.total}★</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-1 text-center">
                        {(() => {
                          const totals = weekDates.reduce((acc, d) => {
                            const r = driverRyde!.get(d);
                            if (!r) return acc;
                            return { ones: acc.ones + r.ones, fives: acc.fives + r.fives, total: acc.total + r.total };
                          }, { ones: 0, fives: 0, total: 0 });
                          if (!totals.total) return null;
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              {totals.fives > 0 && <span className="text-[9px] font-black text-emerald-600 leading-none">{totals.fives}★5</span>}
                              {totals.ones > 0 && <span className="text-[9px] font-black text-red-500 leading-none">{totals.ones}★1</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td /><td />
                    </tr>
                  )}

                  {/* PPOD sub-row: per-day PPOD% */}
                  {hasPpod && (
                    <tr className="bg-cyan-50/30">
                      <td className="px-5 py-1 pl-6">
                        <span className="text-[9px] font-bold text-cyan-500 uppercase tracking-widest">PPOD</span>
                      </td>
                      {weekDates.map((dateStr) => {
                        const pct = driverPpod!.get(dateStr);
                        if (pct == null) return <td key={dateStr} className="px-2 py-1 text-center"><span className="text-slate-200 text-[9px]">—</span></td>;
                        const color = pct >= 99 ? "text-emerald-600" : pct >= 95 ? "text-amber-600" : "text-red-600";
                        return (
                          <td key={dateStr} className="px-2 py-1 text-center">
                            <span className={`text-[11px] font-black ${color}`}>{pct.toFixed(1)}%</span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-1 text-center">
                        {(() => {
                          const vals = weekDates.map((d) => driverPpod!.get(d)).filter((v): v is number => v != null);
                          if (!vals.length) return null;
                          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                          const color = avg >= 99 ? "text-emerald-600" : avg >= 95 ? "text-amber-600" : "text-red-600";
                          return <span className={`text-[11px] font-black ${color}`}>{avg.toFixed(1)}%</span>;
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
