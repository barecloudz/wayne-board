# Badge Celebration & Driver Portal Leaderboard Fixes — Design Spec
_wayneboard / MyGroundOps · 2026-09-23_

---

## Overview

Four improvements to the driver portal and admin dashboard:

1. **Badge celebration overlay** — when a driver logs in with unseen badges, show a full-screen confetti + badge reveal overlay with a "Claim your badge!" button. On dismiss, new badges glow into the shelf.
2. **Driver portal leaderboard → ILS%** — replace the Ryde star rating leaderboard with DSW ILS% rankings so badges and leaderboard use the same metric.
3. **Admin leaderboard nav fix** — the leaderboard page is missing `AppShell`, so there's no sidebar navigation. Wrap it correctly.
4. **Streak label rename** — rename "streak" to "Clean Streak" with a subtitle explaining what it measures.

---

## Part 1 — Badge Celebration Overlay

### Data Model Change

Add `seenAt` nullable timestamp to `driverBadges`:

```sql
ALTER TABLE "driverBadges" ADD COLUMN "seenAt" timestamp;
```

`NULL` = driver has never seen this badge. Stamped when they claim it via the overlay.

### Server Actions (additions to `lib/actions/badges.ts`)

| action | description |
|---|---|
| `getUnseenBadges(driverId)` | Returns `DriverBadgeRow[]` where `seenAt IS NULL`, org-scoped |
| `markBadgesSeen(badgeIds: number[])` | Sets `seenAt = now()` for the given badge IDs, org-scoped |

### Flow

1. `app/driver/page.tsx` calls `getUnseenBadges(session.driverId)` in the existing `Promise.all`
2. If `unseenBadges.length > 0`, pass them through `DriverTabs` → `BadgeCelebrationOverlay`
3. Overlay renders full-screen on top of everything (`z-[100]`)
4. Driver taps "Claim your badge!" → `markBadgesSeen(unseenBadges.map(b => b.id))` called optimistically → overlay animates out → `onClaim()` fires → shelf glows
5. Next login: no unseen badges → no overlay

### `app/driver/badge-celebration.tsx` — New Component

**Props:**
```ts
type Props = {
  badges: DriverBadgeRow[];   // all unseen badges to celebrate
  onClaim: () => void;        // called after dismiss animation completes
}
```

**Overlay structure:**
```
fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6
  └── card (max-w-sm w-full, bg-slate-900, rounded-3xl, relative overflow-hidden)
        ├── confetti layer (absolute inset-0, pointer-events-none, 50 particles)
        ├── "🏆 You earned a badge!" heading (text-white, font-extrabold)
        ├── badge cards (flex row, centered, gap-3, staggered reveal)
        │     └── each: icon (48px) + shine effect + badge name + week label
        └── "Claim your badge!" button (amber-500, pulsing glow ring)
```

**Animations (pure CSS, no library):**

```css
/* Confetti particles — 50 divs with randomized inline styles */
@keyframes confetti-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
}

/* Badge spring-in — staggered per badge index */
@keyframes badge-pop {
  0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
  70%  { transform: scale(1.15) rotate(2deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

/* Button pulse */
@keyframes btn-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
  50%       { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
}

/* Overlay dismiss */
@keyframes overlay-out {
  to { opacity: 0; transform: scale(0.95); }
}
```

**Confetti implementation:** 50 `<div>` elements, each with randomized `left` (0–100%), `animationDelay` (0–1s), `animationDuration` (1–2.5s), `backgroundColor` cycling through gold / amber / white / slate-300. Generated once on mount via `useMemo`. No canvas, no library.

**Badge stagger:** each badge card gets `animationDelay: index * 150 + 'ms'`.

