# Badge Celebration & Portal Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen confetti + badge reveal overlay when drivers log in with unseen badges, fix the driver portal leaderboard to use ILS% instead of Ryde stars, fix the admin leaderboard page missing nav shell, and rename the streak label.

**Architecture:** Add `seenAt` to `driverBadges` to track seen state; new `BadgeCelebrationOverlay` client component renders on login if unseen badges exist; driver portal page swaps `getLeaderboard()` for `computeTopDrivers()`; admin leaderboard page wrapped in `AppShell`. All animations are pure CSS `@keyframes` — no animation library.

**Tech Stack:** Next.js App Router, Drizzle ORM + PostgreSQL, React `useTransition`, Tailwind CSS, pure CSS animations

**Spec:** `docs/superpowers/specs/2026-09-23-badge-celebration-design.md`

## Global Constraints

- Every DB query must include `organizationId` filter — multi-tenant, no exceptions
- `revalidatePath("/driver")` after every server action write
- No animation libraries — pure CSS `@keyframes` only
- Confetti: 30 particles max (mobile performance)
- Drizzle migration generated via `npx drizzle-kit generate`, applied via Neon client (NOT `npm run db:migrate` — hangs on Windows)
- `"use server"` on all server actions, `"use client"` on all interactive components
- TypeScript must compile clean: `npx tsc --noEmit` exit 0 before every commit

---

### Task 1: Schema + Migration — Add `seenAt` to `driverBadges`

**Files:**
- Modify: `lib/schema.ts`
- Run: `npx drizzle-kit generate` → new file in `drizzle/`
- Run: migration via Neon client

**Interfaces:**
- Produces: `driverBadges.seenAt` nullable timestamp column in DB and Drizzle types

- [ ] **Step 1: Read the driverBadges table definition**

Open `lib/schema.ts` and find the `driverBadges` table (around line 642). Read its current column list.

- [ ] **Step 2: Add seenAt column**

Inside the `driverBadges` pgTable column object, add after `awardedAt`:

```ts
seenAt: timestamp("seenAt"),
```

The full table should now look like:
```ts
export const driverBadges = pgTable("driverBadges", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull().references(() => organizations.id),
  driverId:       text("driverId").notNull(),
  badgeTypeId:    integer("badgeTypeId").notNull().references(() => badgeTypes.id),
  weekStart:      date("weekStart").notNull(),
  awardedAt:      timestamp("awardedAt").notNull().defaultNow(),
  seenAt:         timestamp("seenAt"),
}, (t) => ({
  orgBadgeWeekUniq: uniqueIndex("driverBadges_org_badgeType_week_uniq")
    .on(t.organizationId, t.badgeTypeId, t.weekStart),
}));
```

- [ ] **Step 3: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: new `.sql` file in `drizzle/` containing `ALTER TABLE "driverBadges" ADD COLUMN "seenAt" timestamp;`

- [ ] **Step 4: Apply migration via Neon client**

