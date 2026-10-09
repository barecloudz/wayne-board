"use client";

import { useState, useEffect } from "react";
import { Star, Trophy, BarChart2, X, MessageSquare } from "lucide-react";
import ServiceTab, { type DswRow } from "./service-tab";
import { getDriverBadges } from "@/lib/actions/badges";
import type { DriverBadgeRow } from "@/lib/actions/badges";

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @keyframes shine-sweep {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  .badge-shine { position: relative; display: inline-block; }
  .badge-shine::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255,215,0,0.55) 50%, transparent 60%);
    background-size: 200% 100%;
    animation: shine-sweep 2s linear infinite;
    pointer-events: none; border-radius: inherit;
  }
  @keyframes glow-fade {
    0%   { box-shadow: 0 0 0 4px rgba(245,158,11,0.9), 0 0 20px rgba(245,158,11,0.4); }
    100% { box-shadow: 0 0 0 0px rgba(245,158,11,0), 0 0 0px rgba(245,158,11,0); }
  }
  .badge-new-glow { animation: glow-fade 2s ease-out forwards; border-radius: 8px; }
`;

export type ScorePanelProps = {
  rydeAvg: number | null;
  reviewCount: number;
  reviews: Array<{
    id: number; rating: number; comment: string | null; date: string;
    riderName: string | null; type?: "positive" | "negative" | "neutral"; category?: string | null;
  }>;
  leaderboard: Array<{ driverId: string; name: string; avg: number; reviewCount: number }>;
  currentDriverId: string;
  serviceRows: DswRow[];
  myDswHistory: DswRow[];
  showDsw: boolean;
  accent?: string;
  myBadges?: DriverBadgeRow[];
  badgeCounts?: Array<{ driverId: string; badgeCount: number }>;
  driverAvatarMap?: Record<string, { name: string; avatarUrl: string | null }>;
  newBadgeIds?: number[];
  weeklyIlsRank?: number | null;
  weeklyRydeRank?: number | null;
  totalDriversThisWeek?: number;
};

const ARC = Math.PI * 100;

const RATING_FILTERS = ["All", "5★", "4★", "3★", "2★", "1★"] as const;
type RatingFilter = (typeof RATING_FILTERS)[number];
const TYPE_FILTERS = ["All", "Positive", "Negative"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

export default function ScorePanel({
  rydeAvg,
  reviewCount,
  reviews,
  myBadges = [],
  newBadgeIds = [],
  weeklyIlsRank = null,
  weeklyRydeRank = null,
  totalDriversThisWeek = 0,
}: ScorePanelProps) {
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("All");
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>("All");
  const [showAllBadges, setShowAllBadges] = useState(false);

  // Animated ring fill + count-up
  const [animOffset,    setAnimOffset]    = useState(ARC);
  const [displayScore,  setDisplayScore]  = useState(0);

  useEffect(() => {
    if (rydeAvg === null) return;
    const targetOffset = ARC * (1 - rydeAvg / 5);
    const duration = 1200;
    const start = performance.now();
    function step(now: number) {
      const t      = Math.min((now - start) / duration, 1);
      const eased  = 1 - Math.pow(1 - t, 3);
      setAnimOffset(ARC - (ARC - targetOffset) * eased);
      setDisplayScore(rydeAvg! * eased);
      if (t < 1) requestAnimationFrame(step);
      else { setAnimOffset(targetOffset); setDisplayScore(rydeAvg!); }
    }
    requestAnimationFrame(step);
  }, [rydeAvg]);

  const filteredReviews = reviews
    .filter(r => ratingFilter === "All" || r.rating === parseInt(ratingFilter))
    .filter(r => {
      if (typeFilter === "All")      return true;
      if (typeFilter === "Positive") return r.type === "positive" || r.rating >= 4;
      if (typeFilter === "Negative") return r.type === "negative" || r.rating <= 2;
      return true;
    });

  return (
    <div className="flex flex-col">
      <style>{css}</style>
      <div className="px-4 pb-6 flex flex-col gap-4">

        {/* Badges */}
        {myBadges.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Your Badges</p>
            <div className="flex gap-3 flex-wrap">
              {(showAllBadges ? myBadges : myBadges.slice(0, 8)).map(b => (
                <div key={b.id} className={`flex flex-col items-center gap-1.5 ${newBadgeIds.includes(b.id) ? "badge-new-glow" : ""}`}>
                  <span className={b.shine ? "badge-shine" : ""} style={{ display: "inline-block" }}>
                    {b.iconUrl
                      ? <img src={b.iconUrl} alt={b.badgeName} className="w-20 h-20 object-contain" />
                      : <Trophy className="w-16 h-16 text-amber-500" />}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-600 text-center max-w-[80px] leading-tight">{b.badgeName}</span>
                </div>
              ))}
              {myBadges.length > 8 && (
                <button onClick={() => setShowAllBadges(v => !v)} className="text-xs text-slate-400 hover:text-slate-700 self-center transition-colors">
                  {showAllBadges ? "Show less" : `+${myBadges.length - 8} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Score card — dark with animated ring */}
        {rydeAvg !== null ? (
          <div className="rounded-3xl overflow-hidden" style={{ background: "linear-gradient(150deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)" }}>
            <div className="flex flex-col items-center pt-8 pb-5 px-6">
              {/* Ring */}
              <div className="relative w-40 h-40 mb-4">
                <svg className="w-40 h-40 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
                  {/* glow layer */}
                  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand)" strokeWidth="14" strokeLinecap="round"
                    strokeDasharray={ARC} strokeDashoffset={animOffset}
                    style={{ filter: "blur(6px)", opacity: 0.4 }} />
                  {/* sharp arc */}
                  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={ARC} strokeDashoffset={animOffset}
                    style={{ filter: "drop-shadow(0 0 4px var(--brand))" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[42px] font-black text-white leading-none tabular-nums">{displayScore.toFixed(1)}</span>
                  <span className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mt-0.5">/ 5.0</span>
                </div>
              </div>

              {/* Stars */}
              <div className="flex gap-1.5 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-5 h-5 transition-colors ${i < Math.round(displayScore) ? "text-amber-400 fill-amber-400" : "text-white/15 fill-white/15"}`} />
                ))}
              </div>
              <p className="text-[13px] text-white/45">
                Based on <span className="text-white/75 font-bold">{reviewCount}</span> {reviewCount === 1 ? "review" : "reviews"}
              </p>
            </div>

            {/* Rank pills inside the card */}
            {(weeklyIlsRank !== null || weeklyRydeRank !== null) && (
              <div className="px-5 pb-6 flex gap-2 flex-wrap justify-center">
                {weeklyIlsRank !== null && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
                    <span className="text-[13px]">📦</span>
                    <span className="text-[13px] font-bold text-blue-300">
                      #{weeklyIlsRank}
                      {totalDriversThisWeek > 0 && <span className="font-normal text-[12px] text-blue-400"> of {totalDriversThisWeek}</span>}
                    </span>
                    <span className="text-[11px] font-semibold text-blue-400/70">this week</span>
                  </div>
                )}
                {weeklyRydeRank !== null && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
                    <span className="text-[13px]">⭐</span>
                    <span className="text-[13px] font-bold text-orange-300">#{weeklyRydeRank}</span>
                    <span className="text-[11px] font-semibold text-orange-400/70">in ratings</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-3xl p-8 flex flex-col items-center text-center" style={{ background: "linear-gradient(150deg,#0f172a 0%,#1e293b 100%)" }}>
            <Star className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-[15px] font-bold text-white/60">No score yet</p>
            <p className="text-[13px] text-white/30 mt-1">Complete rides to earn your Ryde rating</p>
          </div>
        )}

        {/* Reviews ──────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Reviews</p>

          {/* Filter row */}
          <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-0.5">
            {TYPE_FILTERS.map(f => (
              <button key={f} onClick={() => setTypeFilter(f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  typeFilter === f ? "text-white"
                    : f === "Positive" ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    : f === "Negative" ? "bg-red-50 text-red-500 border border-red-200"
                    : "bg-slate-100 text-slate-500"
                }`}
                style={typeFilter === f ? { backgroundColor: f === "Positive" ? "#16a34a" : f === "Negative" ? "#dc2626" : "var(--brand)" } : {}}
              >
                {f === "Positive" ? "👍 Positive" : f === "Negative" ? "👎 Negative" : "All"}
              </button>
            ))}
            {RATING_FILTERS.map(f => (
              <button key={f} onClick={() => setRatingFilter(f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  ratingFilter === f ? "text-white" : "bg-slate-100 text-slate-500"
                }`}
                style={ratingFilter === f ? { backgroundColor: "var(--brand)" } : {}}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-3">
            {filteredReviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-[15px] font-bold text-slate-700">No reviews</p>
                <p className="text-[12px] text-slate-400 mt-1">Try a different filter</p>
              </div>
            ) : (
              filteredReviews.map(review => {
                const isPos = review.type === "positive" || (!review.type && review.rating >= 4);
                const isNeg = review.type === "negative" || (!review.type && review.rating <= 2);
                const bar   = isPos ? "#16a34a" : isNeg ? "#dc2626" : "#94a3b8";
                const bg    = isPos ? "#f0fdf4" : isNeg ? "#fef2f2" : "#f8fafc";
                const lc    = isPos ? "#16a34a" : isNeg ? "#dc2626" : "#64748b";
                const lbl   = isPos ? "Positive" : isNeg ? "Negative" : "Neutral";
                return (
                  <div key={review.id} className="rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)] border border-slate-200/60" style={{ background: bg }}>
                    <div className="h-1 w-full" style={{ background: bar }} />
                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-4 h-4 ${i < review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
                            ))}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: lc, background: "rgba(0,0,0,0.06)" }}>{lbl}</span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-400">{review.date}</span>
                      </div>
                      {review.category && (
                        <span className="inline-block mb-2 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/70 text-slate-600 border border-slate-200/60">{review.category}</span>
                      )}
                      {review.comment
                        ? <p className="text-[13px] text-slate-700 leading-relaxed">{review.comment}</p>
                        : <p className="text-[12px] text-slate-400 italic">No comment left</p>
                      }
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
