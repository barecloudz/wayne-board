"use client";

import { useState, useEffect, useTransition } from "react";
import AppShell from "@/components/app-shell";
import {
  Plus, Trash2, Star, TrendingUp, TrendingDown, ChevronDown, Loader2, Pencil, Share2, X,
} from "lucide-react";
import RydeShareModal from "@/components/ryde-share-modal";
import RydeAnalytics from "./ryde-analytics";
import {
  getRydeDrivers, getRydeReviews,
  addRydeReview, deleteRydeReview, updateRydeReview,
} from "@/lib/actions/ryde";
import { getOrgName } from "@/lib/actions/mmr";

type Driver = { id: number; driverId: string; name: string };
type Review = {
  id: number; driverId: string; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  reviewDate: string | null;
  improvement: string | null; atFault: boolean;
  customerInitials: string | null; createdAt: Date | null;
  releaseLocation: string | null;
  workArea: string | null;
  address: string | null;
  surveyDate: string | null;
};

const CATEGORIES = ["Customer Feedback", "On-Time Delivery", "Scan Compliance", "Safety", "Professionalism", "Other"];

function normaliseRelLoc(raw: string): string {
  if (raw.startsWith("O~")) {
    const rest = raw.slice(2).replace(/[._]+/g, " ").toLowerCase();
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  const MAP: Record<string, string> = {
    FRONTDOOR: "Front Door", BACKDOOR: "Back Door", PORCH: "Porch",
    GARAGE: "Garage", MAILROOM: "Mailroom", OSSTORAGEUNIT: "Storage Unit",
    INSTORAGEUNIT: "Indoor Storage", GATEDDRIVEWAY: "Gated Driveway",
    LOCKER: "Locker", SIDEDOOR: "Side Door", "PATIO/CARPORT": "Patio / Carport",
  };
  return MAP[raw] ?? raw;
}

const COMPLAINT_GROUPS: Record<string, string> = {
  "Package not placed where it should have been": "Placement Issue",
  "Delivery instructions not followed":           "Placement Issue",
  "Delivered to the wrong address":               "Wrong Address",
  "My package has not arrived":                   "Package Missing",
  "No knock or doorbell ring":                    "No Attempt",
  "Package was damaged":                          "Damage",
  "Delivery was late":                            "Late Delivery",
  "Problem with the picture of the delivery":     "Photo Issue",
  "Other":                                        "Other",
};

function topComplaint(reviews: Review[]): string | null {
  const neg = reviews.filter(r => r.stars != null && r.stars <= 2);
  const counts = new Map<string, number>();
  for (const r of neg) {
    if (!r.category) continue;
    const seen = new Set<string>();
    for (const cat of r.category.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean)) {
      const group = COMPLAINT_GROUPS[cat];
      if (group && !seen.has(group)) { seen.add(group); counts.set(group, (counts.get(group) ?? 0) + 1); }
    }
  }
  if (!counts.size) return null;
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}
function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function dateToWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function currentWeekDate() {
  return toISODate(new Date());
}

