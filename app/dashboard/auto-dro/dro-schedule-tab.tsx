"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, Save, Calendar } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type WaveInfo = {
  serviceAreaDowWaveId: number;
  serviceAreaId: number;
  dow: number;
  wave: number;
  routePlanId: number;
  routePlanName: string;
  totalRoutes: number;
  routePlanInfo: Record<string, unknown>;
  [key: string]: unknown;
};

type DaySchedule = {
  id: number;
  dispatchMode: number;
  waves: WaveInfo[];
  planErrors: unknown[];
  isInvalid: boolean;
  key: string;
  day: string;
};

type ScheduleBody = {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
  selectedDOW?: number;
  [key: string]: unknown;
};

type DroPlan = {
  planId: number;
  name: string;
  totalRoutes: number;
  [key: string]: unknown;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayKey = typeof DAY_KEYS[number];

const DAY_DOW: Record<DayKey, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};

const DAY_COLORS: Record<DayKey, { border: string; header: string; badge: string; ring: string }> = {
  monday:    { border: "border-blue-300",    header: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",    ring: "ring-blue-400" },
  tuesday:   { border: "border-purple-300",  header: "bg-purple-500",  badge: "bg-purple-100 text-purple-700", ring: "ring-purple-400" },
  wednesday: { border: "border-emerald-300", header: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-400" },
  thursday:  { border: "border-orange-300",  header: "bg-orange-500",  badge: "bg-orange-100 text-orange-700",  ring: "ring-orange-400" },
  friday:    { border: "border-amber-300",   header: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",    ring: "ring-amber-400" },
  saturday:  { border: "border-pink-300",    header: "bg-pink-500",    badge: "bg-pink-100 text-pink-700",      ring: "ring-pink-400" },
  sunday:    { border: "border-red-300",     header: "bg-red-500",     badge: "bg-red-100 text-red-700",        ring: "ring-red-400" },
};

// 0=Sun,1=Mon...6=Sat in JS getDay() — map to DayKey
const JS_DAY_TO_KEY: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function droManage(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/auto-dro/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DroScheduleTab() {
  const [schedule, setSchedule] = useState<ScheduleBody | null>(null);
  const [plans, setPlans] = useState<DroPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirtyDays, setDirtyDays] = useState<Set<DayKey>>(new Set());
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectingMsg, setConnectingMsg] = useState(false);

  const todayKey = JS_DAY_TO_KEY[new Date().getDay()];

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setConnectingMsg(true);
      try {
        const [schedRes, plansRes] = await Promise.all([
          droManage("getSchedule"),
          droManage("getPlans"),
        ]);
        setConnectingMsg(false);
        if (schedRes?.data) setSchedule(schedRes.data as ScheduleBody);
        if (Array.isArray(plansRes?.data)) setPlans(plansRes.data as DroPlan[]);
        else if (plansRes?.error) showToast(false, plansRes.error);
      } catch {
        showToast(false, "Failed to load schedule");
      } finally {
        setLoading(false);
        setConnectingMsg(false);
      }
    }
    load();
  }, [showToast]);

  function changeDayPlan(dayKey: DayKey, planId: number) {
    if (!schedule) return;
    const plan = plans.find(p => p.planId === planId);
    if (!plan) return;

    const dayData = schedule[dayKey] as DaySchedule;
    const updatedWaves = dayData.waves.map((w, i) =>
      i === 0
        ? {
            ...w,
            routePlanId: plan.planId,
            routePlanName: plan.name,
            totalRoutes: plan.totalRoutes,
            routePlanInfo: {
              planId: plan.planId,
              name: plan.name,
              optimize_on_full_fleet: true,
              totalRoutes: plan.totalRoutes,
            },
          }
        : w
    );

    setSchedule(prev =>
      prev
        ? {
            ...prev,
            [dayKey]: { ...dayData, waves: updatedWaves },
          }
        : prev
    );
    setDirtyDays(prev => new Set(prev).add(dayKey));
  }

  async function saveSchedule() {
    if (!schedule || dirtyDays.size === 0) return;
    setSaving(true);
    try {
      const firstDirty = Array.from(dirtyDays)[0] as DayKey;
      const body = {
        ...schedule,
        selectedDOW: DAY_DOW[firstDirty],
      };
      const res = await droManage("saveSchedule", { body });
      if (res?.error) {
        showToast(false, res.error);
      } else {
        setDirtyDays(new Set());
        showToast(true, "Schedule saved successfully");
      }
    } catch {
      showToast(false, "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        {connectingMsg && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-700 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting to DRO… (first login takes ~15 seconds)
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 overflow-hidden animate-pulse">
              <div className="h-12 bg-slate-200" />
              <div className="p-5 space-y-3">
                <div className="h-5 bg-slate-100 rounded-lg w-3/4" />
                <div className="h-4 bg-slate-100 rounded-lg w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Calendar className="w-12 h-12 text-slate-200 mb-3" />
        <p className="text-[15px] font-semibold text-slate-500">No schedule data</p>
        <p className="text-[13px] text-slate-400 mt-1">Could not load schedule from DRO</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium border ${
          toast.ok
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {toast.ok
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}

      {/* Day cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DAY_KEYS.map(dayKey => {
          const colors = DAY_COLORS[dayKey];
          const dayData = schedule[dayKey] as DaySchedule;
          const wave = dayData?.waves?.[0];
          const isToday = dayKey === todayKey;
          const isDirty = dirtyDays.has(dayKey);

          return (
            <div
              key={dayKey}
              className={`rounded-2xl border-2 overflow-hidden shadow-sm transition-all ${
                isDirty
                  ? "border-amber-400 shadow-amber-100 shadow-md"
                  : isToday
                  ? `${colors.border} ring-2 ${colors.ring} shadow-md`
                  : colors.border
              }`}
            >
              {/* Card header */}
              <div className={`${colors.header} px-5 py-3 flex items-center justify-between`}>
                <span className="text-white font-extrabold text-[16px] capitalize">{dayKey}</span>
                <div className="flex items-center gap-2">
                  {isDirty && (
                    <span className="text-[10px] font-bold uppercase bg-white/20 text-white px-2 py-0.5 rounded-full">
                      Unsaved
                    </span>
                  )}
                  {isToday && (
                    <span className="text-[10px] font-bold uppercase bg-white text-slate-800 px-2 py-0.5 rounded-full">
                      TODAY
                    </span>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div className="bg-white p-5 min-h-40 flex flex-col gap-3">
                {wave ? (
                  <>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                        Current Plan
                      </p>
                      <span className={`inline-block text-[13px] font-bold px-3 py-1.5 rounded-lg ${colors.badge}`}>
                        {wave.routePlanName || `Plan ${wave.routePlanId}`}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500">
                      {wave.totalRoutes ?? 0} routes
                    </p>

                    {/* Plan picker */}
                    <div className="mt-auto">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                        Change Plan
                      </label>
                      <select
                        value={wave.routePlanId}
                        onChange={e => changeDayPlan(dayKey, Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-[13px] text-slate-800
                          font-medium outline-none focus:border-slate-400 transition bg-white cursor-pointer"
                      >
                        {plans.map(p => (
                          <option key={p.planId} value={p.planId}>
                            {p.name} ({p.totalRoutes} routes)
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-slate-400">No plan configured</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between pt-2">
        {dirtyDays.size > 0 && (
          <p className="text-[13px] text-amber-600 font-medium">
            {dirtyDays.size} day{dirtyDays.size > 1 ? "s" : ""} with unsaved changes
          </p>
        )}
        <div className="ml-auto">
          <button
            onClick={saveSchedule}
            disabled={saving || dirtyDays.size === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-[15px] font-bold
              bg-emerald-600 text-white hover:bg-emerald-700
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors shadow-sm"
          >
            {saving
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
              : <><Save className="w-5 h-5" /> Save Schedule</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
