"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Star, ThumbsUp, ThumbsDown, Eye, EyeOff, Loader2, Lock,
  Truck, CalendarDays, CalendarOff,
  Key, User, MessageSquare, Wrench, Trophy, MoreHorizontal,
  Award, Gift, Activity, X, RefreshCw,
} from "lucide-react";
import { changeDriverPassword, changeMyUsername } from "@/lib/actions/drivers";
import GateCodesTab from "./gate-codes-tab";
import MaintenanceTab from "./maintenance-tab";
import ServiceTab from "./service-tab";
import type { DswRow } from "./service-tab";
import type { GateCodeRow } from "@/lib/gate-code-constants";

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

const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] as const;
const DAY_KEYS   = ["sun","mon","tue","wed","thu","fri","sat"] as const;

const RATING_GOAL = 4.0;

// Card styles
const glass = {
  background: "#ffffff",
  border: "1px solid #F1F5F9",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
} as const;

const glassBright = {
  background: "#ffffff",
  border: "1px solid #E8EDF5",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)",
} as const;

export default function DriverTabs({
  reviews, milestones, streakDays, driverId, claimedMilestoneIds, leaderboard, myRank, companyRating, goalMessage, assignedVehicle, driverSchedule, upcomingTimeOff, showRyde, showMilestones, showDsw, gateCodes, gateAreas, maintenanceRequests, activeVehicles, isAdmin, driverName, dswRows, myDswHistory, accentColor = "var(--brand)", currentUsername,
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
}) {
  const defaultTab = "schedule";
  const [tab, setTab] = useState<"score" | "schedule" | "service" | "gatecodes" | "maintenance" | "reviews" | "milestones" | "bonuses" | "leaderboard" | "account">(defaultTab);
  const [reviewFilter, setReviewFilter] = useState<"all" | "positive" | "negative">("all");
  const [showMore, setShowMore] = useState(false);

  // Account / password change state
  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [pwLoading, setPwLoading]     = useState(false);
  const [pwError, setPwError]         = useState("");
  const [pwSuccess, setPwSuccess]     = useState(false);

  // Username change state
  const [newUsername, setNewUsername] = useState(currentUsername ?? "");
  const [unLoading, setUnLoading]     = useState(false);
  const [unError, setUnError]         = useState("");
  const [unSuccess, setUnSuccess]     = useState(false);

  // Pull-to-refresh
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Score count-up animation
  const [displayScore, setDisplayScore] = useState(0);

  // Maintenance notification dot
  const [maintenanceDot, setMaintenanceDot] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    setPwLoading(true);
    const result = await changeDriverPassword(driverId, currentPw, newPw);
    setPwLoading(false);
    if ("error" in result) { setPwError(result.error ?? "Unknown error."); return; }
    setPwSuccess(true);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
  }

  const ratedReviews = reviews.filter((r) => r.stars != null);
  const avgScore = ratedReviews.length
    ? ratedReviews.reduce((s, r) => s + r.stars!, 0) / ratedReviews.length
    : null;

  // Score count-up animation effect
  useEffect(() => {
    if (avgScore === null) return;
    const target = avgScore;
    const duration = 900;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else setDisplayScore(target);
    };
    requestAnimationFrame(tick);
  }, [avgScore]);

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
    // Count non-pending requests (i.e., management has updated them)
    const nonPending = maintenanceRequests.filter((r: any) => r.status !== "pending").length;
    const key = "mgops_maint_seen";
    const seen = parseInt(localStorage.getItem(key) ?? "0", 10);
    if (nonPending > seen) setMaintenanceDot(true);
  }, [maintenanceRequests]);

  const scoreColor =
    avgScore === null ? "text-slate-400"
    : avgScore >= 4.5 ? "text-emerald-400"
    : avgScore >= 3   ? "text-amber-400"
    : "text-red-400";

  const filteredReviews = reviewFilter === "all" ? reviews : reviews.filter((r) => r.type === reviewFilter);
  const earnedMilestones = milestones.filter((m) => streakDays >= m.daysRequired);
  const nextMilestone    = milestones.find((m) => streakDays < m.daysRequired);
  const atGoal = companyRating != null && companyRating >= RATING_GOAL;
  const goalPct = companyRating != null ? Math.min(100, (companyRating / RATING_GOAL) * 100) : 0;

  // Bottom dock — primary tabs
  const dockTabs = ([
    { key: "score",    label: "Score",    Icon: Star,        show: showRyde },
    { key: "schedule", label: "Schedule", Icon: CalendarDays, show: true },
    { key: "gatecodes",label: "Codes",    Icon: Key,         show: true },
    { key: "account",  label: "Account",  Icon: User,        show: true },
  ] as const).filter(t => t.show);

  // More sheet — secondary tabs
  const moreTabs = ([
    { key: "service",     label: "Service",     Icon: Activity,      show: showDsw },
    { key: "maintenance", label: "Maintenance", Icon: Wrench,        show: true },
    { key: "reviews",     label: `Reviews (${reviews.length})`, Icon: MessageSquare, show: showRyde },
    { key: "milestones",  label: "Milestones",  Icon: Award,         show: showMilestones },
    { key: "bonuses",     label: "Bonuses",     Icon: Gift,          show: showMilestones },
    { key: "leaderboard", label: "Leaderboard", Icon: Trophy,        show: showRyde },
  ] as const).filter(t => t.show);

  const tabInMore = moreTabs.some(t => t.key === tab);

  function goTab(key: typeof tab) {
    setTab(key);
    setShowMore(false);
    if (key === "maintenance") {
      const nonPending = maintenanceRequests.filter((r: any) => r.status !== "pending").length;
      localStorage.setItem("mgops_maint_seen", String(nonPending));
      setMaintenanceDot(false);
    }
  }

  const brand = accentColor;

  return (
    <div style={{ "--brand": brand } as React.CSSProperties}>
      {refreshing && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-lg border border-slate-200">
          <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-spin" />
          <span className="text-[12px] font-semibold text-slate-600">Refreshing…</span>
        </div>
      )}

      {/* Milestone progress bar */}
      {showMilestones && milestones.length > 0 && (() => {
        const maxDays = milestones[milestones.length - 1].daysRequired;
        const pct = Math.min(100, (streakDays / maxDays) * 100);
        return (
          <div className="mb-5 rounded-3xl px-5 pt-4 pb-5" style={glassBright}>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔥</span>
              <span className="text-[14px] font-bold" style={{ color: "#0F172A" }}>
                {streakDays === 0 ? "No streak yet" : `${streakDays} day streak`}
              </span>
              {nextMilestone && streakDays > 0 && (
                <span className="ml-auto text-[11px] font-medium shrink-0" style={{ color: "#94A3B8" }}>
                  {nextMilestone.daysRequired - streakDays}d to {nextMilestone.icon}
                </span>
              )}
            </div>
            {streakDays === 0 && (
              <p className="text-[11px] mt-0.5 pl-8" style={{ color: "#94A3B8" }}>
                Start with a clean week to begin earning milestones
              </p>
            )}
            <div className="relative mt-10 mx-2">
              <div className="h-[3px] rounded-full" style={{ background: "#F1F5F9" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--brand), var(--brand))" }}
                />
              </div>
              {milestones.map((m) => {
                const dotPct = (m.daysRequired / maxDays) * 100;
                const earned = streakDays >= m.daysRequired;
                return (
                  <div
                    key={m.id}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${dotPct}%` }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-300"
                      style={earned ? {
                        background: "linear-gradient(135deg, var(--brand), var(--brand))",
                        border: "2px solid #fff",
                        boxShadow: "0 0 0 3px rgba(255,98,0,0.2), 0 2px 8px rgba(255,98,0,0.3)",
                        color: "white",
                      } : {
                        background: "#F8FAFC",
                        border: "2px solid #E2E8F0",
                        color: "#CBD5E1",
                      }}
                    >
                      {earned ? "✓" : m.type === "bonus" ? <Lock className="w-3 h-3" /> : ""}
                    </div>
                    <div className="mt-2 flex flex-col items-center gap-0.5">
                      <span className="text-sm leading-none">{m.icon}</span>
                      <span className="text-[9px] font-semibold" style={{ color: "#CBD5E1" }}>{m.daysRequired}d</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="h-11" />
          </div>
        );
      })()}

      {/* Tab content — pb-28 so dock doesn't overlap */}
      <div className="pb-32 flex flex-col gap-4">

        {/* ── Score tab ─────────────────────────────────── */}
        {tab === "score" && (
          <>
            {/* My Ryde Score — hero card (leads now) */}
            <div className="rounded-3xl overflow-hidden" style={glassBright}>
              {/* Orange top bar */}
              <div className="h-1" style={{ background: "linear-gradient(90deg, var(--brand), var(--brand))" }} />
              <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-4" style={{ color: "#94A3B8" }}>My Ryde Score</p>
                {avgScore !== null ? (
                  <>
                    <div className="flex gap-1 mb-4">
                      {[1,2,3,4,5].map((i) => (
                        <Star key={i} className={`w-7 h-7 ${i <= Math.round(avgScore) ? "text-amber-400 fill-amber-400" : "fill-slate-100 text-slate-100"}`} />
                      ))}
                    </div>
                    <p className="font-bold leading-none tracking-tight" style={{
                      fontSize: 88,
                      color: avgScore >= 4.5 ? "#16a34a" : avgScore >= 3 ? "#d97706" : "#dc2626",
                    }}>
                      {displayScore.toFixed(1)}
                    </p>
                    <p className="text-[13px] mt-3 font-medium" style={{ color: "#94A3B8" }}>
                      Based on {ratedReviews.length} review{ratedReviews.length !== 1 ? "s" : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-[15px] py-8 font-medium" style={{ color: "#94A3B8" }}>No reviews recorded yet</p>
                )}
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100">
                {[
                  { label: "Avg Score",     value: avgScore !== null ? avgScore.toFixed(1) : "—" },
                  { label: "Total Reviews", value: reviews.length },
                  { label: "Positive",      value: reviews.filter((r) => r.type === "positive").length },
                ].map((s) => (
                  <div key={s.label} className="px-4 py-5 text-center">
                    <p className="text-[24px] font-bold text-slate-800">{s.value}</p>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {ratedReviews.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3">Recent Ratings</p>
                  <div className="flex flex-col gap-1">
                    {ratedReviews.slice(0, 6).map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <span className="text-[12px] text-slate-400">{r.week ?? (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "")}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            r.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                          }`}>{r.type}</span>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map((i) => (
                              <Star key={i} className={`w-3.5 h-3.5 ${i <= r.stars! ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Company rating secondary card */}
            {companyRating !== null && (
              <div className="rounded-3xl px-6 py-5" style={glass}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#94A3B8" }}>Station Rating</p>
                <div className="flex items-end gap-3 mb-3">
                  <p className="text-[40px] font-bold leading-none" style={{ color: atGoal ? "#16a34a" : "#d97706" }}>
                    {companyRating.toFixed(2)}
                  </p>
                  <p className="text-[13px] font-medium pb-1.5" style={{ color: "#64748B" }}>/ {RATING_GOAL} goal</p>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "#F1F5F9" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${goalPct}%`,
                      background: atGoal ? "linear-gradient(90deg,#16a34a,#4ade80)" : "linear-gradient(90deg,var(--brand),var(--brand))",
                    }}
                  />
                </div>
                {goalMessage && (
                  <p className="text-[12px] mt-3 font-medium" style={{ color: "#64748B" }}>{goalMessage}</p>
                )}
              </div>
            )}

            {/* Assigned vehicle card */}
            {assignedVehicle && (
              <div className="rounded-3xl px-6 py-5 flex items-center gap-4" style={glass}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "#F1F5F9" }}>
                  <Truck className="w-6 h-6" style={{ color: "#64748B" }} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: "#94A3B8" }}>Assigned Vehicle</p>
                  <p className="text-[16px] font-bold" style={{ color: "#0F172A" }}>Unit {assignedVehicle.unitNumber}</p>
                  <p className="text-[12px]" style={{ color: "#64748B" }}>{assignedVehicle.year} {assignedVehicle.make} {assignedVehicle.model}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Schedule tab ──────────────────────────────── */}
        {tab === "schedule" && (
          <>
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
                const calDays = Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(startOfWeek);
                  d.setDate(startOfWeek.getDate() + i);
                  const dateStr = d.toISOString().slice(0, 10);
                  const dow = d.getDay();
                  const dayKey = DAY_KEYS[dow];
                  const isWork = driverSchedule ? !!(driverSchedule[dayKey as keyof typeof driverSchedule]) : false;
                  const timeOffEntry = upcomingTimeOff.find(t => t.startDate <= dateStr && t.endDate >= dateStr) ?? null;
                  return { d, dateStr, dow, dateNum: d.getDate(), isToday: dateStr === todayStr, isWork, timeOffEntry };
                });
                const DOW_LABELS = ["S","M","T","W","T","F","S"];
                return (
                  <div className="px-5 pt-4 pb-5 flex flex-col gap-5">
                    {[
                      { label: "This Week", days: calDays.slice(0, 7) },
                      { label: "Next Week", days: calDays.slice(7) },
                    ].map(({ label, days }) => (
                      <div key={label}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">{label}</p>
                        <div className="grid grid-cols-7 gap-1">
                          {days.map((day) => {
                            const isOff = !!day.timeOffEntry;
                            const isWork = day.isWork && !isOff;
                            return (
                              <div
                                key={day.dateStr}
                                className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all ${
                                  day.isToday ? "ring-2 ring-orange-400 ring-offset-1" : ""
                                }`}
                                style={{
                                  background: isOff ? "#fffbeb" : isWork ? "var(--brand)" : "#F8FAFC",
                                }}
                              >
                                <span
                                  className="text-[9px] font-bold uppercase"
                                  style={{ color: isOff ? "#d97706" : isWork ? "rgba(255,255,255,0.75)" : "#CBD5E1" }}
                                >
                                  {DOW_LABELS[day.dow]}
                                </span>
                                <span
                                  className="text-[15px] font-extrabold leading-none"
                                  style={{ color: isOff ? "#b45309" : isWork ? "#ffffff" : "#CBD5E1" }}
                                >
                                  {day.dateNum}
                                </span>
                                {isOff && (
                                  <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "#d97706" }}>Off</span>
                                )}
                                {!isOff && !isWork && (
                                  <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "#CBD5E1" }}>—</span>
                                )}
                                {isWork && (
                                  <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.6)" }}>On</span>
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

        {/* ── Service tab ───────────────────────────────── */}
        {tab === "service" && (
          <ServiceTab rows={dswRows} myDriverId={driverId} myHistory={myDswHistory} accent={brand} />
        )}

        {/* ── Gate Codes tab ────────────────────────────── */}
        {tab === "gatecodes" && (
          <GateCodesTab
            initial={gateCodes}
            areas={gateAreas}
            driverId={driverId}
            driverName={driverName}
            isAdmin={isAdmin ?? false}
          />
        )}

        {/* ── Maintenance tab ───────────────────────────── */}
        {tab === "maintenance" && (
          <MaintenanceTab
            initial={maintenanceRequests}
            driverId={driverId}
            driverName={driverName}
            vehicles={activeVehicles}
            accent={brand}
          />
        )}

        {/* ── Reviews tab ───────────────────────────────── */}
        {tab === "reviews" && (
          <>
            <div className="flex gap-2">
              {([
                { key: "all",      label: "All",      count: reviews.length },
                { key: "positive", label: "Positive", count: reviews.filter((r) => r.type === "positive").length },
                { key: "negative", label: "Negative", count: reviews.filter((r) => r.type === "negative").length },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setReviewFilter(key)}
                  className={`px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${
                    reviewFilter === key
                      ? key === "positive" ? "bg-emerald-500 text-white"
                      : key === "negative" ? "bg-red-500 text-white"
                      : "bg-slate-900 text-white"
                      : "text-slate-500"
                  }`}
                  style={reviewFilter !== key ? { background: "#F1F5F9" } : {}}
                >
                  {label} ({count})
                </button>
              ))}
            </div>

            {filteredReviews.length === 0 ? (
              <div className="rounded-3xl px-6 py-10 text-center" style={glass}>
                <p className="text-[13px]" style={{ color: "#94A3B8" }}>No {reviewFilter !== "all" ? reviewFilter : ""} reviews yet.</p>
              </div>
            ) : (
              filteredReviews.map((r) => (
                <div key={r.id} className="bg-white rounded-3xl shadow-[0_1px_8px_rgba(0,0,0,0.06)] px-5 py-4 flex gap-3">
                  <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    r.type === "positive" ? "bg-emerald-100" : "bg-red-100"
                  }`}>
                    {r.type === "positive"
                      ? <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                      : <ThumbsDown className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.stars != null && (
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map((i) => (
                            <Star key={i} className={`w-3 h-3 ${i <= r.stars! ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
                          ))}
                        </div>
                      )}
                      {r.category && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {r.category}
                        </span>
                      )}
                      {r.week && <span className="text-[10px] font-mono text-slate-400">{r.week}</span>}
                    </div>
                    <p className="text-[13px] text-slate-700 leading-relaxed">{r.content}</p>
                    {r.improvement && (
                      <div className="mt-2 pl-3 border-l-2 border-amber-300">
                        <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Improvement Tip</p>
                        <p className="text-[12px] text-amber-800">{r.improvement}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── Milestones tab ────────────────────────────── */}
        {tab === "milestones" && (
          <>
            <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--brand))" }}>
                🔥
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-0.5">Current Streak</p>
                <p className="text-[28px] font-bold text-slate-900 leading-none">
                  {streakDays} <span className="text-[16px] font-medium text-slate-400">days clean</span>
                </p>
              </div>
            </div>

            <div className="rounded-3xl px-4 py-3 flex gap-3 items-start" style={glass}>
              <span className="text-base shrink-0">⚠️</span>
              <p className="text-[12px] leading-relaxed" style={{ color: "#64748B" }}>
                One <span className="font-semibold" style={{ color: "#0F172A" }}>at-fault review</span> resets your streak to day 1. Rewards already earned are yours to keep — but you won&apos;t earn them twice.
              </p>
            </div>

            {milestones.map((m) => {
              const claimed  = claimedMilestoneIds.has(m.id);
              const unlocked = streakDays >= m.daysRequired && !claimed;
              const daysLeft = m.daysRequired - streakDays;

              if (claimed) {
                return (
                  <div key={m.id} className="bg-white rounded-3xl shadow-[0_1px_8px_rgba(0,0,0,0.05)] px-5 py-4 flex items-center gap-4 opacity-70">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0 text-xl">{m.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-semibold text-slate-700">{m.name}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Claimed</span>
                      </div>
                      <p className="text-[12px] text-slate-400 mt-0.5">Earned at {m.daysRequired} days — yours to keep.</p>
                    </div>
                  </div>
                );
              }

              if (unlocked) {
                return (
                  <div key={m.id} className="rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(255,98,0,0.3)]">
                    <div className="px-5 py-5" style={{ background: "linear-gradient(135deg, var(--brand), var(--brand))" }}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{m.icon}</span>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.65)" }}>Reward Earned 🎉</p>
                          <p className="text-[18px] font-bold text-white leading-tight">{m.name}</p>
                        </div>
                      </div>
                      {m.description && <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{m.description}</p>}
                      {m.type === "bonus" && m.bonusAmount && (
                        <p className="text-[20px] font-bold text-white mt-2">${m.bonusAmount} added to your next check</p>
                      )}
                    </div>
                    <div className="bg-white px-5 py-3">
                      <p className="text-[12px] text-slate-500">Your manager will be notified. Show this screen when collecting your reward.</p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="rounded-3xl px-5 py-4 flex items-center gap-4" style={glass}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-xl grayscale opacity-40"
                    style={{ background: "#F1F5F9" }}>{m.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold" style={{ color: "#CBD5E1" }}>{m.name}</p>
                    {m.description && <p className="text-[12px] mt-0.5" style={{ color: "#E2E8F0" }}>{m.description}</p>}
                    {m.type === "bonus" && m.bonusAmount && (
                      <p className="text-[12px] font-semibold mt-0.5" style={{ color: "#CBD5E1" }}>${m.bonusAmount} bonus</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[18px] font-bold" style={{ color: "#94A3B8" }}>{daysLeft}</p>
                    <p className="text-[10px] font-semibold" style={{ color: "#CBD5E1" }}>days left</p>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── Bonuses tab ───────────────────────────────── */}
        {tab === "bonuses" && (() => {
          const bonusMilestone = milestones.find((m) => m.type === "bonus");
          const bonusUnlocked  = bonusMilestone ? claimedMilestoneIds.has(bonusMilestone.id) || streakDays >= (bonusMilestone.daysRequired) : false;
          const daysLeft       = bonusMilestone ? Math.max(0, bonusMilestone.daysRequired - streakDays) : 0;

          if (!bonusUnlocked) {
            return (
              <>
                <div className="rounded-3xl px-6 py-10 flex flex-col items-center text-center" style={glassBright}>
                  <div className="text-5xl mb-4">🔒</div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "#94A3B8" }}>Locked</p>
                  <h2 className="text-[22px] font-bold mb-2" style={{ color: "#0F172A" }}>Bonus Structure</h2>
                  <p className="text-[14px] leading-relaxed max-w-xs" style={{ color: "#64748B" }}>
                    Hit a <span className="font-bold" style={{ color: "#0F172A" }}>90-day clean streak</span> to unlock your performance bonus program — no at-fault reviews, no safety incidents.
                  </p>
                  {daysLeft > 0 && (
                    <div className="mt-6 px-5 py-3 rounded-2xl" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <p className="text-[28px] font-bold leading-none" style={{ color: "#0F172A" }}>{daysLeft}</p>
                      <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#94A3B8" }}>days remaining</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-3xl px-5 py-5 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-4">What you&apos;ll unlock</p>
                  <div className="flex flex-col gap-4">
                    {[
                      { icon: "💰", label: "Performance Bonus", desc: "Cash added directly to your paycheck for hitting the 90-day mark." },
                      { icon: "📈", label: "Bonus Pay Eligibility", desc: "Stay clean and keep qualifying for ongoing performance bonuses." },
                      { icon: "🏆", label: "Top Performer Status", desc: "Recognition as one of MyGroundOps's most reliable drivers." },
                    ].map((item) => (
                      <div key={item.label} className="flex gap-3 items-start">
                        <span className="text-xl shrink-0">{item.icon}</span>
                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">{item.label}</p>
                          <p className="text-[12px] text-slate-400 mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          }

          return (
            <div className="rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(255,98,0,0.25)]">
              <div className="px-5 py-5" style={{ background: "linear-gradient(135deg, var(--brand), var(--brand))" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.65)" }}>Unlocked ✓</p>
                <h2 className="text-[22px] font-bold text-white leading-tight">Bonus Structure</h2>
                <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>You qualified by maintaining a 90-day clean streak. This is yours.</p>
              </div>
              <div className="bg-white px-5 py-5 flex flex-col gap-4">
                {milestones.filter((m) => m.type === "bonus").map((m) => (
                  <div key={m.id} className="flex items-center gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <span className="text-3xl">{m.icon}</span>
                    <div className="flex-1">
                      <p className="text-[15px] font-bold text-slate-900">{m.name}</p>
                      {m.description && <p className="text-[12px] text-slate-500 mt-0.5">{m.description}</p>}
                    </div>
                    {m.bonusAmount && (
                      <p className="text-[20px] font-bold text-emerald-600 shrink-0">${m.bonusAmount}</p>
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-slate-400 text-center pt-1">
                  Contact your station manager if you have questions about your bonus payout.
                </p>
              </div>
            </div>
          );
        })()}

        {/* ── Leaderboard tab ───────────────────────────── */}
        {tab === "leaderboard" && (
          <>
            {myRank > 0 && (
              <div className="rounded-3xl px-5 py-4 flex items-center gap-4" style={glassBright}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-bold text-white"
                  style={{ background: "linear-gradient(135deg, var(--brand), var(--brand))" }}>
                  #{myRank}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: "#94A3B8" }}>Your Rank</p>
                  <p className="text-[18px] font-bold leading-none" style={{ color: "#0F172A" }}>
                    {myRank === 1 ? "🏆 Top of the fleet" : myRank <= 3 ? "🔥 Top 3 — keep it up" : `${myRank} of ${leaderboard.length}`}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-slate-900">Top Performers</h2>
                <p className="text-[11px] text-slate-400">Avg Ryde Score · All time</p>
              </div>

              {leaderboard.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-[13px] text-slate-400">No scores yet. Check back after your first review is entered.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {leaderboard.map((entry, i) => {
                    const isMe = entry.driverId === driverId;
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                    const sc = entry.avgScore >= 4.5 ? "text-emerald-600" : entry.avgScore >= 3 ? "text-amber-500" : "text-red-500";

                    return (
                      <div key={entry.driverId}
                        className={`px-6 py-4 flex items-center gap-4 ${isMe ? "bg-orange-50" : ""}`}>
                        <div className="w-8 text-center shrink-0">
                          {medal
                            ? <span className="text-xl">{medal}</span>
                            : <span className="text-[13px] font-bold text-slate-400">#{i + 1}</span>}
                        </div>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold ${
                          isMe ? "text-white" : "text-slate-600 bg-slate-100"
                        }`}
                          style={isMe ? { background: "linear-gradient(135deg, var(--brand), var(--brand))" } : {}}>
                          {entry.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[14px] font-semibold ${isMe ? "text-orange-700" : "text-slate-800"}`}>
                            {entry.initials}{isMe ? " (You)" : ""}
                          </p>
                          <p className="text-[11px] text-slate-400">{entry.weeks} review{entry.weeks !== 1 ? "s" : ""} rated</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map((s) => (
                              <Star key={s} className={`w-3 h-3 ${s <= Math.round(entry.avgScore) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
                            ))}
                          </div>
                          <span className={`text-[14px] font-bold ${sc}`}>{entry.avgScore.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-center" style={{ color: "#CBD5E1" }}>Driver names are shown as initials only.</p>
          </>
        )}

        {/* ── Account tab ───────────────────────────────── */}
        {tab === "account" && (
          <div className="flex flex-col gap-4">
          {/* Username card */}
          <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-[15px] font-bold text-slate-900">Username</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">This is what you use to log in.</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <input
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="Choose a username"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-[14px] text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition"
              />
              {unError && <p className="text-[12px] text-red-500 font-medium">{unError}</p>}
              {unSuccess && <p className="text-[12px] text-emerald-600 font-medium">Username updated. Use it next time you log in.</p>}
              <button
                onClick={async () => {
                  setUnError(""); setUnSuccess(false); setUnLoading(true);
                  const r = await changeMyUsername(driverId, newUsername);
                  setUnLoading(false);
                  if ("error" in r) { setUnError(r.error ?? "Failed."); return; }
                  setUnSuccess(true);
                }}
                disabled={unLoading || newUsername.trim().length < 3 || newUsername.trim() === (currentUsername ?? "")}
                className="w-full py-3 rounded-2xl text-[14px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "var(--brand)" }}
              >
                {unLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Username
              </button>
            </div>
          </div>
          {/* Password card */}
          <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-[15px] font-bold text-slate-900">Change Password</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">Update your login password below.</p>
            </div>
            <form onSubmit={handleChangePassword} className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-[14px] text-slate-800 outline-none pr-10 focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition"
                  />
                  <button type="button" onClick={() => setShowCurrent((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-[14px] text-slate-800 outline-none pr-10 focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition"
                  />
                  <button type="button" onClick={() => setShowNew((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-[14px] text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition"
                />
              </div>

              {pwError && <p className="text-[12px] text-red-500 font-medium">{pwError}</p>}
              {pwSuccess && <p className="text-[12px] text-emerald-600 font-medium">Password updated successfully.</p>}

              <button
                type="submit"
                disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                className="w-full py-3 rounded-2xl text-[14px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "var(--brand)" }}
              >
                {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Update Password
              </button>
            </form>
          </div>
          </div>
        )}
      </div>

      {/* ── Fixed bottom dock ─────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid #E2E8F0",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {dockTabs.map(({ key, label, Icon }) => {
          const active = tab === key && !showMore;
          return (
            <button
              key={key}
              onClick={() => goTab(key)}
              className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-3 transition-all active:scale-95"
            >
              <div className={`h-[3px] w-6 rounded-full mb-1.5 transition-all ${active ? "bg-orange-500" : "bg-transparent"}`} />
              <Icon
                className="w-[22px] h-[22px] transition-all"
                style={{ color: active ? "var(--brand)" : "#94A3B8", strokeWidth: active ? 2.2 : 1.7 }}
              />
              <span
                className="text-[10px] font-semibold transition-colors mt-0.5"
                style={{ color: active ? "var(--brand)" : "#94A3B8" }}
              >
                {label}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setShowMore(p => !p)}
          className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-3 transition-all active:scale-95 relative"
        >
          <div className={`h-[3px] w-6 rounded-full mb-1.5 transition-all ${(showMore || tabInMore) ? "bg-orange-500" : "bg-transparent"}`} />
          <div className="relative">
            <MoreHorizontal
              className="w-[22px] h-[22px] transition-all"
              style={{ color: (showMore || tabInMore) ? "var(--brand)" : "#94A3B8", strokeWidth: (showMore || tabInMore) ? 2.2 : 1.7 }}
            />
            {maintenanceDot && !showMore && !tabInMore && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
            )}
          </div>
          <span
            className="text-[10px] font-semibold transition-colors mt-0.5"
            style={{ color: (showMore || tabInMore) ? "var(--brand)" : "#94A3B8" }}
          >
            More
          </span>
        </button>
      </div>

      {/* ── More sheet overlay ────────────────────────── */}
      {showMore && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowMore(false)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl pb-safe"
            style={{
              background: "#ffffff",
              border: "1px solid #E2E8F0",
              borderBottom: "none",
              boxShadow: "0 -4px 32px rgba(0,0,0,0.08)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 80px)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "#E2E8F0" }} />
            </div>
            <div className="px-5 pt-1 pb-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>More</span>
              <button onClick={() => setShowMore(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#F1F5F9" }}>
                <X className="w-4 h-4" style={{ color: "#64748B" }} />
              </button>
            </div>
            <div className="px-4 grid grid-cols-2 gap-2 pb-4">
              {moreTabs.map(({ key, label, Icon }) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    onClick={() => goTab(key)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.97]"
                    style={active ? {
                      background: "rgba(255,98,0,0.08)",
                      border: "1px solid rgba(255,98,0,0.2)",
                    } : {
                      background: "#F8FAFC",
                      border: "1px solid #F1F5F9",
                    }}
                  >
                    <Icon
                      className="w-5 h-5 shrink-0"
                      style={{ color: active ? "var(--brand)" : "#94A3B8" }}
                    />
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: active ? "var(--brand)" : "#475569" }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}
