# Driver Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-tab + More-sheet driver portal with a 5-tab mobile-native bottom dock (Home, Schedule, Codes, Score, Me) that surfaces gamification on the landing screen and eliminates all hidden navigation.

**Architecture:** Extract Score content (Ryde avg, leaderboard, reviews, DSW stats) into `score-panel.tsx` and Me content (milestones, maintenance, account) into `me-panel.tsx`. Create a new `home-tab.tsx` aggregator. Refactor `driver-tabs.tsx` to wire the new 5-tab dock and delete the More sheet entirely.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, CSS custom property `--brand`

**Spec:** `docs/superpowers/specs/2026-09-09-driver-portal-redesign.md`

## Global Constraints

- No new API routes, no DB changes, no new npm dependencies
- Props from `app/driver/page.tsx` unchanged — all existing props flow through as-is
- Light background preserved (`bg-slate-50` / `bg-white`)
- Brand accent via `var(--brand)` / Tailwind `brand` color token — match existing usage
- Icons from `lucide-react` only
- Tailwind utility classes only — no new CSS files
- Safe-area-inset-bottom applied to dock (already pattern in codebase)
- Score tab hidden when `showRyde === false` — dock becomes 4 tabs

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/driver/home-tab.tsx` | Home landing: greeting, shift card, streak, rank/score, vehicle, quick-access |
| Create | `app/driver/score-panel.tsx` | Score sub-nav: Ryde avg, leaderboard, reviews, DSW/service stats |
| Create | `app/driver/me-panel.tsx` | Me sub-nav: milestones, maintenance form, account (username + password) |
| Modify | `app/driver/driver-tabs.tsx` | New 5-tab dock, removes More button + sheet, wires new panels |
| Modify | `app/driver/profile-button.tsx` | Dispatch `"me"` instead of `"account"` |

---

### Task 1: HomeTab component

**Files:**
- Create: `app/driver/home-tab.tsx`

**Interfaces:**
- Consumes: Props passed down from `driver-tabs.tsx` (see exact type below)
- Produces: `export default function HomeTab(props: HomeTabProps)` — used in Task 4

```typescript
// Exact prop type — Task 4 must match this exactly
export type HomeTabProps = {
  driverName: string;
  streakDays: number;
  scheduleToday: { isWork: boolean; startTime?: string; endTime?: string } | null;
  rydeAvg: number | null;
  reviewCount: number;
  leaderboardRank: number | null;
  vehicleNumber: string | null;
  workAreaName: string | null;
  showRyde: boolean;
  onNavigate: (tab: "schedule" | "codes" | "score" | "me") => void;
};
```

- [ ] **Step 1: Create the file with full component**

Create `app/driver/home-tab.tsx`:

```tsx
"use client";

import { Flame, CalendarDays, Key, Star, User, MapPin, Truck, ChevronRight } from "lucide-react";

export type HomeTabProps = {
  driverName: string;
  streakDays: number;
  scheduleToday: { isWork: boolean; startTime?: string; endTime?: string } | null;
  rydeAvg: number | null;
  reviewCount: number;
  leaderboardRank: number | null;
  vehicleNumber: string | null;
  workAreaName: string | null;
  showRyde: boolean;
  onNavigate: (tab: "schedule" | "codes" | "score" | "me") => void;
};

