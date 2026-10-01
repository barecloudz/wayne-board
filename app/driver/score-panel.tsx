"use client";

import { useState } from "react";
import { Star, Trophy, MessageSquare, BarChart2, X } from "lucide-react";
import ServiceTab, { type DswRow } from "./service-tab";
import { getDriverBadges } from "@/lib/actions/badges";
import type { DriverBadgeRow } from "@/lib/actions/badges";

// ── Shine + Glow CSS ──────────────────────────────────────────────────────────
const shineStyle = `
  @keyframes shine-sweep {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .badge-shine {
    position: relative;
    display: inline-block;
  }
  .badge-shine::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255,215,0,0.55) 50%, transparent 60%);
    background-size: 200% 100%;
    animation: shine-sweep 2s linear infinite;
    pointer-events: none;
    border-radius: inherit;
  }
  @keyframes glow-fade {
    0%   { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.9), 0 0 20px rgba(245,158,11,0.4); }
    100% { box-shadow: 0 0 0 0px rgba(245, 158, 11, 0), 0 0 0px rgba(245,158,11,0); }
  }
  .badge-new-glow {
    animation: glow-fade 2s ease-out forwards;
    border-radius: 8px;
  }
`;

export type ScorePanelProps = {
  rydeAvg: number | null;
  reviewCount: number;
  reviews: Array<{
    id: number;
    rating: number;
    comment: string | null;
    date: string;
    riderName: string | null;
    type?: "positive" | "negative" | "neutral";
    category?: string | null;
  }>;
  leaderboard: Array<{
    driverId: string;
    name: string;
    avg: number;
    reviewCount: number;
  }>;
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

type ScoreSection = "score" | "leaderboard" | "reviews" | "service";

const SCORE_SECTIONS: { key: ScoreSection; label: string; icon: typeof Star }[] = [
  { key: "score", label: "Score", icon: Star },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "reviews", label: "Reviews", icon: MessageSquare },
  { key: "service", label: "Service", icon: BarChart2 },
];

const RATING_FILTERS = ["All", "5★", "4★", "3★", "2★", "1★"] as const;
type RatingFilter = (typeof RATING_FILTERS)[number];

