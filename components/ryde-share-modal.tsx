"use client";

import { useRef, useState, useCallback } from "react";
import { X, Share2, Download, Loader2, ChevronDown } from "lucide-react";
import RydeShareCard, { type NegCategory, type ReviewSnippet } from "./ryde-share-card";

type Review = {
  id: number; driverId: string; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  createdAt: Date | null;
};
type Driver = { id: number; driverId: string; name: string };

type Period = "week" | "month" | "all";
type StarFilter = "all" | "high" | "low";

// Human-readable labels for spotlight category flags
const CAT_LABELS: Record<string, string> = {
  late_delivery:              "Late Delivery",
  damaged_package:            "Damaged Package",
  bad_placement:              "Wrong Placement",
  no_knock_bell:              "No Knock / No Ring",
  disruption:                 "Disrupted Day",
  instructions_not_followed:  "Instructions Not Followed",
  "Customer Feedback":        "Customer Feedback",
  "On-Time Delivery":         "On-Time Delivery",
  "Scan Compliance":          "Scan Compliance",
  "Safety":                   "Safety",
  "Professionalism":          "Professionalism",
  general:                    "General Issue",
};

function formatCat(raw: string): string {
  if (!raw) return "General Issue";
  // Category may be comma-separated (multiple flags from spotlight)
  const parts = raw.split(",").map(p => CAT_LABELS[p.trim()] ?? p.trim());
  return parts[0]; // use first/primary complaint
}

