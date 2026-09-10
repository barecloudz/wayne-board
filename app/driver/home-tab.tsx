"use client";

import { Flame, CalendarDays, Key, Star, User, MapPin, Truck, ChevronRight } from "lucide-react";

export type HomeTabProps = {
  driverName: string;
  streakDays: number;
  scheduleToday: { isWork: boolean; startTime?: string; endTime?: string } | null;
  rydeAvg: number | null;
  reviewCount: number;
  leaderboardRank: number | null;
  vehicleNumber: string | null;
  workAreaName: string | null;
  showRyde: boolean;
  onNavigate: (tab: "schedule" | "codes" | "score" | "me") => void;
};

export default function HomeTab({
  driverName,
  streakDays,
  scheduleToday,
  rydeAvg,
  reviewCount,
  leaderboardRank,
  vehicleNumber,
  workAreaName,
  showRyde,
  onNavigate,
}: HomeTabProps) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const firstName = driverName.split(" ")[0];

  let shiftLabel = "No Schedule";
  let shiftSub = "You're not scheduled today";
  let shiftColor = "bg-slate-100 text-slate-500";
  if (scheduleToday?.isWork) {
    shiftLabel = "Working Today";
    shiftSub =
      scheduleToday.startTime && scheduleToday.endTime
        ? `${scheduleToday.startTime} – ${scheduleToday.endTime}`
        : "Scheduled";
    shiftColor = "bg-emerald-50 text-emerald-700";
  } else if (scheduleToday && !scheduleToday.isWork) {
    shiftLabel = "Day Off";
    shiftSub = "Enjoy your day";
    shiftColor = "bg-blue-50 text-blue-700";
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-5 pb-6">
      {/* Greeting */}
      <div>
        <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-widest">
          {dateLabel}
        </p>
        <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
          Hey, {firstName} 👋
        </h1>
      </div>

      {/* Shift card */}
      <button
        onClick={() => onNavigate("schedule")}
        className={`w-full flex items-center justify-between rounded-2xl px-5 py-4 ${shiftColor} text-left`}
      >
        <div>
          <p className="text-[15px] font-bold leading-tight">{shiftLabel}</p>
          <p className="text-[13px] mt-0.5 opacity-80">{shiftSub}</p>
        </div>
        <ChevronRight className="w-5 h-5 opacity-50 shrink-0" />
      </button>

      {/* Streak */}
      {streakDays > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 rounded-2xl px-5 py-4">
          <Flame className="w-7 h-7 text-orange-500 shrink-0" />
          <div>
            <p className="text-[15px] font-bold text-orange-800 leading-tight">
              {streakDays} day streak
            </p>
            <p className="text-[12px] text-orange-600 mt-0.5">Keep it going!</p>
          </div>
        </div>
      )}

      {/* Ryde tiles */}
      {showRyde && (rydeAvg !== null || leaderboardRank !== null) && (
        <button
          onClick={() => onNavigate("score")}
          className="w-full bg-white rounded-2xl border border-slate-200/80 px-5 py-4 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-left"
        >
          <div className="flex items-center gap-4">
            {rydeAvg !== null && (
              <div className="flex flex-col items-center">
                <span className="text-[22px] font-extrabold text-slate-900 leading-none">
                  {rydeAvg.toFixed(1)}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                  Ryde Avg
                </span>
              </div>
            )}
            {rydeAvg !== null && leaderboardRank !== null && (
              <div className="w-px h-8 bg-slate-200" />
            )}
            {leaderboardRank !== null && (
              <div className="flex flex-col items-center">
                <span className="text-[22px] font-extrabold text-slate-900 leading-none">
                  #{leaderboardRank}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                  This Week
                </span>
              </div>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>
      )}

      {/* Vehicle + work area */}
      {(vehicleNumber || workAreaName) && (
        <div className="flex gap-3">
          {vehicleNumber && (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 px-4 py-3 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Truck className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Truck</p>
                <p className="text-[14px] font-bold text-slate-800">{vehicleNumber}</p>
              </div>
            </div>
          )}
          {workAreaName && (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 px-4 py-3 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Area</p>
                <p className="text-[14px] font-bold text-slate-800">{workAreaName}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick access */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Quick Access
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: CalendarDays, label: "Schedule", tab: "schedule" as const, bg: "bg-violet-50", color: "text-violet-600" },
            { icon: Key, label: "Gate Codes", tab: "codes" as const, bg: "bg-amber-50", color: "text-amber-600" },
            ...(showRyde ? [{ icon: Star, label: "Ryde Score", tab: "score" as const, bg: "bg-emerald-50", color: "text-emerald-600" }] : []),
            { icon: User, label: "My Profile", tab: "me" as const, bg: "bg-slate-100", color: "text-slate-600" },
          ].map(({ icon: Icon, label, tab, bg, color }) => (
            <button
              key={tab}
              onClick={() => onNavigate(tab)}
              className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200/80 px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
            >
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <span className="text-[13px] font-bold text-slate-700">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
