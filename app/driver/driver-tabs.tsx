"use client";

import { useState } from "react";
import { Star, ThumbsUp, ThumbsDown, Eye, EyeOff, Loader2, Lock, Truck, CalendarDays, CalendarOff } from "lucide-react";
import { changeDriverPassword } from "@/lib/actions/drivers";
import GateCodesTab from "./gate-codes-tab";
import MaintenanceTab from "./maintenance-tab";
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

export default function DriverTabs({
  reviews, milestones, streakDays, driverId, claimedMilestoneIds, leaderboard, myRank, companyRating, goalMessage, assignedVehicle, driverSchedule, upcomingTimeOff, showRyde, showMilestones, gateCodes, maintenanceRequests, activeVehicles, isAdmin, driverName,
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
  maintenanceRequests: any[];
  activeVehicles: { id: number; unitNumber: string }[];
  isAdmin?: boolean;
  driverName: string;
}) {
  const defaultTab = showRyde ? "score" : "schedule";
  const [tab, setTab] = useState<"score" | "schedule" | "gatecodes" | "maintenance" | "reviews" | "milestones" | "bonuses" | "leaderboard" | "account">(defaultTab);
  const [reviewFilter, setReviewFilter] = useState<"all" | "positive" | "negative">("all");

  // Account / password change state
  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [pwLoading, setPwLoading]     = useState(false);
  const [pwError, setPwError]         = useState("");
  const [pwSuccess, setPwSuccess]     = useState(false);

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

  // Ryde score computed from review stars
  const ratedReviews = reviews.filter((r) => r.stars != null);
  const avgScore = ratedReviews.length
    ? ratedReviews.reduce((s, r) => s + r.stars!, 0) / ratedReviews.length
    : null;

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

  return (
    <>
      {/* Milestone progress bar */}
      {showMilestones && milestones.length > 0 && (() => {
        const maxDays = milestones[milestones.length - 1].daysRequired;
        const pct = Math.min(100, (streakDays / maxDays) * 100);
        return (
          <div
            className="mb-5 rounded-2xl px-5 pt-4 pb-5"
            style={{
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            {/* Streak label row — kept clear of circles */}
            <div className="flex items-center gap-2">
              <span className="text-xl">🔥</span>
              <span className="text-[14px] font-bold text-white">
                {streakDays === 0 ? "No streak yet" : `${streakDays} day streak`}
              </span>
              {nextMilestone && streakDays > 0 && (
                <span className="ml-auto text-[11px] text-white/50 font-medium shrink-0">
                  {nextMilestone.daysRequired - streakDays}d to {nextMilestone.icon}
                </span>
              )}
            </div>
            {streakDays === 0 && (
              <p className="text-[11px] text-white/40 mt-0.5 pl-8">
                Start with a clean week to begin earning milestones
              </p>
            )}

            {/* Track — sits below the text with enough top margin so circles don't clip */}
            <div className="relative mt-10 mx-2">
              <div className="h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: "linear-gradient(90deg, rgba(255,255,255,0.9), #FF6200)" }}
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
                        background: "linear-gradient(135deg, #FF6200, #ff8c42)",
                        border: "2px solid rgba(255,255,255,0.5)",
                        boxShadow: "0 0 0 3px rgba(255,98,0,0.3), 0 2px 8px rgba(255,98,0,0.4)",
                        color: "white",
                      } : {
                        background: "rgba(255,255,255,0.08)",
                        border: "2px solid rgba(255,255,255,0.25)",
                        color: "rgba(255,255,255,0.4)",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      {earned ? "✓" : m.type === "bonus" ? <Lock className="w-3 h-3" /> : ""}
                    </div>
                    <div className="mt-2 flex flex-col items-center gap-0.5">
                      <span className="text-sm leading-none">{m.icon}</span>
                      <span className="text-[9px] font-semibold text-white/40">{m.daysRequired}d</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Space for circle labels below the track */}
            <div className="h-11" />
          </div>
        );
      })()}

      {/* Tabs — scrollable pill row */}
      <div className="flex gap-1 mb-5 bg-white/10 rounded-xl p-1 overflow-x-auto scrollbar-none">
        {([
          { key: "score",       label: "My Score",                  show: showRyde },
          { key: "schedule",    label: "Schedule",                   show: true },
          { key: "gatecodes",   label: "Gate Codes",                 show: true },
          { key: "maintenance", label: "Maintenance",                show: true },
          { key: "reviews",     label: `Reviews (${reviews.length})`, show: showRyde },
          { key: "milestones",  label: "Milestones",                 show: showMilestones },
          { key: "bonuses",     label: "Bonuses",                    show: showMilestones },
          { key: "leaderboard", label: "Leaderboard",                show: showRyde },
          { key: "account",     label: "Account",                    show: true },
        ] as const).filter(({ show }) => show).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`py-2 px-3 rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap shrink-0 ${
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Score tab */}
      {tab === "score" && (
        <div className="flex flex-col gap-4">
          {/* Team goal callout */}
          {!atGoal && goalMessage && (
            <div className="text-center px-2">
              <p className="text-[13px] font-semibold text-white/70 leading-snug">{goalMessage}</p>
            </div>
          )}

          {/* Company rating goal card */}
          <div className={`rounded-2xl px-5 py-4 ${
            atGoal
              ? "bg-emerald-500"
              : ""
          }`} style={!atGoal ? {
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.18)",
          } : {}}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Company Ryde Rating</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map((i) => (
                      <Star key={i} className={`w-4 h-4 ${
                        companyRating != null && i <= Math.round(companyRating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-white/20 fill-white/20"
                      }`} />
                    ))}
                  </div>
                  <span className="text-[20px] font-extrabold text-white leading-none">
                    {companyRating != null ? companyRating.toFixed(1) : "—"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-white/60">Goal: {RATING_GOAL.toFixed(1)} ★</p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  {atGoal ? "🥞 Free breakfast!" : `${companyRating != null ? (RATING_GOAL - companyRating).toFixed(1) : RATING_GOAL.toFixed(1)} to go`}
                </p>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.15)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${goalPct}%`,
                  background: atGoal
                    ? "rgba(255,255,255,0.9)"
                    : "linear-gradient(90deg, #f59e0b, #fb923c)",
                }}
              />
            </div>
            {atGoal && (
              <p className="text-[12px] font-bold text-white mt-2 text-center">
                🎉 We did it — free breakfast for the team!
              </p>
            )}
          </div>

          {/* Vehicle card */}
          {assignedVehicle ? (
            <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-3"
                style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }}>
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">My Vehicle</p>
                  <p className="text-[14px] font-extrabold text-white leading-tight">{assignedVehicle.unitNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-slate-300">{assignedVehicle.year}</p>
                  <p className="text-[11px] text-slate-400">{assignedVehicle.make}</p>
                </div>
              </div>
              <div className="px-5 py-3 grid grid-cols-3 divide-x divide-slate-100">
                {[
                  { label: "Make",    value: assignedVehicle.make },
                  { label: "Model",   value: assignedVehicle.model },
                  { label: "Mileage", value: assignedVehicle.mileage.toLocaleString() + " mi" },
                ].map((s) => (
                  <div key={s.label} className="px-3 first:pl-0 last:pr-0 text-center">
                    <p className="text-[11px] font-bold text-slate-800 truncate">{s.value}</p>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(8px)",
              }}>
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4 text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white/60">My Vehicle</p>
                <p className="text-[12px] text-white/35">Coming soon</p>
              </div>
            </div>
          )}

          {/* My Ryde Score card */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
            <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center"
              style={{ background: "linear-gradient(135deg, #4D148C 0%, #7B2FC0 100%)" }}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-purple-200 mb-2">My Ryde Score</p>
              {avgScore !== null ? (
                <>
                  <div className="flex gap-1 mb-2">
                    {[1,2,3,4,5].map((i) => (
                      <Star key={i} className={`w-7 h-7 ${i <= Math.round(avgScore) ? "text-amber-400 fill-amber-400" : "text-white/20 fill-white/20"}`} />
                    ))}
                  </div>
                  <p className={`text-[64px] font-extrabold leading-none ${scoreColor}`}>
                    {avgScore.toFixed(1)}
                  </p>
                  <p className="text-[12px] text-white/60 mt-2">
                    Based on {ratedReviews.length} review{ratedReviews.length !== 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <p className="text-[16px] text-white/50 py-4">No reviews recorded yet</p>
              )}
            </div>
            <div className="h-[3px]" style={{ background: "#FF6200" }} />

            {/* Stats */}
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              {[
                { label: "Avg Score",      value: avgScore !== null ? avgScore.toFixed(1) : "—" },
                { label: "Total Reviews",  value: reviews.length },
                { label: "Positive",       value: reviews.filter((r) => r.type === "positive").length },
              ].map((s) => (
                <div key={s.label} className="px-4 py-4 text-center">
                  <p className="text-[22px] font-extrabold text-slate-800">{s.value}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Recent reviews */}
            {ratedReviews.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Ratings</p>
                <div className="flex flex-col gap-1">
                  {ratedReviews.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-[12px] text-slate-500">{r.week ?? (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "")}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
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
        </div>
      )}

      {/* Schedule tab */}
      {tab === "schedule" && (
        <div className="flex flex-col gap-4">
          {/* Weekly schedule card */}
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <h2 className="text-[15px] font-extrabold text-slate-900">My Weekly Schedule</h2>
            </div>
            {driverSchedule ? (
              <div className="px-5 py-5">
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_KEYS.map((key, i) => {
                    const isWork = driverSchedule[key as keyof DriverSchedule & string] as boolean;
                    return (
                      <div key={key}
                        className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border min-w-[44px] ${
                          isWork
                            ? "bg-slate-900 border-slate-900"
                            : "bg-slate-50 border-slate-200"
                        }`}>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isWork ? "text-slate-300" : "text-slate-400"}`}>
                          {DAY_LABELS[i]}
                        </span>
                        <span className={`text-[16px] ${isWork ? "text-white" : "text-slate-300"}`}>
                          {isWork ? "✓" : "–"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {driverSchedule.notes && (
                  <p className="text-[12px] text-slate-500 mt-4 italic">{driverSchedule.notes}</p>
                )}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-[13px] text-slate-400">Your schedule hasn&apos;t been set yet. Contact your manager.</p>
              </div>
            )}
          </div>

          {/* Upcoming time off */}
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <CalendarOff className="w-4 h-4 text-slate-400" />
              <h2 className="text-[15px] font-extrabold text-slate-900">Upcoming Time Off</h2>
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
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-slate-800">{entry.reason}</span>
                      </div>
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
        </div>
      )}

      {/* Gate Codes tab */}
      {tab === "gatecodes" && (
        <GateCodesTab
          initial={gateCodes}
          driverId={driverId}
          driverName={driverName}
          isAdmin={isAdmin ?? false}
        />
      )}

      {/* Maintenance tab */}
      {tab === "maintenance" && (
        <MaintenanceTab
          initial={maintenanceRequests}
          driverId={driverId}
          driverName={driverName}
          vehicles={activeVehicles}
        />
      )}

      {/* Reviews tab */}
      {tab === "reviews" && (
        <div className="flex flex-col gap-3">
          {/* Filter */}
          <div className="flex gap-2">
            {([
              { key: "all",      label: "All",      count: reviews.length },
              { key: "positive", label: "Positive", count: reviews.filter((r) => r.type === "positive").length },
              { key: "negative", label: "Negative", count: reviews.filter((r) => r.type === "negative").length },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setReviewFilter(key)}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all border ${
                  reviewFilter === key
                    ? key === "positive" ? "bg-emerald-600 text-white border-emerald-600"
                    : key === "negative" ? "bg-red-500 text-white border-red-500"
                    : "bg-white text-slate-900 border-white"
                    : "bg-white/10 text-white/70 border-white/10 hover:bg-white/20"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {filteredReviews.length === 0 ? (
            <div className="bg-white/10 rounded-2xl border border-white/10 px-6 py-10 text-center">
              <p className="text-white/50 text-[13px]">No {reviewFilter !== "all" ? reviewFilter : ""} reviews yet.</p>
            </div>
          ) : (
            filteredReviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] px-5 py-4 flex gap-3">
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
        </div>
      )}

      {/* Milestones tab */}
      {tab === "milestones" && (
        <div className="flex flex-col gap-3">
          {/* Streak card */}
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.25)] px-5 py-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl"
              style={{ background: "linear-gradient(135deg, #FF6200, #ff8c42)" }}>
              🔥
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Current Streak</p>
              <p className="text-[28px] font-extrabold text-slate-900 leading-none">
                {streakDays} <span className="text-[16px] font-semibold text-slate-400">days clean</span>
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-white/10 rounded-xl border border-white/10 px-4 py-3 flex gap-3 items-start">
            <span className="text-base shrink-0">⚠️</span>
            <p className="text-[12px] text-white/60 leading-relaxed">
              One <span className="font-semibold text-white">at-fault review</span> resets your streak to day 1. Rewards already earned are yours to keep — but you won&apos;t earn them twice.
            </p>
          </div>

          {/* Milestone cards */}
          {milestones.map((m) => {
            const claimed  = claimedMilestoneIds.has(m.id);
            const unlocked = streakDays >= m.daysRequired && !claimed;
            const daysLeft = m.daysRequired - streakDays;

            if (claimed) {
              return (
                <div key={m.id} className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-5 py-4 flex items-center gap-4 opacity-80">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-xl">{m.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-slate-700">{m.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Claimed</span>
                    </div>
                    <p className="text-[12px] text-slate-400 mt-0.5">Earned at {m.daysRequired} days — yours to keep.</p>
                  </div>
                </div>
              );
            }

            if (unlocked) {
              // Shouldn't normally reach here — auto-claimed server-side on page load
              // Show as earned in case of race condition
              return (
                <div key={m.id} className="rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(255,98,0,0.35)]">
                  <div className="px-5 py-4" style={{ background: "linear-gradient(135deg, #FF6200, #ff8c42)" }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{m.icon}</span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Reward Earned 🎉</p>
                        <p className="text-[18px] font-extrabold text-white leading-tight">{m.name}</p>
                      </div>
                    </div>
                    {m.description && <p className="text-[13px] text-white/80 leading-relaxed">{m.description}</p>}
                    {m.type === "bonus" && m.bonusAmount && (
                      <p className="text-[20px] font-extrabold text-white mt-2">${m.bonusAmount} added to your next check</p>
                    )}
                  </div>
                  <div className="bg-white px-5 py-3">
                    <p className="text-[12px] text-slate-500">Your manager will be notified. Show this screen when collecting your reward.</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id}
                className="rounded-2xl px-5 py-4 flex items-center gap-4"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-xl grayscale opacity-50">{m.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-white/60">{m.name}</p>
                  {m.description && <p className="text-[12px] text-white/35 mt-0.5">{m.description}</p>}
                  {m.type === "bonus" && m.bonusAmount && (
                    <p className="text-[12px] font-semibold text-white/35 mt-0.5">${m.bonusAmount} bonus</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[18px] font-extrabold text-white/40">{daysLeft}</p>
                  <p className="text-[10px] text-white/30 font-semibold">days left</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bonuses tab */}
      {tab === "bonuses" && (() => {
        const bonusMilestone = milestones.find((m) => m.type === "bonus");
        const bonusUnlocked  = bonusMilestone ? claimedMilestoneIds.has(bonusMilestone.id) || streakDays >= (bonusMilestone.daysRequired) : false;
        const daysLeft       = bonusMilestone ? Math.max(0, bonusMilestone.daysRequired - streakDays) : 0;

        if (!bonusUnlocked) {
          return (
            <div className="flex flex-col gap-4">
              <div
                className="rounded-2xl px-6 py-8 flex flex-col items-center text-center"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <div className="text-5xl mb-4">🔒</div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">Locked</p>
                <h2 className="text-[22px] font-extrabold text-white mb-2">Bonus Structure</h2>
                <p className="text-[14px] text-white/60 leading-relaxed max-w-xs">
                  Hit a <span className="font-bold text-white">90-day clean streak</span> to unlock your performance bonus program — no at-fault reviews, no safety incidents.
                </p>
                {daysLeft > 0 && (
                  <div className="mt-6 px-5 py-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    <p className="text-[28px] font-extrabold text-white leading-none">{daysLeft}</p>
                    <p className="text-[11px] font-semibold text-white/40 mt-0.5">days remaining</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">What you&apos;ll unlock</p>
                <div className="flex flex-col gap-3">
                  {[
                    { icon: "💰", label: "Performance Bonus", desc: "Cash added directly to your paycheck for hitting the 90-day mark." },
                    { icon: "📈", label: "Bonus Pay Eligibility", desc: "Stay clean and keep qualifying for ongoing performance bonuses." },
                    { icon: "🏆", label: "Top Performer Status", desc: "Recognition as one of 742 Logistics' most reliable drivers." },
                  ].map((item) => (
                    <div key={item.label} className="flex gap-3 items-start">
                      <span className="text-xl shrink-0">{item.icon}</span>
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">{item.label}</p>
                        <p className="text-[12px] text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(255,98,0,0.3)]">
              <div className="px-5 py-5" style={{ background: "linear-gradient(135deg, #FF6200, #ff8c42)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">Unlocked ✓</p>
                <h2 className="text-[22px] font-extrabold text-white leading-tight">Bonus Structure</h2>
                <p className="text-[13px] text-white/80 mt-1">You qualified by maintaining a 90-day clean streak. This is yours.</p>
              </div>
              <div className="bg-white px-5 py-5 flex flex-col gap-4">
                {milestones.filter((m) => m.type === "bonus").map((m) => (
                  <div key={m.id} className="flex items-center gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <span className="text-3xl">{m.icon}</span>
                    <div className="flex-1">
                      <p className="text-[15px] font-extrabold text-slate-900">{m.name}</p>
                      {m.description && <p className="text-[12px] text-slate-500 mt-0.5">{m.description}</p>}
                    </div>
                    {m.bonusAmount && (
                      <p className="text-[20px] font-extrabold text-emerald-600 shrink-0">${m.bonusAmount}</p>
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-slate-400 text-center pt-1">
                  Contact your station manager if you have questions about your bonus payout.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Leaderboard tab */}
      {tab === "leaderboard" && (
        <div className="flex flex-col gap-4">
          {myRank > 0 && (
            <div
              className="rounded-2xl px-5 py-4 flex items-center gap-4"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl font-extrabold text-white"
                style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)" }}>
                #{myRank}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-0.5">Your Rank</p>
                <p className="text-[18px] font-extrabold text-white leading-none">
                  {myRank === 1 ? "🏆 Top of the fleet" : myRank <= 3 ? "🔥 Top 3 — keep it up" : `${myRank} of ${leaderboard.length}`}
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.2)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-slate-900">Top Performers</h2>
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
                  const scoreColor = entry.avgScore >= 4.5 ? "text-emerald-600" : entry.avgScore >= 3 ? "text-amber-500" : "text-red-500";

                  return (
                    <div key={entry.driverId}
                      className={`px-6 py-4 flex items-center gap-4 transition-colors ${isMe ? "bg-purple-50" : "hover:bg-slate-50/50"}`}>
                      <div className="w-8 text-center shrink-0">
                        {medal
                          ? <span className="text-xl">{medal}</span>
                          : <span className="text-[13px] font-bold text-slate-400">#{i + 1}</span>}
                      </div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[14px] font-extrabold ${
                        isMe ? "text-white" : "text-slate-600 bg-slate-100"
                      }`}
                        style={isMe ? { background: "linear-gradient(135deg, #4D148C, #7B2FC0)" } : {}}>
                        {entry.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] font-bold ${isMe ? "text-purple-800" : "text-slate-800"}`}>
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
                        <span className={`text-[14px] font-extrabold ${scoreColor}`}>{entry.avgScore.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-[11px] text-white/30 text-center">Driver names are shown as initials only.</p>
        </div>
      )}

      {/* Account tab */}
      {tab === "account" && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.25)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-[15px] font-extrabold text-slate-900">Change Password</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">Update your login password below.</p>
            </div>
            <form onSubmit={handleChangePassword} className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-800 outline-none pr-10 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                  />
                  <button type="button" onClick={() => setShowCurrent((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-800 outline-none pr-10 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                  />
                  <button type="button" onClick={() => setShowNew((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-800 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                />
              </div>

              {pwError && <p className="text-[12px] text-red-500 font-medium">{pwError}</p>}
              {pwSuccess && <p className="text-[12px] text-emerald-600 font-medium">Password updated successfully.</p>}

              <button
                type="submit"
                disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                className="w-full py-3 rounded-xl text-[14px] font-bold text-white mt-1
                  transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40
                  flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)" }}
              >
                {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}