const TYPE_FILTERS = ["All", "Positive", "Negative"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

export default function ScorePanel({
  rydeAvg,
  reviewCount,
  reviews,
  leaderboard,
  currentDriverId,
  serviceRows,
  myDswHistory,
  showDsw,
  accent = "#FF6200",
  myBadges = [],
  badgeCounts = [],
  driverAvatarMap = {},
  newBadgeIds = [],
  weeklyIlsRank = null,
  weeklyRydeRank = null,
  totalDriversThisWeek = 0,
}: ScorePanelProps) {
  const [section, setSection] = useState<ScoreSection>("score");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("All");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [showAllBadges, setShowAllBadges] = useState(false);

  // Badge popover state
  const [popoverDriver, setPopoverDriver] = useState<string | null>(null);
  const [popoverDriverName, setPopoverDriverName] = useState<string>("");
  const [popoverBadges, setPopoverBadges] = useState<DriverBadgeRow[]>([]);
  const [popoverLoading, setPopoverLoading] = useState(false);

  async function openBadgePopover(driverId: string, driverName: string) {
    setPopoverDriver(driverId);
    setPopoverDriverName(driverName);
    setPopoverBadges([]);
    setPopoverLoading(true);
    try {
      const badges = await getDriverBadges(driverId);
      setPopoverBadges(badges);
    } catch {
      setPopoverBadges([]);
    } finally {
      setPopoverLoading(false);
    }
  }

  const filteredReviews = reviews
    .filter((r) => ratingFilter === "All" || r.rating === parseInt(ratingFilter))
    .filter((r) => {
      if (typeFilter === "All") return true;
      if (typeFilter === "Positive") return r.type === "positive" || r.rating >= 4;
      if (typeFilter === "Negative") return r.type === "negative" || r.rating <= 2;
      return true;
    });

  const badgeCountMap = new Map(badgeCounts.map((b) => [b.driverId, b.badgeCount]));

  return (
    <div className="flex flex-col">
      <style>{shineStyle}</style>

      {/* Sub-nav pills */}
      <div className="flex gap-2 px-4 pt-4 pb-3 overflow-x-auto no-scrollbar">
        {SCORE_SECTIONS.filter(
          (s) => s.key !== "service" || showDsw
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
              section === key
                ? "text-white"
                : "bg-slate-100 text-slate-500"
            }`}
            style={section === key ? { backgroundColor: "var(--brand)" } : {}}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Score section */}
      {section === "score" && (
        <div className="px-4 pb-6 flex flex-col gap-4">
          {/* Badge shelf */}
          {myBadges.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Your Badges</p>
              <div className="flex gap-3 flex-wrap">
                {(showAllBadges ? myBadges : myBadges.slice(0, 8)).map((b) => (
                  <div key={b.id} className={`flex flex-col items-center gap-1.5 ${newBadgeIds.includes(b.id) ? "badge-new-glow" : ""}`}>
                    <span className={b.shine ? "badge-shine" : ""} style={{ display: "inline-block" }}>
                      {b.iconUrl
                        ? <img src={b.iconUrl} alt={b.badgeName} className="w-20 h-20 object-contain" />
                        : <Trophy className="w-16 h-16 text-amber-500" />
                      }
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600 text-center max-w-[80px] leading-tight">{b.badgeName}</span>
                  </div>
                ))}
                {myBadges.length > 8 && (
                  <button
                    onClick={() => setShowAllBadges((v) => !v)}
                    className="text-xs text-slate-400 hover:text-slate-700 self-center transition-colors"
                  >
                    {showAllBadges ? "Show less" : `+${myBadges.length - 8} more`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Weekly rank pills */}
          {(weeklyIlsRank !== null || weeklyRydeRank !== null) && (
            <div className="flex gap-2 flex-wrap">
              {weeklyIlsRank !== null && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                  style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
                >
                  <span className="text-[13px]">📦</span>
                  <span className="text-[13px] font-bold" style={{ color: "#1D4ED8" }}>
                    #{weeklyIlsRank}
                    {totalDriversThisWeek > 0 && (
                      <span className="font-normal text-[12px]" style={{ color: "#3B82F6" }}> of {totalDriversThisWeek}</span>
                    )}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: "#60A5FA" }}>this week</span>
                </div>
              )}
              {weeklyRydeRank !== null && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                  style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}
                >
                  <span className="text-[13px]">⭐</span>
                  <span className="text-[13px] font-bold" style={{ color: "#C2410C" }}>#{weeklyRydeRank}</span>
                  <span className="text-[11px] font-semibold" style={{ color: "#FB923C" }}>in ratings</span>
                </div>
              )}
            </div>
          )}

          {rydeAvg !== null ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col items-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {/* Score ring */}
              <div className="relative w-32 h-32 mb-4">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.PI * 100}`}
                    strokeDashoffset={`${Math.PI * 100 * (1 - rydeAvg / 5)}`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[32px] font-extrabold text-slate-900 leading-none">
                    {rydeAvg.toFixed(1)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    / 5.0
                  </span>
                </div>
              </div>
              <p className="text-[13px] text-slate-500">
                Based on{" "}
                <span className="font-bold text-slate-700">{reviewCount}</span>{" "}
                {reviewCount === 1 ? "review" : "reviews"}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 flex flex-col items-center text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Star className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-[15px] font-bold text-slate-700">No score yet</p>
              <p className="text-[13px] text-slate-400 mt-1">Complete rides to earn your Ryde rating</p>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard section */}
      {section === "leaderboard" && (
        <div className="px-4 pb-6 flex flex-col gap-2">
          {leaderboard.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-[15px] font-bold text-slate-700">No ILS data for this week yet</p>
            </div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.driverId === currentDriverId;
              const badgeCount = badgeCountMap.get(entry.driverId) ?? 0;
              const driverInfo = driverAvatarMap[entry.driverId];
              const avatarUrl = driverInfo?.avatarUrl ?? null;
              const displayName = entry.name;
              return (
                <div
                  key={entry.driverId}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 ${
                    isMe
                      ? "border-2 text-white"
                      : "bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  }`}
                  style={isMe ? { borderColor: "var(--brand)", backgroundColor: "var(--brand)" } : {}}
                >
                  <span
                    className={`text-[14px] font-extrabold w-6 text-center shrink-0 ${
                      isMe ? "text-white/70" : "text-slate-400"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {/* Circular avatar or initials */}
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 flex-shrink-0 flex items-center justify-center">
                      {avatarUrl
                        ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        : <span className={`text-xs font-bold ${isMe ? "text-white/80" : "text-slate-500"}`}
                            style={isMe ? { color: "var(--brand)" } : {}}
                          >
                            {displayName?.[0]?.toUpperCase() ?? "?"}
                          </span>
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-[14px] font-bold truncate ${isMe ? "text-white" : "text-slate-800"}`}>
                          {displayName}
                          {isMe && (
                            <span className="ml-2 text-[11px] font-semibold opacity-80">You</span>
                          )}
                        </p>
                        {/* Badge count chip */}
                        {badgeCount > 0 && (
                          <button
                            onClick={() => openBadgePopover(entry.driverId, displayName)}
                            className="flex items-center gap-0.5 bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[11px] font-bold hover:bg-amber-200 transition-colors shrink-0"
                          >
                            🏆 ×{badgeCount}
                          </button>
                        )}
                      </div>
                      <p className={`text-[12px] ${isMe ? "text-white/70" : "text-slate-400"}`}>
                        {entry.reviewCount} {entry.reviewCount === 1 ? "day" : "days"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[16px] font-extrabold shrink-0 ${isMe ? "text-white" : "text-slate-900"}`}>
                    {entry.avg.toFixed(1)}%
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Reviews section */}
      {section === "reviews" && (
        <div className="flex flex-col">
          {/* Type filter pills */}
          <div className="flex gap-2 px-4 pb-2 overflow-x-auto no-scrollbar">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  typeFilter === f
                    ? "text-white"
                    : f === "Positive"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : f === "Negative"
                        ? "bg-red-50 text-red-500 border border-red-200"
                        : "bg-slate-100 text-slate-500"
                }`}
                style={typeFilter === f ? {
                  backgroundColor: f === "Positive" ? "#16a34a" : f === "Negative" ? "#dc2626" : "var(--brand)",
                } : {}}
              >
                {f === "Positive" ? "👍 Positive" : f === "Negative" ? "👎 Negative" : "All"}
              </button>
            ))}
          </div>
          {/* Star rating filter pills */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {RATING_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setRatingFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  ratingFilter === f
                    ? "text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
                style={ratingFilter === f ? { backgroundColor: "var(--brand)" } : {}}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="px-4 pb-6 flex flex-col gap-3">
            {filteredReviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-[15px] font-bold text-slate-700">No reviews</p>
                <p className="text-[12px] text-slate-400 mt-1">Try a different filter</p>
              </div>
            ) : (
              filteredReviews.map((review) => {
                const isPositive = review.type === "positive" || (!review.type && review.rating >= 4);
                const isNegative = review.type === "negative" || (!review.type && review.rating <= 2);
                const borderColor = isPositive ? "#16a34a" : isNegative ? "#dc2626" : "#94a3b8";
                const bgColor = isPositive ? "#f0fdf4" : isNegative ? "#fef2f2" : "#f8fafc";
                const labelColor = isPositive ? "#16a34a" : isNegative ? "#dc2626" : "#64748b";
                const label = isPositive ? "Positive" : isNegative ? "Negative" : "Neutral";
                return (
                  <div
                    key={review.id}
                    className="rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)] border border-slate-200/60"
                    style={{ background: bgColor }}
                  >
                    {/* Color bar */}
                    <div className="h-1 w-full" style={{ background: borderColor }} />
                    <div className="px-4 py-4">
                      {/* Top row: stars + type badge + date */}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${i < review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`}
                              />
                            ))}
                          </div>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ color: labelColor, background: "rgba(0,0,0,0.06)" }}
                          >
                            {label}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-400">{review.date}</span>
                      </div>
                      {/* Category badge */}
                      {review.category && (
                        <span className="inline-block mb-2 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/70 text-slate-600 border border-slate-200/60">
                          {review.category}
                        </span>
                      )}
                      {/* Comment */}
                      {review.comment ? (
                        <p className="text-[13px] text-slate-700 leading-relaxed">{review.comment}</p>
                      ) : (
                        <p className="text-[12px] text-slate-400 italic">No comment left</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Service/DSW section */}
      {section === "service" && showDsw && (
        <div className="px-4 pb-6">
          <ServiceTab rows={serviceRows} myDriverId={currentDriverId} myHistory={myDswHistory} accent={accent} />
        </div>
      )}

      {/* Badge history popover */}
      {popoverDriver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => setPopoverDriver(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">
                {popoverDriverName ? `${popoverDriverName} — Badges` : "Badge History"}
              </p>
              <button
                onClick={() => setPopoverDriver(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {popoverLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : popoverBadges.length === 0 ? (
              <p className="text-sm text-slate-400">No badges yet.</p>
            ) : (
              popoverBadges.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <span className={b.shine ? "badge-shine" : ""} style={{ display: "inline-block" }}>
                    {b.iconUrl
                      ? <img src={b.iconUrl} alt={b.badgeName} className="w-7 h-7 object-contain" />
                      : <Trophy className="w-6 h-6 text-amber-500" />
                    }
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{b.badgeName}</p>
                    <p className="text-xs text-slate-400">{b.weekStart}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
