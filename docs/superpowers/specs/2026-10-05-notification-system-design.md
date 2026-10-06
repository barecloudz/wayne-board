# Notification System Design
**Date:** 2026-10-05
**Status:** Approved
**Project:** wayneboard / MyGroundOps

---

## Overview

A centralized, org-scoped notification system that delivers in-app alerts and emails across the admin dashboard and driver portal. A single `createNotification()` utility drives all delivery. Admins control every notification type from a rich settings page — toggling channels, recipients, and timing per type. Both portals gain a bell icon with an unread badge and an inbox panel.

---

## Goals

- Admin gets alerted when a driver submits a maintenance request — no more manually checking the dashboard
- Fleet compliance expiries (registration, federal inspection, MMR due) fire automatic warnings at configurable lead times
- All existing email notifications (payroll, task reminders) migrate into the unified system
- Every user has an email address on their account; the system flags missing emails inline
- Admins have one screen to understand and control everything

---

## Non-Goals

- PWA push notifications (not viable without a service worker background process)
- Real-time websocket delivery (polling every 30 s on page focus is sufficient)
- Per-driver notification preferences (drivers are recipients only; preferences are admin-controlled)
- Cross-org notifications

---

## Database Changes

### 1. Add `email` to `drivers` table

```sql
ALTER TABLE drivers ADD COLUMN email text;
```

Nullable. Displayed and editable on:
- Admin: driver management edit modal
- Admins/BCs/Co-owners: their own account/profile page
- Drivers: Me tab in driver portal

### 2. `notifications` table (new)

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| organizationId | integer FK → organizations | |
| recipientId | integer FK → drivers | The specific user this notification is for |
| type | text | See Notification Types section |
| title | text | Short headline, e.g. "New Maintenance Request" |
| body | text | 1–2 sentence detail |
| linkTo | text | App path to navigate when clicked, e.g. `/dashboard/maintenance` |
| metadata | json | Arbitrary context: `{ truckNumber, requestId, vehicleId, daysUntilExpiry }` |
| readAt | timestamp | null = unread |
| emailSentAt | timestamp | null = not sent |
| createdAt | timestamp | defaultNow() |

Index on `(recipientId, readAt)` for fast unread counts.
Index on `(organizationId, createdAt)` for admin history view.

### 3. `notificationPreferences` table (new)

One row per organization per notification type. Controls default delivery behavior.

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| organizationId | integer FK → organizations | |
| type | text | Matches notification type enum |
| enabled | boolean | Master on/off |
| inAppEnabled | boolean | |
| emailEnabled | boolean | |
| recipientRoles | json | Array: `["owner","co_owner","bc"]` — who gets this notification by role |
| recipientIds | json | Array of specific driver IDs to also include |
| timingDays | json | For time-based types only: `[60, 30, 7, 0]` — which lead-day counts fire |
| createdAt | timestamp | |
| updatedAt | timestamp | |

Unique index on `(organizationId, type)`.

Seeded with defaults for all types when an org first visits the notification settings page — no migration script needed.

---

## Notification Types

| Type | Category | Default Trigger | Default Recipients |
|------|----------|----------------|--------------------|
| `maintenance_request` | Maintenance | Driver submits a request | Roles: owner, co_owner, bc |
| `maintenance_resolved` | Maintenance | Admin marks request resolved | The submitting driver |
| `vehicle_expiry` | Fleet | Daily cron — MMR due, fed. inspection due, registration expiry | Roles: owner, co_owner, bc |
| `vehicle_condition_critical` | Fleet | Critical severity condition reported | Roles: owner, co_owner, bc |
| `task_overdue` | Tasks | Existing hourly cron (migrated) | Configurable (existing behavior preserved) |
| `payroll_ready` | Reports | Existing payroll cron (migrated) | Configurable (existing behavior preserved) |
| `mmr_report` | Reports | Last business day of month cron | Roles: owner, co_owner |

### Vehicle Expiry Timing

Default lead-day checkboxes: **60 days**, **30 days**, **7 days**, **day-of (0)**.
Cron runs daily. For each vehicle with a compliance date, checks if `daysUntil` matches any enabled timing value. Deduplicated by checking for an existing `notifications` row with matching metadata on the same calendar day.

---

## `createNotification()` Utility

Location: `lib/notifications.ts`

```ts
createNotification({
  organizationId,
  type,
  title,
  body,
  linkTo,
  metadata?,
  recipientIds?,   // explicit override; otherwise resolved from notificationPreferences
})
```

Internal flow:
1. Load `notificationPreferences` row for `(organizationId, type)`
2. If `!enabled` → return early
3. Resolve recipients: role-matched drivers ∪ explicit `recipientIds`
4. For each recipient: insert row into `notifications`
5. If `emailEnabled` AND recipient has `email` set: send via Resend, set `emailSentAt`

All existing callers (`submitMaintenanceRequest`, payroll cron, task reminder cron) call `createNotification()` instead of Resend directly.

---

## Bell Icon — Both Portals

### Placement

- **Admin portal** — top-right of the sidebar header, above the nav links
- **Driver portal** — top-right of the portal header, next to the existing profile button

### Behavior

- Badge shows unread count (capped at "9+" display)
- Polls `GET /api/notifications/unread-count` every 30 s while `document.visibilityState === 'visible'`
- Click opens a slide-down panel (same spring animation as the More sheet)

