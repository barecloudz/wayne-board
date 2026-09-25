"use client";

import { Trophy } from "lucide-react";
import type { DriverBadgeRow } from "@/lib/actions/badges";

const shelfStyles = `
  @keyframes shine-sweep {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .shelf-badge-shine {
    position: relative;
    display: inline-block;
  }
  .shelf-badge-shine::after {
    content: '';
    position: absolute;
    inset: -4px;
    background: linear-gradient(105deg, transparent 35%, rgba(255,215,0,0.65) 50%, transparent 65%);
    background-size: 200% 100%;
    animation: shine-sweep 2.2s linear infinite;
    pointer-events: none;
    border-radius: 10px;
  }
`;

const SHELF_BODY = "linear-gradient(180deg, #92400e 0%, #78350f 60%, #451a03 100%)";
const SHELF_EDGE = "linear-gradient(180deg, #fbbf24 0%, #d97706 100%)";
const COLS = 4;

type Props = { badges: DriverBadgeRow[] };

export default function BadgeShelfTab({ badges }: Props) {
  const rows: DriverBadgeRow[][] = [];
  for (let i = 0; i < badges.length; i += COLS) {
    rows.push(badges.slice(i, i + COLS));
  }

  return (
    <>
      <style>{shelfStyles}</style>
      <div className="min-h-screen bg-slate-950 px-4 pt-6 pb-32">
        <div className="max-w-sm mx-auto">

          {/* Header */}
          <div className="mb-8 text-center">
            <Trophy className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <h1 className="text-white font-extrabold text-2xl tracking-tight">Awards Shelf</h1>
            <p className="text-slate-400 text-sm mt-1">
              {badges.length === 0
                ? "No badges yet — keep it up!"
                : `${badges.length} badge${badges.length !== 1 ? "s" : ""} earned`}
            </p>
          </div>

          {badges.length === 0 && (
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-10 h-10 text-slate-600" />
              </div>
              <p className="text-slate-500 text-sm">Your badges will appear here when earned.</p>
            </div>
          )}

          {rows.map((row, rowIdx) => (
            <div key={rowIdx}>
              {/* Badge row */}
              <div className="flex justify-around items-end px-1 pt-5 pb-3">
                {Array.from({ length: COLS }).map((_, colIdx) => {
                  const badge = row[colIdx];
                  return (
                    <div key={colIdx} className="flex flex-col items-center gap-1.5 w-16">
                      {badge ? (
                        <>
                          <span className={badge.shine ? "shelf-badge-shine" : ""} style={{ display: "inline-block" }}>
                            {badge.iconUrl
                              ? <img src={badge.iconUrl} alt={badge.badgeName} className="w-14 h-14 object-contain drop-shadow-[0_4px_16px_rgba(245,158,11,0.4)]" />
                              : <Trophy className="w-12 h-12 text-amber-400 drop-shadow-[0_4px_12px_rgba(245,158,11,0.4)]" />
                            }
                          </span>
                          <p className="text-white text-[10px] font-bold text-center leading-tight line-clamp-2">{badge.badgeName}</p>
                          <p className="text-slate-500 text-[9px]">{badge.weekStart.slice(0, 7)}</p>
                        </>
                      ) : (
                        <div className="w-14 h-14 rounded-xl border border-dashed border-slate-700/50" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Shelf plank */}
              <div className="mx-0">
                <div className="h-[3px] rounded-t-sm" style={{ background: SHELF_EDGE }} />
                <div className="h-5 rounded-b-sm shadow-[0_8px_16px_rgba(0,0,0,0.6)]" style={{ background: SHELF_BODY }} />
              </div>
            </div>
          ))}

        </div>
      </div>
    </>
  );
}
