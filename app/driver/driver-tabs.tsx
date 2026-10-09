"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/notification-bell";
import {
  Lock, Eye, EyeOff, Loader2, RefreshCw,
  CalendarDays, CalendarOff, Key,
  Star, Trophy, Wrench, Camera, X,
  ChevronRight,
} from "lucide-react";
import { changeDriverPassword, clearPasswordForceChange, updateMyEmail } from "@/lib/actions/drivers";
import GateCodesTab from "./gate-codes-tab";
import type { GateCodeRow } from "@/lib/gate-code-constants";
import type { DriverBadgeRow } from "@/lib/actions/badges";
import type { TopDriverRow } from "@/lib/actions/badges";
import type { DswRow } from "./service-tab";
import ScorePanel from "./score-panel";
import MaintenanceTab from "./maintenance-tab";
import BadgeCelebrationOverlay from "./badge-celebration";
import BadgeShelfTab from "./badge-shelf-tab";

type DriverTab = "schedule" | "maintenance" | "codes";

type Review  = {
  id: number; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  reviewDate: string | null;
  improvement: string | null; createdAt: Date | null;
};
type Milestone    = { id: number; name: string; description: string | null; daysRequired: number; type: string; bonusAmount: number | null; icon: string };
type AssignedVehicle = { id: number; unitNumber: string; make: string; model: string; year: number; mileage: number; type: string } | null;
type DriverSchedule = { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean; notes: string | null } | null;
type TimeOffEntry = { id: number; startDate: string; endDate: string; reason: string; note: string | null };

const DAY_KEYS   = ["sun","mon","tue","wed","thu","fri","sat"] as const;

function useCountUp(target: number | null, duration = 1000): number | null {
  const [val, setVal] = useState<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const start = performance.now();
    const from = 0;
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target! - from) * eased);
      if (t < 1) requestAnimationFrame(step);
      else setVal(target);
    }
    requestAnimationFrame(step);
  }, [target]);
  return val;
}