`npm run db:migrate` hangs on Windows. Check `scripts/` for an existing Neon migration script (look at `git log --oneline | head -15` and check what scripts were used in the previous badges migration). Run the generated SQL directly against the Neon database using that same pattern.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/schema.ts drizzle/
git commit -m "feat: add seenAt column to driverBadges for celebration tracking"
```

---

### Task 2: Badge Server Actions — `getUnseenBadges` + `markBadgesSeen`

**Files:**
- Modify: `lib/actions/badges.ts`

**Interfaces:**
- Consumes: `driverBadges`, `badgeTypes` from `lib/schema.ts`; `getSession` from `lib/session`; `db` from `lib/db`
- Produces:
  - `getUnseenBadges(driverId: string): Promise<DriverBadgeRow[]>` — rows where `seenAt IS NULL`, org-scoped, newest first
  - `markBadgesSeen(badgeIds: number[]): Promise<void>` — stamps `seenAt = new Date()` for given IDs, org-scoped, calls `revalidatePath("/driver")`

`DriverBadgeRow` is already defined in this file as:
```ts
export type DriverBadgeRow = {
  id: number;
  weekStart: string;
  badgeName: string;
  iconUrl: string | null;
  shine: boolean;
  category: string;
  awardedAt: Date;
}
```

- [ ] **Step 1: Read the bottom of lib/actions/badges.ts**

Find the last exported function (`getDriverBadgeCounts`) to know where to append.

- [ ] **Step 2: Check drizzle-orm imports**

At the top of `lib/actions/badges.ts`, find the `import { ... } from "drizzle-orm"` line. Check whether `isNull` and `inArray` are already imported. If not, add them.

- [ ] **Step 3: Add getUnseenBadges**

Append after `getDriverBadgeCounts`:

```ts
export async function getUnseenBadges(driverId: string): Promise<DriverBadgeRow[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:        driverBadges.id,
      weekStart: driverBadges.weekStart,
      badgeName: badgeTypes.name,
      iconUrl:   badgeTypes.iconUrl,
      shine:     badgeTypes.shine,
      category:  badgeTypes.category,
      awardedAt: driverBadges.awardedAt,
    })
    .from(driverBadges)
    .innerJoin(badgeTypes, and(eq(badgeTypes.id, driverBadges.badgeTypeId), eq(badgeTypes.organizationId, orgId)))
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        eq(driverBadges.driverId, driverId),
        isNull(driverBadges.seenAt),
      )
    )
    .orderBy(desc(driverBadges.awardedAt));
  return rows.map(r => ({ ...r, weekStart: String(r.weekStart).slice(0, 10) }));
}
```

- [ ] **Step 4: Add markBadgesSeen**

Append after `getUnseenBadges`:

```ts
export async function markBadgesSeen(badgeIds: number[]): Promise<void> {
  if (badgeIds.length === 0) return;
  const orgId = await requireOrg();
  await db
    .update(driverBadges)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        inArray(driverBadges.id, badgeIds),
      )
    );
  revalidatePath("/driver");
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/badges.ts
git commit -m "feat: getUnseenBadges and markBadgesSeen server actions"
```

---

### Task 3: `BadgeCelebrationOverlay` Component

**Files:**
- Create: `app/driver/badge-celebration.tsx`

**Interfaces:**
- Consumes: `DriverBadgeRow` type from `lib/actions/badges.ts`; `markBadgesSeen` server action from `lib/actions/badges.ts`
- Produces:
  - Default export `BadgeCelebrationOverlay`:
    ```ts
    type Props = {
      badges: DriverBadgeRow[];
      onClaim: (badgeIds: number[]) => void;
    }
    ```

- [ ] **Step 1: Create app/driver/badge-celebration.tsx**

```tsx
"use client";

import { useState, useMemo, useTransition } from "react";
import { Trophy } from "lucide-react";
import { markBadgesSeen } from "@/lib/actions/badges";
import type { DriverBadgeRow } from "@/lib/actions/badges";

type Props = {
  badges: DriverBadgeRow[];
  onClaim: (badgeIds: number[]) => void;
};

const CONFETTI_COLORS = ["#F59E0B", "#FBBF24", "#FCD34D", "#FFF", "#CBD5E1", "#F97316"];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

const celebrationStyles = `
  @keyframes confetti-fall {
    0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
  }
  @keyframes badge-pop {
    0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
    70%  { transform: scale(1.15) rotate(2deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes btn-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
    50%       { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
  }
  @keyframes overlay-out {
    to { opacity: 0; transform: scale(0.95); }
  }
  .celebration-overlay-exit {
    animation: overlay-out 300ms ease-out forwards;
  }
`;

