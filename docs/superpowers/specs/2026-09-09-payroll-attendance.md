# Payroll Attendance — Design Spec 2026-09-09

## Goal
Add daily attendance tracking (Work / Half Day / Cut / Call Out / Trainee / Day Off) with optional notes to the scheduling page, then surface last week's attendance as a printable payroll report — replacing the empty payroll card on the dashboard.

## Business Rules
- Pay week runs **Saturday → Friday**
- Payroll is processed the **following Friday** (owner reviews last week's report)
- **Half Day:** driver left early / partial day — owner pays less than a full day
- **Cut:** management decision to not use the driver that day (too many people, uncertainty)
- **Call Out:** driver-initiated absence
- **Trainee:** driver was shadowing/training that specific day, not running their own route — paid at trainee rate
- **Notice deduction flag:** automatically shown on payroll report when driver's `terminationType = "notice"` (quit without completing notice or didn't give notice). If `terminationType = "fired"` — no deduction, company's decision. The deduction amount is configurable per org via a setting key `notice_deduction_amount` stored in the existing `settings` table (defaults to `500`). Shown as "−$X" on the report where X is the org's configured amount.
- Terminated drivers must appear on the payroll report for any week they have attendance records — `driverId` stored as plain text (not FK) so records survive hard delete

## Data Model

### New table: `attendanceLog`
```
id              serial PRIMARY KEY
organizationId  text NOT NULL
driverId        text NOT NULL  -- plain text, not FK, survives driver deletion
driverName      text NOT NULL  -- snapshot of name at time of logging
date            date NOT NULL
status          text NOT NULL  -- "work" | "half_day" | "cut" | "call_out" | "trainee" | "day_off"
note            text           -- optional
createdAt       timestamp DEFAULT now()
updatedAt       timestamp DEFAULT now()

UNIQUE (organizationId, driverId, date)
```

One row per driver per day per org. Upsert on conflict — if you change someone from Cut to Call Out, it replaces the row.

### No changes to existing tables
`timeOffEntries` stays as the forward-looking schedule tool. `attendanceLog` is the backward-looking attendance record. `isTrainee` on the driver record stays as the current status indicator — `attendanceLog` captures the per-day history.

## Scheduling UI Changes

### Who's Working tab — driver click modal
Currently clicking a driver's name in the day cell opens a coverage modal. Add these buttons to that modal:
- **Cut** (already exists as a button) → opens note modal → on confirm: upserts attendanceLog with status="cut" + note
- **Call Out** (already exists) → opens note modal → on confirm: upserts attendanceLog with status="call_out" + note
- **Half Day** (NEW button) → opens note modal → on confirm: upserts attendanceLog with status="half_day" + note; cell renders half-filled

### Note modal
- Appears after clicking Cut, Call Out, or Half Day
- Single optional textarea: "Add a note (optional)" placeholder
- Two buttons: Cancel | Confirm
- Note is saved to `attendanceLog.note`
- If note is blank, still saves the status (note stays null)

### Half Day cell appearance
- Cell shows driver name with a half-filled background (top half brand color, bottom half white, or a diagonal split)
- Small "½" badge on the cell

### Trainee toggle
- Existing toggle button on scheduling page already calls `setDriverTrainee(driverId, bool)`
- When toggled ON for a driver: for each day in the current week where that driver is scheduled, upsert attendanceLog with status="trainee"
- When toggled OFF: for each day in the current week where driver has status="trainee" in attendanceLog, upsert to status="work"
- This gives per-day history going forward

## Payroll Report

### Location
- Replaces the empty state in `components/cards/payroll-card.tsx` (dashboard overview card)
- Full report at `/dashboard/payroll` (replaces placeholder page)

### Pay week
- Default: most recently completed Saturday → Friday
- Navigation arrows to go back to previous weeks

### Grid layout
Rows = active drivers + any terminated driver with records that week
Columns = Sat, Sun, Mon, Tue, Wed, Thu, Fri

Each cell shows:
- **Work** — green dot
- **Half Day** — yellow "½" badge
- **Cut** — gray "Cut" pill
- **Call Out** — red "Out" pill
- **Trainee** — blue "T" badge
- **Day Off** (not scheduled) — empty/dash
- Note indicator — small 📝 icon if note exists; hover/tap shows note text

Row footer:
- Days worked count (Work + Half Day count as days, Half Day = 0.5)
- Trainee days count (separate)
- Any termination deduction flag: "−$X" badge if terminationType="notice" (X = org's configured notice_deduction_amount, default 500)

### Terminated drivers
- If a driver was terminated during the displayed week, show their row with a "Terminated" badge
- Show termination note if present
- Show −$X deduction badge if applicable (org-configured amount)

### Print view
- Clean table, no nav chrome
- `window.print()` triggered by a Print button
- CSS `@media print` hides buttons, shows full grid

## Hard Delete Warning Upgrade
`deleteDriver` in `lib/actions/drivers.ts` is a permanent hard delete that wipes Ryde scores. The UI confirmation modal should be upgraded to a two-step danger modal:
- Step 1: "Are you sure? This cannot be undone."
- Step 2: Show what will be deleted: Ryde scores, reviews, attendance records
- Recommend using Terminate instead
- Require typing the driver's name to confirm (or a checkbox "I understand this is permanent")

## Files Touched
- `lib/schema.ts` — add attendanceLog table definition
- `drizzle/` — new migration file
- `lib/actions/attendance.ts` — new server actions: upsertAttendance, getAttendanceForWeek, getPayrollWeek
- `app/dashboard/scheduling/scheduling-client.tsx` — add Half Day button, note modal after Cut/Call Out/Half Day, trainee toggle writes to attendanceLog
- `components/cards/payroll-card.tsx` — show last week summary (day counts per driver)
- `app/dashboard/payroll/` — new page with full weekly grid + print view
- `app/dashboard/drivers/` — upgrade hard delete confirmation modal

## Out of Scope
- No dollar amounts stored in the app (owner processes actual payroll in their external software)
- No driver-facing payroll view
- No approval workflows
- No time clock / clock-in
- No export to CSV (can add later)