export default function DriverTabs({
  today,
  reviews, milestones, streakDays, driverId, driverDbId, claimedMilestoneIds, leaderboard, myRank, companyRating, goalMessage, assignedVehicle, driverSchedule, upcomingTimeOff, showRyde, showMilestones, showDsw, gateCodes, gateAreas, maintenanceRequests, activeVehicles, isAdmin, driverName, dswRows, myDswHistory, accentColor = "var(--brand)", currentUsername, currentEmail = null, avatarUrl = null, mustChangePassword = false, myBadges = [], badgeCounts = [], driverAvatarMap = {}, unseenBadges = [], rydeRank = null, weeklyIlsRank = null, weeklyRydeRank = null, totalDriversThisWeek = 0,
}: {
  today: string;
  reviews: Review[];
  milestones: Milestone[];
  streakDays: number;
  driverId: string;
  driverDbId?: number;
  claimedMilestoneIds: Set<number>;
  leaderboard: TopDriverRow[];
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
  currentEmail?: string | null;
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
  myBadges?: DriverBadgeRow[];
  badgeCounts?: Array<{ driverId: string; badgeCount: number }>;
  driverAvatarMap?: Record<string, { name: string; avatarUrl: string | null }>;
  unseenBadges?: DriverBadgeRow[];
  rydeRank?: number | null;
  weeklyIlsRank?: number | null;
  weeklyRydeRank?: number | null;
  totalDriversThisWeek?: number;
}) {
  const [tab, setTab] = useState<DriverTab>("schedule");
  const [claimedBadgeIds, setClaimedBadgeIds] = useState<number[]>([]);
  const [showCelebration, setShowCelebration] = useState(unseenBadges.length > 0);
  const [showTrophySheet, setShowTrophySheet] = useState(false);
  const [trophyTab, setTrophyTab] = useState<"score" | "awards">("score");
  const [showCodesSheet, setShowCodesSheet]   = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);

  // Account sheet state
  const fileRef = useRef<HTMLInputElement>(null);
  const [localAvatar, setLocalAvatar]   = useState<string | null>(avatarUrl ?? null);
  const [uploading, setUploading]       = useState(false);
  const [editEmail, setEditEmail]       = useState(currentEmail ?? "");
  const [emailMsg, setEmailMsg]         = useState<{ error: boolean; text: string } | null>(null);
  const [currentPw, setCurrentPw]       = useState("");
  const [newPw, setNewPw]               = useState("");
  const [confirmPw, setConfirmPw]       = useState("");
  const [pwMsg, setPwMsg]               = useState<{ error: boolean; text: string } | null>(null);

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

  async function handleChangePassword(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
    const result = await changeDriverPassword(driverId, currentPassword, newPassword);
    return "error" in result ? { error: result.error ?? "Unknown error." } : {};
  }

  async function handleChangeEmail(newEmailValue: string): Promise<{ error?: string }> {
    const result = await updateMyEmail(newEmailValue);
    return "error" in result ? { error: result.error ?? "Failed." } : {};
  }

  async function handleAvatarUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/avatar/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) setLocalAvatar(data.url);
    setUploading(false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    const trimmed = editEmail.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMsg({ error: true, text: "Please enter a valid email." });
      return;
    }
    const result = await handleChangeEmail(trimmed);
    if (result.error) setEmailMsg({ error: true, text: result.error });
    else setEmailMsg({ error: false, text: "Email updated!" });
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ error: true, text: "Passwords don't match" }); return; }
    if (newPw.length < 8) { setPwMsg({ error: true, text: "Password must be at least 8 characters" }); return; }
    const result = await handleChangePassword(currentPw, newPw);
    if (result.error) setPwMsg({ error: true, text: result.error });
    else { setPwMsg({ error: false, text: "Password updated!" }); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
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


  useEffect(() => {
    function handler() { setShowAccountSheet(true); }
    window.addEventListener("mgops:open-account", handler);
    return () => window.removeEventListener("mgops:open-account", handler);
  }, []);

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
    // Score and awards open the trophy sheet
    if (t === "score" || t === "awards") {
      setTrophyTab(t as "score" | "awards");
      setShowTrophySheet(true);
      return;
    }
    // Account / me → open account sheet
    if (t === "me" || t === "account" || t === "milestones" || t === "bonuses") {
      setShowAccountSheet(true);
      return;
    }
    // Codes / more → open codes sheet
    if (t === "codes" || t === "more") {
      setShowCodesSheet(true);
      return;
    }
    const resolved = t as DriverTab;
    if (["schedule", "maintenance", "codes"].includes(resolved)) {
      setTab(resolved);
      setShowCodesSheet(false);
      setShowTrophySheet(false);
    }
  }

  // Derive today's schedule using the server-provided today string to avoid timezone drift
  const [_ty, _tm, _td] = today.split("-").map(Number);
  const todayDow = new Date(_ty, _tm - 1, _td).getDay(); // 0=Sun
  const todayKey = DAY_KEYS[todayDow];
  const todayIsTimeOff = upcomingTimeOff.some(t => t.startDate <= today && t.endDate >= today);
  const scheduleToday = driverSchedule
    ? { isWork: !!(driverSchedule[todayKey as keyof typeof driverSchedule]) && !todayIsTimeOff }
    : null;

  // Derived values for HomeTab
  const ratedReviews = reviews.filter((r) => r.stars != null);
  const rydeAvg = ratedReviews.length
    ? ratedReviews.reduce((s, r) => s + r.stars!, 0) / ratedReviews.length
    : null;
  // Use Ryde rank (Bayesian-weighted) when available; fall back to ILS rank
  const leaderboardRank = (rydeRank != null && rydeRank > 0) ? rydeRank : (myRank > 0 ? myRank : null);
  const vehicleNumber = assignedVehicle?.unitNumber ?? null;

  // Map reviews to ScorePanel format
  const scorePanelReviews = reviews.map((r) => ({
    id: r.id,
    rating: r.stars ?? 0,
    comment: r.content || null,
    date: r.reviewDate
      ? new Date(r.reviewDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : r.week ? r.week : "",
    riderName: null as string | null,
    type: r.type as "positive" | "negative" | "neutral",
    category: r.category,
  }));

  // Map leaderboard to ScorePanel format (leaderboard is now TopDriverRow[])
  const scorePanelLeaderboard = leaderboard.map((entry) => ({
    driverId:    entry.driverId,
    name:        entry.driverName,
    avg:         entry.avgIls,
    reviewCount: entry.dayCount,
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
    { key: "schedule",    label: "Schedule",    icon: CalendarDays },
    { key: "maintenance", label: "Maintenance", icon: Wrench       },
    { key: "codes",       label: "Gate Codes",  icon: Key          },
  ];

  const brand = accentColor;

  return (
    <div style={{ "--brand": brand } as React.CSSProperties}>
      {showCelebration && unseenBadges.length > 0 && (
        <BadgeCelebrationOverlay
          badges={unseenBadges}
          onClaim={(ids) => {
            setClaimedBadgeIds(ids);
            setShowCelebration(false);
          }}
        />
      )}

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

      {/* Tab content · pb-32 so dock doesn't overlap */}
      <div className="pb-32 flex flex-col gap-4">

        {/* ── Schedule tab (also serves as home) ───────── */}
        {tab === "schedule" && (
          <>
            {/* Today card */}
            <div className="px-4 pt-5 pb-2">
              <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-widest">
                {(() => { const [y,m,d] = today.split("-").map(Number); return new Date(y, m-1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); })()}
              </p>
              <div className="flex items-center justify-between mt-0.5">
                <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">
                  Hey, {driverName.split(" ")[0]} 👋
                </h1>
              </div>
            </div>

            {/* Today status card */}
            <div className="px-4">
              <div className={`w-full flex items-center justify-between rounded-2xl px-5 py-4 ${
                scheduleToday?.isWork ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
              }`}>
                <div>
                  <p className="text-[15px] font-bold leading-tight">
                    {scheduleToday?.isWork ? "Working Today" : todayIsTimeOff ? "Time Off" : "Day Off"}
                  </p>
                  <p className="text-[13px] mt-0.5 opacity-80">
                    {scheduleToday?.isWork ? "You're scheduled today" : todayIsTimeOff ? "Approved time off" : "Enjoy your day"}
                  </p>
                </div>
                <CalendarDays className="w-5 h-5 opacity-40 shrink-0" />
              </div>
            </div>

            {/* Quick stats row */}
            {(showRyde && rydeAvg !== null) || vehicleNumber ? (
              <div className="px-4 flex gap-3">
                {showRyde && rydeAvg !== null && (
                  <button
                    onClick={() => { setTrophyTab("score"); setShowTrophySheet(true); }}
                    className="flex-1 bg-white rounded-2xl border border-slate-200/80 px-4 py-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-left"
                  >
                    <Star className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ryde Avg</p>
                      <p className="text-[18px] font-extrabold text-slate-900 leading-none">{rydeAvg.toFixed(1)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
                  </button>
                )}
                {vehicleNumber && (
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 px-4 py-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <span className="text-[16px]">🚚</span>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Truck</p>
                      <p className="text-[18px] font-extrabold text-slate-900 leading-none">{vehicleNumber}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* 2-week calendar card */}
            <div className="mx-4 bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <h2 className="text-[15px] font-bold text-slate-900">My Schedule</h2>
              </div>
              {(() => {
                const todayStr = today;
                const [ty, tm, td] = today.split("-").map(Number);
                const startOfWeek = new Date(ty, tm - 1, td);
                startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
                const DAY_KEYS_LOCAL = ["sun","mon","tue","wed","thu","fri","sat"] as const;
                const calDays = Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(startOfWeek);
                  d.setDate(startOfWeek.getDate() + i);
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                  const dow = d.getDay();
                  const dayKey = DAY_KEYS_LOCAL[dow];
                  const isWork = driverSchedule ? !!(driverSchedule[dayKey as keyof typeof driverSchedule]) : false;
                  const timeOffEntry = upcomingTimeOff.find(t => t.startDate <= dateStr && t.endDate >= dateStr) ?? null;
                  return { d, dateStr, dow, dateNum: d.getDate(), isToday: dateStr === todayStr, isWork, timeOffEntry };
                });
                const DOW_LABELS_2 = ["Su","Mo","Tu","We","Th","Fr","Sa"];
                const monthLabel = startOfWeek.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                return (
                  <div className="px-5 pt-4 pb-5 flex flex-col gap-5">
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
                            const todayOff = day.isToday && isOff;
                            const todayRest = day.isToday && !isOff && !isWorkDay;
                            return (
                              <div
                                key={day.dateStr}
                                className="flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                                style={{
                                  background: todayOff ? "#fffbeb"
                                    : (day.isToday && isWorkDay) || todayRest ? "var(--brand)"
                                    : isOff ? "#fffbeb"
                                    : isWorkDay ? "var(--brand)"
                                    : "#F8FAFC",
                                  boxShadow: day.isToday ? (todayOff ? "0 0 0 2px #d97706, 0 0 0 4px rgba(217,119,6,0.18)" : "0 0 0 2px var(--brand), 0 0 0 4px rgba(255,98,0,0.18)") : undefined,
                                }}
                              >
                                <span className="text-[9px] font-bold uppercase" style={{ color: todayOff ? "#d97706" : day.isToday ? "rgba(255,255,255,0.8)" : isOff ? "#d97706" : isWorkDay ? "rgba(255,255,255,0.75)" : "#CBD5E1" }}>
                                  {DOW_LABELS_2[day.dow]}
                                </span>
                                <span className="text-[15px] font-extrabold leading-none" style={{ color: todayOff ? "#b45309" : day.isToday ? "#ffffff" : isOff ? "#b45309" : isWorkDay ? "#ffffff" : "#CBD5E1" }}>
                                  {day.dateNum}
                                </span>
                                {isOff && <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5" style={{ background: "#fef3c7", color: "#b45309" }}>Off</span>}
                                {!isOff && !isWorkDay && !day.isToday && <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "#CBD5E1" }}>-</span>}
                                {(isWorkDay || todayRest) && !isOff && <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5" style={{ background: "rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.9)" }}>{todayRest ? "Today" : "On"}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {driverSchedule?.notes && <p className="text-[12px] text-slate-500 italic pt-1 border-t border-slate-100">{driverSchedule.notes}</p>}
                    {!driverSchedule && <p className="text-[13px] text-slate-400 text-center py-4">Your schedule hasn&apos;t been set yet. Contact your manager.</p>}
                  </div>
                );
              })()}
            </div>

            {/* Upcoming time off */}
            <div className="mx-4 bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <CalendarOff className="w-4 h-4 text-slate-400" />
                <h2 className="text-[15px] font-bold text-slate-900">Upcoming Time Off</h2>
              </div>
              {upcomingTimeOff.length === 0 ? (
                <div className="px-5 py-8 text-center"><p className="text-[13px] text-slate-400">No upcoming time off on record.</p></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingTimeOff.map((entry) => (
                    <div key={entry.id} className="px-5 py-4">
                      <span className="text-[13px] font-semibold text-slate-800">{entry.reason}</span>
                      <p className="text-[12px] font-mono text-slate-400 mt-0.5">
                        {fmtDate(entry.startDate)}{entry.startDate !== entry.endDate ? ` → ${fmtDate(entry.endDate)}` : ""}
                      </p>
                      {entry.note && <p className="text-[12px] text-slate-500 italic mt-0.5">{entry.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Maintenance tab ───────────────────────────── */}
        {tab === "maintenance" && (
          <div className="px-4 pt-4">
            <MaintenanceTab
              initial={maintenanceRequests}
              driverId={driverId}
              driverName={driverName}
              vehicles={mePanelVehicles.map(v => ({ ...v, model: "" }))}
            />
          </div>
        )}

      </div>

      {/* ── Trophy FAB ────────────────────────────────────── */}
      <style>{`
        @keyframes trophy-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes trophy-glow {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        .trophy-ring { animation: trophy-spin 4s linear infinite; }
        .trophy-glow { animation: trophy-glow 2s ease-in-out infinite; }
      `}</style>
      <button
        onClick={() => setShowTrophySheet(true)}
        className="fixed z-40 flex items-center justify-center active:scale-95 transition-transform"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 76px)",
          right: "16px",
          width: 68,
          height: 68,
          borderRadius: 18,
          background: "linear-gradient(160deg, rgba(30,20,5,0.92) 0%, rgba(15,10,2,0.96) 100%)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.5) inset",
          border: "1px solid rgba(255,200,50,0.25)",
          backdropFilter: "blur(12px)",
        }}
        aria-label="Score & Awards"
      >
        {/* Spinning sparkle orbit — positioned outside the dark card */}
        <svg className="trophy-ring absolute pointer-events-none" viewBox="0 0 84 84" fill="none"
          style={{ width: 84, height: 84, top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(0deg)", transformOrigin: "center" }}>
          {[0,40,80,120,160,200,240,280,320].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const cx = 42 + 38 * Math.cos(rad);
            const cy = 42 + 38 * Math.sin(rad);
            return <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1.2}
              fill={i % 3 === 0 ? "#fef08a" : i % 3 === 1 ? "#fbbf24" : "#ffffff"}
              opacity={i % 3 === 0 ? 0.9 : 0.55} />;
          })}
        </svg>
        {/* Soft gold glow behind trophy */}
        <div className="trophy-glow absolute rounded-full pointer-events-none"
          style={{ width: 36, height: 36, background: "radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 70%)" }} />
        {/* Trophy icon */}
        <Trophy className="w-7 h-7 relative z-10" style={{ color: "#fde68a", filter: "drop-shadow(0 0 6px rgba(251,191,36,0.8)) drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }} />
        {/* Glass top-edge highlight */}
        <div className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{ height: "40%", borderRadius: "18px 18px 0 0", background: "linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)" }} />
      </button>

      {/* ── Trophy bottom sheet ───────────────────────────── */}
      {showTrophySheet && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowTrophySheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="text-[17px] font-extrabold text-slate-900">Score & Awards</h2>
              <button onClick={() => setShowTrophySheet(false)} className="p-1.5 rounded-full hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            {/* Sub-tabs */}
            <div className="flex gap-2 px-5 pb-3">
              {(["score", "awards"] as const).filter(t => t === "awards" || showRyde).map(t => (
                <button
                  key={t}
                  onClick={() => setTrophyTab(t)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors"
                  style={trophyTab === t ? { backgroundColor: "var(--brand)", color: "#fff" } : { backgroundColor: "#F1F5F9", color: "#64748B" }}
                >
                  {t === "score" ? <Star className="w-3.5 h-3.5" /> : <Trophy className="w-3.5 h-3.5" />}
                  {t === "score" ? "Ryde Score" : "Awards"}
                </button>
              ))}
            </div>
            {/* Content */}
            <div className="overflow-y-auto max-h-[70vh] px-0 pb-4">
              {trophyTab === "score" && showRyde && (
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
                  myBadges={myBadges}
                  badgeCounts={badgeCounts}
                  driverAvatarMap={driverAvatarMap}
                  newBadgeIds={claimedBadgeIds}
                  weeklyIlsRank={weeklyIlsRank}
                  weeklyRydeRank={weeklyRydeRank}
                  totalDriversThisWeek={totalDriversThisWeek}
                />
              )}
              {trophyTab === "awards" && <BadgeShelfTab badges={myBadges} />}
            </div>
          </div>
        </>
      )}

      {/* ── Gate Codes bottom sheet ─────────────────────────────── */}
      {showCodesSheet && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowCodesSheet(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col"
            style={{ maxHeight: "88vh", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Sticky handle + header */}
            <div className="flex-shrink-0">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Key className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-[17px] font-extrabold text-slate-900">Gate Codes</h2>
                    <p className="text-[12px] text-slate-400">Access codes for your routes</p>
                  </div>
                </div>
                <button onClick={() => setShowCodesSheet(false)} className="p-1.5 rounded-full hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>
            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 py-4">
              <GateCodesTab
                initial={gateCodes}
                areas={gateAreas}
                driverId={driverId}
                driverName={driverName}
                isAdmin={isAdmin ?? false}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Account bottom sheet ──────────────────────────── */}
      {showAccountSheet && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowAccountSheet(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col"
            style={{ maxHeight: "88vh", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle */}
            <div className="flex-shrink-0">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h2 className="text-[17px] font-extrabold text-slate-900">Account</h2>
                <button onClick={() => setShowAccountSheet(false)} className="p-1.5 rounded-full hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-5 flex flex-col gap-5">
              {/* Avatar section */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center group"
                  title="Tap to change photo"
                >
                  {localAvatar
                    ? <img src={localAvatar} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-3xl font-bold text-slate-500">{driverName?.[0] ?? "?"}</span>
                  }
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    {uploading
                      ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                      : <Camera className="w-6 h-6 text-white" />
                    }
                  </div>
                </button>
                <div className="text-center">
                  <p className="text-[15px] font-extrabold text-slate-900">{driverName}</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">@{currentUsername ?? driverId}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5 px-6 leading-snug">
                    📸 Your profile photo appears on the leaderboard — tap the circle to update it
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }}
                />
              </div>

              {/* Email */}
              <form onSubmit={handleEmailSubmit} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[13px] font-bold text-slate-700 mb-3">Email address</p>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={editEmail}
                  onChange={e => { setEditEmail(e.target.value); setEmailMsg(null); }}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 mb-2"
                  style={{ "--tw-ring-color": "var(--brand)" } as React.CSSProperties}
                />
                {emailMsg
                  ? <p className={`text-[12px] mb-2 ${emailMsg.error ? "text-red-500" : "text-emerald-600"}`}>{emailMsg.text}</p>
                  : !editEmail.trim() && <p className="text-[12px] text-slate-400 mb-2">Add your email to get notifications</p>
                }
                <button type="submit" className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80" style={{ backgroundColor: "var(--brand)" }}>
                  Save Email
                </button>
              </form>

              {/* Password */}
              <form onSubmit={handlePasswordSubmit} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <p className="text-[13px] font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Change Password
                </p>
                {(["Current password", "New password", "Confirm new password"] as const).map((placeholder, i) => {
                  const vals = [currentPw, newPw, confirmPw];
                  const setters = [setCurrentPw, setNewPw, setConfirmPw];
                  return (
                    <input
                      key={placeholder}
                      type="password"
                      placeholder={placeholder}
                      value={vals[i]}
                      onChange={e => setters[i](e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 mb-2"
                      style={{ "--tw-ring-color": "var(--brand)" } as React.CSSProperties}
                    />
                  );
                })}
                {pwMsg && <p className={`text-[12px] mb-2 ${pwMsg.error ? "text-red-500" : "text-emerald-600"}`}>{pwMsg.text}</p>}
                <button type="submit" className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80" style={{ backgroundColor: "var(--brand)" }}>
                  Update Password
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Bottom dock */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 flex z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {dockItems.map(({ key, label, icon: Icon }) => {
          const active = key === "codes" ? showCodesSheet : (tab === key && !showCodesSheet);
          return (
            <button
              key={key}
              onClick={() => {
                if (key === "codes") {
                  setShowCodesSheet(true);
                  setShowTrophySheet(false);
                } else {
                  setTab(key);
                  setShowCodesSheet(false);
                  setShowTrophySheet(false);
                }
              }}
              className="flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 relative gap-0.5 active:bg-slate-100 transition-colors"
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
              )}
              <Icon
                className={`w-5 h-5 transition-colors ${active ? "fill-current" : "text-slate-500"}`}
                style={active ? { color: "var(--brand)" } : {}}
              />
              <span
                className={`text-[10px] font-semibold transition-colors ${active ? "" : "text-slate-500"}`}
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