**Dismiss sequence:**
1. User clicks button → `markBadgesSeen(ids)` called (fire-and-forget, don't await)
2. Component sets `dismissing = true` → overlay plays `overlay-out` (300ms, `animation-fill-mode: forwards`)
3. After 300ms (`setTimeout`) → `onClaim()` fires
4. Parent sets `claimedIds = unseenBadges.map(b => b.id)` and removes overlay from DOM

### Score Panel — Shelf Glow

**New prop on `score-panel.tsx`:** `newBadgeIds?: number[]`

Each badge in the shelf whose `id` is in `newBadgeIds` gets the `badge-new-glow` class applied:

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

**State management in `driver-tabs.tsx`:**
- `const [claimedIds, setClaimedIds] = useState<number[]>([])`
- Passed as `newBadgeIds` to ScorePanel
- Set inside `onClaim` callback from the celebration overlay

---

## Part 2 — Driver Portal Leaderboard → ILS%

### Change

Replace `getLeaderboard()` (Ryde stars) with `computeTopDrivers()` (DSW ILS%) as the driver-facing leaderboard data source.

**`app/driver/page.tsx`:**
- Remove `getLeaderboard()` import and call
- Add `computeTopDrivers(weekStart, weekEnd)` using the most recently completed week:
  - `weekStart` = Monday of the most recently completed week (same logic as admin Award tab: find last Monday before today)
  - `weekEnd` = Sunday of that same week
- Pass result as `leaderboard` prop

**`app/driver/driver-tabs.tsx`:** update leaderboard mapping:
```ts
// Before (Ryde):
{ driverId: entry.driverId, name: entry.initials, avg: entry.avgScore, reviewCount: entry.weeks }

// After (ILS%):
const driverNameMap = new Map(allDrivers.map(d => [d.driverId, d.name]));
{
  driverId: entry.driverId,
  name: driverNameMap.get(entry.driverId) ?? entry.driverId,
  avg: entry.avgIls,
  reviewCount: entry.dayCount
}
```

`allDrivers` is already fetched for the avatar map — reuse it.

**`app/driver/score-panel.tsx`:** update column labels:
- "Avg Rating" / star display → "Avg ILS%"
- "Reviews" / "weeks" → "Days"
- Empty state when `leaderboard.length === 0`: "No ILS data for this week yet"

Ryde scores remain on the driver's personal score card (the score ring + history) — just removed from the ranking table.

---

## Part 3 — Admin Leaderboard Nav Fix

**`app/dashboard/leaderboard/page.tsx`:**

```tsx
import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [badgeTypes, history, allDrivers] = await Promise.all([...]);

  return (
    <AppShell session={session}>
      <LeaderboardClient ... />
    </AppShell>
  );
}
```

Check `AppShell`'s prop signature first — other dashboard pages show the exact pattern to follow.

---

## Part 4 — Streak Label Rename

**`app/driver/home-tab.tsx`:**

Find the streak display element. Change:
- Main label: `"Streak"` → `"Clean Streak"`
- Add subtitle below the day count: `"days without an at-fault review"` (text-xs, text-slate-400)

---

## Migration

One Drizzle migration: add `seenAt timestamp` (nullable, no default) to `driverBadges`.

---

## Files Created / Modified

| file | change |
|---|---|
| `lib/schema.ts` | Add `seenAt` nullable timestamp to `driverBadges` |
| `drizzle/` | Migration for seenAt column |
| `lib/actions/badges.ts` | Add `getUnseenBadges()`, `markBadgesSeen()` |
| `app/driver/page.tsx` | Fetch unseen badges; swap getLeaderboard → computeTopDrivers |
| `app/driver/driver-tabs.tsx` | Pass unseen/claimed badge ids; update leaderboard mapping |
| `app/driver/badge-celebration.tsx` | New — confetti overlay with badge reveal |
| `app/driver/score-panel.tsx` | Accept newBadgeIds for glow; update leaderboard column labels |
| `app/driver/home-tab.tsx` | Rename streak label + add subtitle |
| `app/dashboard/leaderboard/page.tsx` | Wrap in AppShell + session guard |

---

## Out of Scope

- Ryde leaderboard (will be re-introduced later as a separate tab)
- Push notifications for badge awards
- Sound effects
- Per-org animation disable toggle
- Admin preview of celebration animation
