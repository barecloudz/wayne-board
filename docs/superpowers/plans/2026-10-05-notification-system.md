# Notification System — Implementation Plan
**Date:** 2026-10-05
**Spec:** docs/superpowers/specs/2026-10-05-notification-system-design.md
**Status:** Ready to execute

---

## Overview

Build a centralized, org-scoped notification system: persistent DB storage, `createNotification()` utility, bell icon on both portals, and a full admin control panel. Seven notification types. In-app + email delivery via Resend.

Agents work in parallel where noted. Each agent has a clearly bounded task and file list.

---

## Execution Order

```
Agent A  ──────────────────────────────────────────────────────────────────►
                 ├─► Agent B (API routes)  ──► Agent C (Bell component)
                 ├─► Agent D (Settings page)
                 ├─► Agent E (Cron + triggers)
                 └─► Agent F (Email field)
```

Agent A must complete first. B, D, E, F can all run in parallel after A. C runs after B.

---

## Agent A — Database & Core Utility

**Runs first. All other agents depend on this.**

### Files to create/modify
- `lib/schema.ts` — add `email` to `drivers`; add `notifications` and `notificationPreferences` tables
- `drizzle/migrations/` — generate and apply migration
- `lib/notifications.ts` — `createNotification()` utility + Resend email dispatch

### Task

1. In `lib/schema.ts`, add `email: text("email")` to the `drivers` table (nullable).

2. Add `notifications` table to schema:
```ts
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  recipientId: integer("recipient_id").notNull().references(() => drivers.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  linkTo: text("link_to"),
  metadata: json("metadata"),
  readAt: timestamp("read_at"),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Add indexes: `(recipientId, readAt)` for unread counts, `(organizationId, createdAt)` for admin history.

3. Add `notificationPreferences` table to schema:
```ts
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  type: text("type").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  inAppEnabled: boolean("in_app_enabled").default(true).notNull(),
  emailEnabled: boolean("email_enabled").default(false).notNull(),
  recipientRoles: json("recipient_roles").$type<string[]>().default(["owner"]),
  recipientIds: json("recipient_ids").$type<number[]>().default([]),
  timingDays: json("timing_days").$type<number[]>().default([30, 7, 0]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.organizationId, t.type) }));
