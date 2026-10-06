# Badges & Leaderboard Controls — Design Spec
_wayneboard / MyGroundOps · 2026-09-23_

---

## Overview

Award top-3 ILS% performers each week with custom trophy badges. Badges accumulate on driver profiles permanently and are visible to all drivers on the leaderboard in the driver portal, alongside profile pictures. Admins configure badge types (uploadable icon + name, animated GIF/WebP supported, optional CSS shine effect) and manually trigger awards per week from a new Leaderboard admin page. A separate "special badges" tier allows manually awarding badges like Driver of the Month.

---

## Data Model

### `badgeTypes` table
Org-scoped. Covers both weekly rank slots and special badges.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| organizationId | integer FK → organizations | |
| rank | integer nullable | 1, 2, 3 for weekly auto-awards; NULL for special badges |
| name | text | e.g. "Gold", "Driver of the Month" |
| iconUrl | text nullable | R2 public URL (PNG/SVG/GIF/WebP); null = default trophy SVG |
| shine | boolean | true = apply CSS shimmer sweep on top of icon |
| category | text | "weekly" or "special" |
| createdAt | timestamp | |

Unique constraint: `(organizationId, rank)` where rank IS NOT NULL.

### `driverBadges` table
One row per award event. Never deleted — accumulates forever.

| column | type | notes |
|---|---|---|
| id | serial PK | |
| organizationId | integer FK → organizations | |
| driverId | text FK → drivers.driverId | |
| badgeTypeId | integer FK → badgeTypes | |
| weekStart | date | Week of award (used for weekly; set to week start for special too) |
| awardedAt | timestamp | |

Unique constraint: `(organizationId, badgeTypeId, weekStart)` — one winner per badge type per week.

---

## Badge Icons

**Supported upload formats:** PNG, SVG, GIF, WebP (max 512 KB)
- Animated GIF/WebP play automatically — use for premium animated trophies
- Static PNG/SVG can have the **shine toggle** enabled — applies a CSS gold shimmer sweep that loops, making any static image look animated and premium

**Shine effect:** CSS `@keyframes` linear-gradient sweep across the icon, gold-tinted, 2s loop. Applied as an overlay `::after` pseudo-element so the original icon is unchanged.

**Default icon:** A built-in gold/silver/bronze trophy SVG used when no custom icon is uploaded.

---

## Server Actions (`lib/actions/badges.ts`)

| action | description |
|---|---|
| `getBadgeTypes()` | All badge types for org, ordered by category then rank |
| `upsertBadgeType(data)` | Create or update a badge type (rank, name, iconUrl, shine, category) |
| `deleteBadgeType(id)` | Delete a special badge type (weekly rank slots cannot be deleted) |
| `computeTopDrivers(weekStart, weekEnd)` | Queries `dswRouteDays` grouped by `driverId`, avg ILS%, top 3. Excludes NULL driverId rows. Returns driver name + avg + day count + unmapped route count for the week. |
| `awardBadgesForWeek(weekStart, awards[])` | Writes to `driverBadges`. Idempotent. Returns inserted vs skipped. |
| `awardSpecialBadge(driverId, badgeTypeId, weekStart)` | Manually award a special badge to a driver |
| `getBadgeHistory(limit?)` | Past awards joined with driver name + badge type, newest first |
| `getDriverBadges(driverId)` | All badges earned by one driver, newest first |
| `getDriverBadgeCounts()` | `{ driverId, badgeCount }[]` for all org drivers |

---

## Badge Icon Upload (`app/api/badge-icons/upload/route.ts`)

POST endpoint. `multipart/form-data` with `file` and `badgeTypeId`.

- Validates session + org
- Validates mime type (image/png, image/svg+xml, image/gif, image/webp) and size ≤ 512 KB
- Uploads to R2 `mgops-avatars` bucket under `badge-icons/{orgId}/{badgeTypeId}.{ext}`
- Returns `{ url }` — caller upserts `badgeTypes.iconUrl`

---

## Avatar Upload (completing existing feature)

The R2 infrastructure is already in place. This build finishes the driver-facing upload flow.

**Upload:** `app/api/avatar/upload/route.ts` — POST, `multipart/form-data` with `file` (PNG/JPG/WebP, max 2 MB). Uploads to `mgops-avatars/{orgId}/avatars/{driverId}.{ext}`. Updates `drivers.avatarUrl`.

**Driver:** Sets their own photo from the Me tab in the driver portal — tap avatar → file picker → instant upload.

**Admin moderation:** In the admin dashboard driver account view, a "Remove Image" button appears when the driver has a photo set. Clicking it deletes the R2 object and clears `drivers.avatarUrl`. The driver's avatar reverts to their initials fallback. Driver can re-upload at any time. No approval queue.

**Leaderboard display:** Each driver row shows a small circular avatar (32px) or initials fallback. All drivers see all avatars on the leaderboard.

---

## Admin Page (`app/dashboard/leaderboard/`)

New nav item: **Leaderboard**.

### Three tabs:

**Award tab (default)**
- Week picker (defaults to most recently completed DSW week)
- Ranked table: Rank | Avatar | Driver name | Avg ILS% | Days data | Badge preview
- Warning banner if unmatched DSW routes exist for selected week
- "Award Badges for This Week" button — disabled if already awarded
- "Badges awarded [date]" if week already has records
- **Special Badges section below:** dropdown to pick a driver + special badge type → "Award" button

**Badge Setup tab**
- **Weekly Badges section:** 3 rows (rank 1/2/3) — name input, icon uploader, shine toggle
- **Special Badges section:** list of custom badge types, add/edit/delete, same fields
- Default trophy SVG shown as preview when no icon uploaded

**History tab**
- Table: Week | 1st | 2nd | 3rd + any special badges awarded that week
- Driver name + avatar + badge icon per cell
- Newest first

---

## Driver Portal Changes

### Score tab — personal badge shelf
Above the leaderboard list:
- Driver's own badges: icon + week label, up to 8 shown, "View all" expands
- Hidden if zero badges

### Leaderboard list rows
- Circular avatar (or initials) + driver name + score + badge count chip (`🏆 ×4`)
- Clicking badge chip opens popover with full badge history (icon + name + week)
- All drivers see all other drivers' avatars and badges

---

## DSW Name Mapping Dependency

`computeTopDrivers` excludes unmapped rows. Award tab warns when unmatched routes exist so admin knows to fix mappings in DSW Upload first.

---

## Migration

One Drizzle migration adding `badgeTypes` + `driverBadges` tables + indexes.

---

## Files Created / Modified

| file | change |
|---|---|
| `lib/schema.ts` | Add `badgeTypes` + `driverBadges` |
| `db/migrations/XXXX_badges.sql` | Migration SQL |
| `lib/actions/badges.ts` | All badge server actions (new) |
| `app/api/badge-icons/upload/route.ts` | Badge icon R2 upload (new) |
| `app/api/avatar/upload/route.ts` | Driver avatar R2 upload (new) |
| `app/dashboard/leaderboard/page.tsx` | Server component (new) |
| `app/dashboard/leaderboard/leaderboard-client.tsx` | 3-tab client component (new) |
| `app/driver/score-panel.tsx` | Badge shelf + avatar + badge chips on leaderboard rows |
| `app/driver/me-panel.tsx` | Avatar upload UI |
| Nav component | Add Leaderboard link |

---

## Out of Scope

- Auto-awarding on DSW upload (manual trigger only)
- Badge notifications / push alerts
- Custom threshold-based criteria beyond ILS% top-3
- PPODA or SPH-based badges
