"use client";

/**
 * RydeAnalytics
 * Analytics dashboard section for the RYDE page.
 * Renders: KPI strip, satisfaction gauge, driver bar chart, multi-ring progress, rankings table.
 */

import { useMemo } from "react";

type Review = {
  id: number; driverId: string; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  improvement: string | null; atFault: boolean;
  customerInitials: string | null; createdAt: Date | null;
};
type Driver = { id: number; driverId: string; name: string };

interface Props {
  reviews: Review[];
  drivers: Driver[];
}

const GREEN = "#30D158";
const RED   = "#FF453A";
const AMBER = "#FF9F0A";
const RING_COLORS = ["#0071E3","#C9A44E","#30D158","#BF5AF2","#FF453A","#64D2FF","#FF9F0A","#AC8E68"];

function scoreColor(avg: number) { return avg >= 4.2 ? GREEN : avg >= 3.0 ? AMBER : RED; }
function tierLabel(avg: number)  { return avg >= 4.2 ? "Excellent" : avg >= 3.0 ? "Good" : avg >= 2.0 ? "Fair" : "Needs Work"; }

// ── SVG: Semi-circle gauge ────────────────────────────────────────────────
function GaugeSvg({ value, w = 190, h = 122 }: { value: number; w?: number; h?: number }) {
  const cx = w / 2, cy = h - 8, r = Math.min(cx - 18, cy - 14), sw = 11;
  const p = Math.min(value / 5, 0.9999);
  const ang = (1 - p) * Math.PI;
  const ex = (cx + r * Math.cos(ang)).toFixed(2);
  const ey = (cy - r * Math.sin(ang)).toFixed(2);
  const color = scoreColor(value);

  const ticks = [1, 2, 3, 4, 5].map((v) => {
    const a = (1 - v / 5) * Math.PI;
    return (
      <g key={v}>
        <line
          x1={(cx + (r - sw / 2 - 2) * Math.cos(a)).toFixed(1)}
          y1={(cy - (r - sw / 2 - 2) * Math.sin(a)).toFixed(1)}
          x2={(cx + (r + sw / 2 + 5) * Math.cos(a)).toFixed(1)}
          y2={(cy - (r + sw / 2 + 5) * Math.sin(a)).toFixed(1)}
          stroke="rgba(0,0,0,0.12)" strokeWidth="1"
        />
        <text
          x={(cx + (r + sw / 2 + 14) * Math.cos(a)).toFixed(1)}
          y={(cy - (r + sw / 2 + 14) * Math.sin(a) + 3).toFixed(1)}
          textAnchor="middle" fontSize="7.5" fill="#86868B"
          fontFamily="-apple-system,Inter,sans-serif"
        >{v}</text>
      </g>
    );
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {ticks}
      <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
        fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={sw} strokeLinecap="round" />
      <path d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${ex},${ey}`}
        fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" opacity="0.9" />
      <text x={cx} y={cy - r * 0.3} textAnchor="middle" fontSize="28" fontWeight="800"
        fill="#1D1D1F" fontFamily="-apple-system,Inter,sans-serif">{value.toFixed(2)}</text>
      <text x={cx} y={cy - r * 0.3 + 18} textAnchor="middle" fontSize="8.5" fill="#86868B"
        fontFamily="-apple-system,Inter,sans-serif" letterSpacing="0.05em">OUT OF 5.0</text>
    </svg>
  );
}

// ── SVG: Multi-ring chart ─────────────────────────────────────────────────
function MultiRingSvg({
  driverStats, overallAvg, size = 162,
}: {
  driverStats: Array<{ driverId: string; avg: number }>;
  overallAvg: number;
  size?: number;
}) {
  const N = Math.min(driverStats.length, 8);
  const cx = size / 2, cy = size / 2;
  const sw = 7.5, gap = 4, maxR = size / 2 - sw / 2 - 4;

  const rings = Array.from({ length: N }, (_, i) => {
    const r = maxR - i * (sw + gap);
    const d = driverStats[i];
    const p = Math.min(d.avg / 5, 0.9999);
    const circ = 2 * Math.PI * r;
    const fill = (circ * p).toFixed(2);
    const rest = (circ * (1 - p)).toFixed(2);
    return (
      <g key={d.driverId}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={RING_COLORS[i]} strokeWidth={sw}
          strokeDasharray={`${fill} ${rest}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} opacity="0.88" />
      </g>
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings}
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize="19" fontWeight="800"
        fill="#1D1D1F" fontFamily="-apple-system,Inter,sans-serif">{overallAvg.toFixed(1)}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="7.5" fill="#86868B"
        fontFamily="-apple-system,Inter,sans-serif" letterSpacing="0.06em">AVG</text>
    </svg>
  );
}