export default function BadgeCelebrationOverlay({ badges, onClaim }: Props) {
  const [dismissing, setDismissing] = useState(false);
  const [, startTransition] = useTransition();

  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left:         `${randomBetween(2, 98)}%`,
      delay:        `${randomBetween(0, 1)}s`,
      duration:     `${randomBetween(1.2, 2.5)}s`,
      color:        CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:         `${randomBetween(6, 12)}px`,
      borderRadius: Math.random() > 0.5 ? "50%" : "2px",
    })),
  []);

  function handleClaim() {
    const ids = badges.map(b => b.id);
    setDismissing(true);
    startTransition(async () => {
      await markBadgesSeen(ids);
    });
    setTimeout(() => onClaim(ids), 300);
  }

  const heading = badges.length > 1
    ? `You earned ${badges.length} badges!`
    : "You earned a badge!";

  return (
    <>
      <style>{celebrationStyles}</style>
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className={`relative bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden px-6 py-8 flex flex-col items-center gap-6 ${dismissing ? "celebration-overlay-exit" : ""}`}>

          {/* Confetti layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map(p => (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: p.left,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  borderRadius: p.borderRadius,
                  animationName: "confetti-fall",
                  animationDuration: p.duration,
                  animationDelay: p.delay,
                  animationTimingFunction: "linear",
                  animationFillMode: "forwards",
                }}
              />
            ))}
          </div>

          {/* Heading */}
          <div className="text-center relative z-10">
            <p className="text-3xl mb-1">🏆</p>
            <p className="text-[22px] font-extrabold text-white leading-tight">{heading}</p>
          </div>

          {/* Badge cards — staggered pop */}
          <div className="flex flex-row flex-wrap justify-center gap-4 relative z-10">
            {badges.map((badge, i) => (
              <div
                key={badge.id}
                style={{
                  animationName: "badge-pop",
                  animationDuration: "500ms",
                  animationDelay: `${i * 150}ms`,
                  animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                  animationFillMode: "both",
                }}
                className="flex flex-col items-center gap-2 bg-white/10 rounded-2xl px-4 py-4 min-w-[88px]"
              >
                {badge.iconUrl
                  ? <img src={badge.iconUrl} alt={badge.badgeName} className="w-12 h-12 object-contain" />
                  : <Trophy className="w-12 h-12 text-amber-400" />
                }
                <p className="text-white font-bold text-[12px] text-center leading-tight">{badge.badgeName}</p>
                <p className="text-slate-400 text-[10px]">{badge.weekStart.slice(0, 7)}</p>
              </div>
            ))}
          </div>

          {/* Claim button */}
          <button
            onClick={handleClaim}
            disabled={dismissing}
            style={{ animationName: "btn-pulse", animationDuration: "2s", animationIterationCount: "infinite" }}
            className="relative z-10 w-full py-3.5 rounded-2xl bg-amber-500 text-white font-extrabold text-[15px] hover:bg-amber-400 transition-colors disabled:opacity-60"
          >
            Claim your badge!
          </button>

        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/driver/badge-celebration.tsx
git commit -m "feat: BadgeCelebrationOverlay component with confetti and badge reveal"
```

---

### Task 4: Wire Celebration + ILS% Leaderboard + Streak Rename

**Files:**
- Modify: `app/driver/page.tsx`
- Modify: `app/driver/driver-tabs.tsx`
- Modify: `app/driver/score-panel.tsx`
- Modify: `app/driver/home-tab.tsx`

**Interfaces:**
- Consumes:
  - `getUnseenBadges(driverId: string): Promise<DriverBadgeRow[]>` from Task 2
  - `computeTopDrivers(weekStart: string, weekEnd: string): Promise<TopDriverRow[]>` from `lib/actions/badges.ts`
    - `TopDriverRow = { driverId: string; driverName: string; avgIls: number; dayCount: number; unmappedCount: number }`
  - `BadgeCelebrationOverlay` from `app/driver/badge-celebration.tsx` (Task 3)
- Produces: complete wired driver portal

#### page.tsx

- [ ] **Step 1: Read app/driver/page.tsx fully (lines 1–160)**

Understand the complete `Promise.all` array, what index each item sits at, and the full destructuring line. You need to (a) add `getUnseenBadges`, (b) replace `getLeaderboard()` with `computeTopDrivers()`.

- [ ] **Step 2: Add week bounds helper**

After the imports block in `page.tsx`, add:

```ts
function getMostRecentWeekBounds(): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon…6=Sat
  // Walk back to the most recently completed Sunday
  const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - daysToLastSunday);
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);
  return {
    weekStart: lastMonday.toISOString().slice(0, 10),
    weekEnd:   lastSunday.toISOString().slice(0, 10),
  };
}
```

- [ ] **Step 3: Update imports**

Change the badges import line to:
```ts
import { getDriverBadges, getDriverBadgeCounts, getUnseenBadges, computeTopDrivers } from "@/lib/actions/badges";
```

Change the ryde import to remove `getLeaderboard` (keep the rest):
```ts
import { getCompanyRating, getRydeGoalMessage } from "@/lib/actions/ryde";
```

- [ ] **Step 4: Update Promise.all and destructuring**

In the `Promise.all`, replace:
```ts
getLeaderboard(),
```
with:
```ts
computeTopDrivers(getMostRecentWeekBounds().weekStart, getMostRecentWeekBounds().weekEnd),
```

Add `getUnseenBadges(session.driverId),` as the last entry in the `Promise.all` array.

Update the destructuring array to add `unseenBadges` at the new last position:
```ts
const [..., unseenBadges] = await Promise.all([...]);
```

- [ ] **Step 5: Pass unseenBadges to DriverTabs**

In the `<DriverTabs ... />` JSX, add:
```tsx
unseenBadges={unseenBadges}
```

#### driver-tabs.tsx

- [ ] **Step 6: Read driver-tabs.tsx top (lines 1–60) and lines 185–215**

Understand existing imports, props type, and the `scorePanelLeaderboard` mapping. The current `LeaderEntry` type is `{ driverId: string; initials: string; avgScore: number; weeks: number }`.

- [ ] **Step 7: Update driver-tabs.tsx imports and props**

Add to imports:
```ts
import { useState } from "react";
import BadgeCelebrationOverlay from "./badge-celebration";
import type { TopDriverRow } from "@/lib/actions/badges";
```

(Note: `DriverBadgeRow` is already imported from a prior task.)

Add to the props type object:
```ts
unseenBadges?: DriverBadgeRow[];
```

Add to the destructured props:
```ts
unseenBadges = [],
```

- [ ] **Step 8: Add celebration state**

Inside the component body, near the top, add:
```ts
const [claimedIds, setClaimedIds] = useState<number[]>([]);
const [showCelebration, setShowCelebration] = useState(unseenBadges.length > 0);
```

- [ ] **Step 9: Update scorePanelLeaderboard mapping**

Replace the existing mapping (which uses `entry.initials`, `entry.avgScore`, `entry.weeks`):

```ts
// leaderboard is now TopDriverRow[] from computeTopDrivers
const scorePanelLeaderboard = (leaderboard as TopDriverRow[]).map((entry) => ({
  driverId:    entry.driverId,
  name:        entry.driverName,
  avg:         entry.avgIls,
  reviewCount: entry.dayCount,
}));
```

Also remove or update the `LeaderEntry` type at the top of the file — it is no longer needed. Simply delete it.

- [ ] **Step 10: Render BadgeCelebrationOverlay**

In the JSX return, before the outermost tab container div, add:
```tsx
{showCelebration && unseenBadges.length > 0 && (
  <BadgeCelebrationOverlay
    badges={unseenBadges}
    onClaim={(ids) => {
      setClaimedIds(ids);
      setShowCelebration(false);
    }}
  />
)}
```

Pass `newBadgeIds` to ScorePanel (find the `<ScorePanel` JSX and add):
```tsx
newBadgeIds={claimedIds}
```

#### score-panel.tsx

- [ ] **Step 11: Read score-panel.tsx props type and style tag**

Find the props interface (around line 50) and the existing `<style>` tag (which has the shine-sweep keyframes from the previous badges feature).

- [ ] **Step 12: Add newBadgeIds prop**

Add to the props type:
```ts
newBadgeIds?: number[];
```

Add to destructured props:
```ts
newBadgeIds = [],
```

- [ ] **Step 13: Add glow CSS to existing style tag**

Inside the existing `<style>{...}</style>` string, append:
```css
@keyframes glow-fade {
  0%   { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.9), 0 0 20px rgba(245,158,11,0.4); }
  100% { box-shadow: 0 0 0 0px rgba(245, 158, 11, 0), 0 0 0px rgba(245,158,11,0); }
}
.badge-new-glow {
  animation: glow-fade 2s ease-out forwards;
  border-radius: 8px;
}
```

- [ ] **Step 14: Apply glow class to new badges in shelf**

Find the badge shelf rendering (around line 148 — the `myBadges.slice(0, 8).map(b => ...)` section). On the outermost element for each badge, add:
```tsx
className={`... ${newBadgeIds.includes(b.id) ? "badge-new-glow" : ""}`}
```

- [ ] **Step 15: Update leaderboard labels**

Find the leaderboard table in score-panel.tsx. Update:
- Column header for score: change to `"Avg ILS%"`
- Column header for count: change to `"Days"`
- Any ⭐ or star display next to scores: remove; scores are now percentages, display as `{entry.avg.toFixed(1)}%`
- Empty state message: change to `"No ILS data for this week yet"`

#### home-tab.tsx

- [ ] **Step 16: Rename streak in home-tab.tsx**

Find the streak block (around line 80):
```tsx
<p className="text-[15px] font-bold text-orange-800 leading-tight">
  {streakDays} day streak
