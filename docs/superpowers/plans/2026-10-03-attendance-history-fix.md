# Attendance History & Payroll Reporting Bug Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four bugs that cause the scheduling History tab to show wrong attendance data — wrong drivers, wrong statuses, and silent data gaps for dates older than 60 days.

**Architecture:** All four bugs live in two files. The core fix (Task 3) rewrites the history-tab driver loop in `scheduling-client.tsx` so it derives driver presence from `attendance_log` records instead of the current repeating schedule, routes every attendance status to the correct display bucket, and shows terminated drivers whenever they have a log entry. Task 2 widens the server-side fetch window in `page.tsx` from 60 to 365 days so historical queries are never silently starved of data. No schema changes, no new dependencies.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Neon PostgreSQL, TypeScript strict mode, Tailwind CSS, date-fns, lucide-react

**Spec:** (audit findings embedded in task descriptions below)

## Global Constraints

- TypeScript strict mode — no `any` except where the existing codebase already casts with `as any` at the server-component boundary
- Tailwind CSS only — no inline style attributes
- No new npm dependencies
- All DB queries in `lib/actions/` must be org-scoped via `eq(table.organizationId, orgId)`
- Do NOT touch the Coverage tab loop — only the `tab === "history"` block in `scheduling-client.tsx`
- Do NOT touch `getPayrollWeek` in `lib/actions/attendance.ts` — it already handles terminated drivers correctly
- Branch: work on a feature branch, never push directly to master
---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/dashboard/scheduling/page.tsx` | Modify line 23 | Extend attendance fetch window from 60 to 365 days |
| `app/dashboard/scheduling/scheduling-client.tsx` | Modify lines ~1379-1410 | Replace buggy loop with 3-pass attendance_log-first algorithm |
| `app/dashboard/scheduling/scheduling-client.tsx` | Modify lines ~1459-1498 | Add Half Day, Trainee, Day Off display cards to the grid |
| `app/dashboard/scheduling/scheduling-client.tsx` | Modify line ~1501 | Update empty-state condition to include new buckets |

`lib/actions/attendance.ts` — **read-only verification only**. `getAttendanceForRange` needs no code changes; Task 1 confirms it already returns all records (including terminated-driver records) within the date range.

---

## Background: How the Data Model Works

Read this before touching any code.

**`driverSchedules` table** stores a driver current repeating weekly schedule (boolean columns `mon`...`sun`). It is mutable — managers update it any time. It does not record what the driver actually did on any specific past date.

**`attendance_log` table** stores what actually happened on a specific past date. Schema:
- `driverId` — plain text, NOT a FK; survives driver hard-delete
- `driverName` — snapshot of name at time of logging
- `date` — text YYYY-MM-DD
- `status` — one of: `"work" | "half_day" | "cut" | "call_out" | "trainee" | "day_off" | "holiday"`
- `note` — nullable text
- Unique constraint: `(organizationId, driverId, date)` — at most one record per driver per day

**The bug in plain English:** The old loop asked "does this driver current schedule say they work on [dayOfWeek]?" for a past date. The correct question is "is there an `attendance_log` entry for this driver on [specificDate]?" The schedule may have changed since the historical date. A driver terminated six months ago has no current schedule but may have dozens of log entries.

**`timeOffEntries`** (accessed as `timeOff` prop) — Cut and Call Out actions write to BOTH `timeOffEntries` AND `attendance_log`. For the history tab, `attendance_log` is the authoritative source; `timeOffEntries` is a legacy fallback for records predating `attendance_log`.

**`schedules` prop** — typed `ScheduleRow[]`. Contains ALL drivers for the org including inactive/terminated, because `getAllSchedules()` in `lib/actions/scheduling.ts` filters only on `organizationId`, not on `active`.

**`scheduleMap`** — built at line 386 outside the history-tab IIFE and in scope inside it: `const scheduleMap = Object.fromEntries(schedules.map((s) => [s.driverId, s]))`.
---

## Task 1: Verify `getAttendanceForRange` returns terminated-driver records (read-only)

**Files:**
- Read: `lib/actions/attendance.ts` lines 74-96

**Interfaces:**
- Confirms: `getAttendanceForRange` is org-scoped but NOT filtered by driver `active` status

- [ ] **Step 1: Open and read `getAttendanceForRange`**

  Open `lib/actions/attendance.ts` lines 74-96. Confirm the Drizzle WHERE clause is:
  ```ts
  and(
    eq(attendanceLog.organizationId, orgId),
    gte(attendanceLog.date, startDate),
    lte(attendanceLog.date, endDate),
  )
  ```
  There is no join to the `drivers` table and no `eq(drivers.active, true)` condition. Records for terminated drivers ARE included as long as the date falls within the fetch window. **No code change needed in this file.**

- [ ] **Step 2: Note the finding and proceed**

  `getAttendanceForRange` is correct as-is. Widening the fetch window in Task 2 is the only server-side change required.

---

## Task 2: Extend the attendance fetch window to 365 days

**Files:**
- Modify: `app/dashboard/scheduling/page.tsx` line 23

**Interfaces:**
- Produces: `attendanceRecords` prop passed to `SchedulingClient` now covers up to 365 days of history instead of 60

**Why this must happen before the client fix:** After Task 3 rewrites the loop to read from `attendanceRecords`, any date older than 60 days will produce an empty `loggedOnDate` array — even if log records exist in the DB — because the server fetch cuts them off. Fix the data layer first.

- [ ] **Step 1: Locate line 23 in `app/dashboard/scheduling/page.tsx`**

  Current content of line 23:
  ```ts
  const attendanceStart = format(addDays(today, -60), "yyyy-MM-dd");
  ```

- [ ] **Step 2: Change -60 to -365**

  New content of line 23:
  ```ts
  const attendanceStart = format(addDays(today, -365), "yyyy-MM-dd");
  ```

  Nothing else in this file changes. `rangeEnd` (today + 14 days) is unaffected. The call `getAttendanceForRange(attendanceStart, rangeEnd)` at line 40 automatically picks up the new start date.

- [ ] **Step 3: Run TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: zero errors. This is a one-character numeric change with no type implications.

- [ ] **Step 4: Commit**

  ```bash
  git add app/dashboard/scheduling/page.tsx
  git commit -m "fix: extend attendance history fetch window from 60 to 365 days

  The history tab allows picking any past date, but attendance records
  older than 60 days were silently absent because the server-side fetch
  window was hardcoded to today-60. Widening to today-365 ensures the
  client attendanceRecords array contains data for any selectable date.

  getAttendanceForRange already returns terminated-driver records within
  range (confirmed: no active filter on the query) - no server-action
  change needed."
  ```
---

## Task 3: Rewrite the history-tab loop to use attendance_log as source of truth

This task fixes Bugs 1, 2, and 3 simultaneously.

**Files:**
- Modify: `app/dashboard/scheduling/scheduling-client.tsx`
  - Region A — lines ~1379-1410: the bucket declarations and driver loop
  - Region B — lines ~1459-1498: the JSX grid card array
  - Region C — line ~1501: the empty-state condition

**Interfaces:**
- Consumes (all already in scope inside the `tab === "history"` IIFE):
  - `attendanceRecords: AttendanceRecord[]` — prop of `SchedulingClient`; each record: `{ driverId: string, driverName: string, date: string, status: AttendanceStatus, note: string | null }`
  - `schedules: ScheduleRow[]` — all drivers (active + inactive)
  - `scheduleMap: Record<string, ScheduleRow>` — built at line 386 outside the IIFE, in scope inside
  - `historyDate: string` — state, format `YYYY-MM-DD`
  - `date: Date` — from `const date = parseISO(historyDate)` at line 1365
  - `dayKey: DayKey | undefined` — from `JS_DAY_TO_KEY[date.getDay()]` at line 1366
  - `dayEntries: TimeOffRow[]` — from `timeOff.filter(...)` at lines 1369-1371
  - `offDriverIds: Set<string>` — from line 1372
  - `dayOverrideIds: Set<string>` — from lines 1375-1377
  - `isPastLastDay(driverId: string, date: Date): boolean` — defined at line 389
  - `openCoverageModal(driver: ScheduleRow, dateStr: string): void` — defined at line 268
- Produces (new bucket variables consumed by the JSX grid):
  - `working: ScheduleRow[]` — status "work" + inferred active+scheduled drivers
  - `halfDays: HistoryEntry[]` — status "half_day" (NEW bucket)
  - `holidays: ScheduleRow[]` — status "holiday"
  - `cuts: HistoryEntry[]` — status "cut" or timeOff reason "Cut"/"Other"
  - `callOuts: HistoryEntry[]` — status "call_out" or timeOff reason "Call Out"
  - `dayOffs: HistoryEntry[]` — status "day_off" (NEW bucket)
  - `trainees: ScheduleRow[]` — status "trainee" or inferred isTrainee driver (NEW bucket)
  - `timeOffList: HistoryEntry[]` — timeOffEntries fallback only

**Design decisions:**
- `half_day` (driver came in, left early): shown in a separate "Half Day" teal card so managers can distinguish partial from full work days
- `trainee` (driver worked as trainee): shown in a "Trainee" slate card — separate from Working because trainee days count differently on payroll
- `day_off` (manager-recorded planned day off): shown in a "Day Off" sky card — distinct from Call Out (driver-initiated) and Cut (management decision)
- Hard-deleted drivers (in `attendance_log` but absent from `schedules`): synthesize a minimal `ScheduleRow` stub using the `driverName` snapshot from the log record so the historical name still renders

**The 3-pass algorithm:**

Pass 1 — `attendance_log` is authoritative: Filter `attendanceRecords` to `date === historyDate`. For each record, look up the driver in `scheduleMap` (synthesize stub if absent). Route to bucket by `status`. Mark `driverId` as processed.

Pass 2 — schedule-inference fallback: For each driver in `schedules` who is `active`, not yet processed, was scheduled on `dayKey` (or has an override), is not past their last day, and is NOT in `offDriverIds` — add to `working` (or `trainees` if `isTrainee`). Mirrors inference in `getPayrollWeek` so history and payroll agree.

Pass 3 — `timeOffEntries` legacy fallback: For each driver in `offDriverIds` who is not yet processed, route their `dayEntries` records to `cuts` / `callOuts` / `timeOffList` as before.
- [ ] **Step 1: Locate the three regions in `scheduling-client.tsx`**

  - Region A: starts at `type HistoryEntry = { driver: ScheduleRow; reason: string; note: string | null };` (~line 1379), ends with the closing `}` of the old `for` loop (~line 1410), just before `const Section = ...`
  - Region B: the array literal `[{title: "Working", ...}, ..., {title: "Time Off", ...}].map(...)` (~lines 1459-1498)
  - Region C: the empty-state condition `{working.length === 0 && ...` (~line 1501)

- [ ] **Step 2: Replace Region A**

  Remove everything from `type HistoryEntry = ...` through the closing `}` of the old `for` loop. Replace with:

  ```ts
  type HistoryEntry = { driver: ScheduleRow; reason: string; note: string | null };
  const working: ScheduleRow[] = [];
  const halfDays: HistoryEntry[] = [];
  const holidays: ScheduleRow[] = [];
  const cuts: HistoryEntry[] = [];
  const callOuts: HistoryEntry[] = [];
  const dayOffs: HistoryEntry[] = [];
  const trainees: ScheduleRow[] = [];
  const timeOffList: HistoryEntry[] = [];

  // Track processed driverIds so fallback passes do not double-count.
  const processedIds = new Set<string>();

  // -- PASS 1: attendance_log entries for this date are authoritative ----------
  // attendanceRecords covers today-365 to today+14 (after the page.tsx fix).
  // Filter to exactly the selected historyDate.
  const loggedOnDate = attendanceRecords.filter((r) => r.date === historyDate);

  for (const record of loggedOnDate) {
    processedIds.add(record.driverId);

    // Look up the ScheduleRow for name + isTrainee. The driver may have been
    // hard-deleted from the drivers table and therefore absent from schedules.
    // Fall back to a minimal stub using the driverName snapshot from the log
    // so the historical name still renders.
    const driver: ScheduleRow = scheduleMap[record.driverId] ?? {
      id: -1,
      driverId: record.driverId,
      name: record.driverName,
      active: false,
      workArea: null,
      defaultWorkAreaId: null,
      isTrainee: false,
      noticeDate: null,
      lastDay: null,
      schedule: null,
    };

    switch (record.status) {
      case "work":
        working.push(driver);
        break;
      case "trainee":
        trainees.push(driver);
        break;
      case "half_day":
        halfDays.push({ driver, reason: "Half Day", note: record.note });
        break;
      case "holiday":
        holidays.push(driver);
        break;
      case "cut":
        cuts.push({ driver, reason: "Cut", note: record.note });
        break;
      case "call_out":
        callOuts.push({ driver, reason: "Call Out", note: record.note });
        break;
      case "day_off":
        dayOffs.push({ driver, reason: "Day Off", note: record.note });
        break;
      default:
        // Exhaustive guard — AttendanceStatus has no other values in strict mode.
        working.push(driver);
    }
  }

  // -- PASS 2: schedule-inference fallback for active drivers with no log entry
  // An active driver who was scheduled on this day but has no log entry is
  // presumed to have worked normally (or as trainee if isTrainee). Mirrors
  // getPayrollWeek inference so history and payroll agree.
  for (const driver of schedules) {
    if (processedIds.has(driver.driverId)) continue;
    if (!driver.active) continue;
    if (isPastLastDay(driver.driverId, date)) continue;
    const scheduled = dayKey ? driver.schedule?.[dayKey] === true : false;
    const hasOverride = dayOverrideIds.has(driver.driverId);
    if (!scheduled && !hasOverride) continue;
    // Skip drivers with a timeOffEntry — handled in Pass 3.
    if (offDriverIds.has(driver.driverId)) continue;
    processedIds.add(driver.driverId);
    if (driver.isTrainee) {
      trainees.push(driver);
    } else {
      working.push(driver);
    }
  }

  // -- PASS 3: timeOffEntries legacy fallback --------------------------------
  // Handles Cut/Call Out records written before attendance_log existed, and
  // any timeOff entry without a corresponding log record.
  for (const driver of schedules) {
    if (processedIds.has(driver.driverId)) continue;
    if (!offDriverIds.has(driver.driverId)) continue;
    processedIds.add(driver.driverId);
    const entries = dayEntries.filter((to) => to.driverId === driver.driverId);
    for (const e of entries) {
      if (e.reason === "Cut" || e.reason === "Other") {
        cuts.push({ driver, reason: e.reason, note: e.note });
      } else if (e.reason === "Call Out") {
        callOuts.push({ driver, reason: e.reason, note: e.note });
      } else {
        timeOffList.push({ driver, reason: e.reason, note: e.note });
      }
    }
  }
  ```
- [ ] **Step 3: Replace Region B (the grid card array)**

  Remove the entire array literal `[{title: "Working", ...}, ..., {title: "Time Off", ...}].map(...)`. Replace with:

  ```tsx
  {[
    {
      title: "Working", color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-200/60",
      items: working.map((d) => ({ name: d.name, driverId: d.driverId })),
      emptyText: "No drivers scheduled",
      onClickItem: (driverId: string) => {
        const driver = working.find((d) => d.driverId === driverId);
        if (driver) openCoverageModal(driver, historyDate);
      },
    },
    {
      title: "Half Day", color: "text-teal-600",
      bg: "bg-teal-50 border-teal-200/60",
      items: halfDays.map(({ driver, note }) => ({ name: driver.name, driverId: driver.driverId, note })),
      emptyText: "No half days",
      onClickItem: undefined,
    },
    {
      title: "Trainee", color: "text-slate-500",
      bg: "bg-slate-50 border-slate-200/60",
      items: trainees.map((d) => ({ name: d.name, driverId: d.driverId })),
      emptyText: "No trainees",
      onClickItem: undefined,
    },
    {
      title: "Holiday", color: "text-violet-600",
      bg: "bg-violet-50 border-violet-200/60",
      items: holidays.map((d) => ({ name: d.name, driverId: d.driverId })),
      emptyText: "No holiday",
      onClickItem: undefined,
    },
    {
      title: "Cut", color: "text-red-500",
      bg: "bg-red-50 border-red-200/60",
      items: cuts.map(({ driver, note }) => ({ name: driver.name, driverId: driver.driverId, note })),
      emptyText: "No cuts",
      onClickItem: undefined,
    },
    {
      title: "Called Out", color: "text-amber-600",
      bg: "bg-amber-50 border-amber-200/60",
      items: callOuts.map(({ driver, note }) => ({ name: driver.name, driverId: driver.driverId, note })),
      emptyText: "No call-outs",
      onClickItem: undefined,
    },
    {
      title: "Day Off", color: "text-sky-600",
      bg: "bg-sky-50 border-sky-200/60",
      items: dayOffs.map(({ driver, note }) => ({ name: driver.name, driverId: driver.driverId, note })),
      emptyText: "No day offs",
      onClickItem: undefined,
    },
    {
      title: "Time Off", color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200/60",
      items: timeOffList.map(({ driver, reason, note }) => ({ name: driver.name, driverId: driver.driverId, note: [reason, note].filter(Boolean).join(" · ") })),
      emptyText: "No time off",
      onClickItem: undefined,
    },
  ].map(({ title, color, bg, items, emptyText, onClickItem }) => (
    <div key={title} className={`rounded-2xl border p-5 ${bg}`}>
      <Section title={title} color={color} items={items} emptyText={emptyText} onClickItem={onClickItem} />
    </div>
  ))}
  ```

  The outer container `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">` does not change. Eight cards renders as a 4x2 grid on large screens.