// ── Aggregate driver stats ────────────────────────────────────────────────
function useDriverStats(reviews: Review[], drivers: Driver[]) {
  return useMemo(() => {
    const nameMap = new Map(drivers.map((d) => [d.driverId, d.name]));
    const map = new Map<string, { driverId: string; name: string; stars: number[]; dist: number[] }>();

    for (const r of reviews) {
      if (r.stars === null) continue;
      if (!map.has(r.driverId)) {
        map.set(r.driverId, {
          driverId: r.driverId,
          name: nameMap.get(r.driverId) ?? r.driverId,
          stars: [],
          dist: [0, 0, 0, 0, 0],
        });
      }
      const entry = map.get(r.driverId)!;
      entry.stars.push(r.stars);
      entry.dist[r.stars - 1]++;
    }

    return Array.from(map.values())
      .map((d) => {
        const total = d.stars.length;
        const avg   = d.stars.reduce((s, x) => s + x, 0) / total;
        const pos   = d.stars.filter((s) => s >= 4).length;
        const neg   = d.stars.filter((s) => s <= 2).length;
        return { ...d, total, avg, pos, neg, pct: Math.round(pos / total * 100) };
      })
      .sort((a, b) => b.avg - a.avg);
  }, [reviews, drivers]);
}

// ── Main component ────────────────────────────────────────────────────────
export default function RydeAnalytics({ reviews, drivers }: Props) {
  const driverStats = useDriverStats(reviews, drivers);
  const ratedReviews = reviews.filter((r) => r.stars !== null);

  if (ratedReviews.length === 0) return null;

  const totalReviews = ratedReviews.length;
  const overallAvg   = ratedReviews.reduce((s, r) => s + (r.stars ?? 0), 0) / totalReviews;
  const totalPos     = ratedReviews.filter((r) => (r.stars ?? 0) >= 4).length;
  const totalNeg     = ratedReviews.filter((r) => (r.stars ?? 0) <= 2).length;
  const totalNeu     = ratedReviews.filter((r) => (r.stars ?? 0) === 3).length;
  const posPct       = Math.round(totalPos / totalReviews * 100);
  const negPct       = Math.round(totalNeg / totalReviews * 100);
  const neuPct       = Math.round(totalNeu / totalReviews * 100);

  const kpis = [
    { label: "Total Reviews", value: totalReviews,          sub: "rated reviews",              accent: "#0071E3" },
    { label: "Avg Rating",    value: overallAvg.toFixed(2), sub: "out of 5.0",                 accent: scoreColor(overallAvg), suffix: "★" },
    { label: "Positive",      value: `${posPct}%`,          sub: `${totalPos} reviews (4–5★)`, accent: GREEN },
    { label: "Negative",      value: `${negPct}%`,          sub: `${totalNeg} reviews (1–2★)`, accent: RED },
    { label: "Drivers",       value: driverStats.length,    sub: "with reviews",               accent: "#BF5AF2" },
  ];

  // Bar chart dimensions
  const barW = 308, barH = 14, barGap = 5, labelW = 68, chartW = barW - labelW - 28;
  const N_bars = Math.min(driverStats.length, 14);
  const barSvgH = N_bars * (barH + barGap) + 20;

  return (
    <div className="mb-8 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
      style={{ border: "1px solid rgba(255,255,255,0.5)" }}>

      {/* ── Dark silver header ── */}
      <div className="relative overflow-hidden px-7 py-6"
        style={{ background: "linear-gradient(160deg,#2C2C2E 0%,#3A3A3C 50%,#2C2C2E 100%)" }}>
        <div className="absolute top-0 left-0 right-0 h-[2.5px]"
          style={{ background: "linear-gradient(90deg,transparent,#C9A44E,#E8C97A,#C9A44E,transparent)" }} />
        <div className="absolute right-[-30px] top-[-50px] w-[220px] h-[220px] rounded-full"
          style={{ border: "1px solid rgba(255,255,255,0.04)" }} />
        <div className="absolute right-[40px] top-[-30px] w-[130px] h-[130px] rounded-full"
          style={{ border: "1px solid rgba(255,255,255,0.03)" }} />

        <div className="relative flex justify-between items-end">
          <div>
            <div className="text-[8px] font-semibold tracking-[.2em] uppercase mb-2.5" style={{ color: "#C9A44E" }}>
              Analytics Overview
            </div>
            <h2 className="text-[22px] font-extrabold text-white tracking-tight leading-tight">
              RYDE Performance
            </h2>
            <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>
              Customer review analytics across all drivers
            </p>
          </div>
          <div className="text-right">
            <div className="text-[38px] font-black text-white leading-none tracking-tight">{overallAvg.toFixed(2)}</div>
            <div className="text-[8px] tracking-[.12em] uppercase mt-1" style={{ color: "#C9A44E" }}>Overall Avg Rating</div>
            <div className="flex gap-3 mt-2.5 justify-end">
              {[
                { val: `${posPct}%`, label: "Positive", color: GREEN },
                { val: `${negPct}%`, label: "Negative", color: RED },
                { val: totalReviews, label: "Reviews",  color: "#fff" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-[14px] font-black" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-[7px] uppercase tracking-[.07em]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-4" style={{ background: "#F5F5F7" }}>

        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-2.5 mb-3">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
              style={{
                background: "rgba(255,255,255,0.82)",
                border: `1px solid rgba(255,255,255,0.65)`,
                borderTop: `2.5px solid ${k.accent}`,
              }}>
              <div className="text-[7px] font-bold uppercase tracking-[.12em] mb-2" style={{ color: "#86868B" }}>{k.label}</div>
              <div className="text-[22px] font-black leading-none tracking-tight text-[#1D1D1F]">
                {k.value}
                {k.suffix && <span className="text-[12px] ml-0.5" style={{ color: k.accent }}> {k.suffix}</span>}
              </div>
              <div className="text-[7.5px] mt-1.5" style={{ color: "#AEAEB2" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: "1fr 1.9fr 1fr" }}>

          {/* Gauge */}
          <div className="rounded-xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)] flex flex-col items-center"
            style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.65)" }}>
            <div className="text-[7px] font-bold uppercase tracking-[.12em] mb-2.5 self-start" style={{ color: "#86868B" }}>
              Satisfaction Score
            </div>
            <GaugeSvg value={overallAvg} />
            <div className="flex gap-4 mt-2.5 pt-2.5 w-full justify-center" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              {[
                { pct: posPct, label: "Positive", color: GREEN },
                { pct: neuPct, label: "Neutral",  color: AMBER },
                { pct: negPct, label: "Negative", color: RED },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-[13px] font-black" style={{ color: s.color }}>{s.pct}%</div>
                  <div className="text-[7px] uppercase tracking-[.05em]" style={{ color: "#86868B" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div className="rounded-xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
            style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.65)" }}>
            <div className="text-[7px] font-bold uppercase tracking-[.12em] mb-2.5" style={{ color: "#86868B" }}>
              Driver Avg Ratings
            </div>
            <svg width={barW} height={barSvgH} viewBox={`0 0 ${barW} ${barSvgH}`} style={{ maxWidth: "100%" }}>
              <text x="0" y="9" fontSize="7.5" fontWeight="600" fill="#86868B" letterSpacing="0.1em"
                fontFamily="-apple-system,Inter,sans-serif">AVG RATING PER DRIVER</text>
              {driverStats.slice(0, N_bars).map((d, i) => {
                const y = 16 + i * (barH + barGap);
                const bw = Math.max((d.avg / 5) * chartW, 2);
                const color = scoreColor(d.avg);
                const name = d.name.length > 11 ? d.name.slice(0, 11) + "…" : d.name;
                return (
                  <g key={d.driverId}>
                    <text x={labelW - 4} y={y + barH * 0.72} fontSize="8.5" fill="#6E6E73"
                      textAnchor="end" fontFamily="-apple-system,Inter,sans-serif">{name}</text>
                    <rect x={labelW} y={y} width={chartW} height={barH} rx="3" fill="rgba(0,0,0,0.06)" />
                    <rect x={labelW} y={y} width={bw.toFixed(1)} height={barH} rx="3" fill={color} opacity="0.82" />
                    <text x={labelW + bw + 4} y={y + barH * 0.72} fontSize="8.5" fill={color}
                      fontWeight="700" fontFamily="-apple-system,Inter,sans-serif">{d.avg.toFixed(1)}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Multi-ring */}
          <div className="rounded-xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)] flex flex-col items-center"
            style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.65)" }}>
            <div className="text-[7px] font-bold uppercase tracking-[.12em] mb-2.5 self-start" style={{ color: "#86868B" }}>
              Progress Overview
            </div>
            <MultiRingSvg driverStats={driverStats} overallAvg={overallAvg} />
            <div className="w-full mt-2.5 space-y-[3px]">
              {driverStats.slice(0, 8).map((d, i) => (
                <div key={d.driverId} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RING_COLORS[i], opacity: 0.88 }} />
                  <span className="text-[8px] flex-1 truncate" style={{ color: "#6E6E73" }}>{d.name}</span>
                  <span className="text-[8px] font-bold flex-shrink-0" style={{ color: RING_COLORS[i] }}>{d.avg.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rankings table */}
        <div className="rounded-xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
          style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.65)" }}>
          <div className="text-[7px] font-bold uppercase tracking-[.12em] mb-3" style={{ color: "#86868B" }}>
            All Driver Rankings
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                {["#","Driver","ID","Avg","Reviews","5★","4★","3★","2★","1★","Pos%","Status"].map((h, i) => (
                  <th key={h} className="pb-2 px-1"
                    style={{
                      textAlign: i === 1 || i === 11 ? "left" : "center",
                      fontSize: 7, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: ".09em", color: "#AEAEB2",
                    }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driverStats.map((d, i) => {
                const color = scoreColor(d.avg);
                return (
                  <tr key={d.driverId}
                    style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", background: i % 2 !== 0 ? "rgba(0,0,0,0.01)" : undefined }}>
                    <td className="py-1.5 px-1 text-center text-[9px] font-semibold" style={{ color: "#C7C7CC" }}>{i + 1}</td>
                    <td className="py-1.5 px-1 text-[10px] font-bold text-[#1D1D1F]">{d.name}</td>
                    <td className="py-1.5 px-1 text-center text-[8px]" style={{ color: "#AEAEB2" }}>{d.driverId}</td>
                    <td className="py-1.5 px-1 text-center">
                      <span className="text-[14px] font-black" style={{ color }}>{d.avg.toFixed(2)}</span>
                    </td>
                    <td className="py-1.5 px-1 text-center text-[10px] font-semibold" style={{ color: "#6E6E73" }}>{d.total}</td>
                    {[4, 3, 2, 1, 0].map((idx) => {
                      const count = d.dist[idx];
                      const c = idx >= 3 ? GREEN : idx === 2 ? AMBER : RED;
                      return (
                        <td key={idx} className="py-1.5 px-1 text-center text-[10px] font-bold"
                          style={{ color: count > 0 ? c : "#E5E5EA" }}>
                          {count}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-1 text-center text-[10px] font-bold"
                      style={{ color: d.pct >= 70 ? GREEN : d.pct >= 50 ? AMBER : RED }}>
                      {d.pct}%
                    </td>
                    <td className="py-1.5 px-1">
                      <span className="px-2 py-0.5 rounded-full text-[7px] font-bold uppercase tracking-wider"
                        style={{ background: `${color}1A`, color }}>
                        {tierLabel(d.avg)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