</p>
<p className="text-[12px] text-orange-600 mt-0.5">Keep it going!</p>
```

Replace with:
```tsx
<p className="text-[15px] font-bold text-orange-800 leading-tight">
  🔥 Clean Streak — {streakDays} days
</p>
<p className="text-[12px] text-orange-600 mt-0.5">Days without an at-fault review</p>
```

- [ ] **Step 17: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0. Fix any type errors — common ones to watch for:
- `leaderboard` prop type mismatch (`LeaderEntry[]` vs `TopDriverRow[]`) — delete the old `LeaderEntry` type
- `myRank` calculation still works because `TopDriverRow` has `driverId`

- [ ] **Step 18: Commit**

```bash
git add app/driver/page.tsx app/driver/driver-tabs.tsx app/driver/score-panel.tsx app/driver/home-tab.tsx
git commit -m "feat: wire badge celebration overlay, ILS% leaderboard, streak rename"
```

---

### Task 5: Admin Leaderboard Nav Fix

**Files:**
- Modify: `app/dashboard/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `AppShell` from `@/components/app-shell`; `getSession` from `@/lib/session`; `redirect` from `next/navigation`
- Produces: leaderboard page with full dashboard sidebar navigation

- [ ] **Step 1: Read app/dashboard/leaderboard/page.tsx**

