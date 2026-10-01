# Competitive Leaderboard & Weekly Badge Awards Design

**Goal:** Make the driver portal genuinely competitive — drivers see their live weekly rank, earn badges automatically each week, and the driver who stacks the most weekly wins becomes Monthly Performer.

**Architecture:** Weekly badge awards are computed from existing DSW (ILS%) and Ryde review data, auto-awarded every Monday via a server action callable from a cron endpoint and an admin trigger button. Live standings are computed on-demand at portal load. The existing badge system (badge_types + driver_badges tables) is the storage layer — no new tables needed beyond seeded badge type rows.

**Tech Stack:** Drizzle ORM + Neon PostgreSQL, Next.js App Router server actions, existing `dswRouteDays` + `rydeReviews` + `drivers` + `driver_badges` + `badge_types` tables.

---

## Global Constraints

- All queries must be scoped by `organizationId` — no cross-org data leakage
- ILS% from `dswRouteDays.ilsPct`: **lower is better** (represents % of packages with ILS impact)
- Ryde score from `rydeReviews.stars`: **higher is better** (1–5 scale, Bayesian averaged, PRIOR = 5)
- `driver_badges.weekStart` stores the Monday of the award week in `YYYY-MM-DD` format
- Badge types are seeded per-org on first award run if not yet present — no migration gate
- Minimum 1 DSW data day in the week for ILS badge eligibility
- Minimum 1 Ryde review with matching week string for Top Rated badge eligibility
- Ties in ILS: driver with more DSW days in that week wins; still tied = both get the badge
- Ties in monthly badge count: all tied drivers earn Monthly Performer

---

## Badge Types (seeded)

Five badge type slugs introduced. Each org gets these rows inserted into `badge_types` on first run if not present:

| slug | name | category | description |
|------|------|----------|-------------|
| `weekly_ils_gold` | ILS Gold | weekly | Best ILS score of the week |
| `weekly_ils_silver` | ILS Silver | weekly | 2nd best ILS score of the week |
| `weekly_ils_bronze` | ILS Bronze | weekly | 3rd best ILS score of the week |
| `weekly_top_rated` | Top Rated | weekly | Highest customer rating of the week |
| `monthly_performer` | Monthly Performer | monthly | Most weekly badges earned this month |

---

## Section 1 — Weekly Award Computation

**Function:** `computeAndAwardWeeklyBadges(weekStart: string, orgId: number): Promise<AwardResult>`

`weekStart` is the Monday of the target week (`YYYY-MM-DD`). `weekEnd` is derived as `weekStart + 6 days`.

**ILS award logic:**
1. Query `dswRouteDays` where `date BETWEEN weekStart AND weekEnd` and `organizationId = orgId` and `driverId IS NOT NULL` and `ilsPct IS NOT NULL`
2. Group by `driverId`, compute `avgIls = sum(ilsPct) / count(days)` and `dayCount`
3. Sort ascending by `avgIls` (lower = better); secondary sort descending by `dayCount` for ties
4. Award Gold to rank 1, Silver to rank 2, Bronze to rank 3
5. Skip ranks if fewer drivers qualify (1 driver → Gold only; 2 drivers → Gold + Silver)
6. Deduplicate: if driver already has this badge for this `weekStart`, skip insertion

**Ryde award logic:**
1. Compute ISO week string for `weekStart` (e.g. `"2026-W40"`)
2. Query `rydeReviews` where `week = isoWeekStr` and `organizationId = orgId` and `stars IS NOT NULL`
3. Group by `driverId`, compute Bayesian avg: `(sum(stars) + 5 * globalMean) / (count + 5)` where `globalMean` is the mean across ALL org reviews (not just this week)
4. Driver with highest Bayesian avg wins; skip entirely if no qualifying reviews exist
5. Deduplicate same as above

**Monthly Performer logic (run on 1st of each month for prior month):**
1. Compute `monthStart` / `monthEnd` for prior month
2. Query `driver_badges` joined with `badge_types` where `category = 'weekly'` and `weekStart BETWEEN monthStart AND monthEnd` and `organizationId = orgId`
3. Count badges per `driverId`; find max count
4. All drivers at max count earn Monthly Performer badge with `weekStart = first day of that month`
5. Deduplicate: skip if Monthly Performer badge already exists for that month