export default function RydePage() {
  const [drivers, setDrivers]   = useState<Driver[]>([]);
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [orgName, setOrgName]   = useState<string>("MyGroundOps");
  const [showReview,      setShowReview]      = useState(false);
  const [showShareCard,   setShowShareCard]   = useState(false);
  const [shareDriverId,   setShareDriverId]   = useState<string | undefined>(undefined);
  const [reviewTarget,    setReviewTarget]    = useState<{ driver: Driver; reviews: Review[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [reviewsShown, setReviewsShown] = useState(20);
  const REVIEWS_PAGE = 20;

  // ── Global period filter (drives everything on the page) ──────────────────
  type Period = "week" | "month" | "30d" | "90d" | "all";
  const [period, setPeriod] = useState<Period>("all");

  // Review-level drill-down filters (applied on top of period)
  const [filterDriver, setFilterDriver] = useState("");
  const [filterType, setFilterType]     = useState<"all" | "positive" | "negative">("all");
  const [filterStars, setFilterStars]   = useState(0);

  // Review form state
  const [rDriver, setRDriver]     = useState("");
  const [rType, setRType]         = useState<"positive" | "negative">("positive");
  const [rStars, setRStars]       = useState(0);
  const [rCategory, setRCategory] = useState(CATEGORIES[0]);
  const [rContent, setRContent]   = useState("");
  const [rWeek, setRWeek]         = useState(currentWeekDate());
  const [rImprovement, setRImprovement] = useState("");
  const [rAtFault, setRAtFault]           = useState(false);
  const [rCustomerInitials, setRCustomerInitials] = useState("");

  // Edit review state
  const [editReview, setEditReview] = useState<Review | null>(null);
  const [eType, setEType]           = useState<"positive" | "negative">("positive");
  const [eStars, setEStars]         = useState(0);
  const [eCategory, setECategory]   = useState(CATEGORIES[0]);
  const [eContent, setEContent]     = useState("");
  const [eWeek, setEWeek]           = useState(currentWeekDate());
  const [eImprovement, setEImprovement] = useState("");
  const [eAtFault, setEAtFault]                 = useState(false);
  const [eCustomerInitials, setECustomerInitials] = useState("");

  async function refresh() {
    const [d, r, name] = await Promise.all([getRydeDrivers(), getRydeReviews(), getOrgName()]);
    setDrivers(d as Driver[]);
    setReviews(r as Review[]);
    setOrgName(name);
  }

  useEffect(() => { refresh(); }, []);

  function handleAddReview() {
    if (!rDriver || !rContent.trim() || rStars === 0) return;
    startTransition(async () => {
      await addRydeReview({
        driverId:         rDriver,
        type:             rType,
        stars:            rStars,
        category:         rCategory || null,
        content:          rContent.trim(),
        week:             rWeek ? dateToWeek(rWeek) : null,
        improvement:      rType === "negative" && rImprovement.trim() ? rImprovement.trim() : null,
        atFault:          rType === "negative" ? rAtFault : false,
        customerInitials: rCustomerInitials.trim() || null,
      });
      setShowReview(false);
      setRDriver(""); setRType("positive"); setRStars(0); setRCategory(CATEGORIES[0]);
      setRContent(""); setRWeek(currentWeekDate()); setRImprovement(""); setRAtFault(false); setRCustomerInitials("");
      await refresh();
    });
  }

  function handleDeleteReview(id: number) {
    startTransition(async () => {
      await deleteRydeReview(id);
      await refresh();
    });
  }

  function openEditReview(review: Review) {
    setEditReview(review);
    setEType(review.type as "positive" | "negative");
    setEStars(review.stars ?? 0);
    setECategory(review.category ?? CATEGORIES[0]);
    setEContent(review.content);
    setEWeek(currentWeekDate());
    setEImprovement(review.improvement ?? "");
    setEAtFault(review.atFault);
    setECustomerInitials(review.customerInitials ?? "");
  }

  function handleEditReview() {
    if (!editReview || !eContent.trim() || eStars === 0) return;
    startTransition(async () => {
      await updateRydeReview(editReview.id, {
        type:             eType,
        stars:            eStars,
        category:         eCategory || null,
        content:          eContent.trim(),
        week:             eWeek ? dateToWeek(eWeek) : null,
        improvement:      eType === "negative" && eImprovement.trim() ? eImprovement.trim() : null,
        atFault:          eType === "negative" ? eAtFault : false,
        customerInitials: eCustomerInitials.trim() || null,
      });
      setEditReview(null);
      await refresh();
    });
  }

  function driverName(driverId: string) {
    return drivers.find((d) => d.driverId === driverId)?.name ?? driverId;
  }

  // ── Period filter: drives the whole page ──────────────────────────────────
  function getReviewDate(r: Review): Date | null {
    if (r.reviewDate) return new Date(r.reviewDate + "T12:00:00");
    if (r.createdAt)  return new Date(r.createdAt);
    return null;
  }

  const periodCutoff: Date | null = (() => {
    const now = new Date();
    if (period === "week")  { const d = new Date(now); d.setDate(d.getDate() - 7);  return d; }
    if (period === "month") { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
    if (period === "30d")   { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
    if (period === "90d")   { const d = new Date(now); d.setDate(d.getDate() - 90); return d; }
    return null;
  })();

  const periodReviews = periodCutoff
    ? reviews.filter((r) => { const d = getReviewDate(r); return d != null && d >= periodCutoff; })
    : reviews;

  const PERIOD_LABELS: Record<string, string> = {
    week: "Last 7 Days", month: "Last Month", "30d": "Last 30 Days", "90d": "Last 90 Days", all: "All Time",
  };
  const periodLabel = PERIOD_LABELS[period];

  const reviewCount = periodReviews.length;
  const posCount    = periodReviews.filter((r) => r.type === "positive").length;
  const negCount    = periodReviews.filter((r) => r.type === "negative").length;

  // ── Review list drill-down filters (on top of period) ─────────────────────
  const filteredReviews = periodReviews.filter((r) => {
    if (filterDriver && r.driverId !== filterDriver) return false;
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterStars > 0 && r.stars !== filterStars) return false;
    return true;
  });
  const hasActiveFilters = filterDriver !== "" || filterType !== "all" || filterStars !== 0;

  return (
    <AppShell>
      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              MyGroundOps · Admin
            </p>
            <h1 className="text-[24px] sm:text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Ryde Scores
            </h1>
            <p className="text-[12px] text-slate-400 mt-1">Driver performance reviews and customer ratings.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowReview(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold
                border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Review</span>
            </button>
            <button
              onClick={() => setShowShareCard(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold
                bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Build Ryde Card</span>
            </button>
          </div>
        </div>

        {/* Coaching CTA banner */}
        <div className="mb-5 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)" }}>
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-indigo-300 mb-0.5">Driver Coaching</p>
            <p className="text-[15px] font-bold text-white leading-tight">Send drivers their Ryde scorecard</p>
            <p className="text-[12px] text-indigo-300 mt-0.5">Pick a driver, choose reviews to spotlight, share as an image.</p>
          </div>
          <button
            onClick={() => setShowShareCard(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors shrink-0 shadow-lg"
          >
            <Share2 className="w-4 h-4" />
            Build Ryde Card
          </button>
        </div>

        {/* ── Global period filter ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Time Period</span>
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-1">
            {([
              { key: "week",  label: "Last 7 Days"  },
              { key: "month", label: "Last Month"   },
              { key: "30d",   label: "30 Days"      },
              { key: "90d",   label: "90 Days"      },
              { key: "all",   label: "All Time"     },
            ] as { key: string; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setPeriod(key as any); setReviewsShown(20); }}
                className={`px-3 sm:px-4 py-2 rounded-lg text-[12px] sm:text-[13px] font-semibold transition-all whitespace-nowrap ${
                  period === key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {period !== "all" && (
            <span className="text-[11px] text-slate-400">
              {reviewCount} review{reviewCount !== 1 ? "s" : ""} in this period
            </span>
          )}
        </div>

        {/* Analytics dashboard */}
        <RydeAnalytics reviews={periodReviews} drivers={drivers} periodLabel={periodLabel} />

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
          {[
            { label: "Total Reviews", value: reviewCount.toString() },
            { label: "Positive",      value: posCount.toString()    },
            { label: "Negative",      value: negCount.toString()    },
          ].map((kpi) => (
            <div key={kpi.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4
                shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{kpi.label}</p>
              <span className="text-[22px] font-extrabold text-slate-900 leading-none tracking-tight">{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* Per-driver score cards */}
        {drivers.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Driver Scorecards</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {drivers.map((driver) => {
                const driverReviews = periodReviews.filter(r => r.driverId === driver.driverId);
                const total = driverReviews.length;
                const pos = driverReviews.filter(r => r.type === "positive").length;
                const positivePct = total > 0 ? Math.round((pos / total) * 100) : 0;
                const avgStars = total > 0
                  ? driverReviews.reduce((s, r) => s + (r.stars ?? 0), 0) / total
                  : 0;
                const ringColor = positivePct >= 80 ? "#4ade80" : positivePct >= 60 ? "#fb923c" : total === 0 ? "#334155" : "#f87171";
                const statusLabel = total === 0 ? "NO DATA" : positivePct >= 80 ? "EXCELLENT" : positivePct >= 60 ? "GOOD" : "NEEDS WORK";
                const initials = driver.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                const recent = [...driverReviews].sort((a, b) => {
                  return (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                }).slice(0, 1)[0];

                return (
                  <div
                    key={driver.driverId}
                    className="rounded-2xl p-5 cursor-pointer group transition-all"
                    style={{
                      background: "linear-gradient(155deg, #0b0f1a 0%, #111827 55%, #0b0f1a 100%)",
                      border: `1px solid ${ringColor}30`,
                    }}
                    onClick={() => setReviewTarget({ driver, reviews: driverReviews })}
                    title="Click to see reviews"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black text-slate-100 flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${ringColor}60, #6366f160)`, border: `2px solid ${ringColor}50` }}
                        >
                          {initials}
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-slate-100 leading-tight">{driver.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{total} review{total !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <span
                        className="text-[9px] font-black tracking-widest px-2.5 py-1 rounded-full"
                        style={{ color: ringColor, background: `${ringColor}18`, border: `1px solid ${ringColor}40` }}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: "Positive", val: `${positivePct}%`, color: ringColor },
                        { label: "Avg Stars", val: total > 0 ? `${avgStars.toFixed(1)}★` : "-", color: "#facc15" },
                        { label: "Negative", val: `${total - pos}`, color: "#f87171" },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="rounded-xl px-3 py-2" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
                          <p className="text-[8px] font-bold uppercase tracking-wide" style={{ color: "#475569" }}>{label}</p>
                          <p className="text-[14px] font-black mt-0.5" style={{ color }}>{val}</p>
                        </div>
                      ))}
                    </div>

                    {/* Top complaint badge */}
                    {(() => {
                      const complaint = topComplaint(driverReviews);
                      if (!complaint) return null;
                      const isRed = complaint === "Wrong Address" || complaint === "Package Missing";
                      return (
                        <div className="mb-2 rounded-lg px-3 py-1.5 flex items-center gap-2"
                          style={{ background: isRed ? "#450a0a" : "#431407", border: `1px solid ${isRed ? "#7f1d1d" : "#7c2d12"}` }}>
                          <span className="text-[8px] font-bold uppercase tracking-wider"
                            style={{ color: isRed ? "#f87171" : "#fb923c" }}>
                            Top Issue
                          </span>
                          <span className="text-[10px] font-semibold" style={{ color: isRed ? "#fca5a5" : "#fdba74" }}>
                            {complaint}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Most recent review snippet */}
                    {recent && (
                      <div className="rounded-xl px-3 py-2.5" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} className={`w-2.5 h-2.5 ${s <= (recent.stars ?? 0) ? "text-amber-400 fill-amber-400" : "text-slate-700 fill-slate-700"}`} />
                          ))}
                          <span className="text-[8px] font-bold ml-1" style={{ color: recent.type === "positive" ? "#4ade80" : "#f87171" }}>
                            {recent.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 italic leading-snug">
                          &ldquo;{recent.content.length > 70 ? recent.content.slice(0, 67) + "…" : recent.content}&rdquo;
                        </p>
                      </div>
                    )}

                    {total === 0 && (
                      <div className="rounded-xl px-3 py-3 text-center" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
                        <p className="text-[11px] text-slate-600">No reviews yet</p>
                      </div>
                    )}

                    {/* Action row */}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">View all reviews →</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShareDriverId(driver.driverId); setShowShareCard(true); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all opacity-0 group-hover:opacity-100"
                        style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" }}
                        title="Share scorecard"
                      >
                        <Share2 className="w-3 h-3" />
                        Share
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reviews list */}
        <div className="flex flex-col gap-3">

          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[12px] font-bold text-slate-700">
                {hasActiveFilters
                  ? `${filteredReviews.length} of ${reviews.length} reviews`
                  : `${reviews.length} reviews`}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterDriver(""); setFilterType("all"); setFilterStars(0); setReviewsShown(20); }}
                  className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Driver filter */}
              <div className="relative">
                <select
                  value={filterDriver}
                  onChange={(e) => { setFilterDriver(e.target.value); setReviewsShown(20); }}
                  className="pl-2.5 pr-7 py-1.5 text-[12px] font-medium rounded-lg border border-slate-200 bg-white text-slate-700 appearance-none outline-none focus:border-slate-400"
                >
                  <option value="">All drivers</option>
                  {drivers.map((d) => (
                    <option key={d.driverId} value={d.driverId}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              </div>

              {/* Type filter */}
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                {([
                  { key: "all",      label: "All" },
                  { key: "positive", label: "Positive" },
                  { key: "negative", label: "Negative" },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setFilterType(key); setReviewsShown(20); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      filterType === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Stars filter */}
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => { setFilterStars(0); setReviewsShown(20); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${filterStars === 0 ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Any ★
                </button>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setFilterStars(s); setReviewsShown(20); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${filterStars === s ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {s}★
                  </button>
                ))}
              </div>
            </div>
          </div>

          {reviews.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center
              shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-slate-400 text-[13px]">No reviews yet. Use &quot;Add Review&quot; to record customer or performance feedback.</p>
            </div>
          )}
          {filteredReviews.length === 0 && reviews.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-[13px] text-slate-400">No reviews match the selected filters.</p>
            </div>
          )}
          {filteredReviews.slice(0, reviewsShown).map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              driverName={driverName(r.driverId)}
              onDelete={() => handleDeleteReview(r.id)}
              onEdit={() => openEditReview(r)}
              isPending={isPending}
            />
          ))}
          {filteredReviews.length > reviewsShown && (
            <button
              onClick={() => setReviewsShown((n) => n + REVIEWS_PAGE)}
              className="mt-1 w-full py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Load more ({filteredReviews.length - reviewsShown} remaining)
            </button>
          )}
        </div>
      </main>

      {/* Add Review modal */}
      {showReview && (
        <Modal title="Add Review" onClose={() => setShowReview(false)}>
          <FormField label="Driver">
            <DriverSelect drivers={drivers} value={rDriver} onChange={setRDriver} />
          </FormField>
          <FormField label="Type">
            <div className="flex gap-2">
              {(["positive", "negative"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRType(t)}
                  className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                    rType === t
                      ? t === "positive"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-red-500 text-white border-red-500"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Ryde Score (1–5 stars)">
            <StarPicker value={rStars} onChange={setRStars} />
          </FormField>
          <FormField label="Category">
            <div className="relative">
              <select
                value={rCategory}
                onChange={(e) => setRCategory(e.target.value)}
                className={INPUT_CLS + " appearance-none pr-8"}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </FormField>
          <FormField label="Date of Review">
            <input type="date" value={rWeek} onChange={(e) => setRWeek(e.target.value)} className={INPUT_CLS} />
          </FormField>
          <FormField label="Customer Initials (optional)">
            <input
              type="text"
              value={rCustomerInitials}
              onChange={(e) => setRCustomerInitials(e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g. J.D."
              maxLength={10}
            />
          </FormField>
          <FormField label="Review / Feedback">
            <textarea
              value={rContent}
              onChange={(e) => setRContent(e.target.value)}
              rows={3}
              className={INPUT_CLS + " resize-none"}
              placeholder="Enter the customer or performance feedback..."
            />
          </FormField>
          {rType === "negative" && (
            <>
              <FormField label="Improvement Tip (optional)">
                <textarea
                  value={rImprovement}
                  onChange={(e) => setRImprovement(e.target.value)}
                  rows={2}
                  className={INPUT_CLS + " resize-none"}
                  placeholder="How can the driver improve in this area?"
                />
              </FormField>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rAtFault}
                  onChange={(e) => setRAtFault(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-red-500"
                />
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Driver at fault</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Checking this will reset the driver&apos;s milestone streak.</p>
                </div>
              </label>
            </>
          )}
          <ModalFooter
            onCancel={() => setShowReview(false)}
            onConfirm={handleAddReview}
            disabled={!rDriver || !rContent.trim() || rStars === 0 || isPending}
            isPending={isPending}
            label="Add Review"
          />
        </Modal>
      )}

      {/* Driver reviews drill-down modal */}
      {reviewTarget && (
        <DriverReviewsModal
          driver={reviewTarget.driver}
          reviews={reviewTarget.reviews}
          onClose={() => setReviewTarget(null)}
          onShare={() => { setReviewTarget(null); setShareDriverId(reviewTarget.driver.driverId); setShowShareCard(true); }}
        />
      )}

      {/* Share Card modal */}
      {showShareCard && (
        <RydeShareModal
          drivers={drivers}
          reviews={reviews}
          initialDriverId={shareDriverId}
          orgName={orgName}
          onClose={() => { setShowShareCard(false); setShareDriverId(undefined); }}
        />
      )}

      {/* Edit Review modal */}
      {editReview && (
        <Modal title="Edit Review" onClose={() => setEditReview(null)}>
          <FormField label="Type">
            <div className="flex gap-2">
              {(["positive", "negative"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEType(t)}
                  className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                    eType === t
                      ? t === "positive" ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-500 text-white border-red-500"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Ryde Score (1–5 stars)">
            <StarPicker value={eStars} onChange={setEStars} />
          </FormField>
          <FormField label="Category">
            <div className="relative">
              <select value={eCategory} onChange={(e) => setECategory(e.target.value)} className={INPUT_CLS + " appearance-none pr-8"}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </FormField>
          <FormField label="Date of Review">
            <input type="date" value={eWeek} onChange={(e) => setEWeek(e.target.value)} className={INPUT_CLS} />
          </FormField>
          <FormField label="Customer Initials (optional)">
            <input
              type="text"
              value={eCustomerInitials}
              onChange={(e) => setECustomerInitials(e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g. J.D."
              maxLength={10}
            />
          </FormField>
          <FormField label="Review / Feedback">
            <textarea value={eContent} onChange={(e) => setEContent(e.target.value)} rows={3} className={INPUT_CLS + " resize-none"} />
          </FormField>
          {eType === "negative" && (
            <>
              <FormField label="Improvement Tip">
                <textarea value={eImprovement} onChange={(e) => setEImprovement(e.target.value)} rows={2} className={INPUT_CLS + " resize-none"} />
              </FormField>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={eAtFault} onChange={(e) => setEAtFault(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-red-500" />
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Driver at fault</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Resets driver&apos;s milestone streak.</p>
                </div>
              </label>
            </>
          )}
          <ModalFooter onCancel={() => setEditReview(null)} onConfirm={handleEditReview} disabled={!eContent.trim() || eStars === 0 || isPending} isPending={isPending} label="Save Changes" />
        </Modal>
      )}
    </AppShell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const INPUT_CLS = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            className={`w-8 h-8 transition-colors ${
              star <= (hovered || value)
                ? "text-amber-400 fill-amber-400"
                : "text-slate-200 fill-slate-200"
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-[14px] font-bold text-slate-600">{value} star{value !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

function ReviewCard({ review, driverName, onDelete, onEdit, isPending }: {
  review: Review; driverName: string; onDelete: () => void; onEdit: () => void; isPending: boolean;
}) {
  const isPos = review.type === "positive";
  return (
    <div className={`bg-white rounded-xl border px-5 py-4 flex gap-4
      shadow-[0_1px_3px_rgba(0,0,0,0.04)]
      ${isPos ? "border-emerald-200/80" : "border-red-200/80"}`}>
      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0
        ${isPos ? "bg-emerald-100" : "bg-red-100"}`}>
        {isPos
          ? <TrendingUp className="w-4 h-4 text-emerald-600" />
          : <TrendingDown className="w-4 h-4 text-red-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[13px] font-bold text-slate-900">{driverName}</span>
          {/* Star rating */}
          {review.stars != null && (
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map((i) => (
                <Star key={i} className={`w-3 h-3 ${i <= review.stars! ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
              ))}
            </div>
          )}
          {review.category && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/80">
              {review.category}
            </span>
          )}
          {review.customerInitials && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/80">
              {review.customerInitials}
            </span>
          )}
          {review.atFault && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200/80">
              At Fault
            </span>
          )}
          {review.week && (
            <span className="text-[10px] font-mono text-slate-400">{review.week}</span>
          )}
        </div>
        <p className="text-[13px] text-slate-700">{review.content}</p>
        {review.improvement && (
          <div className="mt-2 pl-3 border-l-2 border-amber-300">
            <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Improvement Tip</p>
            <p className="text-[12px] text-amber-800">{review.improvement}</p>
          </div>
        )}
        {review.releaseLocation && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
            review.type === "negative"
              ? "text-amber-700 bg-amber-50 border border-amber-200"
              : "text-slate-500 bg-slate-100"
          }`}>
            📍 {normaliseRelLoc(review.releaseLocation)}
          </span>
        )}
        <p className="text-[11px] text-slate-300 mt-2">
          {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ""}
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0 self-start">
        <button
          onClick={onEdit}
          disabled={isPending}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DriverSelect({ drivers, value, onChange }: {
  drivers: Driver[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS + " appearance-none pr-8"}
      >
        <option value="">Select a driver...</option>
        {drivers.map((d) => (
          <option key={d.driverId} value={d.driverId}>{d.name} ({d.driverId})</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-[16px] font-extrabold text-slate-900">{title}</h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onConfirm, disabled, isPending, label }: {
  onCancel: () => void; onConfirm: () => void; disabled: boolean; isPending: boolean; label: string;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        onClick={onCancel}
        className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
          text-slate-500 hover:bg-slate-50 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
          hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-2"
      >
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

function DriverReviewsModal({ driver, reviews, onClose, onShare }: {
  driver: Driver; reviews: Review[]; onClose: () => void; onShare: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");
  const pos = reviews.filter(r => r.type === "positive").length;
  const total = reviews.length;
  const positivePct = total > 0 ? Math.round((pos / total) * 100) : 0;
  const avgStars = total > 0 ? reviews.reduce((s, r) => s + (r.stars ?? 0), 0) / total : 0;
  const filtered = filter === "all" ? reviews : reviews.filter(r => r.type === filter);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-[16px] font-extrabold text-slate-900">{driver.name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[12px] text-slate-400">{total} review{total !== 1 ? "s" : ""}</span>
              {total > 0 && (
                <>
                  <span className="text-[12px] font-semibold text-emerald-600">{positivePct}% positive</span>
                  <span className="text-[12px] text-amber-600">{avgStars.toFixed(1)} ★ avg</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold
                border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share Card
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        {total > 0 && (
          <div className="px-6 py-3 border-b border-slate-100 flex gap-2 shrink-0">
            {([
              { key: "all",      label: "All",      count: total },
              { key: "positive", label: "Positive", count: pos },
              { key: "negative", label: "Negative", count: total - pos },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                  filter === key
                    ? key === "positive" ? "bg-emerald-600 text-white border-emerald-600"
                    : key === "negative" ? "bg-red-500 text-white border-red-500"
                    : "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Reviews list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[13px] text-slate-400">No {filter !== "all" ? filter : ""} reviews for {driver.name}.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(r => (
                <div key={r.id} className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3 h-3 ${i <= (r.stars ?? 0) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
                      ))}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      r.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    }`}>
                      {r.type === "positive" ? "Positive" : "Negative"}
                    </span>
                    {r.customerInitials && (
                      <span className="text-[10px] font-semibold text-blue-500 px-2 py-0.5 rounded-full bg-blue-50 shrink-0">{r.customerInitials}</span>
                    )}
                    {r.week && (
                      <span className="text-[10px] font-mono text-slate-400 ml-auto">{r.week}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-700 leading-relaxed">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