- [ ] **Step 4: Replace Region C (the empty-state condition)**

  Find (~line 1501):
  ```tsx
  {working.length === 0 && holidays.length === 0 && cuts.length === 0 && callOuts.length === 0 && timeOffList.length === 0 && (
  ```

  Replace with:
  ```tsx
  {working.length === 0 && halfDays.length === 0 && trainees.length === 0 && holidays.length === 0 && cuts.length === 0 && callOuts.length === 0 && dayOffs.length === 0 && timeOffList.length === 0 && (
  ```

- [ ] **Step 5: Run TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: zero errors.

  Common errors and fixes:

  **"Object literal may only specify known properties"** on the synthetic stub — compare against the `ScheduleRow` type at lines 32-46 of `scheduling-client.tsx`. Required fields: `id: number`, `driverId: string`, `name: string`, `active: boolean`, `workArea: string | null`, `defaultWorkAreaId: number | null`, `isTrainee: boolean`, `noticeDate: string | null`, `lastDay: string | null`, `schedule: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean; notes: string | null } | null`. The stub uses `id: -1` and `schedule: null` — both type-compatible.

  **"Type undefined is not assignable to type (driverId: string) => void"** — the `Section` prop is `onClickItem?: (driverId: string) => void` (optional). If TypeScript still complains about the mapped array, annotate the element type explicitly: add `onClickItem?: (driverId: string) => void` to a local type alias declared just above the array literal.

