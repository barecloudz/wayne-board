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
    0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(110vh) rotate(900deg); opacity: 0; }
  }
  @keyframes badge-pop {
    0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
    60%  { transform: scale(1.12) rotate(3deg); opacity: 1; }
    80%  { transform: scale(0.96) rotate(-1deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes badge-shine {
    0%   { background-position: -300% center; }
    100% { background-position: 300% center; }
  }
  @keyframes title-drop {
    0%   { transform: translateY(-30px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes btn-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
    50%       { box-shadow: 0 0 0 16px rgba(245, 158, 11, 0); }
  }
  @keyframes overlay-out {
    to { opacity: 0; transform: scale(1.04); }
  }
  .celebration-overlay-exit {
    animation: overlay-out 300ms ease-out forwards;
  }
  .badge-shine-sweep {
    position: relative;
    display: inline-block;
  }
  .badge-shine-sweep::after {
    content: '';
    position: absolute;
    inset: -10px;
    background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.7) 50%, transparent 70%);
    background-size: 300% 100%;
    animation: badge-shine 2s linear infinite;
    pointer-events: none;
    border-radius: 12px;
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
      <div className={`fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-between py-12 px-6 ${dismissing ? "celebration-overlay-exit" : ""}`}>

        {/* Full-screen confetti */}
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
                animationIterationCount: "infinite",
              }}
            />
          ))}
        </div>

        {/* Title */}
        <p
          className="relative z-10 text-white font-extrabold text-3xl tracking-tight text-center"
          style={{ animation: "title-drop 600ms cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          {heading}
        </p>

        {/* Badge(s) — huge, centered */}
        <div className="relative z-10 flex flex-row flex-wrap justify-center gap-6">
          {badges.map((badge, i) => (
            <div
              key={badge.id}
              style={{
                animationName: "badge-pop",
                animationDuration: "700ms",
                animationDelay: `${i * 200}ms`,
                animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                animationFillMode: "both",
              }}
              className="flex flex-col items-center gap-4"
            >
              <span className="badge-shine-sweep" style={{ display: "inline-block" }}>
                {badge.iconUrl
                  ? <img src={badge.iconUrl} alt={badge.badgeName} className="w-56 h-56 object-contain drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]" />
                  : <Trophy className="w-56 h-56 text-amber-400 drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]" />
                }
              </span>
              <p className="text-white font-extrabold text-xl text-center">{badge.badgeName}</p>
            </div>
          ))}
        </div>

        {/* Claim button */}
        <button
          onClick={handleClaim}
          disabled={dismissing}
          style={{ animationName: "btn-pulse", animationDuration: "1.5s", animationIterationCount: "infinite" }}
          className="relative z-10 w-full max-w-xs py-4 rounded-2xl bg-amber-500 text-white font-extrabold text-lg hover:bg-amber-400 transition-colors disabled:opacity-60"
        >
          Claim your badge!
        </button>

      </div>
    </>
  );
}