export default function HomeTab({
  driverName,
  streakDays,
  scheduleToday,
  rydeAvg,
  reviewCount,
  leaderboardRank,
  vehicleNumber,
  workAreaName,
  showRyde,
  onNavigate,
}: HomeTabProps) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const firstName = driverName.split(" ")[0];

  let shiftLabel = "No Schedule";
  let shiftSub = "You're not scheduled today";
  let shiftColor = "bg-slate-100 text-slate-500";
  if (scheduleToday?.isWork) {
    shiftLabel = "Working Today";
    shiftSub =
      scheduleToday.startTime && scheduleToday.endTime
        ? `${scheduleToday.startTime} – ${scheduleToday.endTime}`
        : "Scheduled";
    shiftColor = "bg-emerald-50 text-emerald-700";
  } else if (scheduleToday && !scheduleToday.isWork) {
    shiftLabel = "Day Off";
    shiftSub = "Enjoy your day";
    shiftColor = "bg-blue-50 text-blue-700";
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-5 pb-6">
      {/* Greeting */}
      <div>
        <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-widest">
          {dateLabel}
        </p>
        <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
          Hey, {firstName} 👋
        </h1>
      </div>

      {/* Shift card */}
      <button
        onClick={() => onNavigate("schedule")}
        className={`w-full flex items-center justify-between rounded-2xl px-5 py-4 ${shiftColor} text-left`}
      >
        <div>
          <p className="text-[15px] font-bold leading-tight">{shiftLabel}</p>
          <p className="text-[13px] mt-0.5 opacity-80">{shiftSub}</p>
        </div>
        <ChevronRight className="w-5 h-5 opacity-50 shrink-0" />
      </button>

      {/* Streak */}
      {streakDays > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 rounded-2xl px-5 py-4">
          <Flame className="w-7 h-7 text-orange-500 shrink-0" />
          <div>
            <p className="text-[15px] font-bold text-orange-800 leading-tight">
              {streakDays} day streak
            </p>
            <p className="text-[12px] text-orange-600 mt-0.5">Keep it going!</p>
          </div>
        </div>
      )}

      {/* Ryde tiles */}
      {showRyde && (rydeAvg !== null || leaderboardRank !== null) && (
        <button
          onClick={() => onNavigate("score")}
          className="w-full bg-white rounded-2xl border border-slate-200/80 px-5 py-4 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-left"
        >
          <div className="flex items-center gap-4">
            {rydeAvg !== null && (
              <div className="flex flex-col items-center">
                <span className="text-[22px] font-extrabold text-slate-900 leading-none">
                  {rydeAvg.toFixed(1)}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                  Ryde Avg
                </span>
              </div>
            )}
            {rydeAvg !== null && leaderboardRank !== null && (
              <div className="w-px h-8 bg-slate-200" />
            )}
            {leaderboardRank !== null && (
              <div className="flex flex-col items-center">
                <span className="text-[22px] font-extrabold text-slate-900 leading-none">
                  #{leaderboardRank}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                  This Week
                </span>
              </div>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>
      )}

      {/* Vehicle + work area */}
      {(vehicleNumber || workAreaName) && (
        <div className="flex gap-3">
          {vehicleNumber && (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 px-4 py-3 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Truck className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Truck</p>
                <p className="text-[14px] font-bold text-slate-800">{vehicleNumber}</p>
              </div>
            </div>
          )}
          {workAreaName && (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 px-4 py-3 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Area</p>
                <p className="text-[14px] font-bold text-slate-800">{workAreaName}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick access */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Quick Access
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: CalendarDays, label: "Schedule", tab: "schedule" as const, bg: "bg-violet-50", color: "text-violet-600" },
            { icon: Key, label: "Gate Codes", tab: "codes" as const, bg: "bg-amber-50", color: "text-amber-600" },
            ...(showRyde ? [{ icon: Star, label: "Ryde Score", tab: "score" as const, bg: "bg-emerald-50", color: "text-emerald-600" }] : []),
            { icon: User, label: "My Profile", tab: "me" as const, bg: "bg-slate-100", color: "text-slate-600" },
          ].map(({ icon: Icon, label, tab, bg, color }) => (
            <button
              key={tab}
              onClick={() => onNavigate(tab)}
              className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200/80 px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
            >
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4.5 h-4.5 ${color}`} />
              </div>
              <span className="text-[13px] font-bold text-slate-700">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: no errors related to `home-tab.tsx`

- [ ] **Step 3: Commit**

```bash
git add app/driver/home-tab.tsx
git commit -m "feat: add HomeTab component for driver portal redesign"
```

---

### Task 2: ScorePanel component

**Files:**
- Create: `app/driver/score-panel.tsx`

**Interfaces:**
- Consumes: `ServiceTab` from `./service-tab`, `DswRow` type from `./service-tab`
- Produces: `export default function ScorePanel(props: ScorePanelProps)` — used in Task 4

```typescript
// Exact prop type — Task 4 must match this exactly
export type ScorePanelProps = {
  // Ryde
  rydeAvg: number | null;
  reviewCount: number;
  reviews: Array<{
    id: number;
    rating: number;
    comment: string | null;
    date: string;
    riderName: string | null;
  }>;
  leaderboard: Array<{
    driverId: string;
    name: string;
    avg: number;
    reviewCount: number;
  }>;
  currentDriverId: string;
  // Service (DSW)
  serviceRows: import("./service-tab").DswRow[];
  showDsw: boolean;
};
```

- [ ] **Step 1: Create the file with full component**

Create `app/driver/score-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Star, Trophy, MessageSquare, BarChart2 } from "lucide-react";
import ServiceTab, { type DswRow } from "./service-tab";

export type ScorePanelProps = {
  rydeAvg: number | null;
  reviewCount: number;
  reviews: Array<{
    id: number;
    rating: number;
    comment: string | null;
    date: string;
    riderName: string | null;
  }>;
  leaderboard: Array<{
    driverId: string;
    name: string;
    avg: number;
    reviewCount: number;
  }>;
  currentDriverId: string;
  serviceRows: DswRow[];
  showDsw: boolean;
};

type ScoreSection = "score" | "leaderboard" | "reviews" | "service";

const SCORE_SECTIONS: { key: ScoreSection; label: string; icon: typeof Star }[] = [
  { key: "score", label: "Score", icon: Star },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "reviews", label: "Reviews", icon: MessageSquare },
  { key: "service", label: "Service", icon: BarChart2 },
];

const RATING_FILTERS = ["All", "5★", "4★", "3★", "2★", "1★"] as const;
type RatingFilter = (typeof RATING_FILTERS)[number];

export default function ScorePanel({
  rydeAvg,
  reviewCount,
  reviews,
  leaderboard,
  currentDriverId,
  serviceRows,
  showDsw,
}: ScorePanelProps) {
  const [section, setSection] = useState<ScoreSection>("score");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("All");

  const filteredReviews =
    ratingFilter === "All"
      ? reviews
      : reviews.filter((r) => r.rating === parseInt(ratingFilter));

  const myLeaderboardEntry = leaderboard.find((e) => e.driverId === currentDriverId);

  return (
    <div className="flex flex-col">
      {/* Sub-nav pills */}
      <div className="flex gap-2 px-4 pt-4 pb-3 overflow-x-auto no-scrollbar">
        {SCORE_SECTIONS.filter(
          (s) => s.key !== "service" || showDsw
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
              section === key
                ? "text-white"
                : "bg-slate-100 text-slate-500"
            }`}
            style={section === key ? { backgroundColor: "var(--brand)" } : {}}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Score section */}
      {section === "score" && (
        <div className="px-4 pb-6 flex flex-col gap-4">
          {rydeAvg !== null ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col items-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {/* Score ring */}
              <div className="relative w-32 h-32 mb-4">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.PI * 100}`}
                    strokeDashoffset={`${Math.PI * 100 * (1 - rydeAvg / 5)}`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[32px] font-extrabold text-slate-900 leading-none">
                    {rydeAvg.toFixed(1)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    / 5.0
                  </span>
                </div>
              </div>
              <p className="text-[13px] text-slate-500">
                Based on{" "}
                <span className="font-bold text-slate-700">{reviewCount}</span>{" "}
                {reviewCount === 1 ? "review" : "reviews"}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 flex flex-col items-center text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Star className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-[15px] font-bold text-slate-700">No score yet</p>
              <p className="text-[13px] text-slate-400 mt-1">Complete rides to earn your Ryde rating</p>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard section */}
      {section === "leaderboard" && (
        <div className="px-4 pb-6 flex flex-col gap-2">
          {leaderboard.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-[15px] font-bold text-slate-700">No data yet</p>
            </div>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.driverId === currentDriverId;
              return (
                <div
                  key={entry.driverId}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 ${
                    isMe
                      ? "border-2 text-white"
                      : "bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  }`}
                  style={isMe ? { borderColor: "var(--brand)", backgroundColor: "var(--brand)" } : {}}
                >
                  <span
                    className={`text-[14px] font-extrabold w-6 text-center shrink-0 ${
                      isMe ? "text-white/70" : "text-slate-400"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-bold truncate ${isMe ? "text-white" : "text-slate-800"}`}>
                      {entry.name}
                      {isMe && (
                        <span className="ml-2 text-[11px] font-semibold opacity-80">You</span>
                      )}
                    </p>
                    <p className={`text-[12px] ${isMe ? "text-white/70" : "text-slate-400"}`}>
                      {entry.reviewCount} {entry.reviewCount === 1 ? "review" : "reviews"}
                    </p>
                  </div>
                  <span className={`text-[16px] font-extrabold shrink-0 ${isMe ? "text-white" : "text-slate-900"}`}>
                    {entry.avg.toFixed(1)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Reviews section */}
      {section === "reviews" && (
        <div className="flex flex-col">
          {/* Filter pills */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {RATING_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setRatingFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  ratingFilter === f
                    ? "text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
                style={ratingFilter === f ? { backgroundColor: "var(--brand)" } : {}}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="px-4 pb-6 flex flex-col gap-3">
            {filteredReviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-[15px] font-bold text-slate-700">No reviews yet</p>
              </div>
            ) : (
              filteredReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-white rounded-2xl border border-slate-200/80 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">{review.date}</span>
                  </div>
                  {review.comment && (
                    <p className="text-[13px] text-slate-700 leading-relaxed">{review.comment}</p>
                  )}
                  {review.riderName && (
                    <p className="text-[11px] text-slate-400 mt-1.5">— {review.riderName}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Service/DSW section */}
      {section === "service" && showDsw && (
        <div className="px-4 pb-6">
          <ServiceTab rows={serviceRows} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: no errors related to `score-panel.tsx`

- [ ] **Step 3: Commit**

```bash
git add app/driver/score-panel.tsx
git commit -m "feat: add ScorePanel component (Ryde avg, leaderboard, reviews, DSW)"
```

---

### Task 3: MePanel component

**Files:**
- Create: `app/driver/me-panel.tsx`

**Interfaces:**
- Consumes: `MaintenanceTab` from `./maintenance-tab`
- Produces: `export default function MePanel(props: MePanelProps)` — used in Task 4

```typescript
// Exact prop type — Task 4 must match this exactly
export type MePanelProps = {
  // Milestones
  showMilestones: boolean;
  milestones: Array<{
    id: number;
    label: string;
    target: number;
    progress: number;
    unit: string;
    earned: boolean;
    rewardDescription: string | null;
  }>;
  bonuses: Array<{
    id: number;
    label: string;
    amount: number;
    earned: boolean;
    date: string | null;
  }>;
  // Account
  driverName: string;
  driverUsername: string;
  onChangeUsername: (newUsername: string) => Promise<{ error?: string }>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  // Maintenance form prop passthrough
  driverId: string;
  vehicles: Array<{ id: number; unitNumber: string }>;
};
```

- [ ] **Step 1: Create the file with full component**

Create `app/driver/me-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Trophy, Gift, Wrench, User, ChevronRight, CheckCircle2, Lock } from "lucide-react";
import MaintenanceTab from "./maintenance-tab";

export type MePanelProps = {
  showMilestones: boolean;
  milestones: Array<{
    id: number;
    label: string;
    target: number;
    progress: number;
    unit: string;
    earned: boolean;
    rewardDescription: string | null;
  }>;
  bonuses: Array<{
    id: number;
    label: string;
    amount: number;
    earned: boolean;
    date: string | null;
  }>;
  driverName: string;
  driverUsername: string;
  onChangeUsername: (newUsername: string) => Promise<{ error?: string }>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  driverId: string;
  vehicles: Array<{ id: number; unitNumber: string }>;
};

type MeSection = "milestones" | "maintenance" | "account";

export default function MePanel({
  showMilestones,
  milestones,
  bonuses,
  driverName,
  driverUsername,
  onChangeUsername,
  onChangePassword,
  driverId,
  vehicles,
}: MePanelProps) {
  const defaultSection: MeSection = showMilestones ? "milestones" : "maintenance";
  const [section, setSection] = useState<MeSection>(defaultSection);

  // Account form state
  const [newUsername, setNewUsername] = useState("");
  const [usernameMsg, setUsernameMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ error: boolean; text: string } | null>(null);

  const ME_SECTIONS: { key: MeSection; label: string; icon: typeof Trophy }[] = [
    ...(showMilestones ? [{ key: "milestones" as const, label: "Milestones", icon: Trophy }] : []),
    { key: "maintenance", label: "Maintenance", icon: Wrench },
    { key: "account", label: "Account", icon: User },
  ];

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsernameMsg(null);
    if (!newUsername.trim()) return;
    const result = await onChangeUsername(newUsername.trim());
    if (result.error) {
      setUsernameMsg({ error: true, text: result.error });
    } else {
      setUsernameMsg({ error: false, text: "Username updated!" });
      setNewUsername("");
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ error: true, text: "Passwords don't match" });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ error: true, text: "Password must be at least 6 characters" });
      return;
    }
    const result = await onChangePassword(currentPw, newPw);
    if (result.error) {
      setPwMsg({ error: true, text: result.error });
    } else {
      setPwMsg({ error: false, text: "Password updated!" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  const earnedMilestones = milestones.filter((m) => m.earned);
  const inProgressMilestones = milestones.filter((m) => !m.earned);
  const earnedBonuses = bonuses.filter((b) => b.earned);

  return (
    <div className="flex flex-col">
      {/* Sub-nav pills */}
      <div className="flex gap-2 px-4 pt-4 pb-3 overflow-x-auto no-scrollbar">
        {ME_SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
              section === key ? "text-white" : "bg-slate-100 text-slate-500"
            }`}
            style={section === key ? { backgroundColor: "var(--brand)" } : {}}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Milestones section */}
      {section === "milestones" && showMilestones && (
        <div className="px-4 pb-6 flex flex-col gap-4">
          {inProgressMilestones.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                In Progress
              </p>
              <div className="flex flex-col gap-2">
                {inProgressMilestones.map((m) => {
                  const pct = Math.min((m.progress / m.target) * 100, 100);
                  return (
                    <div
                      key={m.id}
                      className="bg-white rounded-2xl border border-slate-200/80 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[14px] font-bold text-slate-800">{m.label}</p>
                        <span className="text-[12px] font-semibold text-slate-400">
                          {m.progress}/{m.target} {m.unit}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: "var(--brand)" }}
                        />
                      </div>
                      {m.rewardDescription && (
                        <p className="text-[11px] text-slate-400 mt-1.5">🎁 {m.rewardDescription}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {earnedMilestones.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Earned
              </p>
              <div className="flex flex-col gap-2">
                {earnedMilestones.map((m) => (
                  <div
                    key={m.id}
                    className="bg-emerald-50 rounded-2xl border border-emerald-100 px-4 py-3.5 flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-emerald-800">{m.label}</p>
                      {m.rewardDescription && (
                        <p className="text-[12px] text-emerald-600 mt-0.5">{m.rewardDescription}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {earnedBonuses.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Bonuses
              </p>
              <div className="flex flex-col gap-2">
                {earnedBonuses.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3.5 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  >
                    <Gift className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-slate-800">{b.label}</p>
                      {b.date && <p className="text-[11px] text-slate-400 mt-0.5">{b.date}</p>}
                    </div>
                    <span className="text-[15px] font-extrabold text-emerald-600">${b.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {milestones.length === 0 && bonuses.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-[15px] font-bold text-slate-700">No milestones yet</p>
              <p className="text-[13px] text-slate-400 mt-1">Keep delivering to unlock rewards</p>
            </div>
          )}
        </div>
      )}

      {/* Maintenance section */}
      {section === "maintenance" && (
        <div className="px-4 pb-6">
          <MaintenanceTab driverId={driverId} vehicles={vehicles} />
        </div>
      )}

      {/* Account section */}
      {section === "account" && (
        <div className="px-4 pb-6 flex flex-col gap-5">
          {/* Info */}
          <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Signed in as
            </p>
            <p className="text-[18px] font-extrabold text-slate-900">{driverName}</p>
            <p className="text-[13px] text-slate-500 mt-0.5">@{driverUsername}</p>
          </div>

          {/* Change username */}
          <form onSubmit={handleUsernameSubmit} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[13px] font-bold text-slate-700 mb-3">Change Username</p>
            <input
              type="text"
              placeholder="New username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 mb-2"
              style={{ "--tw-ring-color": "var(--brand)" } as React.CSSProperties}
            />
            {usernameMsg && (
              <p className={`text-[12px] mb-2 ${usernameMsg.error ? "text-red-500" : "text-emerald-600"}`}>
                {usernameMsg.text}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Update Username
            </button>
          </form>

          {/* Change password */}
          <form onSubmit={handlePasswordSubmit} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[13px] font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Change Password
            </p>
            {[
              { placeholder: "Current password", value: currentPw, onChange: setCurrentPw },
              { placeholder: "New password", value: newPw, onChange: setNewPw },
              { placeholder: "Confirm new password", value: confirmPw, onChange: setConfirmPw },
            ].map(({ placeholder, value, onChange }) => (
              <input
                key={placeholder}
                type="password"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 mb-2"
                style={{ "--tw-ring-color": "var(--brand)" } as React.CSSProperties}
              />
            ))}
            {pwMsg && (
              <p className={`text-[12px] mb-2 ${pwMsg.error ? "text-red-500" : "text-emerald-600"}`}>
                {pwMsg.text}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Update Password
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: no errors related to `me-panel.tsx`

- [ ] **Step 3: Commit**

```bash
git add app/driver/me-panel.tsx
git commit -m "feat: add MePanel component (milestones, maintenance, account)"
```

---

### Task 4: Refactor driver-tabs.tsx + update profile-button.tsx

**Files:**
- Modify: `app/driver/driver-tabs.tsx`
- Modify: `app/driver/profile-button.tsx`

**Interfaces:**
- Consumes: `HomeTab` + `HomeTabProps` from `./home-tab`, `ScorePanel` + `ScorePanelProps` from `./score-panel`, `MePanel` + `MePanelProps` from `./me-panel`
- The existing props from `app/driver/page.tsx` must remain unchanged

**Before editing:** Read the current file to understand what to keep vs. remove:

```bash
# Identify More-sheet related code to delete
grep -n "moreTabs\|moreOpen\|More\|sheet" app/driver/driver-tabs.tsx | head -50
# Identify dock rendering to replace
grep -n "dockTabs\|DockTab\|dock" app/driver/driver-tabs.tsx | head -30
# Identify password/username state to move to MePanel
grep -n "newUsername\|newPassword\|changeUsername\|changePassword" app/driver/driver-tabs.tsx | head -30
```

- [ ] **Step 1: Read current driver-tabs.tsx before editing**

```bash
# Read the file so the editor can make precise replacements
wc -l app/driver/driver-tabs.tsx
```

Then use Read tool on `app/driver/driver-tabs.tsx`.

- [ ] **Step 2: Update the tab type**

Find the existing tab union type (e.g. `"score" | "schedule" | "service" | ...`) and replace it with:

```typescript
type DriverTab = "home" | "schedule" | "codes" | "score" | "me";
```

- [ ] **Step 3: Replace dockTabs / More state with new 5-tab dock items**

Remove:
- `moreTabs` array
- `moreOpen` state + setter
- `showMore` / More button logic

Add above the return statement:

```typescript
type DockItem = {
  key: DriverTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeIcon: React.ComponentType<{ className?: string }>;
};

// Import at top of file (add to existing lucide-react import):
// Home, HomeIcon, CalendarDays, Key, Star, User
// (use outline for inactive, solid fill via className for active)
const dockItems: DockItem[] = [
  { key: "home",     label: "Home",     icon: HomeIcon,      activeIcon: HomeIcon      },
  { key: "schedule", label: "Schedule", icon: CalendarDays,  activeIcon: CalendarDays  },
  { key: "codes",    label: "Codes",    icon: Key,           activeIcon: Key           },
  ...(showRyde ? [{ key: "score" as DriverTab, label: "Score", icon: Star, activeIcon: Star }] : []),
  { key: "me",       label: "Me",       icon: User,          activeIcon: User          },
];
```

Note: lucide-react doesn't have separate outline/fill variants — use `fill-current` on the active icon via className to simulate filled state.

- [ ] **Step 4: Add imports for new panel components**

At the top of the file, add:

```typescript
import HomeTab from "./home-tab";
import ScorePanel from "./score-panel";
import MePanel from "./me-panel";
import { Home as HomeIcon, CalendarDays, Key, Star, User } from "lucide-react";
```

Remove any imports that are now dead (e.g. `ServiceTab`, `MaintenanceTab` if no longer used directly in this file — they are now used inside ScorePanel/MePanel).

- [ ] **Step 5: Replace tab content rendering**

Remove the old `if (tab === "service")`, `if (tab === "maintenance")`, `if (tab === "reviews")`, `if (tab === "milestones")`, `if (tab === "bonuses")`, `if (tab === "leaderboard")`, `if (tab === "account")` blocks.

Replace with:

```tsx
{tab === "home" && (
  <HomeTab
    driverName={driverName}
    streakDays={streakDays}
    scheduleToday={scheduleToday}
    rydeAvg={rydeAvg}
    reviewCount={reviews.length}
    leaderboardRank={leaderboardRank}
    vehicleNumber={vehicleNumber}
    workAreaName={workAreaName}
    showRyde={showRyde}
    onNavigate={(dest) => setTab(dest)}
  />
)}

{tab === "schedule" && (
  /* existing schedule JSX — keep as-is */
)}

{tab === "codes" && (
  /* existing gate codes JSX — keep as-is */
)}

{tab === "score" && showRyde && (
  <ScorePanel
    rydeAvg={rydeAvg}
    reviewCount={reviews.length}
    reviews={reviews}
    leaderboard={leaderboard}
    currentDriverId={driverId}
    serviceRows={serviceRows}
    showDsw={showDsw}
  />
)}

{tab === "me" && (
  <MePanel
    showMilestones={showMilestones}
    milestones={milestones}
    bonuses={bonuses}
    driverName={driverName}
    driverUsername={driverUsername}
    onChangeUsername={handleChangeUsername}
    onChangePassword={handleChangePassword}
    driverId={driverId}
    vehicles={vehicles}
  />
)}
```

Note: `handleChangeUsername` and `handleChangePassword` are the existing server-action wrappers already in `driver-tabs.tsx` — keep them in this file and pass as props to `MePanel`.

- [ ] **Step 6: Replace the dock JSX**

Remove the old dock (More button + sheet + `dockTabs.map(...)`) and replace with:

```tsx
{/* Bottom dock */}
<nav
  className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 flex z-40"
  style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
>
  {dockItems.map(({ key, label, icon: Icon }) => {
    const active = tab === key;
    return (
      <button
        key={key}
        onClick={() => setTab(key)}
        className="flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 relative gap-0.5"
      >
        {/* Active indicator bar */}
        {active && (
          <span
            className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
            style={{ backgroundColor: "var(--brand)" }}
          />
        )}
        <Icon
          className={`w-5 h-5 transition-colors ${active ? "fill-current" : "text-slate-400"}`}
          style={active ? { color: "var(--brand)" } : {}}
        />
        <span
          className={`text-[10px] font-semibold transition-colors ${active ? "" : "text-slate-400"}`}
          style={active ? { color: "var(--brand)" } : {}}
        >
          {label}
        </span>
      </button>
    );
  })}
</nav>
```

- [ ] **Step 7: Update goTab / event listener to map "account" → "me" and "service"/"maintenance"/"reviews"/"milestones"/"bonuses"/"leaderboard" → appropriate new tabs**

Find the `mgops:goto-driver-tab` event listener and the `goTab` function. Update the handler:

```typescript
function goTab(t: string) {
  // Map legacy tab names to new 5-tab names
  const legacyMap: Record<string, DriverTab> = {
    account: "me",
    service: "score",
    maintenance: "me",
    reviews: "score",
    milestones: "me",
    bonuses: "me",
    leaderboard: "score",
  };
  const resolved = (legacyMap[t] ?? t) as DriverTab;
  if (["home", "schedule", "codes", "score", "me"].includes(resolved)) {
    setTab(resolved);
  }
}
```

- [ ] **Step 8: Update profile-button.tsx**

In `app/driver/profile-button.tsx`, find the line dispatching `"account"`:

```typescript
new CustomEvent("mgops:goto-driver-tab", { detail: "account" })
```

Change `"account"` to `"me"`:

```typescript
new CustomEvent("mgops:goto-driver-tab", { detail: "me" })
```

- [ ] **Step 9: Set default tab to "home"**

Find the `useState` call for tab and change the initial value:

```typescript
// Before:
const [tab, setTab] = useState<DriverTab>("score");  // or whatever it was
// After:
const [tab, setTab] = useState<DriverTab>("home");
```

- [ ] **Step 10: Verify build**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit --project tsconfig.json 2>&1 | head -50
```

Expected: no TypeScript errors. Fix any that appear (likely missing prop names or import paths).

- [ ] **Step 11: Commit**

```bash
git add app/driver/driver-tabs.tsx app/driver/profile-button.tsx
git commit -m "feat: refactor driver portal to 5-tab dock; remove More sheet; wire HomeTab, ScorePanel, MePanel"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered by |
|-----------------|------------|
| 5-tab dock (Home/Schedule/Codes/Score/Me) | Task 4 step 6 |
| Score tab hidden when `showRyde === false` | Task 4 step 3 (conditional spread) |
| Home: greeting + date | Task 1 HomeTab |
| Home: today shift card | Task 1 HomeTab |
| Home: streak badge | Task 1 HomeTab |
| Home: rank pill | Task 1 HomeTab |
| Home: Ryde score ring | Task 2 ScorePanel (score section) + Task 1 tile |
| Home: work area badge | Task 1 HomeTab |
| Schedule tab: unchanged | Task 4 step 5 (kept as-is) |
| Codes tab: unchanged | Task 4 step 5 (kept as-is) |
| Score: Ryde avg, leaderboard, reviews, DSW stats | Task 2 ScorePanel |
| Me: Milestones + bonuses (when showMilestones) | Task 3 MePanel |
| Me: Maintenance request form | Task 3 MePanel |
| Me: Account (username + password change) | Task 3 MePanel |
| Active tab: filled icon + brand label + top bar | Task 4 step 6 |
| Inactive tab: outline icon + muted label | Task 4 step 6 |
| No More button or sheet | Task 4 step 3/5 |
| Props from page.tsx unchanged | Task 4 (passthrough, no new props added to page) |
| No new API routes / DB / dependencies | All tasks — confirmed |

### Type consistency

- `HomeTabProps.onNavigate: (tab: "schedule" | "codes" | "score" | "me") => void` — matches Task 4 call `onNavigate={(dest) => setTab(dest)}`
- `ScorePanelProps.serviceRows: DswRow[]` — `DswRow` re-exported from `./service-tab`, matches Task 2 import
- `MePanelProps.onChangeUsername/onChangePassword` — wrappers kept in `driver-tabs.tsx`, passed as props
- `DriverTab` union = `"home" | "schedule" | "codes" | "score" | "me"` — used in all 4 tasks consistently
- `goTab` legacy map covers all old tab names → new tab names