### Notification Panel

- Header: "Notifications" + "Mark all read" button (only shown if any unread)
- List of 20 most recent notifications, newest first
- Each row:
  - Icon per type (wrench = maintenance, truck = fleet, checklist = tasks, dollar = payroll)
  - Title (bold if unread)
  - Body snippet (1 line, truncated with ellipsis)
  - Relative timestamp ("2 min ago", "Yesterday")
  - Unread indicator — colored left border
- Clicking a row: marks read → navigates to `linkTo`
- "View all" link at bottom
- Empty state: "You're all caught up"

### API Routes

- `GET /api/notifications/unread-count` → `{ count: number }`
- `GET /api/notifications` → paginated, scoped to session user
- `POST /api/notifications/[id]/read` → mark one read
- `POST /api/notifications/read-all` → mark all read for current user

---

## Admin Notification Settings Page

Route: `/dashboard/notifications`

### Layout

**Desktop:** Two-column — left sidebar with category filters (All, Fleet, Maintenance, Tasks, Reports), right content area with notification type cards.

**Mobile:** Category filter becomes a horizontal scrollable chip row at top; cards stack full-width below.

### Notification Type Card

Each card contains:

```
┌──────────────────────────────────────────────────────────────────┐
│  🔧  New Maintenance Request                   [Master Toggle ●] │
│  Sent when a driver submits a maintenance request                │
│  ──────────────────────────────────────────────────────────────  │
│  Channels:    [In-App ●]   [Email ○]                             │
│                                                                  │
│  Recipients:  [All Admins ●]  [Owner Only]  [+ Add person]       │
│               Blake (no email ⚠)  Sarah (sarah@co.com ✓)        │
│                                                                  │
│  [See example ▾]                                                 │
└──────────────────────────────────────────────────────────────────┘
```

- **Master toggle off** → child controls gray out; card gets subtle disabled background
- **"No email ⚠" chip** → clicking opens the driver edit modal with email field focused
- **Timing row** (vehicle_expiry only): `[60 days] [30 days ●] [7 days ●] [Day-of ●]`
- **"See example"** → expands a sample in-app notification + sample email preview side by side

### Missing Email Banner

If admin-role drivers are missing emails and email is enabled for any type:

> "3 admins are missing email addresses — they'll receive in-app notifications only. [Review →]"

### Save Behavior

Toggles auto-save via server action (optimistic update). No Save button needed for toggles.

---

## Email Templates

From address: `alerts@mygroundops.com`

Common structure:
- Header: MyGroundOps logo + org name
- Title (large, bold)
- Body paragraph
- CTA button → deep link to `linkTo` path
- Footer: "Manage notifications → /dashboard/notifications · Unsubscribe"

Type-specific additions:
- `vehicle_expiry` — table of expiring vehicles with dates and days remaining
- `maintenance_request` — truck number, driver name, description excerpt
- `task_overdue` — task name, due time, overdue count

---

## Migration of Existing Email Flows

| Existing | Replaced by |
|----------|------------|
| `payroll_email_recipients` settings key | `notificationPreferences` row for `payroll_ready` |
| `task_reminder_recipients` settings key | `notificationPreferences` row for `task_overdue` |
| Direct `resend.emails.send()` in cron routes | `createNotification()` |

Old settings keys preserved until new system is confirmed working, then removed.

---

## Cron Jobs

| Job | Schedule | Action |
|-----|----------|--------|
| `/api/cron/vehicle-expiry` (new) | Daily 8:00 AM | Check all active vehicles; fire `vehicle_expiry` for matching timing milestones |
| `/api/cron/task-reminders` (existing) | Hourly | Route through `createNotification()` |
| `/api/cron/payroll-email` (existing) | Configured day/time | Route through `createNotification()` |
| `/api/cron/mmr-report` (new) | Last business day of month, 7:00 AM | Fire `mmr_report` notifications |

All cron entries added/updated in `vercel.json`.

---

## Files to Create / Modify

**New:**
- `lib/notifications.ts` — `createNotification()` + Resend dispatch
- `lib/actions/notifications.ts` — server actions (fetch, mark read, preferences CRUD)
- `components/notification-bell.tsx` — shared bell icon + panel (used in both portals)
- `app/api/notifications/unread-count/route.ts`
- `app/api/notifications/route.ts`
- `app/api/notifications/[id]/read/route.ts`
- `app/api/notifications/read-all/route.ts`
- `app/api/cron/vehicle-expiry/route.ts`
- `app/api/cron/mmr-report/route.ts`
- `app/dashboard/notifications/page.tsx`
- `app/dashboard/notifications/notifications-client.tsx`

**Modified:**
- `lib/schema.ts` — add `email` to drivers; add `notifications` + `notificationPreferences` tables
- `lib/actions/maintenance.ts` — call `createNotification()` on submit and on resolve
- `app/api/cron/task-reminders/route.ts` — route through `createNotification()`
- `app/api/cron/payroll-email/route.ts` — route through `createNotification()`
- `app/driver/driver-tabs.tsx` — add bell icon to driver portal header
- `app/driver/me-panel.tsx` — add email field to driver profile
- `components/sidebar.tsx` — add bell icon to admin sidebar header
- `app/dashboard/drivers/page.tsx` — add email field to driver edit modal
- `vercel.json` — add new cron entries