**Return type:**
```typescript
type AwardResult = {
  week: string;
  ilsGold: string | null;
  ilsSilver: string | null;
  ilsBronze: string | null;
  topRated: string | null;
  monthlyPerformer: string[] | null;
  badgesInserted: number;
  skipped: number;
};
```

---

## Section 2 — Cron & Admin Trigger

**API route:** `POST /api/award-weekly-badges`
- Auth: session required, `isAdmin` must be true
- Body: `{ weekStart?: string }` — omit to default to previous Monday
- Calls `computeAndAwardWeeklyBadges` for the session's `organizationId`
- Returns `AwardResult` as JSON

**Netlify cron function:** `netlify/functions/cron-award-badges.mts`
- Runs every Monday at 6:00 AM ET (`0 11 * * 1` UTC)
- Iterates all active orgs, calls `computeAndAwardWeeklyBadges` for each
- Uses `CRON_SECRET` env var for auth (same pattern as existing cron functions)
- Also checks if today is the 1st of the month and runs monthly performer logic if so

---

## Section 3 — Live Weekly Standings

**Function:** `getWeeklyStandings(orgId: number): Promise<WeeklyStanding[]>`

```typescript
type WeeklyStanding = {
  driverId: string;
  driverName: string;
  ilsRank: number | null;      // 1-based; null if no DSW data this week
  avgIls: number | null;
  rydeRank: number | null;     // 1-based; null if no reviews this ISO week
  bayesianAvg: number | null;
  reviewCount: number;
};
```

- Uses current week Monday–today for ILS, current ISO week string for Ryde
- Sorted by `ilsRank` ascending; drivers with no ILS data sorted to bottom
- Called from `app/driver/page.tsx` (driver's own rank) and admin leaderboard page (full table)

**Driver portal display (added to `score-panel.tsx`):**
- ILS rank: `"#2 of 14 drivers this week"` — always shown when DSW data exists
- Ryde rank: `"#1 in customer ratings this week"` — only shown when driver has ≥1 review this ISO week
- Both are read-only display pills, no tap action

---

## Section 4 — Admin Leaderboard Page Updates

File: existing leaderboard client component

**New tabs added (existing tabs unchanged):**
1. **This Week** — live `WeeklyStanding[]` table: Rank / Driver / Avg ILS% / Ryde Avg / Reviews this week
2. **Monthly** — badge count leaderboard for current month: Rank / Driver / Total Badges / breakdown (🥇🥈🥉 counts)
3. **Award Badges** button — admin only, calls `POST /api/award-weekly-badges` for previous Monday, shows toast with `AwardResult` summary

---

## Section 5 — Driver Portal Live Rank Display

**File:** `app/driver/score-panel.tsx`

Add a "This Week" rank row above the existing Ryde score ring:
- ILS rank pill (always visible when data exists): `#2 this week` with subtle up/down delta vs previous week
- Ryde rank pill (only when ≥1 review this ISO week): `#1 rated`

`app/driver/page.tsx` calls `getWeeklyStandings()`, finds the session driver's entry, passes `ilsRank`, `rydeRank`, and `totalDrivers` count as new props to `DriverTabs` → `ScorePanel`.

---

## Self-Review

**Placeholder scan:** No TBDs — all functions have concrete signatures, field names, and exact values.

**Internal consistency:**
- `weekStart` format `YYYY-MM-DD` (Monday) used consistently with existing `driver_badges.weekStart`
- ISO week string (`YYYY-Www`) used only for Ryde — matches existing `rydeReviews.week` format
- `organizationId` scoping in every query
- Badge deduplication prevents double-awarding on re-runs

**Scope:** Single implementation plan covers this cleanly — no decomposition needed.

**Ambiguity:**
- "Lower ILS is better" — stated in Global Constraints
- Tie-breaking — dayCount tiebreaker for ILS defined; all-tied monthly performers all win
- "Prior month" boundary when running on the 1st — explicit
