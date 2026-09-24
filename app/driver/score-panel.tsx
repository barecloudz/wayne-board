"use client";

import { useState } from "react";
import { Star, Trophy, MessageSquare, BarChart2, X } from "lucide-react";
import ServiceTab, { type DswRow } from "./service-tab";
import { getDriverBadges } from "@/lib/actions/badges";
import type { DriverBadgeRow } from "@/lib/actions/badges";

// ── Shine CSS ─────────────────────────────────────────────────────────────────
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
}: ScorePanelProps) {
  const [section, setSection] = useState<ScoreSection>("score");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("All");
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

  const filteredReviews =
    ratingFilter === "All"
      ? reviews
      : reviews.filter((r) => r.rating === parseInt(ratingFilter));

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
                  <div key={b.id} className="flex flex-col items-center gap-1">
                    <span className={b.shine ? "badge-shine" : ""} style={{ display: "inline-block" }}>
                      {b.iconUrl
                        ? <img src={b.iconUrl} alt={b.badgeName} className="w-8 h-8 object-contain" />
                        : <Trophy className="w-7 h-7 text-amber-500" />
                      }
                    </span>
                    <span className="text-[9px] text-slate-400 text-center max-w-[52px] leading-tight">
                      {b.weekStart.slice(0, 7)}
                    </span>
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
              <p className="text-[15px] font-bold text-slate-700">No data yet</p>
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
                        {entry.reviewCount} {entry.reviewCount === 1 ? "review" : "reviews"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[16px] font-extrabold shrink-0 ${isMe ? "text-white" : "text-slate-900"}`}>
                    {entry.avg.toFixed(1)}
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
          {/* Filter pills */}
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
                <p className="text-[15px] font-bold text-slate-700">No reviews yet</p>
              </div>
            ) : (
              filteredReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-white rounded-2xl border border-slate-200/80 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">{review.date}</span>
                  </div>
                  {review.comment && (
                    <p className="text-[13px] text-slate-700 leading-relaxed">{review.comment}</p>
                  )}
                  {review.riderName && (
                    <p className="text-[11px] text-slate-400 mt-1.5">— {review.riderName}</p>
                  )}
                </div>
              ))
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