Note it currently renders `<LeaderboardClient>` with no AppShell or session check.

- [ ] **Step 2: Read the AppShell pattern from another page**

Run:
```bash
head -5 app/dashboard/payroll/page.tsx
```
and:
```bash
sed -n '59,65p' app/dashboard/payroll/page.tsx
```

Confirm `AppShell` takes no props besides `children`, and the session pattern is `getSession()` → `if (!session) redirect("/sign-in")`.

- [ ] **Step 3: Rewrite app/dashboard/leaderboard/page.tsx**

```tsx
export const dynamic = "force-dynamic";

import { getBadgeTypes, getBadgeHistory } from "@/lib/actions/badges";
import { getDrivers } from "@/lib/actions/drivers";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import LeaderboardClient from "./leaderboard-client";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [badgeTypes, history, allDrivers] = await Promise.all([
    getBadgeTypes(),
    getBadgeHistory(100),
    getDrivers(),
  ]);

  return (
    <AppShell>
      <LeaderboardClient
        initialBadgeTypes={badgeTypes}
        initialHistory={history}
        allDrivers={allDrivers}
      />
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit and push**

```bash
git add app/dashboard/leaderboard/page.tsx
git commit -m "fix: wrap admin leaderboard page in AppShell so nav is visible"
git push origin master
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `seenAt` column on `driverBadges` | Task 1 |
| `getUnseenBadges` server action | Task 2 |
| `markBadgesSeen` server action | Task 2 |
| Full-screen confetti overlay component | Task 3 |
| Badge reveal with staggered pop animation | Task 3 |
| "Claim your badge!" button with pulse | Task 3 |
| Overlay dismiss → onClaim fires | Task 3 |
| page.tsx fetches unseen badges | Task 4 |
| page.tsx swaps getLeaderboard → computeTopDrivers | Task 4 |
| driver-tabs.tsx shows celebration overlay | Task 4 |
| score-panel.tsx glows new badge ids | Task 4 |
| Leaderboard labels updated to ILS%/Days | Task 4 |
| Streak renamed to "Clean Streak" + subtitle | Task 4 |
| Admin leaderboard wrapped in AppShell | Task 5 |

All spec requirements covered. No placeholders. Types consistent: `DriverBadgeRow` (Tasks 2→3→4), `TopDriverRow` (Task 4 throughout), `onClaim: (badgeIds: number[]) => void` (Tasks 3→4), `newBadgeIds: number[]` (Task 4 driver-tabs → score-panel).
