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
  getCompanyRating, setCompanyRating,
  getRydeGoalMessage, setRydeGoalMessage,
} from "@/lib/actions/ryde";

type Driver = { id: number; driverId: string; name: string };
type Review = {
  id: number; driverId: string; type: string; stars: number | null;
  category: string | null; content: string; week: string | null;
  improvement: string | null; atFault: boolean;
  customerInitials: string | null; createdAt: Date | null;
};

const CATEGORIES = ["Customer Feedback", "On-Time Delivery", "Scan Compliance", "Safety", "Professionalism", "Other"];
const RATING_GOAL = 4.0;

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
  const [companyRating, setCompanyRatingState] = useState<number | null>(null);
  const [editingRating, setEditingRating] = useState(false);
  const [ratingInput, setRatingInput] = useState("");
  const [goalMessage, setGoalMessageState] = useState("");
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [showReview,      setShowReview]      = useState(false);
  const [showShareCard,   setShowShareCard]   = useState(false);
  const [shareDriverId,   setShareDriverId]   = useState<string | undefined>(undefined);
  const [reviewTarget,    setReviewTarget]    = useState<{ driver: Driver; reviews: Review[] } | null>(null);
  const [isPending, startTransition] = useTransition();

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
    const [d, r, cr, msg] = await Promise.all([getRydeDrivers(), getRydeReviews(), getCompanyRating(), getRydeGoalMessage()]);
    setDrivers(d as Driver[]);
    setReviews(r as Review[]);
    setCompanyRatingState(cr);
    setGoalMessageState(msg);
  }

  function handleSaveMessage() {
    if (!messageInput.trim()) return;
    startTransition(async () => {
      await setRydeGoalMessage(messageInput.trim());
      setGoalMessageState(messageInput.trim());
      setEditingMessage(false);
    });
  }

  function handleSaveRating() {
    const n = parseFloat(ratingInput);
    if (isNaN(n) || n < 1 || n > 5) return;
    const rounded = Math.round(n * 10) / 10;
    startTransition(async () => {
      await setCompanyRating(rounded);
      setCompanyRatingState(rounded);
      setEditingRating(false);
    });
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

  const reviewCount = reviews.length;
  const posCount    = reviews.filter((r) => r.type === "positive").length;
  const negCount    = reviews.filter((r) => r.type === "negative").length;
  const goalPct     = companyRating != null ? Math.min(100, (companyRating / RATING_GOAL) * 100) : 0;
  const atGoal      = companyRating != null && companyRating >= RATING_GOAL;

  return (
    <AppShell>
      <main className="flex-1 px-6 py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              MyGroundOps · Admin
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Ryde Scores
            </h1>
            <p className="text-[13px] text-slate-400 mt-1.5">Driver performance reviews and Ryde metrics.</p>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setShowShareCard(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
                border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share Card
            </button>
            <button
              onClick={() => { setShowReview(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
                bg-slate-900 text-white hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Review
            </button>
          </div>
        </div>

        {/* Analytics dashboard */}
        <RydeAnalytics reviews={reviews} drivers={drivers} />

        {/* Team goal message — editable */}
        <div className="mb-3 flex items-start justify-between gap-4 px-1">
          {editingMessage ? (
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                rows={2}
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-[13px] text-slate-800 outline-none focus:border-slate-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveMessage}
                  disabled={isPending || !messageInput.trim()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  {isPending ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingMessage(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-slate-500 flex-1">{goalMessage}</p>
              <button
                onClick={() => { setMessageInput(goalMessage); setEditingMessage(true); }}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-2 shrink-0 transition-colors"
              >
                Edit message
              </button>
            </>
          )}
        </div>

        {/* Company Rating Goal Banner */}
        <div className={`mb-6 rounded-2xl px-6 py-5 border ${
          atGoal
            ? "bg-emerald-50 border-emerald-200"
            : "bg-white border-slate-200/80"
        } shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]`}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                Company Ryde Rating
              </p>
              {editingRating ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="1" max="5" step="0.1"
                    value={ratingInput}
                    onChange={(e) => setRatingInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveRating(); if (e.key === "Escape") setEditingRating(false); }}
                    autoFocus
                    className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 text-[16px] font-bold text-slate-900 outline-none focus:border-slate-500"
                    placeholder="3.5"
                  />
                  <button
                    onClick={handleSaveRating}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-700 transition-colors disabled:opacity-40"
                  >
                    {isPending ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingRating(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map((i) => (
                      <Star key={i} className={`w-5 h-5 ${
                        companyRating != null && i <= Math.round(companyRating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-200 fill-slate-200"
                      }`} />
                    ))}
                  </div>
                  <span className="text-[28px] font-extrabold text-slate-900 leading-none">
                    {companyRating != null ? companyRating.toFixed(1) : "—"}
                  </span>
                  <button
                    onClick={() => { setRatingInput(companyRating != null ? String(companyRating) : ""); setEditingRating(true); }}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
                  >
                    Edit
                  </button>
                  {atGoal && (
                    <span className="text-[12px] font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      🎉 Goal reached! Free breakfast!
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] font-semibold text-slate-400">Goal: {RATING_GOAL.toFixed(1)} ★</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {atGoal ? "Team earns free breakfast" : `${companyRating != null ? (RATING_GOAL - companyRating).toFixed(1) : RATING_GOAL.toFixed(1)} stars to go`}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${goalPct}%`,
                background: atGoal
                  ? "linear-gradient(90deg, #10b981, #34d399)"
                  : "linear-gradient(90deg, #f59e0b, #fb923c)",
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-400">0</span>
            <span className="text-[10px] font-semibold text-slate-500">🥞 Free Breakfast @ {RATING_GOAL.toFixed(1)}</span>
            <span className="text-[10px] text-slate-400">5.0</span>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
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
                const driverReviews = reviews.filter(r => r.driverId === driver.driverId);
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
                        { label: "Avg Stars", val: total > 0 ? `${avgStars.toFixed(1)}★` : "—", color: "#facc15" },
                        { label: "Negative", val: `${total - pos}`, color: "#f87171" },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="rounded-xl px-3 py-2" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
                          <p className="text-[8px] font-bold uppercase tracking-wide" style={{ color: "#475569" }}>{label}</p>
                          <p className="text-[14px] font-black mt-0.5" style={{ color }}>{val}</p>
                        </div>
                      ))}
                    </div>

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
          {reviews.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center
              shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-slate-400 text-[13px]">No reviews yet. Use &quot;Add Review&quot; to record customer or performance feedback.</p>
            </div>
          )}
          {reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              driverName={driverName(r.driverId)}
              onDelete={() => handleDeleteReview(r.id)}
              onEdit={() => openEditReview(r)}
              isPending={isPending}
            />
          ))}
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

        {/* Reviews table */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[13px] text-slate-400">No {filter !== "all" ? filter : ""} reviews for {driver.name}.</p>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-slate-50/95 border-b border-slate-100">
                <tr>
                  <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Week</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Stars</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Review</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap align-top pt-4">{r.week ?? "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap align-top pt-4">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} className={`w-3 h-3 ${i <= (r.stars ?? 0) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap align-top pt-4">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        r.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      }`}>
                        {r.type === "positive" ? "Positive" : "Negative"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700 align-top">
                      <p className="leading-relaxed">{r.content}</p>
                      {r.customerInitials && (
                        <span className="text-[10px] font-semibold text-blue-500 mt-1 inline-block">{r.customerInitials}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
