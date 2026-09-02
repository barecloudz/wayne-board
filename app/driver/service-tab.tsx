"use client";

export type DswRow = {
  id: number;
  date: string;
  driverId: string | null;
  driverNameRaw: string;
  waName: string;
  waNumber: string;
  ilsPct: number | null;
  actDelStps: number | null;
  actDelPkgs: number | null;
  nonDelvdStps: number | null;
  allStatusCodePkgs: number | null;
  vscanPkgs: number | null;
  delStpsPlanned: number | null;
};

const STREAK_GOAL = 14; // days of clean ILS for Chick-fil-A
const CFA_EMOJI   = "🍗";

function dswInitials(raw: string): string {
  if (!raw) return "?";
  const [last, ...rest] = raw.split(",");
  const first = rest.join("").trim();
  const fi = first.charAt(0).toUpperCase();
  const li = last.trim().charAt(0).toUpperCase();
  return fi && li ? `${fi}.${li}.` : li || fi || "?";
}

function ilsImpacts(row: DswRow): number {
  if (row.vscanPkgs && row.vscanPkgs > 0 && row.ilsPct != null) {
    return Math.round(row.vscanPkgs * (100 - row.ilsPct) / 100);
  }
  return row.allStatusCodePkgs ?? 0;
}

function serviceRate(row: DswRow): number | null {
  const del = row.actDelStps ?? 0;
  const nondel = row.nonDelvdStps ?? 0;
  const total = del + nondel;
  if (!total) return null;
  return (del / total) * 100;
}

type IlsTier = "green" | "yellow" | "red" | "none";

function ilsTier(impacts: number, hasData: boolean): IlsTier {
  if (!hasData) return "none";
  if (impacts === 0) return "green";
  if (impacts <= 3) return "yellow";
  return "red";
}