- [ ] **Step 6: Smoke-test in browser**

  Run `npm run dev`. Navigate to `/dashboard/scheduling` and switch to the History tab.

  | Scenario | Expected result |
  |----------|----------------|
  | Pick a date where a driver has a "work" log entry | Driver appears only in Working |
  | Pick a date where a driver has a "cut" log entry with a note | Driver appears in Cut with their note |
  | Pick a date where a driver has a "call_out" log entry | Driver appears in Called Out |
  | Pick a date where a driver has a "half_day" log entry | Driver appears in Half Day |
  | Pick a date where a driver has a "holiday" log entry | Driver appears in Holiday |
  | Active driver scheduled that day, no log entry | Driver appears in Working (inferred) |
  | Terminated driver with a log entry for that date | Driver appears in the correct bucket |
  | Pick a date older than 60 days that has log data | Records appear (not silently empty) |
  | Switch to Coverage tab and navigate weeks | Coverage tab is completely unaffected |
  | Pick a date with no activity | "No drivers were scheduled on this day." appears |

- [ ] **Step 7: Commit**

  ```bash
  git add app/dashboard/scheduling/scheduling-client.tsx
  git commit -m "fix: rewrite history-tab loop to use attendance_log as source of truth

  Bugs fixed:
  - BUG 1 (CRITICAL): loop no longer checks driver.schedule[dayKey] against
    the current repeating schedule for a past date; reads attendance_log
    records for the exact selected date instead.
  - BUG 2 (CRITICAL): terminated drivers now appear whenever they have a
    log entry for the selected date, regardless of their active flag.
  - BUG 3 (HIGH): all AttendanceStatus values (half_day, cut, call_out,
    trainee, day_off, holiday) are routed to their own display bucket
    instead of falling through to Working.

  Algorithm: 3-pass design - (1) attendance_log entries for historyDate are
  authoritative and processed first, (2) active+scheduled drivers with no
  log entry are inferred as working (mirrors getPayrollWeek so history and
  payroll agree), (3) timeOffEntries are legacy fallback for pre-log data.

  New display cards: Half Day (teal), Trainee (slate), Day Off (sky).
  Synthetic ScheduleRow stub handles hard-deleted drivers gracefully."
  ```

