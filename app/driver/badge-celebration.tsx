"use client";

import { useState, useMemo, useTransition } from "react";
import { Trophy } from "lucide-react";
import { markBadgesSeen } from "@/lib/actions/badges";
import type { DriverBadgeRow } from "@/lib/actions/badges";

type Props = {
  badges: DriverBadgeRow[];
  onClaim: (badgeIds: number[]) => void;
};

const CONFETTI_COLORS = ["#F59E0B", "#FBBF24", "#FCD34D", "#FFF", "#CBD5E1", "#F97316"];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

const celebrationStyles = `
  @keyframes confetti-fall {
    0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
  }
  @keyframes badge-pop {
    0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
    70%  { transform: scale(1.15) rotate(2deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes btn-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
    50%       { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
  }
  @keyframes overlay-out {
    to { opacity: 0; transform: scale(0.95); }
  }
  .celebration-overlay-exit {
    animation: overlay-out 300ms ease-out forwards;
  }
`;

export default function BadgeCelebrationOverlay({ badges, onClaim }: Props) {
  const [dismissing, setDismissing] = useState(false);
  const [, startTransition] = useTransition();

  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left:         `${randomBetween(2, 98)}%`,
      delay:        `${randomBetween(0, 1)}s`,
      duration:     `${randomBetween(1.2, 2.5)}s`,
      color:        CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:         `${randomBetween(6, 12)}px`,
      borderRadius: Math.random() > 0.5 ? "50%" : "2px",
    })),
  []);

  function handleClaim() {
    const ids = badges.map(b => b.id);
    setDismissing(true);
    startTransition(async () => {
      await markBadgesSeen(ids);
    });
    setTimeout(() => onClaim(ids), 300);
  }

  const heading = badges.length > 1
    ? `You earned ${badges.length} badges!`
    : "You earned a badge!";

  return (
    <>
      <style>{celebrationStyles}</style>
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className={`relative bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden px-6 py-8 flex flex-col items-center gap-6 ${dismissing ? "celebration-overlay-exit" : ""}`}>

          {/* Confetti layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map(p => (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: p.left,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  borderRadius: p.borderRadius,
                  animationName: "confetti-fall",
                  animationDuration: p.duration,
                  animationDelay: p.delay,
                  animationTimingFunction: "linear",
                  animationFillMode: "forwards",
                }}
              />
            ))}
          </div>

          {/* Heading */}
          <div className="text-center relative z-10">
            <p className="text-3xl mb-1">🏆</p>
            <p className="text-[22px] font-extrabold text-white leading-tight">{heading}</p>
          </div>

          {/* Badge cards — staggered pop */}
          <div className="flex flex-row flex-wrap justify-center gap-4 relative z-10">
            {badges.map((badge, i) => (
              <div
                key={badge.id}
                style={{
                  animationName: "badge-pop",
                  animationDuration: "500ms",
                  animationDelay: `${i * 150}ms`,
                  animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                  animationFillMode: "both",
                }}
                className="flex flex-col items-center gap-2 bg-white/10 rounded-2xl px-4 py-4 min-w-[88px]"
              >
                {badge.iconUrl
                  ? <img src={badge.iconUrl} alt={badge.badgeName} className="w-12 h-12 object-contain" />
                  : <Trophy className="w-12 h-12 text-amber-400" />
                }
                <p className="text-white font-bold text-[12px] text-center leading-tight">{badge.badgeName}</p>
                <p className="text-slate-400 text-[10px]">{badge.weekStart.slice(0, 7)}</p>
              </div>
            ))}
          </div>

          {/* Claim button */}
          <button
            onClick={handleClaim}
            disabled={dismissing}
            style={{ animationName: "btn-pulse", animationDuration: "2s", animationIterationCount: "infinite" }}
            className="relative z-10 w-full py-3.5 rounded-2xl bg-amber-500 text-white font-extrabold text-[15px] hover:bg-amber-400 transition-colors disabled:opacity-60"
          >
            Claim your badge!
          </button>

        </div>
      </div>
    </>
  );
}
