"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Lock, Eye, EyeOff, Loader2, RefreshCw,
  CalendarDays, CalendarOff, Key,
  Home as HomeIcon, Star, User,
} from "lucide-react";
import { changeDriverPassword, changeMyUsername, clearPasswordForceChange } from "@/lib/actions/drivers";
import GateCodesTab from "./gate-codes-tab";
import type { GateCodeRow } from "@/lib/gate-code-constants";
import type { DswRow } from "./service-tab";
import HomeTab from "./home-tab";
import ScorePanel from "./score-panel";
import MePanel from "./me-panel";

type DriverTab = "home" | "schedule" | "codes" | "score" | "me";

type Review  = {
  id: number; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  improvement: string | null; createdAt: Date | null;
};
type Milestone    = { id: number; name: string; description: string | null; daysRequired: number; type: string; bonusAmount: number | null; icon: string };
type LeaderEntry  = { driverId: string; initials: string; avgScore: number; weeks: number };
type AssignedVehicle = { id: number; unitNumber: string; make: string; model: string; year: number; mileage: number; type: string } | null;
type DriverSchedule = { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean; notes: string | null } | null;
type TimeOffEntry = { id: number; startDate: string; endDate: string; reason: string; note: string | null };

const DAY_KEYS   = ["sun","mon","tue","wed","thu","fri","sat"] as const;

