"use client";

import { Trophy, Lock } from "lucide-react";
import type { DriverBadgeRow } from "@/lib/actions/badges";

const SHINE_CSS = `
  @keyframes badge-shine {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .badge-shine-wrap {
    position: relative;
  }
  .badge-shine-wrap::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
    background: linear-gradient(105deg, transparent 30%, rgba(255,215,0,0.55) 50%, transparent 70%);
    background-size: 200% 100%;
    animation: badge-shine 2.4s linear infinite;
    pointer-events: none;
  }
`;

const CAT_LABEL: Record<string, string> = {
  weekly:    "Weekly Win",
  monthly:   "Monthly",
  milestone: "Milestone",
  special:   "Special",
  streak:    "Streak",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

type Props = { badges: DriverBadgeRow[] };

export default function BadgeShelfTab({ badges }: Props) {
  const sorted = [...badges].sort(
    (a, b) => new Date(b.awardedAt ?? b.weekStart).getTime() - new Date(a.awardedAt ?? a.weekStart).getTime()
  );

  // Group by category
  const groups = new Map<string, DriverBadgeRow[]>();
  for (const b of sorted) {
    const cat = b.category ?? "special";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(b);
  }

  return (
    <>
      <style>{SHINE_CSS}</style>
      <div className="min-h-screen px-4 pt-6 pb-32" style={{ background: "#F8FAFC" }}>
        <div className="max-w-sm mx-auto">

          {/* ── Header ── */}
          <div className="mb-6">
            <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: "#0F172A" }}>
              Achievements
            </h1>
            <p className="text-[13px] mt-0.5" style={{ color: "#64748B" }}>
              {badges.length === 0
                ? "Earn badges by performing well each week"
                : `${badges.length} badge${badges.length !== 1 ? "s" : ""} earned`}
            </p>
          </div>

          {/* ── Empty state ── */}
          {badges.length === 0 && (
            <div className="mt-8">
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl"
                    style={{ background: "#FFFFFF", border: "1px solid #E2E8F0" }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: "#F1F5F9" }}
                    >
                      <Lock className="w-5 h-5" style={{ color: "#CBD5E1" }} />
                    </div>
                    <div className="w-10 h-2 rounded-full" style={{ background: "#E2E8F0" }} />
                    <div className="w-7 h-1.5 rounded-full" style={{ background: "#F1F5F9" }} />
                  </div>
                ))}
              </div>
              <p className="text-center text-[13px]" style={{ color: "#94A3B8" }}>
                Your first badge is one great week away.
              </p>
            </div>
          )}

          {/* ── Badge groups ── */}
          {Array.from(groups.entries()).map(([cat, catBadges]) => (
            <div key={cat} className="mb-8">

              {/* Category label */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: "#94A3B8" }}
                >
                  {CAT_LABEL[cat] ?? cat}
                </span>
                <span className="flex-1 h-px" style={{ background: "#E2E8F0" }} />
                <span
                  className="text-[11px] font-semibold tabular-nums"
                  style={{ color: "#CBD5E1" }}
                >
                  {catBadges.length}
                </span>
              </div>

              {/* Badge grid — 3 columns */}
              <div className="grid grid-cols-3 gap-3">
                {catBadges.map((badge) => (
                  <div key={badge.id} className={badge.shine ? "badge-shine-wrap" : ""}>
                    <div
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-transform active:scale-95"
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        boxShadow: badge.shine
                          ? "0 4px 20px rgba(251,191,36,0.25), 0 1px 3px rgba(0,0,0,0.06)"
                          : "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      {/* Icon */}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, #fcd34d 0%, #fb923c 100%)",
                          boxShadow: "0 2px 8px rgba(251,191,36,0.3)",
                        }}
                      >
                        {badge.iconUrl ? (
                          <img
                            src={badge.iconUrl}
                            alt={badge.badgeName}
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <Trophy className="w-6 h-6 text-white" />
                        )}
                      </div>

                      {/* Name */}
                      <p
                        className="text-[11px] font-bold text-center leading-tight line-clamp-2"
                        style={{ color: "#0F172A" }}
                      >
                        {badge.badgeName}
                      </p>

                      {/* Date */}
                      <p className="text-[10px] font-medium" style={{ color: "#94A3B8" }}>
                        {formatDate(badge.weekStart)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ── Total earned footer ── */}
          {badges.length > 0 && (
            <div
              className="mt-2 rounded-2xl px-5 py-4 flex items-center justify-between"
              style={{ background: "#FFFFFF", border: "1px solid #E2E8F0" }}
            >
              <div>
                <p
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: "#94A3B8" }}
                >
                  Total Earned
                </p>
                <p
                  className="text-[22px] font-extrabold leading-none mt-0.5"
                  style={{ color: "#0F172A" }}
                >
                  {badges.length}
                </p>
              </div>
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #fcd34d 0%, #fb923c 100%)" }}
              >
                <Trophy className="w-6 h-6 text-white" />
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
