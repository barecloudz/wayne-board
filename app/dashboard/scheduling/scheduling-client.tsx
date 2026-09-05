"use client";

import { useState, useTransition, Fragment, useRef } from "react";
import {
  Calendar, Clock, ChevronDown, ChevronUp, Plus, Trash2,
  Loader2, Check, AlertTriangle, Pencil, X, CalendarPlus, ChevronLeft, ChevronRight, History,
} from "lucide-react";
import { upsertSchedule, addTimeOff, updateTimeOff, deleteTimeOff, updateDriverInfo, setDriverActive, addScheduleOverride, removeScheduleOverride, setDriverNoticeDate, setDriverLastDay, setDriverTrainee } from "@/lib/actions/scheduling";
import { assignDriverVehicle } from "@/lib/actions/drivers";
import { setDailyWorkArea, setDriverDefaultWorkArea } from "@/lib/actions/work-areas";
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
  id: number;
  driverId: string;
  name: string;
  active: boolean;
  workArea: string | null;
  defaultWorkAreaId: number | null;
  isTrainee: boolean;
  noticeDate: string | null;
  lastDay: string | null;
  assignedVehicleId: number | null;
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

type OverrideRow = {
  id: number;
  driverId: string;
  date: string;
  note: string | null;
};

type VehicleRow = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  active: boolean;
};

type WorkAreaRow = {
  id: number;
  name: string;
  shape: string;
  color: string;
  active: boolean;
};

type DroRouteRow = {
  workAreaName: string;
  workAreaNumber: string;
};

type DailyAssignmentRow = {
  id: number;
  driverId: string;
  date: string;
  workAreaId: number;
};

const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

