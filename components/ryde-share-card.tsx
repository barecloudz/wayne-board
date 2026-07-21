"use client";

import React from "react";

export type NegCategory = {
  label: string;
  count: number;
  pct: number; // 0–100
};

export type ReviewSnippet = {
  type: "positive" | "negative";
  stars: number;
  content: string;
  initials?: string | null;
};

export type RydeShareCardProps = {
  driverName: string;
  period: string;
  positivePct: number; // 0–100
  totalRatings: number;
  avgStars: number; // 1–5
  negBreakdown: NegCategory[];
  recentReviews?: ReviewSnippet[];
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
const CIRC = 2 * Math.PI * R;
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
 * The shareable card — fixed-width inline styles for html2canvas.
 * Avoids flex gap (html2canvas <0.5 ignores gap), uses marginLeft/marginTop instead.
 */
const RydeShareCard = React.forwardRef<HTMLDivElement, RydeShareCardProps>(
  ({ driverName, period, positivePct, totalRatings, avgStars, negBreakdown, recentReviews = [] }, ref) => {
    const pct = Math.max(0, Math.min(100, positivePct));

    const ringColor =
      pct >= 80 ? "#4ade80"
      : pct >= 60 ? "#fb923c"
      : "#f87171";

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
          fontFamily: "'Segoe UI', Arial, sans-serif",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow circles */}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase" }}>
              742 Logistics
            </div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.06em", marginTop: 3 }}>
              RYDE · Wayne Board
            </div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: ringColor,
            background: `${ringColor}1a`,
            border: `1px solid ${ringColor}50`,
            padding: "6px 14px",
            borderRadius: 20,
          }}>
            {statusLabel}
          </div>
        </div>

        {/* ── Driver avatar + name (no flex gap — use marginLeft) ── */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: `linear-gradient(135deg, ${ringColor}70, #6366f170)`,
            border: `2px solid ${ringColor}60`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#f1f5f9", flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ marginLeft: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em", lineHeight: "1.15" }}>
              {driverName}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>
              {period}
            </div>
          </div>
        </div>

        {/* ── Donut ring + stats (no flex gap — use marginLeft) ── */}
        <div style={{
          display: "flex", alignItems: "center",
          background: "#0f172a",
          borderRadius: 20, padding: "20px 22px",
          marginBottom: 16,
          border: "1px solid #1e293b",
        }}>
          {/* Ring */}
          <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <RingTrack />
              <RingArc pct={pct} color={ringColor} />
            </svg>
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: "#f8fafc", lineHeight: "1" }}>
                {Math.round(pct)}%
              </span>
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 4, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Positive
              </span>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ flex: 1, marginLeft: 20 }}>
            {[
              { label: "Total Ratings", val: totalRatings.toString(),       color: "#60a5fa" },
              { label: "Avg Stars",     val: `${avgStars.toFixed(1)} ★`,    color: "#facc15" },
              { label: "Positive",      val: `${Math.round(pct * totalRatings / 100)}`,          color: ringColor  },
              { label: "Negative",      val: `${totalRatings - Math.round(pct * totalRatings / 100)}`, color: "#f87171" },
            ].map(({ label, val, color }, i) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#111827", borderRadius: 10, padding: "8px 12px",
                marginTop: i === 0 ? 0 : 8,
              }}>
                <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent review snippets ── */}
        {recentReviews.length > 0 && (
          <div style={{
            background: "#0f172a",
            borderRadius: 20,
            padding: "16px 18px",
            border: "1px solid #1e293b",
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#475569",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              Recent Reviews
            </div>
            {recentReviews.slice(0, 3).map((rv, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
                  {/* Stars */}
                  <div style={{ display: "flex" }}>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ fontSize: 10, color: s <= rv.stars ? "#facc15" : "#1e293b", marginRight: 1 }}>★</span>
                    ))}
                  </div>
                  {rv.initials && (
                    <span style={{ fontSize: 9, color: "#60a5fa", marginLeft: 8, fontWeight: 600 }}>{rv.initials}</span>
                  )}
                  <span style={{
                    fontSize: 8, fontWeight: 700, marginLeft: 8,
                    color: rv.type === "positive" ? "#4ade80" : "#f87171",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {rv.type}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: "1.5", fontStyle: "italic" }}>
                  &ldquo;{rv.content.length > 90 ? rv.content.slice(0, 87) + "…" : rv.content}&rdquo;
                </div>
                {i < recentReviews.slice(0, 3).length - 1 && (
                  <div style={{ height: 1, background: "#1e293b", marginTop: 10 }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Complaint breakdown ── */}
        {negBreakdown.length > 0 && (
          <div style={{
            background: "#0f172a",
            borderRadius: 20,
            padding: "16px 18px",
            border: "1px solid #1e293b",
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#475569",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              Complaint Breakdown
            </div>
            {negBreakdown.slice(0, 5).map((cat, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <div key={cat.label} style={{ marginTop: i === 0 ? 0 : 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginLeft: 8 }}>{cat.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#475569", fontWeight: 500 }}>{cat.count}×</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color, marginLeft: 10 }}>{cat.pct}%</span>
                    </div>
                  </div>
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
        )}

        {/* ── Footer ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#334155", textTransform: "uppercase", whiteSpace: "nowrap", padding: "0 12px" }}>
            Wayne Board · 742 Logistics
          </span>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
        </div>

      </div>
    );
  }
);

RydeShareCard.displayName = "RydeShareCard";
export default RydeShareCard;
