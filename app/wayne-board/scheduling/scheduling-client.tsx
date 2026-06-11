"use client";

import { useState, useTransition } from "react";
import {
  Calendar, Clock, ChevronDown, ChevronUp, Plus, Trash2,
  Loader2, Check, AlertTriangle, Pencil, X,
} from "lucide-react";
import { upsertSchedule, addTimeOff, updateTimeOff, deleteTimeOff } from "@/lib/actions/scheduling";
import { addDays, format, parseISO, isWithinInterval } from "date-fns";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "Monday",    short: "M"  },
  { key: "tue", label: "Tuesday",   short: "T"  },
  { key: "wed", label: "Wednesday", short: "W"  },
  { key: "thu", label: "Thursday",  short: "Th" },
  { key: "fri", label: "Friday",    short: "F"  },
  { key: "sat", label: "Saturday",  short: "Sa" },
  { key: "sun", label: "Sunday",    short: "Su" },
];

// Day index: 0=Sun,1=Mon...6=Sat  — JS getDay()
const JS_DAY_TO_KEY: Record<number, DayKey> = {
  1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun",
};

type ScheduleRow = {
  driverId: string;
  name: string;
  active: boolean;
  schedule: {
    mon: boolean; tue: boolean; wed: boolean; thu: boolean;
    fri: boolean; sat: boolean; sun: boolean; notes: string | null;
  } | null;
};

type TimeOffRow = {
  id: number;
  driverId: string;
  name: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  note: string | null;
  createdAt: Date | null;
};

type CoverageRow = {
  driverId: string;
  name: string | null;
  startDate: string;
  endDate: string;
  reason: string;
};

const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

