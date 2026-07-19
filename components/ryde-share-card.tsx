"use client";

import React from "react";

export type NegCategory = {
  label: string;
  count: number;
  pct: number; // 0–100
};

export type RydeShareCardProps = {
  driverName: string;
  period: string;
  positivePct: number; // 0–100
  totalRatings: number;
  avgStars: number; // 1–5
  negBreakdown: NegCategory[];
};

// Neon color palette for categories
const CAT_COLORS = [
  "#a78bfa", // violet
  "#38bdf8", // sky
  "#fb923c", // orange
  "#34d399", // emerald
  "#f472b6", // pink
  "#facc15", // yellow
];

// SVG ring constants
const R    = 52;
const CIRC = 2 * Math.PI * R; // ≈ 326.7
const CX   = 70;
const CY   = 70;
const SIZE = 140;

function RingTrack() {
  return <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e293b" strokeWidth={11} />;
}

function RingArc({ pct, color }: { pct: number; color: string }) {
  const dash = Math.max(0, (pct / 100) * CIRC);
  return (
    <circle
      cx={CX} cy={CY} r={R}
      fill="none"
      stroke={color}
      strokeWidth={11}
      strokeDasharray={`${dash} ${CIRC}`}
      strokeLinecap="round"
      transform={`rotate(-90 ${CX} ${CY})`}
    />
  );
}

/**
 * The shareable card — fixed 400×620 in inline styles so html2canvas
 * captures exactly what you see.  Use forwardRef to get a DOM ref.
 */
const RydeShareCard = React.forwardRef<HTMLDivElement, RydeShareCardProps>(
  ({ driverName, period, positivePct, totalRatings, avgStars, negBreakdown }, ref) => {
    const pct = Math.max(0, Math.min(100, positivePct));

    // Ring color based on score
    const ringColor =
      pct >= 80 ? "#4ade80"  // green
      : pct >= 60 ? "#fb923c" // orange
      : "#f87171";             // red

    const statusLabel =
      pct >= 80 ? "EXCELLENT" : pct >= 60 ? "GOOD" : "NEEDS WORK";

    const initials = driverName
      .split(" ")
      .map(w => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <div
        ref={ref}
        style={{
          width: 400,
          background: "linear-gradient(155deg, #0b0f1a 0%, #111827 55%, #0b0f1a 100%)",
          borderRadius: 28,
          padding: "30px 28px 26px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >

        {/* Background decorative circles */}
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 220, height: 220, borderRadius: "50%",
          background: `radial-gradient(circle, ${ringColor}18 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -40, left: -40,
          width: 180, height: 180, borderRadius: "50%",
          background: "radial-gradient(circle, #6366f118 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", color: "#4b5563", textTransform: "uppercase" }}>
              742 LOGISTICS
            </div>
            <div style={{ fontSize: 10, color: "#374151", letterSpacing: "0.06em", marginTop: 2 }}>
              RYDE · Wayne Board
            </div>
          </div>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
            color: ringColor,
            background: `${ringColor}18`,
            border: `1px solid ${ringColor}40`,
            padding: "5px 12px",
            borderRadius: 20,
          }}>
            {statusLabel}
          </div>
        </div>

        {/* ── Driver avatar + name ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: `linear-gradient(135deg, ${ringColor}60, #6366f160)`,
            border: `2px solid ${ringColor}50`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 800, color: "#f1f5f9", flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              {driverName}
            </div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 3, fontWeight: 500 }}>
              {period}
            </div>
          </div>
        </div>

        {/* ── Donut ring + stats side-by-side ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20,
          background: "#0f172a",
          borderRadius: 20, padding: "20px 22px",
          marginBottom: 18,
          border: "1px solid #1e293b",
        }}>
          {/* Ring */}
          <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <RingTrack />
              <RingArc pct={pct} color={ringColor} />
            </svg>
            {/* Centre text */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: "#f8fafc", lineHeight: 1 }}>
                {Math.round(pct)}%
              </span>
              <span style={{ fontSize: 9, color: "#4b5563", marginTop: 3, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Positive
              </span>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Total Ratings", val: totalRatings.toString(), color: "#60a5fa" },
              { label: "Avg Stars",     val: `${avgStars.toFixed(1)} ★`, color: "#facc15" },
              { label: "Positive",      val: `${Math.round(pct * totalRatings / 100)}`, color: ringColor },
              { label: "Negative",      val: `${totalRatings - Math.round(pct * totalRatings / 100)}`, color: "#f87171" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#111827", borderRadius: 10, padding: "7px 12px",
              }}>
                <span style={{ fontSize: 10, color: "#4b5563", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Complaint breakdown ── */}
        {negBreakdown.length > 0 && (
          <div style={{
            background: "#0f172a",
            borderRadius: 20,
            padding: "18px 20px",
            border: "1px solid #1e293b",
            marginBottom: 18,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#374151",
              textTransform: "uppercase", marginBottom: 14,
            }}>
              Complaint Breakdown
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {negBreakdown.slice(0, 6).map((cat, i) => {
                const color = CAT_COLORS[i % CAT_COLORS.length];
                return (
                  <div key={cat.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{cat.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "#475569", fontWeight: 500 }}>{cat.count} reviews</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color }}>{cat.pct}%</span>
                      </div>
                    </div>
                    {/* Bar */}
                    <div style={{ height: 5, borderRadius: 3, background: "#1e293b" }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        width: `${cat.pct}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}88)`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8,
        }}>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#1e293b", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            WAYNE BOARD · 742 LOGISTICS
          </span>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
        </div>

      </div>
    );
  }
);

RydeShareCard.displayName = "RydeShareCard";
export default RydeShareCard;