```

4. Run `npx drizzle-kit generate` then apply the migration using the existing migration pattern in the repo.

5. Create `lib/notifications.ts`:

```ts
// Notification type constants
export const NOTIFICATION_TYPES = {
  MAINTENANCE_REQUEST: "maintenance_request",
  MAINTENANCE_RESOLVED: "maintenance_resolved",
  VEHICLE_EXPIRY: "vehicle_expiry",
  VEHICLE_CONDITION_CRITICAL: "vehicle_condition_critical",
  TASK_OVERDUE: "task_overdue",
  PAYROLL_READY: "payroll_ready",
  MMR_REPORT: "mmr_report",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

// Default preferences per type (used for seeding)
export const DEFAULT_PREFERENCES: Record<NotificationType, Partial<typeof notificationPreferences.$inferInsert>> = {
  maintenance_request:        { enabled: true, inAppEnabled: true, emailEnabled: false, recipientRoles: ["owner", "co_owner", "bc"] },
  maintenance_resolved:       { enabled: true, inAppEnabled: true, emailEnabled: false, recipientRoles: [] },
  vehicle_expiry:             { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner", "co_owner", "bc"], timingDays: [60, 30, 7, 0] },
  vehicle_condition_critical: { enabled: true, inAppEnabled: true, emailEnabled: false, recipientRoles: ["owner", "co_owner", "bc"] },
  task_overdue:               { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner"] },
  payroll_ready:              { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner"] },
  mmr_report:                 { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner", "co_owner"] },
};

export async function createNotification({
  organizationId,
  type,
  title,
  body,
  linkTo,
  metadata,
  recipientIds,   // explicit override; otherwise resolved from notificationPreferences
}: CreateNotificationArgs) {
  // 1. Load prefs (or seed defaults)
  // 2. If !enabled → return early
  // 3. Resolve recipients: role-matched drivers ∪ explicit recipientIds
  // 4. Insert one notifications row per recipient
  // 5. If emailEnabled AND recipient.email set → send via Resend, set emailSentAt
}
```

Read `lib/resend.ts` (or wherever Resend is initialized) before writing the email dispatch section so you use the same client instance.

**Does not touch:** UI files, cron routes, API routes.

---

## Agent B — API Routes

**Depends on Agent A completing first.**

### Files to create
- `app/api/notifications/unread-count/route.ts`
- `app/api/notifications/route.ts`
- `app/api/notifications/[id]/read/route.ts`
- `app/api/notifications/read-all/route.ts`

### Task

Read `lib/session.ts` first to understand the session pattern before writing any route.

All routes authenticate via the existing session util. Scope all queries to the session user's driver ID.

1. `GET /api/notifications/unread-count` — returns `{ count: number }`. Count rows where `recipientId = sessionUser.id AND readAt IS NULL`. Header: `Cache-Control: no-store`.

2. `GET /api/notifications?page=1&limit=20` — returns `{ notifications: Notification[], total: number, unread: number }`. Ordered by `createdAt DESC`.

3. `POST /api/notifications/[id]/read` — sets `readAt = now()` for the given ID, only if `recipientId` matches session user. Returns `{ ok: true }`.

4. `POST /api/notifications/read-all` — sets `readAt = now()` on all unread rows for session user. Returns `{ ok: true }`.

**Does not touch:** schema, UI, cron routes.

---

## Agent C — Bell Icon Component

**Depends on Agent B completing first.**

### Files to create
- `components/notification-bell.tsx`

### Files to modify
- `components/sidebar.tsx` — add bell to admin sidebar header
- `app/driver/driver-tabs.tsx` — add bell to driver portal header

### Task

Read `components/sidebar.tsx` and `app/driver/driver-tabs.tsx` before editing either.

1. Create `components/notification-bell.tsx` — client component:
   - Props: `recipientId: number`
   - Polls `GET /api/notifications/unread-count` every 30 s while `document.visibilityState === 'visible'` (use `visibilitychange` event listener to pause/resume)
   - Bell icon from lucide-react (`Bell`), red badge with count capped at "9+" display
   - Click toggles a slide-down panel (positioned absolute, z-50)
   - Panel:
     - Header: "Notifications" + "Mark all read" button (only when `unread > 0`)
     - Fetches `GET /api/notifications` on open; shows spinner while loading
     - Each row: left-border color by type, type icon (wrench/truck/checklist/dollar from lucide), bold title if unread, body snippet truncated to 1 line, relative timestamp via `formatDistanceToNow` from date-fns
     - Row click → POST `/api/notifications/[id]/read` → navigate to `linkTo`
     - "View all" link at bottom → `/dashboard/notifications`
     - Empty state: "You're all caught up"
   - Panel open animation: use `.animate-sheet-up` already in `globals.css`, or a simple `transition-all` fade-in
   - Close on outside click: `useEffect` + `mousedown` listener on `document`

2. In `components/sidebar.tsx` — add `<NotificationBell recipientId={...} />` to the sidebar header. Find the existing header area and insert it top-right. Get the recipientId from the session/props already passed to sidebar.

3. In `app/driver/driver-tabs.tsx` — add `<NotificationBell recipientId={...} />` to the driver portal header, right of the existing profile button. The driver's ID is already available in that component.

**Does not touch:** schema, cron routes, settings page.

---

## Agent D — Admin Notifications Settings Page

**Depends on Agent A completing first. Runs in parallel with B, E, F.**

### Files to create
- `lib/actions/notifications.ts` — server actions
- `app/dashboard/notifications/page.tsx` — server component
- `app/dashboard/notifications/notifications-client.tsx` — full client UI

### Files to modify
- `components/sidebar.tsx` — add "Notifications" nav link

### Task

Read `lib/actions/maintenance.ts` and an existing dashboard page for patterns before writing.

1. `lib/actions/notifications.ts` server actions:
   - `getNotificationPreferences(organizationId)` — fetch all pref rows; for any of the 7 types with no row, insert defaults from `DEFAULT_PREFERENCES` and return the full set
   - `upsertNotificationPreference(organizationId, type, patch: Partial<NotificationPreference>)` — update a single pref; used by auto-saving toggles
   - `getNotificationsHistory(organizationId, { page, limit, type?, unreadOnly? })` — paginated list for admin history view
   - `getAdminsWithoutEmail(organizationId)` — returns drivers in admin roles (`role IN ('owner','co_owner','bc')`) where `email IS NULL`

2. `app/dashboard/notifications/page.tsx` — server component. Calls `getNotificationPreferences` and `getAdminsWithoutEmail`, passes to `<NotificationsClient />`.

3. `app/dashboard/notifications/notifications-client.tsx`:

   **Category filter** — chip row on mobile, left column on desktop. Categories: All / Fleet / Maintenance / Tasks / Reports. Filter state is local React state (no URL param needed).

   **Notification type cards** — one per type. Card anatomy:
   - Header row: type icon + name (bold) + master toggle (right-aligned). Toggle change calls `upsertNotificationPreference` optimistically.
   - Subtext: plain-English description of when this fires (hardcode per type)
   - Channels row: "In-App" toggle + "Email" toggle — each auto-saves independently
   - Recipients row: role chips ("All Admins", "Owner Only", "Co-Owners") that toggle role inclusion; "+ Add person" for individual driver selection
   - Timing row (vehicle_expiry only): chip checkboxes for 60 / 30 / 7 / 0 days
   - Summary chip: "N recipients · Email + In-App" (or "In-App only")
   - "See example" expand: static preview mockup of the in-app notification and email layout
   - When master toggle is off: gray out all child controls (`opacity-50 pointer-events-none`)

   **Missing email banner** at top of page (if `adminsWithoutEmail.length > 0`):
   > "N admins are missing email addresses — they'll receive in-app notifications only."

4. In `components/sidebar.tsx` — find the nav items array and add a "Notifications" entry with a `Bell` icon, linking to `/dashboard/notifications`. Read the file first to match the exact nav item shape.

**Does not touch:** cron routes, bell component, driver portal.

---

## Agent E — Cron Routes & Trigger Wiring

**Depends on Agent A completing first. Runs in parallel with B, D, F.**

### Files to create
- `app/api/cron/vehicle-expiry/route.ts`
- `app/api/cron/mmr-report/route.ts`

### Files to modify
- `app/api/cron/task-reminders/route.ts` — route through `createNotification()`
- `lib/actions/maintenance.ts` — call `createNotification()` on submit + resolve
- `vercel.json` — add new cron entries

### Task

Read each file before modifying it.

1. `app/api/cron/vehicle-expiry/route.ts`:
   - Auth: verify `Authorization: Bearer ${process.env.CRON_SECRET}` header
   - Query all active vehicles across all orgs with compliance date fields (MMR due, federal inspection due, registration expiry) — check `lib/schema.ts` for the exact column names on the vehicles table
   - For each org, load `notificationPreferences` for `vehicle_expiry` and get `timingDays`
   - For each vehicle × each compliance date field: compute `daysUntil = differenceInDays(dueDate, today)` using date-fns
   - If `daysUntil` is in `timingDays`: check for an existing `notifications` row with `type='vehicle_expiry'`, `organizationId`, and `metadata->>'vehicleId' = vehicleId` created today (same calendar day) — skip if exists (deduplication)
   - If no duplicate: call `createNotification({ type: 'vehicle_expiry', metadata: { vehicleId, truckNumber, field, daysUntil }, linkTo: '/dashboard/fleet' })`

2. `app/api/cron/mmr-report/route.ts`:
   - Auth: verify CRON_SECRET
   - Code guard: compute whether today is the last business day of the current month. If not, return `{ ok: true, skipped: true }` early.
   - For each active org: call `createNotification({ type: 'mmr_report', title: 'Monthly MMR Report Ready', body: 'Your end-of-month MMR report is available.', linkTo: '/dashboard/mmr' })`

3. `app/api/cron/task-reminders/route.ts` — read first. Replace any direct `resend.emails.send()` calls with `createNotification({ type: 'task_overdue', organizationId, title, body, linkTo: '/dashboard/tasks' })`. Preserve all existing logic for determining which tasks are overdue.

4. `lib/actions/maintenance.ts` — read first. After the DB insert that creates a new request: add `await createNotification({ organizationId, type: 'maintenance_request', title: 'New Maintenance Request', body: \`${driverName} submitted a request for Truck ${truckNumber}\`, linkTo: '/dashboard/maintenance', metadata: { requestId, truckNumber, driverName } })`. After the update that marks a request resolved: add `createNotification` for `maintenance_resolved` with `recipientIds: [submittingDriverId]`.

5. `vercel.json` — add two entries to the `crons` array:
```json
{ "path": "/api/cron/vehicle-expiry", "schedule": "0 8 * * *" },
{ "path": "/api/cron/mmr-report",     "schedule": "0 7 28-31 * *" }
```

**Does not touch:** UI files, bell component, settings page.

---

## Agent F — Driver Email Field

**Depends on Agent A completing first. Runs in parallel with B, D, E.**

### Files to modify
- Admin driver management page/modal — add email input to driver edit form
- Driver portal Me/Account tab — add email field for self-edit

### Task

First, search the codebase to find:
- The admin driver edit modal (grep for "edit" + "driver" in `app/dashboard/drivers/`)
- The driver portal Me/Account tab (grep for "me" or "account" in `app/driver/`)
- The server action that updates a driver record (grep for `updateDriver` or similar in `lib/actions/`)

Read each found file before editing.

1. **Admin driver edit modal** — add an "Email address" text input (`type="email"`) to the form. Bind it to the `email` field. Hook into the existing form submit / server action. Client-side validation: basic email format regex. If no email is set, show a subtle placeholder note: "No email — driver won't receive email notifications."

2. **Driver portal Me/Account tab** — add an email field the driver can view and update themselves. On save, call the driver-update server action (or create a minimal one if it doesn't exist — check first). Same client-side email validation.

3. In both places: if the current value is empty, show an info nudge: "Add your email to receive notifications."

**Does not touch:** schema (Agent A handles it), cron routes, bell component.

---

## Acceptance Checklist

- [ ] Migration runs clean; `notifications` and `notificationPreferences` tables exist
- [ ] `createNotification()` inserts a row and sends via Resend when emailEnabled + recipient has email
- [ ] Bell icon visible on both admin sidebar and driver portal header
- [ ] Badge shows unread count; updates within 30 s of a new notification
- [ ] Clicking a notification row marks it read and navigates to `linkTo`
- [ ] "Mark all read" clears the badge
- [ ] Admin `/dashboard/notifications` page loads all 7 type cards; toggles auto-save
- [ ] Disabled master toggle grays out child controls
- [ ] `vehicle_expiry` cron deduplicates — no duplicate same-day notifications
- [ ] Maintenance submit fires `maintenance_request`; resolve fires `maintenance_resolved`
- [ ] Email field appears in driver edit modal (admin) and Me tab (driver portal)
- [ ] Build passes with no TypeScript errors
