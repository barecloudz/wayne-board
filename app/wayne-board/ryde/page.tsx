"use client";

import { useState, useEffect, useTransition } from "react";
import AppShell from "@/components/app-shell";
import {
  Plus, Trash2, Star, TrendingUp, TrendingDown, ChevronDown, Loader2,
} from "lucide-react";
import {
  getRydeDrivers, getRydeScores, getRydeReviews,
  addRydeScore, addRydeReview, deleteRydeScore, deleteRydeReview,
} from "@/lib/actions/ryde";

type Driver   = { id: number; driverId: string; name: string };
type Score    = { id: number; driverId: string; score: number; week: string; deliveries: number; positiveReviews: number; createdAt: Date | null };
type Review   = { id: number; driverId: string; type: string; category: string | null; content: string; week: string | null; improvement: string | null; createdAt: Date | null };

const CATEGORIES = ["Customer Feedback", "On-Time Delivery", "Scan Compliance", "Safety", "Professionalism", "Other"];

function currentWeek() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export default function RydePage() {
  const [drivers, setDrivers]   = useState<Driver[]>([]);
  const [scores, setScores]     = useState<Score[]>([]);
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [tab, setTab]           = useState<"scores" | "reviews">("scores");
  const [showScore, setShowScore]   = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Score form state
  const [sDriver, setSDriver]     = useState("");
  const [sScore, setSScore]       = useState("");
  const [sWeek, setSWeek]         = useState(currentWeek());
  const [sDeliveries, setSDeliveries] = useState("");
  const [sPosReviews, setSPosReviews] = useState("");

  // Review form state
  const [rDriver, setRDriver]     = useState("");
  const [rType, setRType]         = useState<"positive" | "negative">("positive");
  const [rCategory, setRCategory] = useState(CATEGORIES[0]);
  const [rContent, setRContent]   = useState("");
  const [rWeek, setRWeek]         = useState(currentWeek());
  const [rImprovement, setRImprovement] = useState("");

  async function refresh() {
    const [d, s, r] = await Promise.all([getRydeDrivers(), getRydeScores(), getRydeReviews()]);
    setDrivers(d as Driver[]);
    setScores(s as Score[]);
    setReviews(r as Review[]);
  }

  useEffect(() => { refresh(); }, []);

  function handleAddScore() {
    if (!sDriver || !sScore || !sWeek) return;
    startTransition(async () => {
      await addRydeScore({
        driverId:       sDriver,
        score:          parseFloat(sScore),
        week:           sWeek,
        deliveries:     parseInt(sDeliveries) || 0,
        positiveReviews: parseInt(sPosReviews) || 0,
      });
      setShowScore(false);
      setSDriver(""); setSScore(""); setSWeek(currentWeek());
      setSDeliveries(""); setSPosReviews("");
      await refresh();
    });
  }

  function handleAddReview() {
    if (!rDriver || !rContent.trim()) return;
    startTransition(async () => {
      await addRydeReview({
        driverId:    rDriver,
        type:        rType,
        category:    rCategory || null,
        content:     rContent.trim(),
        week:        rWeek || null,
        improvement: rType === "negative" && rImprovement.trim() ? rImprovement.trim() : null,
      });
      setShowReview(false);
      setRDriver(""); setRType("positive"); setRCategory(CATEGORIES[0]);
      setRContent(""); setRWeek(currentWeek()); setRImprovement("");
      await refresh();
    });
  }

  function handleDeleteScore(id: number) {
    startTransition(async () => {
      await deleteRydeScore(id);
      await refresh();
    });
  }

  function handleDeleteReview(id: number) {
    startTransition(async () => {
      await deleteRydeReview(id);
      await refresh();
    });
  }

  function driverName(driverId: string) {
    return drivers.find((d) => d.driverId === driverId)?.name ?? driverId;
  }

  const scoreCount  = scores.length;
  const reviewCount = reviews.length;
  const posCount    = reviews.filter((r) => r.type === "positive").length;
  const negCount    = reviews.filter((r) => r.type === "negative").length;

  return (
    <AppShell>
      <main className="flex-1 px-6 py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Wayne Board · Admin
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Ryde Scores
            </h1>
            <p className="text-[13px] text-slate-400 mt-1.5">Driver performance reviews and Ryde metrics.</p>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => { setShowReview(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
                border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Review
            </button>
            <button
              onClick={() => { setShowScore(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
                bg-slate-900 text-white hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Score
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Score Entries",    value: scoreCount.toString()  },
            { label: "Total Reviews",    value: reviewCount.toString() },
            { label: "Positive",         value: posCount.toString()    },
            { label: "Negative",         value: negCount.toString()    },
          ].map((kpi) => (
            <div key={kpi.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4
                shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{kpi.label}</p>
              <span className="text-[22px] font-extrabold text-slate-900 leading-none tracking-tight">{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
          {(["scores", "reviews"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                tab === t
                  ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "scores" && (
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden
            shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Driver</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Week</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Score</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Deliveries</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Pos. Reviews</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id}
                    className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-semibold text-slate-800">{driverName(s.driverId)}</td>
                    <td className="px-3 py-3 font-mono text-[12px] text-slate-500">{s.week}</td>
                    <td className="px-3 py-3">
                      <ScoreBadge score={s.score} />
                    </td>
                    <td className="px-3 py-3 text-slate-500 hidden md:table-cell">{s.deliveries}</td>
                    <td className="px-3 py-3 text-slate-500 hidden md:table-cell">{s.positiveReviews}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleDeleteScore(s.id)}
                        disabled={isPending}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {scores.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-[13px]">
                      No scores yet. Use &quot;Add Score&quot; to enter a driver&apos;s Ryde score.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "reviews" && (
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
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </main>

      {/* Add Score modal */}
      {showScore && (
        <Modal title="Add Ryde Score" onClose={() => setShowScore(false)}>
          <FormField label="Driver">
            <DriverSelect drivers={drivers} value={sDriver} onChange={setSDriver} />
          </FormField>
          <FormField label="Week (e.g. 2026-W18)">
            <input
              type="text"
              value={sWeek}
              onChange={(e) => setSWeek(e.target.value)}
              className={INPUT_CLS}
              placeholder="2026-W18"
            />
          </FormField>
          <FormField label="Ryde Score (0–100)">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={sScore}
              onChange={(e) => setSScore(e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g. 94.5"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Deliveries">
              <input type="number" min={0} value={sDeliveries} onChange={(e) => setSDeliveries(e.target.value)} className={INPUT_CLS} placeholder="0" />
            </FormField>
            <FormField label="Positive Reviews">
              <input type="number" min={0} value={sPosReviews} onChange={(e) => setSPosReviews(e.target.value)} className={INPUT_CLS} placeholder="0" />
            </FormField>
          </div>
          <ModalFooter
            onCancel={() => setShowScore(false)}
            onConfirm={handleAddScore}
            disabled={!sDriver || !sScore || !sWeek || isPending}
            isPending={isPending}
            label="Add Score"
          />
        </Modal>
      )}

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
          <FormField label="Week (optional)">
            <input type="text" value={rWeek} onChange={(e) => setRWeek(e.target.value)} className={INPUT_CLS} placeholder="2026-W18" />
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
            <FormField label="Improvement Tip (optional)">
              <textarea
                value={rImprovement}
                onChange={(e) => setRImprovement(e.target.value)}
                rows={2}
                className={INPUT_CLS + " resize-none"}
                placeholder="How can the driver improve in this area?"
              />
            </FormField>
          )}
          <ModalFooter
            onCancel={() => setShowReview(false)}
            onConfirm={handleAddReview}
            disabled={!rDriver || !rContent.trim() || isPending}
            isPending={isPending}
            label="Add Review"
          />
        </Modal>
      )}
    </AppShell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const INPUT_CLS = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 95 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    score >= 85 ? "text-amber-600 bg-amber-50 border-amber-200" :
                  "text-red-600 bg-red-50 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-0.5 rounded-full border ${color}`}>
      <Star className="w-3 h-3" />
      {score.toFixed(1)}
    </span>
  );
}

function ReviewCard({ review, driverName, onDelete, isPending }: {
  review: Review; driverName: string; onDelete: () => void; isPending: boolean;
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
          {review.category && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/80">
              {review.category}
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
      <button
        onClick={onDelete}
        disabled={isPending}
        className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors shrink-0 self-start"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
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