export default function SchedulingClient({
  schedules, timeOff, upcomingOverrides, allOverrides, today, vehicles, workAreas, dailyAssignments, droRoutes,
}: {
  schedules: ScheduleRow[];
  timeOff: TimeOffRow[];
  upcomingOverrides: OverrideRow[];
  allOverrides: OverrideRow[];
  today: string;
  vehicles: VehicleRow[];
  workAreas: WorkAreaRow[];
  dailyAssignments: DailyAssignmentRow[];
  droRoutes: DroRouteRow[];
}) {
  const [tab, setTab] = useState<"schedules" | "timeoff" | "coverage" | "added" | "history">("schedules");
  const [historyDate, setHistoryDate] = useState(() => {
    // Default to yesterday
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
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

  // ── Show/hide inactive ────────────────────────────────────────────────────
  const [showInactive, setShowInactive] = useState(false);

  function handleSetActive(driverId: string, active: boolean) {
    startTransition(async () => { await setDriverActive(driverId, active); });
  }

  function handleSetTrainee(driverId: string, isTrainee: boolean) {
    startTransition(async () => { await setDriverTrainee(driverId, isTrainee); });
  }

  const visibleSchedules = showInactive ? schedules : schedules.filter((s) => s.active);

  // ── Driver info editing ───────────────────────────────────────────────────
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [driverDrafts, setDriverDrafts] = useState<Record<string, { name: string; workArea: string; defaultWorkAreaId: number | null; noticeDate: string; lastDay: string; isTrainee: boolean }>>({});

  function openDriverEdit(row: ScheduleRow) {
    setDriverDrafts((prev) => ({
      ...prev,
      [row.driverId]: { name: row.name, workArea: row.workArea ?? "", defaultWorkAreaId: row.defaultWorkAreaId ?? null, noticeDate: row.noticeDate ?? "", lastDay: row.lastDay ?? "", isTrainee: row.isTrainee ?? false },
    }));
    setEditingDriver(row.driverId);
  }

  function saveDriverInfo(driverId: string) {
    const draft = driverDrafts[driverId];
    if (!draft?.name.trim()) return;
    startTransition(async () => {
      const currentRow = schedules.find((s) => s.driverId === driverId);
      await updateDriverInfo(driverId, draft.name, draft.workArea || null);
      const noticeDateVal = draft.noticeDate || null;
      if (noticeDateVal !== (currentRow?.noticeDate ?? null)) {
        await setDriverNoticeDate(driverId, noticeDateVal);
      }
      const lastDayVal = draft.lastDay || null;
      if (lastDayVal !== (currentRow?.lastDay ?? null)) {
        await setDriverLastDay(driverId, lastDayVal);
      }
      const isTraineeVal = draft.isTrainee ?? false;
      if (isTraineeVal !== (currentRow?.isTrainee ?? false)) {
        await setDriverTrainee(driverId, isTraineeVal);
      }
      const defaultWaId = draft.defaultWorkAreaId ?? null;
      if (defaultWaId !== (currentRow?.defaultWorkAreaId ?? null)) {
        await setDriverDefaultWorkArea(driverId, defaultWaId);
      }
      setEditingDriver(null);
    });
  }

  // ── One-time overrides ────────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<OverrideRow[]>(upcomingOverrides);
  const [overridePicker, setOverridePicker] = useState<string | null>(null); // driverId
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  function handleAddOverride(driverId: string) {
    if (!overrideDate) return;
    startTransition(async () => {
      await addScheduleOverride(driverId, overrideDate, overrideNote || undefined);
      setOverrides((prev) => [
        ...prev.filter((o) => !(o.driverId === driverId && o.date === overrideDate)),
        { id: Date.now(), driverId, date: overrideDate, note: overrideNote || null },
      ]);
      setOverridePicker(null);
      setOverrideDate("");
      setOverrideNote("");
    });
  }

  function handleRemoveOverride(id: number) {
    startTransition(async () => {
      await removeScheduleOverride(id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    });
  }

  // ── Coverage driver modal ─────────────────────────────────────────────────
  type CoverageModal = { driver: ScheduleRow; dateStr: string };
  const [coverageModal, setCoverageModal] = useState<CoverageModal | null>(null);
  const [modalVehicleId, setModalVehicleId] = useState("");
  const [modalWorkAreaId, setModalWorkAreaId] = useState<string>("");

  function openCoverageModal(driver: ScheduleRow, dateStr: string) {
    setCoverageModal({ driver, dateStr });
    setModalVehicleId(driver.assignedVehicleId?.toString() ?? "");
    const dailyId = dailyAssignments.find(
      (a) => a.driverId === driver.driverId && a.date === dateStr
    )?.workAreaId;
    setModalWorkAreaId(dailyId?.toString() ?? "");
  }

  function handleCutDay() {
    if (!coverageModal) return;
    const { driver, dateStr } = coverageModal;
    startTransition(async () => {
      await addTimeOff(driver.driverId, dateStr, dateStr, "Cut");
      setCoverageModal(null);
    });
  }

  function handleCallOut() {
    if (!coverageModal) return;
    const { driver, dateStr } = coverageModal;
    startTransition(async () => {
      await addTimeOff(driver.driverId, dateStr, dateStr, "Call Out");
      setCoverageModal(null);
    });
  }

  function handleAssignVehicleFromModal() {
    if (!coverageModal) return;
    const vid = modalVehicleId ? parseInt(modalVehicleId) : null;
    startTransition(async () => {
      await assignDriverVehicle(coverageModal.driver.id, vid);
      setCoverageModal(null);
    });
  }

  function handleAssignWorkAreaFromModal() {
    if (!coverageModal) return;
    const waId = modalWorkAreaId ? parseInt(modalWorkAreaId) : null;
    startTransition(async () => {
      await setDailyWorkArea(coverageModal.driver.driverId, coverageModal.dateStr, waId);
      setCoverageModal(null);
    });
  }

  // ── Time off ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]   = useState(false);
  const [editEntry, setEditEntry] = useState<TimeOffRow | null>(null);
  const timeOffFormRef = useRef<HTMLDivElement>(null);
  const [toDriverId, setToDriverId] = useState("");
  const [toStart, setToStart]   = useState("");
  const [toEnd, setToEnd]       = useState("");
  const [toReason, setToReason] = useState("");
  const [toNote, setToNote]     = useState("");

  function openAdd() {
    setToDriverId(""); setToStart(""); setToEnd(""); setToReason(""); setToNote("");
    setEditEntry(null);
    setShowAdd(true);
    setTimeout(() => timeOffFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openEdit(entry: TimeOffRow) {
    setToDriverId(entry.driverId);
    setToStart(entry.startDate);
    setToEnd(entry.endDate);
    setToReason(entry.reason);
    setToNote(entry.note ?? "");
    setEditEntry(entry);
    setShowAdd(true);
    setTimeout(() => timeOffFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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
  const COVERAGE_FLOOR = parseISO("2026-06-08"); // earliest allowed week start
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week, etc.

  const coverageStart = addDays(parseISO(today), weekOffset * 7);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(coverageStart, i));
  const canGoBack = addDays(coverageStart, -7) >= COVERAGE_FLOOR;
  const canGoForward = weekOffset < 0; // can only go forward if in the past

  // Build a set of "driverId|YYYY-MM-DD" for quick off-day lookup using ALL time off
  const offSet = new Set<string>();
  timeOff.forEach((to) => {
    const s = parseISO(to.startDate), e = parseISO(to.endDate);
    days14.forEach((d) => {
      if (isWithinInterval(d, { start: s, end: e })) {
        offSet.add(`${to.driverId}|${format(d, "yyyy-MM-dd")}`);
      }
    });
  });

  // Map schedules for quick lookup
  const scheduleMap = Object.fromEntries(schedules.map((s) => [s.driverId, s]));

  // Returns true if driver should be excluded from coverage on this date (past their last day)
  function isPastLastDay(driverId: string, date: Date): boolean {
    const sched = scheduleMap[driverId];
    if (sched?.lastDay) return date > parseISO(sched.lastDay);
    if (sched?.noticeDate) return date > addDays(parseISO(sched.noticeDate), 14);
    return false;
  }

  // Work area lookups for coverage
  const workAreaById = new Map<number, WorkAreaRow>(workAreas.map((wa) => [wa.id, wa]));
  const dailyWorkAreaMap = new Map<string, number>(
    dailyAssignments.map((a) => [`${a.driverId}|${a.date}`, a.workAreaId])
  );

  function getEffectiveWorkArea(driverId: string, defaultWorkAreaId: number | null, dateStr: string): WorkAreaRow | null {
    const dailyId = dailyWorkAreaMap.get(`${driverId}|${dateStr}`);
    const effectiveId = dailyId ?? defaultWorkAreaId ?? null;
    return effectiveId != null ? (workAreaById.get(effectiveId) ?? null) : null;
  }

  const activeDrivers = schedules.filter((s) => s.active);

  // Build override lookup: "driverId|YYYY-MM-DD" — use allOverrides for past week viewing
  const overrideSet = new Set<string>(allOverrides.map((o) => `${o.driverId}|${o.date}`));

  const upcomingTimeOff = timeOff.filter((t) => t.endDate >= today).slice(0, 20);

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            MyGroundOps · Admin
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Scheduling
          </h1>
          <p className="text-[14px] text-slate-400 mt-2 max-w-xl">
            Manage driver schedules, time off, and day-to-day coverage at a glance.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-2 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: "schedules", label: "Weekly Schedule",   icon: Clock },
          { key: "timeoff",   label: "Time Off",          icon: Calendar },
          { key: "coverage",  label: "Who's Working",     icon: AlertTriangle },
          { key: "added",     label: "Extra Days",        icon: CalendarPlus },
          { key: "history",   label: "Attendance History", icon: History },
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

      {/* Tab descriptions */}
      {tab === "schedules" && (
        <p className="text-[13px] text-slate-400 mb-6">
          Set which days of the week each driver works. Click a day to toggle it on or off — then hit <strong className="text-slate-600">Save</strong>.
        </p>
      )}
      {tab === "timeoff" && (
        <p className="text-[13px] text-slate-400 mb-6">
          Record when a driver won&apos;t be in — vacation, personal days, appointments. Time off overrides their normal schedule.
        </p>
      )}
      {tab === "coverage" && (
        <p className="text-[13px] text-slate-400 mb-6">
          Shows every driver scheduled to work each day for the next 2 weeks, after subtracting time off. Click any driver to cut their day or reassign their truck.
        </p>
      )}
      {tab === "added" && (
        <p className="text-[13px] text-slate-400 mb-6">
          One-time extra days — when a driver comes in on a day they&apos;re not normally scheduled. Add these from the Weekly Schedule tab using the <strong className="text-slate-600">+ Extra Day</strong> button.
        </p>
      )}
      {tab === "history" && (
        <p className="text-[13px] text-slate-400 mb-6">
          Pick any past date to see who was working, who was cut, who called out, and who had time off.
        </p>
      )}

      {/* ── SCHEDULES TAB ────────────────────────────────────────────────── */}
      {tab === "schedules" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[13px] text-slate-500">
              Tap the day buttons to toggle a driver&apos;s regular schedule, then click <strong className="text-slate-700">Save</strong>.
            </p>
            <button
              onClick={() => setShowInactive((p) => !p)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                showInactive
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {showInactive ? "Hide inactive" : `Show inactive (${schedules.filter(s => !s.active).length})`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Driver</th>
                  {DAYS.map((d) => (
                    <th key={d.key} title={d.label} className="px-2 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center w-12">
                      {d.short}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right w-72">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSchedules.map((row) => {
                  const days = getDays(row);
                  const isDirty = !!drafts[row.driverId];
                  const driverOverrides = overrides.filter((o) => o.driverId === row.driverId);
                  const pickerOpen = overridePicker === row.driverId;
                  return (
                    <Fragment key={row.driverId}>
                    <tr className={`border-b ${pickerOpen ? "border-slate-100" : "border-slate-100/80 last:border-0"} transition-colors ${isDirty ? "bg-amber-50/40" : "hover:bg-slate-50/40"}`}>
                      <td className="px-6 py-3">
                        {editingDriver === row.driverId ? (
                          <div className="flex flex-col gap-1.5 min-w-[200px]">
                            <input
                              autoFocus
                              value={driverDrafts[row.driverId]?.name ?? row.name}
                              onChange={(e) => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], name: e.target.value } }))}
                              placeholder="Full name"
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[13px] text-slate-800 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                            />
                            <select
                              value={driverDrafts[row.driverId]?.workArea ?? ""}
                              onChange={(e) => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], workArea: e.target.value } }))}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[13px] text-slate-800 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                            >
                              <option value="">— No DRO route assigned —</option>
                              {droRoutes.map((r) => (
                                <option key={r.workAreaName} value={r.workAreaName}>
                                  {r.workAreaNumber ? `${r.workAreaNumber} — ` : ""}{r.workAreaName}
                                </option>
                              ))}
                            </select>
                            <select
                              value={driverDrafts[row.driverId]?.defaultWorkAreaId?.toString() ?? ""}
                              onChange={(e) => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], defaultWorkAreaId: e.target.value ? parseInt(e.target.value) : null } }))}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[13px] text-slate-800 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                            >
                              <option value="">— No default work area —</option>
                              {workAreas.filter((wa) => wa.active).map((wa) => (
                                <option key={wa.id} value={wa.id.toString()}>{wa.name}</option>
                              ))}
                            </select>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">2-Week Notice Date</label>
                              <input
                                type="date"
                                value={driverDrafts[row.driverId]?.noticeDate ?? ""}
                                onChange={(e) => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], noticeDate: e.target.value } }))}
                                className="px-2.5 py-1.5 rounded-lg border border-red-200 text-[13px] text-slate-800 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-red-50/40"
                              />
                              {driverDrafts[row.driverId]?.noticeDate && (
                                <button
                                  type="button"
                                  onClick={() => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], noticeDate: "" } }))}
                                  className="text-[10px] text-slate-400 hover:text-red-500 text-left transition-colors"
                                >
                                  Clear notice
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider">Last Day</label>
                              <input
                                type="date"
                                value={driverDrafts[row.driverId]?.lastDay ?? ""}
                                onChange={(e) => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], lastDay: e.target.value } }))}
                                className="px-2.5 py-1.5 rounded-lg border border-orange-200 text-[13px] text-slate-800 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100 bg-orange-50/40"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], lastDay: today } }))}
                                  className="text-[10px] text-orange-500 hover:text-orange-700 font-semibold text-left transition-colors"
                                >
                                  Set today
                                </button>
                                {driverDrafts[row.driverId]?.lastDay && (
                                  <button
                                    type="button"
                                    onClick={() => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], lastDay: "" } }))}
                                    className="text-[10px] text-slate-400 hover:text-red-500 text-left transition-colors"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={driverDrafts[row.driverId]?.isTrainee ?? false}
                                onChange={(e) => setDriverDrafts((p) => ({ ...p, [row.driverId]: { ...p[row.driverId], isTrainee: e.target.checked } }))}
                                className="w-4 h-4 rounded accent-blue-600"
                              />
                              <span className="text-[12px] font-semibold text-blue-700">In training — doesn&apos;t count as a route</span>
                            </label>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => saveDriverInfo(row.driverId)}
                                disabled={isPending}
                                className="flex-1 py-1 rounded-lg text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                              >
                                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Save
                              </button>
                              <button
                                onClick={() => setEditingDriver(null)}
                                className="px-2 py-1 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 group">
                            <div>
                              <div className="flex items-center gap-2">
                                {row.noticeDate && (
                                  <span title={`2-week notice given ${formatDate(row.noticeDate)}`}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  </span>
                                )}
                                <span className="font-semibold text-slate-800">{row.name}</span>
                                {row.isTrainee && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                                    trainee
                                  </span>
                                )}
                                {!row.active && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                                    inactive
                                  </span>
                                )}
                                {row.noticeDate && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                                    notice: {formatDate(row.noticeDate)}
                                  </span>
                                )}
                                {row.lastDay && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
                                    last day: {formatDate(row.lastDay)}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">{row.driverId}</span>
                              {row.workArea && (
                                <span className="block text-[11px] text-slate-500 mt-0.5">{row.workArea}</span>
                              )}
                              {driverOverrides.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {driverOverrides.map((o) => (
                                    <span key={o.id} className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                                      {formatDate(o.date)}
                                      <button
                                        onClick={() => handleRemoveOverride(o.id)}
                                        disabled={isPending}
                                        className="hover:text-red-500 transition-colors disabled:opacity-40"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => openDriverEdit(row)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors mt-0.5 shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                          </div>
                        )}
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
                        <div className="flex items-center justify-end gap-2">
                          {isDirty ? (
                            <button
                              onClick={() => saveSchedule(row.driverId)}
                              disabled={savingId === row.driverId}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-slate-900 text-white
                                hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                            >
                              {savingId === row.driverId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              Save
                            </button>
                          ) : savedId === row.driverId ? (
                            <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                              <Check className="w-3.5 h-3.5" /> Saved
                            </span>
                          ) : null}
                          <button
                            onClick={() => {
                              setOverridePicker(pickerOpen ? null : row.driverId);
                              setOverrideDate("");
                              setOverrideNote("");
                            }}
                            disabled={isPending}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 border ${
                              pickerOpen
                                ? "bg-blue-100 text-blue-600 border-blue-200"
                                : "border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                            }`}
                          >
                            <CalendarPlus className="w-3 h-3" />
                            Extra Day
                          </button>
                          <button
                            onClick={() => handleSetTrainee(row.driverId, !row.isTrainee)}
                            disabled={isPending}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 border ${
                              row.isTrainee
                                ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                : "border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                            }`}
                          >
                            Trainee
                          </button>
                          <button
                            onClick={() => handleSetActive(row.driverId, !row.active)}
                            disabled={isPending}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 border ${
                              row.active
                                ? "border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                                : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
                            }`}
                          >
                            {row.active
                              ? <><X className="w-3 h-3" /> Deactivate</>
                              : <><Check className="w-3 h-3" /> Restore</>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                    {pickerOpen && (
                      <tr className="border-b border-slate-100/80">
                        <td colSpan={9} className="px-6 pb-3 pt-0">
                          <div className="flex items-center gap-2 bg-blue-50/60 border border-blue-100 rounded-xl p-3">
                            <CalendarPlus className="w-4 h-4 text-blue-400 shrink-0" />
                            <input
                              type="date"
                              value={overrideDate}
                              onChange={(e) => setOverrideDate(e.target.value)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
                            />
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={overrideNote}
                              onChange={(e) => setOverrideNote(e.target.value)}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
                            />
                            <button
                              onClick={() => handleAddOverride(row.driverId)}
                              disabled={!overrideDate || isPending}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                            >
                              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                              Add Day
                            </button>
                            <button
                              onClick={() => setOverridePicker(null)}
                              className="p-1.5 rounded-lg hover:bg-blue-100 transition-colors text-slate-400 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
            <div ref={timeOffFormRef} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-6">
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
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-slate-500">
              Based on each driver&apos;s weekly schedule minus any time-off entries.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                disabled={!canGoBack}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <span className="text-[12px] font-semibold text-slate-600 min-w-[120px] text-center">
                {weekOffset === 0 ? "This 2 weeks" : weekOffset === -1 ? "Last 2 weeks" : `${Math.abs(weekOffset) * 2} weeks ago`}
              </span>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                disabled={!canGoForward}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max pb-2">
              {days14.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayKey = JS_DAY_TO_KEY[day.getDay()];
                const working = activeDrivers.filter((d) => {
                  const key = `${d.driverId}|${dateStr}`;
                  if (offSet.has(key)) return false;
                  if (isPastLastDay(d.driverId, day)) return false;
                  return (d.schedule && d.schedule[dayKey]) || overrideSet.has(key);
                });
                const offToday = activeDrivers.filter((d) => {
                  const key = `${d.driverId}|${dateStr}`;
                  if (isPastLastDay(d.driverId, day)) return false;
                  if (!offSet.has(key)) return false;
                  return (d.schedule && d.schedule[dayKey]) || overrideSet.has(key);
                });
                const isToday = dateStr === today;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const routeCount = working.filter((d) => !d.isTrainee).length;

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
                        routeCount === 0 ? "text-red-400" : isToday ? "text-slate-300" : "text-emerald-600"
                      }`}>
                        {routeCount} route{routeCount !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Drivers working */}
                    <div className="flex flex-col p-2 gap-1 flex-1">
                      {working.map((d) => {
                        const isLastDay = d.lastDay === dateStr;
                        const isTrainee = d.isTrainee;
                        const wa = getEffectiveWorkArea(d.driverId, d.defaultWorkAreaId, dateStr);
                        const droRoute = d.workArea
                          ? droRoutes.find(r => r.workAreaName === d.workArea)
                          : null;
                        return (
                          <div key={d.driverId} className="flex flex-col gap-0.5 w-full">
                            <div className="flex items-center gap-1 w-full">
                              <button
                                onClick={() => openCoverageModal(d, dateStr)}
                                className={`text-[11px] font-semibold px-2 py-1 rounded-md truncate text-left flex-1 min-w-0 transition-opacity hover:opacity-70 ${
                                  isTrainee
                                    ? "text-blue-700 bg-blue-50 border border-blue-100"
                                    : isLastDay
                                    ? "text-red-700 bg-red-50 border border-red-100"
                                    : "text-slate-700 bg-emerald-50 border border-emerald-100"
                                }`}>
                                {d.name}
                              </button>
                              {wa && !droRoute && (
                                <>
                                  <span className="text-[10px] font-semibold text-slate-500 shrink-0 max-w-[36px] truncate">{wa.name}</span>
                                  <WorkAreaShape shape={wa.shape} color={wa.color} size={10} />
                                </>
                              )}
                            </div>
                            {droRoute && (
                              <span className="text-[10px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 font-mono truncate">
                                {droRoute.workAreaNumber} {droRoute.workAreaName.replace(/^742\s*/i, "")}
                              </span>
                            )}
                          </div>
                        );
                      })}
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
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block" />
              Working
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-200 inline-block" />
              Trainee (not counted as a route)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 inline-block" />
              Last day
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

      {/* ── ADDED DAYS TAB ───────────────────────────────────────────────── */}
      {tab === "added" && (() => {
        // Build a lookup: driverId → schedule days
        const scheduleByDriver = new Map(schedules.map(s => [s.driverId, s]));

        // Group all overrides by date, sorted newest first
        const byDate = new Map<string, OverrideRow[]>();
        for (const o of allOverrides) {
          const list = byDate.get(o.date) ?? [];
          list.push(o);
          byDate.set(o.date, list);
        }
        const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

        return (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-slate-500">
              Days a driver was <span className="font-semibold text-violet-700">manually added</span> to work outside their regular weekly schedule — including trainee days. Most recent first.
            </p>

            {sortedDates.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                <CalendarPlus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-[14px] font-semibold text-slate-400">No added days on record</p>
                <p className="text-[12px] text-slate-400 mt-1">When you add a driver to a day they&apos;re not normally scheduled, it will appear here.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {sortedDates.map((dateStr) => {
                const entries = byDate.get(dateStr)!;
                const d = parseISO(dateStr);
                const isToday = dateStr === today;
                const isPast  = dateStr < today;

                return (
                  <div key={dateStr} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    {/* Date header */}
                    <div className={`px-5 py-3 border-b border-slate-100 flex items-center gap-3 ${
                      isToday ? "bg-slate-900" : isPast ? "bg-slate-50" : "bg-violet-50"
                    }`}>
                      <div>
                        <p className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? "text-slate-400" : "text-slate-400"}`}>
                          {format(d, "EEEE")}
                        </p>
                        <p className={`text-[16px] font-extrabold leading-tight ${isToday ? "text-white" : "text-slate-800"}`}>
                          {format(d, "MMM d, yyyy")}
                        </p>
                      </div>
                      {isToday && (
                        <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white">TODAY</span>
                      )}
                      {!isToday && !isPast && (
                        <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-500 text-white">UPCOMING</span>
                      )}
                      {isPast && !isToday && (
                        <span className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-500">PAST</span>
                      )}
                      <span className="text-[12px] font-semibold text-slate-500 ml-2">
                        {entries.length} driver{entries.length !== 1 ? "s" : ""} added
                      </span>
                    </div>

                    {/* Driver rows */}
                    <div className="divide-y divide-slate-100">
                      {entries.map((o) => {
                        const driverRow = scheduleByDriver.get(o.driverId);
                        const isTrainee = driverRow?.isTrainee ?? false;
                        const name = driverRow?.name ?? o.driverId;
                        const dayKey = JS_DAY_TO_KEY[d.getDay()];
                        const normallyScheduled = driverRow?.schedule?.[dayKey] ?? false;

                        return (
                          <div key={o.id} className="px-5 py-3 flex items-center gap-3">
                            {/* Trainee or extra day badge */}
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isTrainee ? "bg-blue-500" : "bg-violet-500"
                            }`} />

                            <span className="font-semibold text-slate-800 text-[14px] flex-1">{name}</span>

                            {isTrainee && (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                TRAINEE
                              </span>
                            )}

                            {normallyScheduled && !isTrainee && (
                              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                Also on regular schedule
                              </span>
                            )}

                            {!normallyScheduled && !isTrainee && (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                                EXTRA DAY
                              </span>
                            )}

                            {o.note && (
                              <span className="text-[12px] text-slate-400 italic hidden sm:block max-w-[200px] truncate">
                                {o.note}
                              </span>
                            )}

                            {/* Remove button (only for upcoming/today) */}
                            {dateStr >= today && (
                              <button
                                onClick={() => handleRemoveOverride(o.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Remove added day"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── COVERAGE DRIVER MODAL ────────────────────────────────────────── */}
      {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
      {tab === "history" && (() => {
        // Compute attendance for the selected date
        const date = parseISO(historyDate);
        const dayKey = JS_DAY_TO_KEY[date.getDay()];

        // Time-off entries that cover this date
        const dayEntries = timeOff.filter(
          (to) => to.startDate <= historyDate && to.endDate >= historyDate
        );
        const offDriverIds = new Set(dayEntries.map((to) => to.driverId));

        // Overrides for this date
        const dayOverrideIds = new Set(
          allOverrides.filter((o) => o.date === historyDate).map((o) => o.driverId)
        );

        type HistoryEntry = { driver: ScheduleRow; reason: string; note: string | null };
        const working: ScheduleRow[] = [];
        const cuts: HistoryEntry[] = [];
        const callOuts: HistoryEntry[] = [];
        const timeOffList: HistoryEntry[] = [];

        for (const driver of schedules.filter((s) => s.active || offDriverIds.has(s.driverId))) {
          if (isPastLastDay(driver.driverId, date)) continue;
          const scheduled = dayKey ? driver.schedule?.[dayKey] === true : false;
          const hasOverride = dayOverrideIds.has(driver.driverId);
          if (!scheduled && !hasOverride) continue;

          if (!offDriverIds.has(driver.driverId)) {
            if (driver.active) working.push(driver);
          } else {
            const entries = dayEntries.filter((to) => to.driverId === driver.driverId);
            for (const e of entries) {
              if (e.reason === "Cut" || e.reason === "Other") cuts.push({ driver, reason: e.reason, note: e.note });
              else if (e.reason === "Call Out") callOuts.push({ driver, reason: e.reason, note: e.note });
              else timeOffList.push({ driver, reason: e.reason, note: e.note });
            }
          }
        }

        const Section = ({ title, color, items, emptyText }: {
          title: string; color: string; items: { name: string; driverId: string; note?: string | null }[]; emptyText: string;
        }) => (
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${color}`}>{title} <span className="text-slate-400 font-normal">({items.length})</span></p>
            {items.length === 0
              ? <p className="text-[12px] text-slate-300 italic">{emptyText}</p>
              : <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <div key={item.driverId} className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{item.name}</span>
                      {item.note && <span className="text-[11px] text-slate-400 italic">{item.note}</span>}
                    </div>
                  ))}
                </div>
            }
          </div>
        );

        return (
          <div className="flex flex-col gap-6">
            {/* Date picker */}
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={historyDate}
                max={today}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
              />
              <span className="text-[14px] font-semibold text-slate-600">
                {format(date, "EEEE, MMMM d, yyyy")}
              </span>
            </div>

            {/* Attendance grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  title: "Working", color: "text-emerald-600",
                  bg: "bg-emerald-50 border-emerald-200/60",
                  items: working.map((d) => ({ name: d.name, driverId: d.driverId })),
                  emptyText: "No drivers scheduled",
                },
                {
                  title: "Cut", color: "text-red-500",
                  bg: "bg-red-50 border-red-200/60",
                  items: cuts.map(({ driver, note }) => ({ name: driver.name, driverId: driver.driverId, note })),
                  emptyText: "No cuts",
                },
                {
                  title: "Called Out", color: "text-amber-600",
                  bg: "bg-amber-50 border-amber-200/60",
                  items: callOuts.map(({ driver, note }) => ({ name: driver.name, driverId: driver.driverId, note })),
                  emptyText: "No call-outs",
                },
                {
                  title: "Time Off", color: "text-blue-600",
                  bg: "bg-blue-50 border-blue-200/60",
                  items: timeOffList.map(({ driver, reason, note }) => ({ name: driver.name, driverId: driver.driverId, note: [reason, note].filter(Boolean).join(" — ") })),
                  emptyText: "No time off",
                },
              ].map(({ title, color, bg, items, emptyText }) => (
                <div key={title} className={`rounded-2xl border p-5 ${bg}`}>
                  <Section title={title} color={color} items={items} emptyText={emptyText} />
                </div>
              ))}
            </div>

            {working.length === 0 && cuts.length === 0 && callOuts.length === 0 && timeOffList.length === 0 && (
              <p className="text-[13px] text-slate-400 text-center py-6">No drivers were scheduled on this day.</p>
            )}
          </div>
        );
      })()}

      {coverageModal && (() => {
        const { driver, dateStr } = coverageModal;
        const assignedVehicle = vehicles.find(v => v.id === driver.assignedVehicleId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setCoverageModal(null)}>
            <div
              className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.2)] w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[18px] font-extrabold text-slate-900">{driver.name}</p>
                    <p className="text-[12px] font-mono text-slate-400 mt-0.5">{driver.driverId}</p>
                    {driver.workArea && (() => {
                    const r = droRoutes.find(dr => dr.workAreaName === driver.workArea);
                    return (
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        {r ? <span className="font-mono font-bold text-slate-700">{r.workAreaNumber}</span> : null}
                        {r ? <span className="text-slate-400"> — </span> : null}
                        {driver.workArea}
                      </p>
                    );
                  })()}
                  </div>
                  <button onClick={() => setCoverageModal(null)} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[12px] font-semibold text-slate-500 mt-3 bg-slate-50 rounded-lg px-3 py-1.5 inline-block">
                  {formatDate(dateStr)}
                </p>
              </div>

              <div className="px-6 py-5 flex flex-col gap-5">
                {/* Cut / Call Out */}
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Not working this day?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleCutDay}
                      disabled={isPending}
                      className="py-3 rounded-xl text-[13px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Cut
                    </button>
                    <button
                      onClick={handleCallOut}
                      disabled={isPending}
                      className="py-3 rounded-xl text-[13px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      Call Out
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">Cut = management decision · Call Out = driver called in</p>
                </div>

                {/* Assign vehicle */}
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Vehicle Assignment
                  </p>
                  {assignedVehicle && (
                    <p className="text-[12px] text-slate-500">
                      Currently: <span className="font-semibold text-slate-700">{assignedVehicle.unitNumber}</span>
                    </p>
                  )}
                  <select
                    value={modalVehicleId || (driver.assignedVehicleId?.toString() ?? "")}
                    onChange={(e) => setModalVehicleId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                  >
                    <option value="">— No vehicle —</option>
                    {vehicles.filter(v => v.active).map(v => (
                      <option key={v.id} value={v.id.toString()}>
                        {v.unitNumber} — {v.year} {v.make} {v.model}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignVehicleFromModal}
                    disabled={isPending}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {assignedVehicle ? "Update Vehicle" : "Assign Vehicle"}
                  </button>
                </div>

                {/* Work area for this day */}
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Work Area — {formatDate(dateStr)}
                  </p>
                  {driver.defaultWorkAreaId && (() => {
                    const defaultWa = workAreaById.get(driver.defaultWorkAreaId);
                    return defaultWa ? (
                      <p className="text-[12px] text-slate-500">
                        Default: <span className="font-semibold text-slate-700">{defaultWa.name}</span>
                      </p>
                    ) : null;
                  })()}
                  <div className="flex items-center gap-2">
                    <select
                      value={modalWorkAreaId}
                      onChange={(e) => setModalWorkAreaId(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                    >
                      <option value="">— Use repeatable default —</option>
                      {workAreas.filter((wa) => wa.active).map((wa) => (
                        <option key={wa.id} value={wa.id.toString()}>{wa.name}</option>
                      ))}
                    </select>
                    {modalWorkAreaId && (() => {
                      const wa = workAreaById.get(parseInt(modalWorkAreaId));
                      return wa ? (
                        <div className="flex items-center justify-center w-8 h-8 shrink-0">
                          <WorkAreaShape shape={wa.shape} color={wa.color} size={18} />
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <button
                    onClick={handleAssignWorkAreaFromModal}
                    disabled={isPending}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Set Work Area for this Day
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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

function WorkAreaShape({ shape, color, size = 10 }: { shape: string; color: string; size?: number }) {
  if (shape === "triangle") {
    const half = Math.round(size * 0.55);
    return (
      <span style={{
        display: "inline-block", width: 0, height: 0,
        borderLeft: `${half}px solid transparent`,
        borderRight: `${half}px solid transparent`,
        borderBottom: `${size}px solid ${color}`,
        flexShrink: 0,
      }} />
    );
  }
  return (
    <span style={{
      display: "inline-block",
      width: size,
      height: size,
      backgroundColor: color,
      borderRadius: shape === "circle" ? "50%" : "2px",
      transform: shape === "diamond" ? "rotate(45deg)" : "none",
      flexShrink: 0,
    }} />
  );
}