---

## Self-Review

**Spec coverage:**
- Bug 1 (history uses current schedule instead of historical attendance): fixed in Task 3 Pass 1 — `attendanceRecords.filter((r) => r.date === historyDate)` reads actual log entries, not `driver.schedule[dayKey]`
- Bug 2 (terminated drivers excluded): fixed in Task 3 Pass 1 — processes all `loggedOnDate` records regardless of `driver.active`; terminated drivers with log entries always appear
- Bug 3 (only "holiday" handled, all others default to Working): fixed in Task 3 `switch` statement — covers all 7 `AttendanceStatus` values with explicit cases, no fall-through
- Bug 4 (60-day fetch window): fixed in Task 2 — `-60` changed to `-365`
- `getAttendanceForRange` verified correct in Task 1 — no active filter, returns terminated-driver records
- `schedules` prop confirmed to include inactive/terminated drivers — `getAllSchedules()` WHERE clause filters only on `organizationId`
- Coverage tab loop: not touched — entirely outside the `tab === "history"` block
- `getPayrollWeek`: not touched — already handles terminated drivers correctly

**Placeholder scan:** No TBDs, no vague instructions, no "similar to Task N". All code blocks are complete and copy-pasteable.

**Type consistency:**
- `HistoryEntry` type declared once in Region A and used only within the same IIFE scope — no cross-task drift
- `ScheduleRow` synthetic stub fields match the type declaration at lines 32-46: `id`, `driverId`, `name`, `active`, `workArea`, `defaultWorkAreaId`, `isTrainee`, `noticeDate`, `lastDay`, `schedule`
- `halfDays`, `dayOffs`, `trainees` declared in Region A and referenced in both Region B and Region C — no name mismatch
- `onClickItem: undefined` is valid — `Section` prop is `onClickItem?: (driverId: string) => void`
- `attendanceRecords` is a prop of `SchedulingClient` and in scope everywhere in the component, including inside the IIFE
- `processedIds` is `Set<string>` — TypeScript infers this from `new Set<string>()`

---

### Critical Files for Implementation

- `app/dashboard/scheduling/scheduling-client.tsx`
- `app/dashboard/scheduling/page.tsx`
- `lib/actions/attendance.ts`