export default function DriverTabs({
  reviews, milestones, streakDays, driverId, claimedMilestoneIds, leaderboard, myRank, companyRating, goalMessage, assignedVehicle, driverSchedule, upcomingTimeOff, showRyde, showMilestones, showDsw, gateCodes, gateAreas, maintenanceRequests, activeVehicles, isAdmin, driverName, dswRows, myDswHistory, accentColor = "var(--brand)", currentUsername, mustChangePassword = false,
}: {
  reviews: Review[];
  milestones: Milestone[];
  streakDays: number;
  driverId: string;
  claimedMilestoneIds: Set<number>;
  leaderboard: LeaderEntry[];
  myRank: number;
  companyRating: number | null;
  goalMessage: string;
  assignedVehicle: AssignedVehicle;
  driverSchedule: DriverSchedule;
  upcomingTimeOff: TimeOffEntry[];
  showRyde: boolean;
  showMilestones: boolean;
  gateCodes: GateCodeRow[];
  gateAreas: string[];
  maintenanceRequests: any[];
  activeVehicles: { id: number; unitNumber: string; model: string }[];
  isAdmin?: boolean;
  driverName: string;
  dswRows: DswRow[];
  myDswHistory: DswRow[];
  showDsw: boolean;
  accentColor?: string;
  currentUsername?: string | null;
  mustChangePassword?: boolean;
}) {
  const [tab, setTab] = useState<DriverTab>("home");

  // First-login force password change modal
  const [forceModal, setForceModal]     = useState(mustChangePassword);
  const [forceCurrent, setForceCurrent] = useState("");
  const [forcePw, setForcePw]           = useState("");
  const [forceConfirm, setForceConfirm] = useState("");
  const [forceShowCur, setForceShowCur] = useState(false);
  const [forceShowNew, setForceShowNew] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [forceError, setForceError]     = useState("");

  // Pull-to-refresh
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Maintenance notification dot
  const [maintenanceDot, setMaintenanceDot] = useState(false);

  async function handleForcePassword(e: React.FormEvent) {
    e.preventDefault();
    setForceError("");
    if (!forceCurrent) { setForceError("Enter your temporary password."); return; }
    if (forcePw.length < 8) { setForceError("New password must be at least 8 characters."); return; }
    if (forcePw !== forceConfirm) { setForceError("Passwords don't match."); return; }
    setForceLoading(true);
    const result = await changeDriverPassword(driverId, forceCurrent, forcePw);
    setForceLoading(false);
    if ("error" in result) { setForceError(result.error ?? "Unknown error."); return; }
    await clearPasswordForceChange();
    setForceModal(false);
  }

  // Server-action wrappers passed to MePanel
  async function handleChangeUsername(newUsername: string): Promise<{ error?: string }> {
    const result = await changeMyUsername(driverId, newUsername);
    return "error" in result ? { error: result.error ?? "Failed." } : {};
  }

  async function handleChangePassword(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
    const result = await changeDriverPassword(driverId, currentPassword, newPassword);
    return "error" in result ? { error: result.error ?? "Unknown error." } : {};
  }

  // Pull-to-refresh effect
  useEffect(() => {
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const dist = e.changedTouches[0].clientY - startY;
      if (dist > 72 && window.scrollY === 0 && !refreshing) {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 1500);
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [router, refreshing]);

  // Maintenance notification dot effect
  useEffect(() => {
    const nonPending = maintenanceRequests.filter((r: any) => r.status !== "pending").length;
    const key = "mgops_maint_seen";
    const seen = parseInt(localStorage.getItem(key) ?? "0", 10);
    if (nonPending > seen) setMaintenanceDot(true);
  }, [maintenanceRequests]);

  // Listen for profile circle "goto-tab" events dispatched from the nav
  useEffect(() => {
    function handler(e: Event) {
      const t = (e as CustomEvent<string>).detail;
      goTab(t);
    }
    window.addEventListener("mgops:goto-driver-tab", handler);
    return () => window.removeEventListener("mgops:goto-driver-tab", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTab(t: string) {
    // Map legacy tab names to new 5-tab names
    const legacyMap: Record<string, DriverTab> = {
      account: "me",
      service: "score",
      maintenance: "me",
      reviews: "score",
      milestones: "me",
      bonuses: "me",
      leaderboard: "score",
    };
    const resolved = (legacyMap[t] ?? t) as DriverTab;
    if (["home", "schedule", "codes", "score", "me"].includes(resolved)) {
      setTab(resolved);
      if (resolved === "me") {
        const nonPending = maintenanceRequests.filter((r: any) => r.status !== "pending").length;
        localStorage.setItem("mgops_maint_seen", String(nonPending));
        setMaintenanceDot(false);
      }
    }
  }

  // Derive today's schedule for HomeTab
  const todayDow = new Date().getDay(); // 0=Sun
  const todayKey = DAY_KEYS[todayDow];
  const scheduleToday = driverSchedule
    ? { isWork: !!(driverSchedule[todayKey as keyof typeof driverSchedule]) }
    : null;

  // Derived values for HomeTab
  const ratedReviews = reviews.filter((r) => r.stars != null);
  const rydeAvg = ratedReviews.length
    ? ratedReviews.reduce((s, r) => s + r.stars!, 0) / ratedReviews.length
    : null;
  const leaderboardRank = myRank > 0 ? myRank : null;
  const vehicleNumber = assignedVehicle?.unitNumber ?? null;

  // Map reviews to ScorePanel format
  const scorePanelReviews = reviews.map((r) => ({
    id: r.id,
    rating: r.stars ?? 0,
    comment: r.content || null,
    date: r.createdAt ? r.createdAt.toLocaleDateString() : (r.week ?? ""),
    riderName: null as string | null,
  }));

  // Map leaderboard to ScorePanel format
  const scorePanelLeaderboard = leaderboard.map((entry) => ({
    driverId: entry.driverId,
    name: entry.initials,
    avg: entry.avgScore,
    reviewCount: entry.weeks,
  }));

  // Map milestones to MePanel format
  const mePanelMilestones = milestones.map((m) => ({
    id: m.id,
    label: m.name,
    target: m.daysRequired,
    progress: streakDays,
    unit: "days",
    earned: claimedMilestoneIds.has(m.id),
    rewardDescription: m.description,
  }));

  // Map activeVehicles to MePanel format (already matches { id, unitNumber })
  const mePanelVehicles = activeVehicles.map((v) => ({ id: v.id, unitNumber: v.unitNumber }));

  // Dock items
  type DockItem = {
    key: DriverTab;
    label: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  };

  const dockItems: DockItem[] = [
    { key: "home",     label: "Home",     icon: HomeIcon    },
    { key: "schedule", label: "Schedule", icon: CalendarDays },
    { key: "codes",    label: "Codes",    icon: Key         },
    ...(showRyde ? [{ key: "score" as DriverTab, label: "Score", icon: Star }] : []),
    { key: "me",       label: "Me",       icon: User        },
  ];

  const brand = accentColor;

  return (
    <div style={{ "--brand": brand } as React.CSSProperties}>
      {/* First-login force password change modal */}
      {forceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" style={{ backdropFilter: "blur(6px)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-orange-500" />
              </div>
              <h2 className="text-[18px] font-extrabold text-slate-900 leading-tight">Set your password</h2>
            </div>
            <p className="text-[13px] text-slate-500 mb-6 ml-12">This is your first login. Please set a personal password before continuing.</p>
            <form onSubmit={handleForcePassword} className="flex flex-col gap-3">
              <div className="relative">
                <input
                  type={forceShowCur ? "text" : "password"}
                  placeholder="Temporary password"
                  value={forceCurrent}
                  onChange={(e) => setForceCurrent(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                  autoFocus
                />
                <button type="button" onClick={() => setForceShowCur(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {forceShowCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={forceShowNew ? "text" : "password"}
                  placeholder="New password (min 8 characters)"
                  value={forcePw}
                  onChange={(e) => setForcePw(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                />
                <button type="button" onClick={() => setForceShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {forceShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type="password"
                placeholder="Confirm new password"
                value={forceConfirm}
                onChange={(e) => setForceConfirm(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
              {forceError && <p className="text-[12px] text-red-500 font-medium">{forceError}</p>}
              <button
                type="submit"
                disabled={forceLoading}
                className="mt-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-bold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {forceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set Password & Continue"}
              </button>
            </form>
          </div>
        </div>
      )}

      {refreshing && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-lg border border-slate-200">
          <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-spin" />
          <span className="text-[12px] font-semibold text-slate-600">Refreshing…</span>
        </div>
      )}

      {/* Tab content · pb-28 so dock doesn't overlap */}
      <div className="pb-32 flex flex-col gap-4">

        {/* ── Home tab ─────────────────────────────────── */}
        {tab === "home" && (
          <HomeTab
            driverName={driverName}
            streakDays={streakDays}
            scheduleToday={scheduleToday}
            rydeAvg={rydeAvg}
            reviewCount={reviews.length}
            leaderboardRank={leaderboardRank}
            vehicleNumber={vehicleNumber}
            workAreaName={null}
            showRyde={showRyde}
            onNavigate={(dest) => setTab(dest)}
          />
        )}

        {/* ── Schedule tab ──────────────────────────────── */}
        {tab === "schedule" && (
          <>
            {/* Streak badge — shown at top of Schedule tab when active */}
            {streakDays > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl self-start"
                style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                <span className="text-base leading-none">🔥</span>
                <span className="text-[13px] font-bold" style={{ color: "#92400e" }}>
                  {streakDays} day streak
                </span>
              </div>
            )}

            {/* 2-week calendar card */}
            <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <h2 className="text-[15px] font-bold text-slate-900">My Schedule</h2>
              </div>
              {(() => {
                const todayDate = new Date();
                const todayStr = todayDate.toISOString().slice(0, 10);
                // Start from Sunday of current week
                const startOfWeek = new Date(todayDate);
                startOfWeek.setDate(todayDate.getDate() - todayDate.getDay());
                const DAY_KEYS_LOCAL = ["sun","mon","tue","wed","thu","fri","sat"] as const;
                const calDays = Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(startOfWeek);
                  d.setDate(startOfWeek.getDate() + i);
                  const dateStr = d.toISOString().slice(0, 10);
                  const dow = d.getDay();
                  const dayKey = DAY_KEYS_LOCAL[dow];
                  const isWork = driverSchedule ? !!(driverSchedule[dayKey as keyof typeof driverSchedule]) : false;
                  const timeOffEntry = upcomingTimeOff.find(t => t.startDate <= dateStr && t.endDate >= dateStr) ?? null;
                  return { d, dateStr, dow, dateNum: d.getDate(), isToday: dateStr === todayStr, isWork, timeOffEntry };
                });
                const DOW_LABELS_2 = ["Su","Mo","Tu","We","Th","Fr","Sa"];
                // Month label: use the month of the first day of the current week
                const monthLabel = startOfWeek.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                return (
                  <div className="px-5 pt-4 pb-5 flex flex-col gap-5">
                    {/* Month header */}
                    <p className="text-[13px] font-bold text-slate-700 -mb-2">{monthLabel}</p>
                    {[
                      { label: "This Week", days: calDays.slice(0, 7), muted: false },
                      { label: "Next Week", days: calDays.slice(7), muted: true },
                    ].map(({ label, days, muted }) => (
                      <div key={label} style={{ opacity: muted ? 0.65 : 1 }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">{label}</p>
                        <div className="grid grid-cols-7 gap-1">
                          {days.map((day) => {
                            const isOff = !!day.timeOffEntry;
                            const isWorkDay = day.isWork && !isOff;
                            return (
                              <div
                                key={day.dateStr}
                                className="flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                                style={{
                                  background: day.isToday
                                    ? "var(--brand)"
                                    : isOff ? "#fffbeb"
                                    : isWorkDay ? "var(--brand)"
                                    : "#F8FAFC",
                                  opacity: day.isToday ? 1 : undefined,
                                  boxShadow: day.isToday ? "0 0 0 2px var(--brand), 0 0 0 4px rgba(255,98,0,0.18)" : undefined,
                                }}
                              >
                                <span
                                  className="text-[9px] font-bold uppercase"
                                  style={{
                                    color: day.isToday
                                      ? "rgba(255,255,255,0.8)"
                                      : isOff ? "#d97706"
                                      : isWorkDay ? "rgba(255,255,255,0.75)"
                                      : "#CBD5E1"
                                  }}
                                >
                                  {DOW_LABELS_2[day.dow]}
                                </span>
                                <span
                                  className="text-[15px] font-extrabold leading-none"
                                  style={{
                                    color: day.isToday
                                      ? "#ffffff"
                                      : isOff ? "#b45309"
                                      : isWorkDay ? "#ffffff"
                                      : "#CBD5E1"
                                  }}
                                >
                                  {day.dateNum}
                                </span>
                                {isOff && !day.isToday && (
                                  <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                                    style={{ background: "#fef3c7", color: "#b45309" }}>Off</span>
                                )}
                                {!isOff && !isWorkDay && !day.isToday && (
                                  <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "#CBD5E1" }}>-</span>
                                )}
                                {(isWorkDay || day.isToday) && !isOff && (
                                  <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                                    style={{ background: "rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.9)" }}>
                                    {day.isToday && !isWorkDay ? "Today" : "On"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {driverSchedule?.notes && (
                      <p className="text-[12px] text-slate-500 italic pt-1 border-t border-slate-100">{driverSchedule.notes}</p>
                    )}
                    {!driverSchedule && (
                      <p className="text-[13px] text-slate-400 text-center py-4">Your schedule hasn&apos;t been set yet. Contact your manager.</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <CalendarOff className="w-4 h-4 text-slate-400" />
                <h2 className="text-[15px] font-bold text-slate-900">Upcoming Time Off</h2>
              </div>
              {upcomingTimeOff.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-slate-400">No upcoming time off on record.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingTimeOff.map((entry) => (
                    <div key={entry.id} className="px-5 py-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-slate-800">{entry.reason}</span>
                        <p className="text-[12px] font-mono text-slate-400 mt-0.5">
                          {fmtDate(entry.startDate)}{entry.startDate !== entry.endDate ? ` → ${fmtDate(entry.endDate)}` : ""}
                        </p>
                        {entry.note && <p className="text-[12px] text-slate-500 italic mt-0.5">{entry.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Gate Codes tab ────────────────────────────── */}
        {tab === "codes" && (
          <GateCodesTab
            initial={gateCodes}
            areas={gateAreas}
            driverId={driverId}
            driverName={driverName}
            isAdmin={isAdmin ?? false}
          />
        )}

        {/* ── Score tab ─────────────────────────────────── */}
        {tab === "score" && showRyde && (
          <ScorePanel
            rydeAvg={rydeAvg}
            reviewCount={reviews.length}
            reviews={scorePanelReviews}
            leaderboard={scorePanelLeaderboard}
            currentDriverId={driverId}
            serviceRows={dswRows}
            myDswHistory={myDswHistory}
            showDsw={showDsw}
            accent={accentColor}
          />
        )}

        {/* ── Me tab ────────────────────────────────────── */}
        {tab === "me" && (
          <MePanel
            showMilestones={showMilestones}
            milestones={mePanelMilestones}
            bonuses={[]}
            driverName={driverName}
            driverUsername={currentUsername ?? ""}
            onChangeUsername={handleChangeUsername}
            onChangePassword={handleChangePassword}
            driverId={driverId}
            vehicles={mePanelVehicles}
            maintenanceRequests={maintenanceRequests}
          />
        )}
      </div>

      {/* Bottom dock */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 flex z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {dockItems.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => goTab(key)}
              className="flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 relative gap-0.5"
            >
              {/* Active indicator bar */}
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ backgroundColor: "var(--brand)" }}
                />
              )}
              {/* Maintenance dot on Me tab */}
              {key === "me" && maintenanceDot && !active && (
                <span className="absolute top-1.5 right-[calc(50%-14px)] w-2 h-2 bg-red-500 rounded-full border border-white" />
              )}
              <Icon
                className={`w-5 h-5 transition-colors ${active ? "fill-current" : "text-slate-600"}`}
                style={active ? { color: "var(--brand)" } : {}}
              />
              <span
                className={`text-[10px] font-semibold transition-colors ${active ? "" : "text-slate-600"}`}
                style={active ? { color: "var(--brand)" } : {}}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}
