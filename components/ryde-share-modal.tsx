"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { X, Share2, Download, Loader2, Check, Eye, ListChecks } from "lucide-react";
import RydeShareCard, { type NegCategory, type ReviewSnippet } from "./ryde-share-card";

type Review = {
  id: number; driverId: string; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  reviewDate: string | null; createdAt: Date | null;
};
type Driver = { id: number; driverId: string; name: string };
type Period = "week" | "month" | "all";
type TypeFilter = "all" | "positive" | "negative";

const CAT_LABELS: Record<string, string> = {
  late_delivery:             "Late Delivery",
  damaged_package:           "Damaged Package",
  bad_placement:             "Wrong Placement",
  no_knock_bell:             "No Knock / No Ring",
  disruption:                "Disrupted Day",
  instructions_not_followed: "Instructions Not Followed",
  "Customer Feedback":       "Customer Feedback",
  "On-Time Delivery":        "On-Time Delivery",
  "Scan Compliance":         "Scan Compliance",
  "Safety":                  "Safety",
  "Professionalism":         "Professionalism",
  general:                   "General Issue",
};

function formatCat(raw: string): string {
  if (!raw) return "General Issue";
  const parts = raw.split(",").map(p => CAT_LABELS[p.trim()] ?? p.trim());
  return parts[0];
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
  const [yearStr, wPart] = week.split("-W");
  const year = parseInt(yearStr, 10);
  const wn   = parseInt(wPart, 10);
  const jan4  = new Date(year, 0, 4);
  const dayOfYear = (wn - 1) * 7 + jan4.getDay();
  const d    = new Date(year, 0, dayOfYear);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekToReadable(week: string): string {
  const [yearStr, wPart] = week.split("-W");
  const year = parseInt(yearStr, 10);
  const wn   = parseInt(wPart, 10);
  if (isNaN(year) || isNaN(wn)) return week;
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4Dow - 1) + (wn - 1) * 7);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPeriodLabel(period: Period, now: Date): string {
  if (period === "week") {
    const w = currentWeekStr();
    return `Week ${w.split("-W")[1]} · ${now.getFullYear()}`;
  }
  if (period === "month") {
    return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return "All Time";
}

function driverInitials(name: string): string {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "from-violet-500 to-indigo-600",
  "from-sky-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
  "from-fuchsia-500 to-purple-600",
];

function avatarGradient(idx: number) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

// ── ReviewRow ─────────────────────────────────────────────────────────────────
function ReviewRow({
  review,
  selected,
  onToggle,
  disabled,
}: {
  review: Review;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const dateStr = review.reviewDate
    ? new Date(review.reviewDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : review.week ? weekToReadable(review.week) : null;
  const cat = formatCat(review.category ?? "general");
  const isPos = review.type === "positive";
  const stars = review.stars ?? 0;

  return (
    <button
      onClick={onToggle}
      disabled={disabled && !selected}
      className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 group
        ${selected
          ? "bg-slate-800/80 border-slate-600 ring-1 ring-slate-500"
          : disabled
          ? "bg-slate-900/30 border-slate-800/60 opacity-50 cursor-not-allowed"
          : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700 cursor-pointer"
        }`}
    >
      {/* Checkbox circle */}
      <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150
        ${selected ? "bg-emerald-500 border-emerald-500" : "border-slate-600 group-hover:border-slate-500"}`}>
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>

      <div className="flex-1 min-w-0">
        {/* Top row: stars + badge + date */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            {/* Stars */}
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(s => (
                <span key={s} className={`text-[11px] ${s <= stars ? "text-amber-400" : "text-slate-700"}`}>★</span>
              ))}
            </div>
            {/* Type badge */}
            <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full
              ${isPos ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              {isPos ? "Positive" : "Negative"}
            </span>
            {/* Category */}
            <span className="text-[10px] text-slate-500 truncate">{cat}</span>
          </div>
          {dateStr && (
            <span className="text-[10px] text-slate-600 shrink-0">{dateStr}</span>
          )}
        </div>
        {/* Review text */}
        <p className="text-[12px] text-slate-400 leading-snug line-clamp-2 italic">
          &ldquo;{review.content}&rdquo;
        </p>
      </div>
    </button>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
interface RydeShareModalProps {
  drivers: Driver[];
  reviews: Review[];
  onClose: () => void;
  initialDriverId?: string;
  orgName?: string;
}

export default function RydeShareModal({ drivers, reviews, onClose, initialDriverId, orgName }: RydeShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedDriver, setSelectedDriver] = useState<string>(initialDriverId ?? drivers[0]?.driverId ?? "");
  const [period,         setPeriod]         = useState<Period>("all");
  const [typeFilter,     setTypeFilter]     = useState<TypeFilter>("all");
  const [selectedIds,    setSelectedIds]    = useState<Set<number>>(new Set());
  const [sharing,        setSharing]        = useState(false);
  const [mobileTab,      setMobileTab]      = useState<"pick" | "preview">("pick");

  // Reset selection when driver changes
  useEffect(() => { setSelectedIds(new Set()); }, [selectedDriver]);

  const now = new Date();
  const curWeek  = currentWeekStr();
  const curMonth = currentMonthStr();

  // All reviews for selected driver + period
  const periodFiltered = reviews.filter(r => {
    if (r.driverId !== selectedDriver) return false;
    if (period === "week"  && r.week !== curWeek) return false;
    if (period === "month" && r.week && weekToMonth(r.week) !== curMonth) return false;
    return true;
  });

  // Reviews visible in the picker (period + type filter)
  const visibleReviews = periodFiltered.filter(r => {
    if (typeFilter === "positive" && r.type !== "positive") return false;
    if (typeFilter === "negative" && r.type !== "negative") return false;
    return true;
  }).sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  // Stats from all period-filtered reviews
  const totalRatings = periodFiltered.length;
  const posCount     = periodFiltered.filter(r => r.type === "positive").length;
  const positivePct  = totalRatings > 0 ? Math.round((posCount / totalRatings) * 100) : 0;
  const starsSum     = periodFiltered.reduce((s, r) => s + (r.stars ?? 0), 0);
  const avgStars     = totalRatings > 0 ? starsSum / totalRatings : 0;

  const negatives = periodFiltered.filter(r => r.type === "negative");
  const catCounts: Record<string, number> = {};
  for (const r of negatives) {
    const label = formatCat(r.category ?? "general");
    catCounts[label] = (catCounts[label] ?? 0) + 1;
  }
  const negTotal = negatives.length;
  const negBreakdown: NegCategory[] = Object.entries(catCounts)
    .map(([label, count]) => ({ label, count, pct: negTotal > 0 ? Math.round((count / negTotal) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Spotlighted reviews for card: selected first, fallback to most recent
  const spotlightReviews: ReviewSnippet[] = (() => {
    const base = selectedIds.size > 0
      ? periodFiltered.filter(r => selectedIds.has(r.id))
      : [...periodFiltered].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        }).slice(0, 3);

    return base.slice(0, 3).map(r => ({
      type: r.type as "positive" | "negative",
      stars: r.stars ?? 0,
      content: r.content,
      initials: (r as any).customerInitials ?? null,
      date: r.reviewDate
        ? new Date(r.reviewDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : r.week ? weekToReadable(r.week) : null,
    }));
  })();

  const driverName  = drivers.find(d => d.driverId === selectedDriver)?.name ?? selectedDriver;
  const periodLabel = formatPeriodLabel(period, now);
  const maxSelect   = 3;
  const atMax       = selectedIds.size >= maxSelect;

  function toggleReview(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else if (next.size < maxSelect) { next.add(id); }
      return next;
    });
  }

  // ── Share / Download ──────────────────────────────────────────────────────
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const handleShare = useCallback(async (download = false) => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, skipFonts: false });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = `${driverName.replace(/\s+/g, "-")}-ryde-${period}.png`;

      if (!download && canNativeShare) {
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `${driverName} · RYDE Scorecard` });
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
      if (err?.name !== "AbortError") console.error("Share failed:", err);
    } finally {
      setSharing(false);
    }
  }, [cardRef, driverName, period, canNativeShare]);

  const PERIOD_OPTIONS: [Period, string][] = [["week", "This Week"], ["month", "This Month"], ["all", "All Time"]];
  const TYPE_OPTIONS: [TypeFilter, string][] = [["all", "All"], ["positive", "Positive"], ["negative", "Negative"]];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#080c14] border border-slate-800/80 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-4xl h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800/60">
          <div>
            <h2 className="text-[16px] font-extrabold text-white tracking-tight">Build RYDE Card</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Pick reviews · preview · share</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Driver pills ───────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 sm:px-6 py-3 border-b border-slate-800/60 overflow-x-auto">
          <div className="flex gap-2 w-max">
            {drivers.map((d, i) => {
              const active = d.driverId === selectedDriver;
              return (
                <button
                  key={d.driverId}
                  onClick={() => setSelectedDriver(d.driverId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-semibold whitespace-nowrap transition-all duration-150
                    ${active
                      ? "bg-slate-700 border-slate-500 text-white"
                      : "bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                >
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradient(i)} flex items-center justify-center text-[9px] font-black text-white shrink-0`}>
                    {driverInitials(d.name)}
                  </div>
                  {d.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Mobile tab toggle ──────────────────────────────────────────── */}
        <div className="sm:hidden shrink-0 flex gap-1 p-3 border-b border-slate-800/60">
          {([["pick", <ListChecks className="w-3.5 h-3.5" />, "Reviews"] as const,
             ["preview", <Eye className="w-3.5 h-3.5" />, "Preview"] as const]).map(([tab, icon, label]) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all
                ${mobileTab === tab ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Main panels ────────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Left: review picker */}
          <div className={`flex flex-col w-full sm:w-[52%] border-r border-slate-800/60 overflow-hidden
            ${mobileTab === "preview" ? "hidden sm:flex" : "flex"}`}>

            {/* Controls: period + type */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800/40 flex flex-wrap gap-2">
              {/* Period chips */}
              <div className="flex gap-1">
                {PERIOD_OPTIONS.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setPeriod(val)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all
                      ${period === val ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="w-px bg-slate-800 mx-0.5" />
              {/* Type chips */}
              <div className="flex gap-1">
                {TYPE_OPTIONS.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setTypeFilter(val)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all
                      ${typeFilter === val
                        ? val === "positive" ? "bg-emerald-600/30 text-emerald-400"
                        : val === "negative" ? "bg-red-600/30 text-red-400"
                        : "bg-slate-700 text-white"
                        : "text-slate-500 hover:text-slate-300"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Review list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
              {visibleReviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <p className="text-[13px] text-slate-600">No reviews match these filters.</p>
                  <p className="text-[11px] text-slate-700 mt-1">Try "All Time" or change the type filter.</p>
                </div>
              ) : (
                visibleReviews.map(r => (
                  <ReviewRow
                    key={r.id}
                    review={r}
                    selected={selectedIds.has(r.id)}
                    onToggle={() => toggleReview(r.id)}
                    disabled={atMax && !selectedIds.has(r.id)}
                  />
                ))
              )}
            </div>

            {/* Selection status bar */}
            <div className={`shrink-0 px-4 py-3 border-t border-slate-800/60 flex items-center justify-between
              ${selectedIds.size > 0 ? "bg-slate-800/40" : ""}`}>
              <div>
                {selectedIds.size === 0 ? (
                  <p className="text-[12px] text-slate-600">Select up to 3 reviews to spotlight</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {Array.from({ length: maxSelect }).map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < selectedIds.size ? "bg-emerald-500" : "bg-slate-700"}`} />
                      ))}
                    </div>
                    <span className="text-[12px] font-semibold text-slate-300">
                      {selectedIds.size} of {maxSelect} selected
                    </span>
                  </div>
                )}
              </div>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Right: live preview */}
          <div className={`flex flex-col w-full sm:w-[48%] overflow-hidden
            ${mobileTab === "pick" ? "hidden sm:flex" : "flex"}`}>

            {/* Stats info */}
            <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-800/40">
              <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                Preview · {totalRatings} total review{totalRatings !== 1 ? "s" : ""}
                {selectedIds.size > 0 && <span className="text-emerald-500 ml-2">· {selectedIds.size} spotlighted</span>}
              </p>
            </div>

            {/* Card preview */}
            <div className="flex-1 overflow-y-auto flex items-start justify-center px-4 py-4 min-h-0">
              <div style={{ transform: "scale(0.82)", transformOrigin: "top center", width: 400, flexShrink: 0 }}>
                <RydeShareCard
                  ref={cardRef}
                  driverName={driverName}
                  period={periodLabel}
                  positivePct={positivePct}
                  totalRatings={totalRatings}
                  avgStars={avgStars}
                  negBreakdown={negBreakdown}
                  recentReviews={spotlightReviews}
                  orgName={orgName}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="shrink-0 px-4 pb-4 pt-2 border-t border-slate-800/60 flex gap-2">
              <button
                onClick={() => handleShare(false)}
                disabled={sharing || totalRatings === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                  text-[13px] font-semibold bg-white text-slate-900 hover:bg-slate-100
                  disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-700
                    text-[13px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200
                    disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Save
                </button>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