const tierStyles = {
  green:  { row: "bg-emerald-50/60 border-l-2 border-emerald-400", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400", label: "CLEAN" },
  yellow: { row: "bg-amber-50/60 border-l-2 border-amber-400",    badge: "bg-amber-100 text-amber-700",    dot: "bg-amber-400",   label: "WATCH" },
  red:    { row: "bg-red-50/60 border-l-2 border-red-400",        badge: "bg-red-100 text-red-600",        dot: "bg-red-500",     label: "HIGH"  },
  none:   { row: "bg-slate-50 border-l-2 border-slate-200",       badge: "bg-slate-100 text-slate-400",    dot: "bg-slate-300",   label: "—"     },
};

function svcBadge(rate: number | null) {
  if (rate == null) return null;
  const pass = rate >= 99.0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
      pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
    }`}>
      {rate.toFixed(1)}% {pass ? "✓" : "✗"}
    </span>
  );
}

// Build Mon–Sun slots for this week
function thisWeekSlots(): { date: string; dow: string }[] {
  const now  = new Date();
  const day  = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  const days = ["M","T","W","T","F","S","S"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { date: d.toISOString().slice(0, 10), dow: days[i] };
  });
}

// Team ILS per day: sum all vscan and impacts across all drivers
// A day passes only if team ILS ≥ 99%
function teamDailyPass(history: DswRow[]): Record<string, boolean> {
  const byDate: Record<string, { vscan: number; impacts: number }> = {};
  for (const r of history) {
    if (!r.vscanPkgs) continue;
    if (!byDate[r.date]) byDate[r.date] = { vscan: 0, impacts: 0 };
    byDate[r.date].vscan   += r.vscanPkgs;
    byDate[r.date].impacts += ilsImpacts(r);
  }
  const result: Record<string, boolean> = {};
  for (const [date, { vscan, impacts }] of Object.entries(byDate)) {
    if (vscan === 0) continue;
    const teamIls = ((vscan - impacts) / vscan) * 100;
    result[date] = teamIls >= 99.0;
  }
  return result;
}

// Count consecutive team-passing days going back from most recent
function calcStreak(history: DswRow[]): number {
  if (history.length === 0) return 0;
  const byDate = teamDailyPass(history);
  const dates  = Object.keys(byDate).sort().reverse();
  let streak = 0;
  for (const d of dates) {
    if (byDate[d]) streak++;
    else break;
  }
  return streak;
}

export default function ServiceTab({
  rows,
  myDriverId,
  myHistory = [],
}: {
  rows: DswRow[];
  myDriverId: string;
  myHistory?: DswRow[];
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-10 flex flex-col items-center text-center"
        style={{
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.15)",
          backdropFilter: "blur(12px)",
        }}
      >
        <p className="text-[22px] mb-2">📋</p>
        <p className="text-[15px] font-bold text-white/70">No service data yet</p>
        <p className="text-[12px] text-white/40 mt-1">
          Data syncs each morning from the FedEx Daily Service Worksheet.
        </p>
      </div>
    );
  }

  const dateLabel = (() => {
    try {
      const [y, m, d] = rows[0].date.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return rows[0].date; }
  })();

  const myRow      = rows.find(r => r.driverId === myDriverId) ?? null;
  const myImpacts  = myRow ? ilsImpacts(myRow) : 0;
  const mySvcRate  = myRow ? serviceRate(myRow) : null;
  const myTier     = myRow ? ilsTier(myImpacts, true) : "none";
  const svcFail    = mySvcRate != null && mySvcRate < 99.0;

  // Week calendar — team pass/fail per day
  const weekSlots = thisWeekSlots();
  const today = new Date().toISOString().slice(0, 10);
  const historyByDate = teamDailyPass(myHistory);

  const ilsStreak = calcStreak(myHistory);
  const streakPct = Math.min(100, (ilsStreak / STREAK_GOAL) * 100);
  const daysLeft  = Math.max(0, STREAK_GOAL - ilsStreak);
  const earned    = ilsStreak >= STREAK_GOAL;

  const statusConfig = {
    green:  { headline: "Looking Good!", sub: "Clean ILS — keep everything off the truck delivered.", emoji: "✅" },
    yellow: { headline: "Watch Your ILS", sub: `${myImpacts} ILS impact${myImpacts !== 1 ? "s" : ""} — keep it under 4.`, emoji: "⚠️" },
    red:    { headline: "Needs Attention", sub: `${myImpacts} ILS impacts — talk to your manager.`, emoji: "🔴" },
    none:   { headline: "No Data Found", sub: "Your route may not have synced yet.", emoji: "❓" },
  }[myTier];

  const sorted = [...rows].sort((a, b) => {
    const ia = ilsImpacts(a), ib = ilsImpacts(b);
    if (ia !== ib) return ia - ib;
    return (serviceRate(b) ?? 0) - (serviceRate(a) ?? 0);
  });

  return (
    <div className="flex flex-col gap-4">

      {/* ── Chick-fil-A Streak Card ── */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
        {/* Header */}
        <div className="px-5 pt-4 pb-3" style={{
          background: earned
            ? "linear-gradient(135deg, #dc2626, #ef4444)"
            : "linear-gradient(135deg, #1e293b, #334155)",
        }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
            {earned ? "🎉 Team Reward Unlocked!" : "Team Clean ILS Streak"}
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[20px] font-extrabold text-white leading-tight">
                {earned ? `${CFA_EMOJI} Free Chick-fil-A!` : `${ilsStreak} / ${STREAK_GOAL} days`}
              </p>
              <p className="text-[11px] text-white/60 mt-0.5">
                {earned
                  ? "The whole team passed service for 2 weeks. Show this to your manager!"
                  : daysLeft === 1
                  ? "1 more team clean day — everyone gets Chick-fil-A!"
                  : `${daysLeft} more team clean days — one bad day resets everyone`}
              </p>
            </div>
            <span className="text-4xl shrink-0 ml-3">{CFA_EMOJI}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 pt-3 pb-2">
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${streakPct}%`,
                background: earned
                  ? "linear-gradient(90deg, #dc2626, #ef4444)"
                  : "linear-gradient(90deg, #10b981, #34d399)",
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-400">Day 0</span>
            <span className="text-[10px] text-slate-400">Day {STREAK_GOAL}</span>
          </div>
        </div>

        {/* This week's days */}
        <div className="px-5 pb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">This Week</p>
          <div className="flex gap-1.5">
            {weekSlots.map((slot) => {
              const isPast   = slot.date < today;
              const isToday  = slot.date === today;
              const hasDat   = historyByDate[slot.date] !== undefined;
              const passed   = historyByDate[slot.date] === true;
              const failed   = historyByDate[slot.date] === false;
              const isFuture = slot.date > today;

              return (
                <div key={slot.date} className="flex flex-col items-center gap-1 flex-1">
                  <span className={`text-[10px] font-bold uppercase ${isToday ? "text-slate-900" : "text-slate-400"}`}>
                    {slot.dow}
                  </span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold border-2 ${
                    passed  ? "bg-emerald-500 border-emerald-500 text-white" :
                    failed  ? "bg-red-500 border-red-500 text-white" :
                    isToday ? "bg-slate-100 border-slate-900 text-slate-600" :
                    isFuture ? "bg-slate-50 border-slate-200 text-slate-300" :
                               "bg-slate-100 border-slate-200 text-slate-400"
                  }`}>
                    {passed ? "✓" : failed ? "✗" : isToday ? "·" : "–"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Today's personal card ── */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.2)]">
        <div
          className="px-5 pt-5 pb-4"
          style={{
            background: myTier === "green"
              ? "linear-gradient(135deg, #065f46, #059669)"
              : myTier === "yellow"
              ? "linear-gradient(135deg, #78350f, #d97706)"
              : myTier === "red"
              ? "linear-gradient(135deg, #7f1d1d, #dc2626)"
              : "linear-gradient(135deg, #1e293b, #475569)",
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Today — {dateLabel}</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{statusConfig.emoji}</span>
            <div>
              <p className="text-[22px] font-extrabold text-white leading-tight">{statusConfig.headline}</p>
              <p className="text-[12px] text-white/65 mt-0.5">{statusConfig.sub}</p>
            </div>
          </div>
        </div>

        {myRow ? (
          <>
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              <div className="px-4 py-4 text-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Service Rate</p>
                {mySvcRate != null ? (
                  <>
                    <p className={`text-[24px] font-extrabold leading-none ${mySvcRate >= 99 ? "text-emerald-600" : "text-red-500"}`}>
                      {mySvcRate.toFixed(1)}%
                    </p>
                    <p className={`text-[11px] font-bold mt-1 ${mySvcRate >= 99 ? "text-emerald-500" : "text-red-500"}`}>
                      {mySvcRate >= 99 ? "PASS" : "FAIL"}
                    </p>
                  </>
                ) : (
                  <p className="text-[22px] font-extrabold text-slate-300">—</p>
                )}
              </div>
              <div className="px-4 py-4 text-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">ILS Impacts</p>
                <p className={`text-[24px] font-extrabold leading-none ${
                  myImpacts === 0 ? "text-emerald-600" : myImpacts <= 3 ? "text-amber-500" : "text-red-500"
                }`}>{myImpacts}</p>
                <p className={`text-[11px] font-bold mt-1 ${
                  myImpacts === 0 ? "text-emerald-500" : myImpacts <= 3 ? "text-amber-500" : "text-red-500"
                }`}>{myImpacts === 0 ? "CLEAN" : myImpacts <= 3 ? "WATCH" : "HIGH"}</p>
              </div>
              <div className="px-4 py-4 text-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Stops Del&apos;d</p>
                <p className="text-[24px] font-extrabold text-slate-800 leading-none">{myRow.actDelStps ?? "—"}</p>
                {myRow.delStpsPlanned
                  ? <p className="text-[11px] text-slate-400 mt-1">of {myRow.delStpsPlanned}</p>
                  : <p className="text-[11px] text-slate-400 mt-1">&nbsp;</p>}
              </div>
            </div>

            {(myRow.vscanPkgs != null || myRow.actDelPkgs != null) && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-6 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loaded</p>
                    <p className="text-[16px] font-extrabold text-slate-700">{myRow.vscanPkgs ?? "—"}</p>
                  </div>
                  <span className="text-slate-300 text-lg">→</span>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delivered</p>
                    <p className="text-[16px] font-extrabold text-slate-700">{myRow.actDelPkgs ?? "—"}</p>
                  </div>
                  {(myRow.nonDelvdStps ?? 0) > 0 && (
                    <>
                      <span className="text-slate-300 text-lg">·</span>
                      <div>
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Not Del&apos;d</p>
                        <p className="text-[16px] font-extrabold text-red-500">{myRow.nonDelvdStps}</p>
                      </div>
                    </>
                  )}
                </div>
                {svcFail && (
                  <span className="text-[11px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                    Below 99% — Fail
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="px-5 py-5 text-center">
            <p className="text-[13px] text-slate-400">Your route wasn&apos;t found in today&apos;s data.</p>
            <p className="text-[11px] text-slate-300 mt-1">Make sure your MyGroundOps profile is linked to your FedEx account.</p>
          </div>
        )}
      </div>

      {/* ── Team list ── */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-slate-900">Team Service</h2>
          <span className="text-[11px] text-slate-400">{dateLabel}</span>
        </div>

        <div className="divide-y divide-slate-100">
          {sorted.map((row, i) => {
            const impacts  = ilsImpacts(row);
            const svc      = serviceRate(row);
            const tier     = ilsTier(impacts, row.ilsPct != null);
            const ts       = tierStyles[tier];
            const isMe     = row.driverId === myDriverId;
            const initials = dswInitials(row.driverNameRaw);

            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${ts.row} ${isMe ? "ring-1 ring-inset ring-blue-200" : ""}`}
              >
                <span className="text-[12px] font-bold text-slate-400 w-5 shrink-0 text-center">{i + 1}</span>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ts.dot}`} />
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-extrabold ${
                    isMe ? "text-white" : "text-slate-600 bg-slate-100"
                  }`}
                  style={isMe ? { background: "linear-gradient(135deg, #4D148C, #7B2FC0)" } : {}}
                >
                  {initials.replace(/\./g, "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold truncate ${isMe ? "text-purple-800" : "text-slate-700"}`}>
                    {initials}{isMe ? " (You)" : ""}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{row.waName || "—"}</p>
                </div>
                <div className="shrink-0">{svcBadge(svc)}</div>
                <div className="shrink-0 text-right min-w-[52px]">
                  <p className={`text-[13px] font-extrabold ${
                    impacts === 0 ? "text-emerald-600" : impacts <= 3 ? "text-amber-500" : "text-red-500"
                  }`}>{impacts} ILS</p>
                  <p className={`text-[10px] font-bold ${ts.badge.split(" ").slice(1).join(" ")}`}>{ts.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /><span className="text-[11px] text-slate-400">0 impacts</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /><span className="text-[11px] text-slate-400">1–3 impacts</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /><span className="text-[11px] text-slate-400">4+ impacts</span></div>
          <span className="ml-auto text-[10px] text-slate-300">Initials only</span>
        </div>
      </div>

    </div>
  );
}
