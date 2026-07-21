"use client";

import React from "react";

export type NegCategory = {
  label: string;
  count: number;
  pct: number;
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
  positivePct: number;
  totalRatings: number;
  avgStars: number;
  negBreakdown: NegCategory[];
  recentReviews?: ReviewSnippet[];
};

const CAT_COLORS = ["#a78bfa","#38bdf8","#fb923c","#34d399","#f472b6","#facc15"];

const R    = 52;
const CIRC = 2 * Math.PI * R;
const CX   = 70;
const CY   = 70;
const SIZE = 140;

// Card is 400px wide, 28px padding each side → content = 344px
const CONTENT_W = 344;

const RydeShareCard = React.forwardRef<HTMLDivElement, RydeShareCardProps>(
  ({ driverName, period, positivePct, totalRatings, avgStars, negBreakdown, recentReviews = [] }, ref) => {
    const pct = Math.max(0, Math.min(100, positivePct));
    const dash = Math.max(0, (pct / 100) * CIRC);

    const ringColor =
      pct >= 80 ? "#4ade80"
      : pct >= 60 ? "#fb923c"
      : "#f87171";

    const statusLabel =
      pct >= 80 ? "EXCELLENT" : pct >= 60 ? "GOOD" : "NEEDS WORK";

    const initials = driverName
      .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

    const negCount = totalRatings - Math.round(pct * totalRatings / 100);
    const posCount = Math.round(pct * totalRatings / 100);

    const stats = [
      { label: "Total Ratings", val: totalRatings.toString(), color: "#60a5fa" },
      { label: "Avg Stars",     val: `${avgStars.toFixed(1)} \u2605`, color: "#facc15" },
      { label: "Positive",      val: posCount.toString(),   color: ringColor },
      { label: "Negative",      val: negCount.toString(),   color: "#f87171" },
    ];

    // Stat pill width inside the ring section
    // ring=140, gap=20 → stats width = 344-140-20 = 184
    const STAT_W = CONTENT_W - SIZE - 20;

    return (
      <div
        ref={ref}
        style={{
          width: 400,
          background: "linear-gradient(155deg, #0b0f1a 0%, #111827 55%, #0b0f1a 100%)",
          borderRadius: 28,
          padding: "30px 28px 26px",
          fontFamily: "Arial, Helvetica, sans-serif",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >

        {/* ── Header: left text + right badge ── */}
        <div style={{ width: CONTENT_W, marginBottom: 22, position: "relative", height: 36 }}>
          {/* left */}
          <div style={{ position: "absolute", left: 0, top: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase" }}>
              742 Logistics
            </div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.06em", marginTop: 3 }}>
              RYDE · Wayne Board
            </div>
          </div>
          {/* right */}
          <div style={{
            position: "absolute", right: 0, top: 0,
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

        {/* ── Avatar + name: inline-block ── */}
        <div style={{ width: CONTENT_W, marginBottom: 22, whiteSpace: "nowrap" }}>
          {/* avatar */}
          <div style={{
            display: "inline-block", verticalAlign: "middle",
            width: 48, height: 48, borderRadius: "50%",
            background: `linear-gradient(135deg, ${ringColor}70, #6366f170)`,
            border: `2px solid ${ringColor}60`,
            textAlign: "center", lineHeight: "48px",
            fontSize: 16, fontWeight: 800, color: "#f1f5f9",
          }}>
            {initials}
          </div>
          {/* name block */}
          <div style={{
            display: "inline-block", verticalAlign: "middle",
            marginLeft: 14,
            whiteSpace: "normal",
            width: CONTENT_W - 48 - 14,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em", lineHeight: "1.15" }}>
              {driverName}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>
              {period}
            </div>
          </div>
        </div>

        {/* ── Ring + stats: inline-block ── */}
        <div style={{
          width: CONTENT_W,
          background: "#0f172a",
          borderRadius: 20,
          padding: "20px 22px",
          marginBottom: 16,
          border: "1px solid #1e293b",
          boxSizing: "border-box",
          whiteSpace: "nowrap",
        }}>
          {/* Donut ring */}
          <div style={{
            display: "inline-block", verticalAlign: "middle",
            width: SIZE, height: SIZE,
            position: "relative",
          }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e293b" strokeWidth={11} />
              <circle
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={ringColor}
                strokeWidth={11}
                strokeDasharray={`${dash} ${CIRC}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${CX} ${CY})`}
              />
            </svg>
            {/* Centre label — absolute inside relative wrapper */}
            <div style={{
              position: "absolute", top: 0, left: 0,
              width: SIZE, height: SIZE,
              textAlign: "center",
            }}>
              <div style={{ marginTop: 44 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#f8fafc", lineHeight: "1" }}>
                  {Math.round(pct)}%
                </div>
                <div style={{ fontSize: 9, color: "#64748b", marginTop: 4, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Positive
                </div>
              </div>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{
            display: "inline-block", verticalAlign: "middle",
            marginLeft: 20, width: STAT_W - 44, /* -44 for the 22px padding each side */
            whiteSpace: "normal",
          }}>
            {stats.map(({ label, val, color }, i) => (
              <div key={label} style={{
                background: "#111827", borderRadius: 10,
                padding: "8px 12px",
                marginTop: i === 0 ? 0 : 8,
                overflow: "hidden",
              }}>
                <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color, float: "right" }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent reviews ── */}
        {recentReviews.length > 0 && (
          <div style={{
            width: CONTENT_W, boxSizing: "border-box",
            background: "#0f172a", borderRadius: 20,
            padding: "16px 18px", border: "1px solid #1e293b",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#475569", textTransform: "uppercase", marginBottom: 12 }}>
              Recent Reviews
            </div>
            {recentReviews.slice(0, 3).map((rv, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: 1, background: "#1e293b", margin: "10px 0" }} />}
                {/* Stars */}
                <div style={{ marginBottom: 5 }}>
                  {"★★★★★".split("").map((s, si) => (
                    <span key={si} style={{ fontSize: 11, color: si < rv.stars ? "#facc15" : "#1e293b" }}>{s}</span>
                  ))}
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
                  "{rv.content.length > 90 ? rv.content.slice(0, 87) + "…" : rv.content}"
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Complaint breakdown ── */}
        {negBreakdown.length > 0 && (
          <div style={{
            width: CONTENT_W, boxSizing: "border-box",
            background: "#0f172a", borderRadius: 20,
            padding: "16px 18px", border: "1px solid #1e293b",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#475569", textTransform: "uppercase", marginBottom: 12 }}>
              Complaint Breakdown
            </div>
            {negBreakdown.slice(0, 5).map((cat, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <div key={cat.label} style={{ marginTop: i === 0 ? 0 : 10 }}>
                  <div style={{ overflow: "hidden", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 8, verticalAlign: "middle" }} />
                      {cat.label}
                    </span>
                    <span style={{ float: "right", fontSize: 12, fontWeight: 800, color }}>{cat.pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "#1e293b" }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      width: `${cat.pct}%`,
                      background: color,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ width: CONTENT_W, textAlign: "center", paddingTop: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#334155", textTransform: "uppercase" }}>
            ——————  Wayne Board · 742 Logistics  ——————
          </span>
        </div>

      </div>
    );
  }
);

RydeShareCard.displayName = "RydeShareCard";
export default RydeShareCard;
