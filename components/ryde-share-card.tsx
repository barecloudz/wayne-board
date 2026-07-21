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
const R = 52, CIRC = 2 * Math.PI * R, CX = 70, CY = 70, SIZE = 140;

const RydeShareCard = React.forwardRef<HTMLDivElement, RydeShareCardProps>(
  ({ driverName, period, positivePct, totalRatings, avgStars, negBreakdown, recentReviews = [] }, ref) => {
    const pct = Math.max(0, Math.min(100, positivePct));
    const dash = Math.max(0, (pct / 100) * CIRC);

    const ringColor = pct >= 80 ? "#4ade80" : pct >= 60 ? "#fb923c" : "#f87171";
    const statusLabel = pct >= 80 ? "EXCELLENT" : pct >= 60 ? "GOOD" : "NEEDS WORK";
    const initials = driverName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const posCount = Math.round(pct * totalRatings / 100);
    const negCount = totalRatings - posCount;

    const row = (label: string, val: string, color: string) => (
      <div key={label} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#111827", borderRadius: 10, padding: "8px 12px",
      }}>
        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{val}</span>
      </div>
    );

    return (
      <div ref={ref} style={{
        width: 400,
        background: "linear-gradient(155deg, #0b0f1a 0%, #111827 55%, #0b0f1a 100%)",
        borderRadius: 28,
        padding: "30px 28px 26px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
        boxSizing: "border-box" as const,
        position: "relative" as const,
        overflow: "hidden" as const,
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase" as const }}>742 Logistics</div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.06em", marginTop: 3 }}>RYDE · Wayne Board</div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
            color: ringColor, background: `${ringColor}1a`, border: `1px solid ${ringColor}50`,
            padding: "6px 14px", borderRadius: 20,
          }}>{statusLabel}</div>
        </div>

        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${ringColor}70, #6366f170)`,
            border: `2px solid ${ringColor}60`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#f1f5f9",
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{driverName}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>{period}</div>
          </div>
        </div>

        {/* Ring + stats */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20,
          background: "#0f172a", borderRadius: 20, padding: "20px 22px",
          marginBottom: 16, border: "1px solid #1e293b",
        }}>
          <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e293b" strokeWidth={11} />
              <circle cx={CX} cy={CY} r={R} fill="none" stroke={ringColor} strokeWidth={11}
                strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="round"
                transform={`rotate(-90 ${CX} ${CY})`} />
            </svg>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: "#f8fafc", lineHeight: 1 }}>{Math.round(pct)}%</span>
              <span style={{ fontSize: 9, color: "#64748b", marginTop: 4, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Positive</span>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {row("Total Ratings", totalRatings.toString(), "#60a5fa")}
            {row("Avg Stars", `${avgStars.toFixed(1)} ★`, "#facc15")}
            {row("Positive", posCount.toString(), ringColor)}
            {row("Negative", negCount.toString(), "#f87171")}
          </div>
        </div>

        {/* Recent reviews */}
        {recentReviews.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: 20, padding: "16px 18px", border: "1px solid #1e293b", marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#475569", textTransform: "uppercase" as const, marginBottom: 12 }}>Recent Reviews</div>
            {recentReviews.slice(0, 3).map((rv, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: 1, background: "#1e293b", margin: "10px 0" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ fontSize: 11, color: s <= rv.stars ? "#facc15" : "#1e293b" }}>★</span>
                    ))}
                  </div>
                  {rv.initials && <span style={{ fontSize: 9, color: "#60a5fa", fontWeight: 700 }}>{rv.initials}</span>}
                  <span style={{ fontSize: 8, fontWeight: 800, color: rv.type === "positive" ? "#4ade80" : "#f87171", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{rv.type}</span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5, fontStyle: "italic" as const }}>
                  "{rv.content.length > 90 ? rv.content.slice(0, 87) + "…" : rv.content}"
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Complaint breakdown */}
        {negBreakdown.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: 20, padding: "16px 18px", border: "1px solid #1e293b", marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "#475569", textTransform: "uppercase" as const, marginBottom: 12 }}>Complaint Breakdown</div>
            {negBreakdown.slice(0, 5).map((cat, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <div key={cat.label} style={{ marginTop: i === 0 ? 0 : 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{cat.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color }}>{cat.pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "#1e293b" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${cat.pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#334155", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>Wayne Board · 742 Logistics</span>
          <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
        </div>

      </div>
    );
  }
);

RydeShareCard.displayName = "RydeShareCard";
export default RydeShareCard;