function currentWeekStr(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const wk = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function weekToMonth(week: string): string {
  // "2026-W28" → "2026-07"
  const [yearStr, wPart] = week.split("-W");
  const year = parseInt(yearStr, 10);
  const wn   = parseInt(wPart, 10);
  const jan4  = new Date(year, 0, 4);
  const dayOfYear = (wn - 1) * 7 + jan4.getDay();
  const d    = new Date(year, 0, dayOfYear);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodLabel(period: Period, driverReviews: Review[]): string {
  const now = new Date();
  if (period === "week") {
    const w = currentWeekStr();
    return `Week ${w.split("-W")[1]} · ${now.getFullYear()}`;
  }
  if (period === "month") {
    return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (driverReviews.length === 0) return "All Time";
  const weeks = driverReviews
    .map(r => r.week)
    .filter(Boolean) as string[];
  if (weeks.length === 0) return "All Time";
  const sorted = [...new Set(weeks)].sort();
  const first = sorted[0].split("-W");
  const last  = sorted[sorted.length - 1].split("-W");
  if (first[0] === last[0]) {
    return `Weeks ${first[1]}–${last[1]} · ${first[0]}`;
  }
  return `${first[0]}–${last[0]}`;
}

interface RydeShareModalProps {
  drivers: Driver[];
  reviews: Review[];
  onClose: () => void;
  initialDriverId?: string;
}

export default function RydeShareModal({ drivers, reviews, onClose, initialDriverId }: RydeShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedDriver, setSelectedDriver] = useState<string>(initialDriverId ?? drivers[0]?.driverId ?? "");
  const [period,         setPeriod]         = useState<Period>("week");
  const [starFilter,     setStarFilter]     = useState<StarFilter>("all");
  const [sharing,        setSharing]        = useState(false);

  // ── Compute filtered reviews ──────────────────────────────────────────────
  const curWeek  = currentWeekStr();
  const curMonth = currentMonthStr();

  const filtered = reviews.filter((r) => {
    if (r.driverId !== selectedDriver) return false;
    if (period === "week"  && r.week !== curWeek)              return false;
    if (period === "month" && r.week && weekToMonth(r.week) !== curMonth) return false;
    if (starFilter === "high" && (r.stars ?? 0) < 4)           return false;
    if (starFilter === "low"  && (r.stars ?? 0) > 3)           return false;
    return true;
  });

  const totalRatings  = filtered.length;
  const posCount      = filtered.filter(r => r.type === "positive").length;
  const positivePct   = totalRatings > 0 ? Math.round((posCount / totalRatings) * 100) : 0;
  const starsSum      = filtered.reduce((s, r) => s + (r.stars ?? 0), 0);
  const avgStars      = totalRatings > 0 ? starsSum / totalRatings : 0;

  // Complaint breakdown from negatives
  const negatives = filtered.filter(r => r.type === "negative");
  const catCounts: Record<string, number> = {};
  for (const r of negatives) {
    const label = formatCat(r.category ?? "general");
    catCounts[label] = (catCounts[label] ?? 0) + 1;
  }
  const negTotal = negatives.length;
  const negBreakdown: NegCategory[] = Object.entries(catCounts)
    .map(([label, count]) => ({
      label,
      count,
      pct: negTotal > 0 ? Math.round((count / negTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Most recent reviews for the card (sorted by createdAt desc)
  const recentReviews: ReviewSnippet[] = [...filtered]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 3)
    .map(r => ({
      type: r.type as "positive" | "negative",
      stars: r.stars ?? 0,
      content: r.content,
      initials: (r as any).customerInitials ?? null,
    }));

  const driverName   = drivers.find(d => d.driverId === selectedDriver)?.name ?? selectedDriver;
  const periodLabel  = formatPeriodLabel(period, filtered);

  // ── Share / Download ──────────────────────────────────────────────────────
  const handleShare = useCallback(async (download = false) => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, skipFonts: false });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = `${driverName.replace(/\s+/g, "-")}-ryde-${period}.png`;

      if (!download && typeof navigator !== "undefined" && navigator.share) {
        const file = new File([blob], filename, { type: "image/png" });
        const canShareFile = navigator.canShare?.({ files: [file] });
        if (canShareFile) {
          await navigator.share({
            files: [file],
            title: `${driverName} · RYDE Scorecard`,
          });
          return;
        }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
      if (err?.name !== "AbortError") console.error("Share failed:", err);
    } finally {
      setSharing(false);
    }
  }, [cardRef, driverName, period]);

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const INPUT_CLS = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 bg-white appearance-none transition";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-[16px] font-extrabold text-slate-900">Share RYDE Card</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">Customize and share a driver scorecard</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6 lg:flex-row lg:gap-8">

          {/* Filters */}
          <div className="flex flex-col gap-4 lg:w-52 shrink-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Filters</p>

            {/* Driver */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Driver</label>
              <div className="relative">
                <select
                  value={selectedDriver}
                  onChange={e => setSelectedDriver(e.target.value)}
                  className={INPUT_CLS + " pr-8"}
                >
                  {drivers.map(d => (
                    <option key={d.driverId} value={d.driverId}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Period</label>
              <div className="flex flex-col gap-1.5">
                {([["week", "This Week"], ["month", "This Month"], ["all", "All Time"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setPeriod(val)}
                    className={`px-3 py-2 rounded-lg text-[13px] font-semibold text-left transition-colors ${
                      period === val
                        ? "bg-slate-900 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stars filter */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Ratings</label>
              <div className="flex flex-col gap-1.5">
                {([["all", "All Ratings"], ["high", "4-5 Stars Only"], ["low", "1-3 Stars Only"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setStarFilter(val)}
                    className={`px-3 py-2 rounded-lg text-[13px] font-semibold text-left transition-colors ${
                      starFilter === val
                        ? "bg-slate-900 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Review count */}
            <div className="text-[12px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
              <span className="font-bold text-slate-600">{totalRatings}</span> review{totalRatings !== 1 ? "s" : ""} matched
            </div>
          </div>

          {/* Card preview + actions */}
          <div className="flex-1 flex flex-col gap-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Preview</p>

            {/* Card · scaled down to fit, but real size for capture */}
            <div className="flex justify-center overflow-hidden">
              <div style={{ transform: "scale(0.78)", transformOrigin: "top center", marginBottom: -128 }}>
                <RydeShareCard
                  ref={cardRef}
                  driverName={driverName}
                  period={periodLabel}
                  positivePct={positivePct}
                  totalRatings={totalRatings}
                  avgStars={avgStars}
                  negBreakdown={negBreakdown}
                  recentReviews={recentReviews}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleShare(false)}
                disabled={sharing || totalRatings === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                  text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sharing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : (
                  <><Share2 className="w-4 h-4" /> {canNativeShare ? "Share" : "Download"}</>
                )}
              </button>
              {canNativeShare && (
                <button
                  onClick={() => handleShare(true)}
                  disabled={sharing || totalRatings === 0}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200
                    text-[13px] font-semibold text-slate-600 hover:bg-slate-50
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Save
                </button>
              )}
            </div>

            {totalRatings === 0 && (
              <p className="text-[12px] text-slate-400 text-center">
                No reviews match these filters. Try a different period or driver.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