export default function SchedulingClient({
  schedules, timeOff, coverageTimeOff, today,
}: {
  schedules: ScheduleRow[];
  timeOff: TimeOffRow[];
  coverageTimeOff: CoverageRow[];
  today: string;
}) {
  const [tab, setTab] = useState<"schedules" | "timeoff" | "coverage">("schedules");
  const [isPending, startTransition] = useTransition();

  // ── Schedule editing ──────────────────────────────────────────────────────
  // Local draft state per driver: driverId -> days object
  const [drafts, setDrafts] = useState<Record<string, Record<DayKey, boolean>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId]   = useState<string | null>(null);

  function getDays(row: ScheduleRow): Record<DayKey, boolean> {
    if (drafts[row.driverId]) return drafts[row.driverId];
    const s = row.schedule;
    return {
      mon: s?.mon ?? false, tue: s?.tue ?? false, wed: s?.wed ?? false,
      thu: s?.thu ?? false, fri: s?.fri ?? false, sat: s?.sat ?? false, sun: s?.sun ?? false,
    };
  }

  function toggleDay(driverId: string, day: DayKey, current: Record<DayKey, boolean>) {
    setDrafts((prev) => ({
      ...prev,
      [driverId]: { ...current, [day]: !current[day] },
    }));
  }

  function saveSchedule(driverId: string) {
    const days = drafts[driverId];
    if (!days) return;
    setSavingId(driverId);
    startTransition(async () => {
      await upsertSchedule(driverId, days);
      setSavingId(null);
      setSavedId(driverId);
      setDrafts((prev) => { const n = { ...prev }; delete n[driverId]; return n; });
      setTimeout(() => setSavedId(null), 2000);
    });
  }

  // ── Time off ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]   = useState(false);
  const [editEntry, setEditEntry] = useState<TimeOffRow | null>(null);
  const [toDriverId, setToDriverId] = useState("");
  const [toStart, setToStart]   = useState("");
  const [toEnd, setToEnd]       = useState("");
  const [toReason, setToReason] = useState("");
  const [toNote, setToNote]     = useState("");

  function openAdd() {
    setToDriverId(""); setToStart(""); setToEnd(""); setToReason(""); setToNote("");
    setEditEntry(null);
    setShowAdd(true);
  }

  function openEdit(entry: TimeOffRow) {
    setToDriverId(entry.driverId);
    setToStart(entry.startDate);
    setToEnd(entry.endDate);
    setToReason(entry.reason);
    setToNote(entry.note ?? "");
    setEditEntry(entry);
    setShowAdd(true);
  }

  function handleSaveTimeOff() {
    if (!toDriverId || !toStart || !toEnd || !toReason) return;
    startTransition(async () => {
      if (editEntry) {
        await updateTimeOff(editEntry.id, toStart, toEnd, toReason, toNote || undefined);
      } else {
        await addTimeOff(toDriverId, toStart, toEnd, toReason, toNote || undefined);
      }
      setShowAdd(false);
    });
  }

  function handleDeleteTimeOff(id: number) {
    startTransition(async () => {
      await deleteTimeOff(id);
    });
  }

  // ── Coverage ──────────────────────────────────────────────────────────────
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(parseISO(today), i));

  // Build a set of "driverId|YYYY-MM-DD" for quick off-day lookup
  const offSet = new Set<string>();
  coverageTimeOff.forEach((to) => {
    const s = parseISO(to.startDate), e = parseISO(to.endDate);
    days14.forEach((d) => {
      if (isWithinInterval(d, { start: s, end: e })) {
        offSet.add(`${to.driverId}|${format(d, "yyyy-MM-dd")}`);
      }
    });
  });

  // Map schedules for quick lookup
  const scheduleMap = Object.fromEntries(schedules.map((s) => [s.driverId, s]));
  const activeDrivers = schedules.filter((s) => s.active);

  function isWorking(driverId: string, date: Date): boolean {
    const dayKey = JS_DAY_TO_KEY[date.getDay()];
    const sched = scheduleMap[driverId];
    if (!sched?.schedule) return false;
    if (!sched.schedule[dayKey]) return false;
    return !offSet.has(`${driverId}|${format(date, "yyyy-MM-dd")}`);
  }

  const upcomingTimeOff = timeOff.filter((t) => t.endDate >= today).slice(0, 20);

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Wayne Board · Admin
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Scheduling
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: "schedules", label: "Weekly Schedules", icon: Clock },
          { key: "timeoff",   label: "Time Off",         icon: Calendar },
          { key: "coverage",  label: "Coverage (14 Days)", icon: AlertTriangle },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
              tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── SCHEDULES TAB ────────────────────────────────────────────────── */}
      {tab === "schedules" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-[13px] text-slate-500">
              Toggle which days each driver is scheduled. Changes save per-driver.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Driver</th>
                  {DAYS.map((d) => (
                    <th key={d.key} className="px-2 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center w-12">
                      {d.short}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Save</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((row) => {
                  const days = getDays(row);
                  const isDirty = !!drafts[row.driverId];
                  return (
                    <tr key={row.driverId} className={`border-b border-slate-100/80 last:border-0 transition-colors ${isDirty ? "bg-amber-50/40" : "hover:bg-slate-50/40"}`}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{row.name}</span>
                          {!row.active && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                              inactive
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">{row.driverId}</span>
                      </td>
                      {DAYS.map((d) => (
                        <td key={d.key} className="px-2 py-3 text-center">
                          <button
                            onClick={() => toggleDay(row.driverId, d.key, days)}
                            className={`w-8 h-8 rounded-lg text-[11px] font-bold transition-all border ${
                              days[d.key]
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-300 border-slate-200 hover:border-slate-400"
                            }`}
                          >
                            {d.short}
                          </button>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        {isDirty ? (
                          <button
                            onClick={() => saveSchedule(row.driverId)}
                            disabled={savingId === row.driverId}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-slate-900 text-white
                              hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center gap-1.5 ml-auto"
                          >
                            {savingId === row.driverId
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : null}
                            Save
                          </button>
                        ) : savedId === row.driverId ? (
                          <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600 justify-end">
                            <Check className="w-3.5 h-3.5" /> Saved
                          </span>
                        ) : (
                          <span className="text-[12px] text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TIME OFF TAB ─────────────────────────────────────────────────── */}
      {tab === "timeoff" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
                bg-slate-900 text-white hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Time Off
            </button>
          </div>

          {/* Add/edit form */}
          {showAdd && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-extrabold text-slate-900">
                  {editEntry ? "Edit Time Off" : "Add Time Off"}
                </h2>
                <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Driver</label>
                  <select
                    value={toDriverId}
                    onChange={(e) => setToDriverId(e.target.value)}
                    className={INPUT}
                    disabled={!!editEntry}
                  >
                    <option value="">— Select driver —</option>
                    {schedules.filter((s) => s.active).map((s) => (
                      <option key={s.driverId} value={s.driverId}>{s.name} ({s.driverId})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Start Date</label>
                  <input type="date" value={toStart} onChange={(e) => setToStart(e.target.value)} className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">End Date</label>
                  <input type="date" value={toEnd} onChange={(e) => setToEnd(e.target.value)} className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reason</label>
                  <select value={toReason} onChange={(e) => setToReason(e.target.value)} className={INPUT}>
                    <option value="">— Select —</option>
                    <option>Vacation</option>
                    <option>Personal</option>
                    <option>Medical</option>
                    <option>Family</option>
                    <option>Appointment</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Note (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. baby on the way"
                    value={toNote}
                    onChange={(e) => setToNote(e.target.value)}
                    className={INPUT}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                    text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTimeOff}
                  disabled={!toDriverId || !toStart || !toEnd || !toReason || isPending}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                    hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editEntry ? "Save Changes" : "Add Entry"}
                </button>
              </div>
            </div>
          )}

          {/* Upcoming time off list */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-[14px] font-extrabold text-slate-900">Upcoming Time Off</h2>
              <span className="text-[12px] text-slate-400">{upcomingTimeOff.length} entries</span>
            </div>
            {upcomingTimeOff.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-400 text-[13px]">No upcoming time off recorded.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingTimeOff.map((entry) => {
                  const isPast = entry.endDate < today;
                  return (
                    <div key={entry.id} className={`px-6 py-4 flex items-center gap-4 ${isPast ? "opacity-50" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-[13px]">{entry.name ?? entry.driverId}</span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {entry.reason}
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-400 mt-0.5 font-mono">
                          {formatDate(entry.startDate)} → {formatDate(entry.endDate)}
                          {entry.startDate === entry.endDate ? " (1 day)" : ""}
                        </p>
                        {entry.note && (
                          <p className="text-[12px] text-slate-500 mt-0.5 italic">{entry.note}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(entry)}
                          className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteTimeOff(entry.id)}
                          disabled={isPending}
                          className="p-1.5 rounded hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past entries */}
          {timeOff.filter((t) => t.endDate < today).length > 0 && (
            <details className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <summary className="px-6 py-4 cursor-pointer text-[13px] font-semibold text-slate-500 hover:text-slate-700 select-none list-none flex items-center gap-2">
                <ChevronDown className="w-3.5 h-3.5" />
                Past entries ({timeOff.filter((t) => t.endDate < today).length})
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {timeOff.filter((t) => t.endDate < today).map((entry) => (
                  <div key={entry.id} className="px-6 py-3 flex items-center gap-4 opacity-60">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-700 text-[13px]">{entry.name ?? entry.driverId}</span>
                      <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{entry.reason}</span>
                      <p className="text-[12px] text-slate-400 font-mono">{formatDate(entry.startDate)} → {formatDate(entry.endDate)}</p>
                    </div>
                    <button onClick={() => handleDeleteTimeOff(entry.id)} disabled={isPending}
                      className="p-1.5 rounded hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── COVERAGE TAB ─────────────────────────────────────────────────── */}
      {tab === "coverage" && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-slate-500">
            Based on each driver&apos;s weekly schedule minus any time-off entries. Drivers with no schedule set are excluded.
          </p>
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max pb-2">
              {days14.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayKey = JS_DAY_TO_KEY[day.getDay()];
                const working = activeDrivers.filter(
                  (d) => d.schedule && d.schedule[dayKey] && !offSet.has(`${d.driverId}|${dateStr}`)
                );
                const offToday = activeDrivers.filter(
                  (d) => d.schedule && d.schedule[dayKey] && offSet.has(`${d.driverId}|${dateStr}`)
                );
                const isToday = dateStr === today;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div
                    key={dateStr}
                    className={`w-36 rounded-xl border flex flex-col overflow-hidden shrink-0 ${
                      isToday
                        ? "border-slate-900 shadow-[0_2px_12px_rgba(0,0,0,0.12)]"
                        : isWeekend
                        ? "border-slate-200 bg-slate-50/60"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Date header */}
                    <div className={`px-3 py-2 text-center ${isToday ? "bg-slate-900" : isWeekend ? "bg-slate-100/80" : "bg-slate-50"}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-slate-300" : "text-slate-400"}`}>
                        {format(day, "EEE")}
                      </p>
                      <p className={`text-[15px] font-extrabold leading-tight ${isToday ? "text-white" : "text-slate-800"}`}>
                        {format(day, "MMM d")}
                      </p>
                      <p className={`text-[11px] font-semibold mt-0.5 ${
                        working.length === 0 ? "text-red-400" : isToday ? "text-slate-300" : "text-emerald-600"
                      }`}>
                        {working.length} driver{working.length !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Drivers working */}
                    <div className="flex flex-col p-2 gap-1 flex-1">
                      {working.map((d) => (
                        <span key={d.driverId}
                          className="text-[11px] font-semibold text-slate-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md truncate">
                          {d.name}
                        </span>
                      ))}
                      {offToday.map((d) => (
                        <span key={d.driverId}
                          className="text-[11px] font-semibold text-slate-400 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md truncate line-through">
                          {d.name}
                        </span>
                      ))}
                      {working.length === 0 && offToday.length === 0 && (
                        <span className="text-[11px] text-slate-300 px-1 py-1">No coverage</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block" />
              Working
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200 inline-block" />
              Scheduled but off (time off)
            </span>
          </div>

          {/* Upcoming time off summary */}
          {upcomingTimeOff.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-900">Upcoming Time Off</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {upcomingTimeOff.map((t) => (
                  <div key={t.id} className="px-6 py-3 flex items-center gap-3">
                    <span className="font-semibold text-slate-800 text-[13px] w-28 truncate">{t.name ?? t.driverId}</span>
                    <span className="text-[12px] font-mono text-slate-400">{formatDate(t.startDate)} → {formatDate(t.endDate)}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 ml-auto shrink-0">
                      {t.reason}
                    </span>
                    {t.note && <span className="text-[12px] text-slate-400 italic hidden md:block truncate max-w-[140px]">{t.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function formatDate(d: string) {
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}
