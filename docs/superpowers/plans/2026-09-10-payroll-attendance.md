# Payroll Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add daily attendance tracking (Work / Half Day / Cut / Call Out / Trainee) with optional notes to the scheduling page, then surface last week's attendance as a printable payroll report — replacing the empty payroll card on the dashboard.

**Architecture:** New `attendanceLog` table (driverId as plain text so records survive driver hard-delete) is the backward-looking record of what actually happened each day. The scheduling UI's coverage modal gains a note step for Cut/Call Out and a new Half Day button; all three write to `attendanceLog`. The payroll report at `/dashboard/payroll` reads from `attendanceLog`, groups by Sat→Fri week, and renders a printable grid.

**Tech Stack:** Next.js App Router, Drizzle ORM (drizzle-orm@0.45.2), Tailwind CSS, TypeScript, lucide-react, date-fns

**Spec:** `docs/superpowers/specs/2026-09-09-payroll-attendance.md`

## Global Constraints

- Pay week runs **Saturday → Friday**
- `driverId` in `attendanceLog` is plain text (NOT a FK) so records survive driver hard-delete
- `organizationId` is an integer FK to `organizations.id` (cascade delete OK for org-level cleanup)
- Status values are exactly: `"work" | "half_day" | "cut" | "call_out" | "trainee" | "day_off"`
- Setting key is exactly `no_notice_deduction_amount`, default value `"500"` (string in settings table)
- Deduction badge label: `−$X · No Notice` where X = org's configured amount
- Cut/Call Out writes to BOTH `timeOffEntries` (keeps coverage display working) AND `attendanceLog` (payroll record)
- Half Day writes ONLY to `attendanceLog` (driver is still working, not off)
- Migration command: `npm run db:migrate`
- Never ask the user to run SQL or DB commands — always execute them via Bash
- Branch: `testing-742` (never push to master)
- Read `node_modules/next/dist/docs/` before writing Next.js-specific code if uncertain

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/schema.ts` | Modify | Add `attendanceLog` table |
| `drizzle/0026_attendance_log.sql` | Create | Migration SQL |
| `lib/actions/attendance.ts` | Create | All attendance server actions |
| `lib/actions/scheduling.ts` | Modify | `setDriverTrainee` writes per-day attendanceLog rows |
| `app/dashboard/scheduling/page.tsx` | Modify | Fetch 60-day attendance range, pass to client |
| `app/dashboard/scheduling/scheduling-client.tsx` | Modify | Note modal, Half Day button, cell overlays |
| `components/cards/payroll-card.tsx` | Modify | Show last week summary; link to `/dashboard/payroll` |
| `app/dashboard/page.tsx` | Modify | Fetch payroll summary for card |
| `app/dashboard/payroll/page.tsx` | Create | Payroll report server component |
| `app/dashboard/payroll/payroll-client.tsx` | Create | Payroll report client component with week nav + print |
| `app/dashboard/drivers/page.tsx` | Modify | Upgrade hard-delete confirmation modal |

---

## Task 1: Schema + Migration

Add the `attendanceLog` table to Drizzle schema and create/run the migration.

**Files:**
- Modify: `lib/schema.ts`
- Create: `drizzle/0026_attendance_log.sql`

**Interfaces:**
- Produces: `attendanceLog` Drizzle table reference — used in Tasks 2, 3, 4

- [ ] **Step 1: Add `attendanceLog` table to `lib/schema.ts`**

Open `lib/schema.ts`. At the very end of the file, append:

```ts
// ── Attendance Log (backward-looking daily attendance record) ─────────────────
export const attendanceLog = pgTable("attendance_log", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  driverId:       text("driver_id").notNull(),     // plain text — NOT FK, survives driver hard-delete
  driverName:     text("driver_name").notNull(),   // snapshot of name at time of logging
  date:           date("date").notNull(),
  status:         text("status").notNull(),        // "work"|"half_day"|"cut"|"call_out"|"trainee"|"day_off"
  note:           text("note"),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
}, (t) => ({
  orgDriverDateUnique: uniqueIndex("attendance_log_org_driver_date_unique").on(t.organizationId, t.driverId, t.date),
}));
```

Note: `organizationId` has a FK to `organizations` (cascade delete), but `driverId` does NOT reference `drivers` — plain text intentionally so attendance survives driver hard-delete.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `attendanceLog`. Fix any type errors before proceeding.

- [ ] **Step 3: Create migration SQL file**

Create `drizzle/0026_attendance_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS "attendance_log" (
  "id"              serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "driver_id"       text NOT NULL,
  "driver_name"     text NOT NULL,
  "date"            date NOT NULL,
  "status"          text NOT NULL,
  "note"            text,
  "created_at"      timestamp DEFAULT now(),
  "updated_at"      timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_log_org_driver_date_unique"
  ON "attendance_log" ("organization_id", "driver_id", "date");
```

- [ ] **Step 4: Run the migration**

```bash
cd C:/Users/Blake/Documents/wayneboard && npm run db:migrate
```

Expected: migration runs successfully without errors.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Blake/Documents/wayneboard
git add lib/schema.ts drizzle/0026_attendance_log.sql
git commit -m "feat: add attendanceLog table schema and migration"
```

---

## Task 2: Attendance Server Actions

Create `lib/actions/attendance.ts` with all server actions needed by the scheduling UI and payroll report.

**Files:**
- Create: `lib/actions/attendance.ts`

**Interfaces:**
- Consumes: `attendanceLog` table from `lib/schema.ts` (Task 1)
- Consumes: `drivers`, `settings` tables from `lib/schema.ts`
- Produces (used by Task 3 scheduling UI):
  - `upsertAttendance(driverId: string, driverName: string, date: string, status: AttendanceStatus, note?: string): Promise<void>`
  - `getAttendanceForRange(startDate: string, endDate: string): Promise<AttendanceRecord[]>`
- Produces (used by Task 4 payroll report):
  - `getPayrollWeek(weekStart: string, weekEnd: string): Promise<PayrollWeekData>`
  - `getPayrollCardSummary(): Promise<PayrollCardSummary>`

- [ ] **Step 1: Create `lib/actions/attendance.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { attendanceLog, drivers, settings } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg(): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type AttendanceStatus = "work" | "half_day" | "cut" | "call_out" | "trainee" | "day_off";

export type AttendanceRecord = {
  driverId: string;
  driverName: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
};

// ── Upsert a single attendance record ────────────────────────────────────────

export async function upsertAttendance(
  driverId: string,
  driverName: string,
  date: string,
  status: AttendanceStatus,
  note?: string,
): Promise<void> {
  const orgId = await requireOrg();
  await db
    .insert(attendanceLog)
    .values({
      organizationId: orgId,
      driverId,
      driverName,
      date,
      status,
      note: note ?? null,
    })
    .onConflictDoUpdate({
      target: [attendanceLog.organizationId, attendanceLog.driverId, attendanceLog.date],
      set: { status, note: note ?? null, updatedAt: new Date() },
    });
  revalidatePath("/dashboard/scheduling");
  revalidatePath("/dashboard/payroll");
}

// ── Fetch attendance records for a date range (for scheduling UI overlay) ───

export async function getAttendanceForRange(
  startDate: string,
  endDate: string,
): Promise<AttendanceRecord[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      driverId:   attendanceLog.driverId,
      driverName: attendanceLog.driverName,
      date:       attendanceLog.date,
      status:     attendanceLog.status,
      note:       attendanceLog.note,
    })
    .from(attendanceLog)
    .where(
      and(
        eq(attendanceLog.organizationId, orgId),
        gte(attendanceLog.date, startDate),
        lte(attendanceLog.date, endDate),
      )
    );
  return rows as AttendanceRecord[];
}

// ── Types for payroll report ─────────────────────────────────────────────────

export type PayrollDriverRow = {
  driverId: string;
  name: string;
  isTerminated: boolean;
  terminationType: string | null;  // "notice" | "fired" | "mistake" | null
  terminationNote: string | null;
  terminatedAt: Date | null;
  // Map of date string → status (only dates with records)
  attendance: Record<string, AttendanceStatus>;
  notes: Record<string, string | null>;
};

export type PayrollWeekData = {
  weekStart: string;
  weekEnd: string;
  drivers: PayrollDriverRow[];
  deductionAmount: number;
};

// ── Get full payroll week data ───────────────────────────────────────────────

export async function getPayrollWeek(weekStart: string, weekEnd: string): Promise<PayrollWeekData> {
  const orgId = await requireOrg();

  // 1. Get deduction amount from settings (default 500)
  const [deductionSetting] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, "no_notice_deduction_amount")))
    .limit(1);
  const deductionAmount = parseInt(deductionSetting?.value ?? "500", 10);

  // 2. Get all attendance records for the week
  const records = await db
    .select({
      driverId:   attendanceLog.driverId,
      driverName: attendanceLog.driverName,
      date:       attendanceLog.date,
      status:     attendanceLog.status,
      note:       attendanceLog.note,
    })
    .from(attendanceLog)
    .where(
      and(
        eq(attendanceLog.organizationId, orgId),
        gte(attendanceLog.date, weekStart),
        lte(attendanceLog.date, weekEnd),
      )
    );

  // 3. Get all current drivers for the org (active + terminated with records)
  const allDrivers = await db
    .select({
      driverId:        drivers.driverId,
      name:            drivers.name,
      active:          drivers.active,
      terminationType: drivers.terminationType,
      terminationNote: drivers.terminationNote,
      terminatedAt:    drivers.terminatedAt,
    })
    .from(drivers)
    .where(eq(drivers.organizationId, orgId));

  const driverMap = new Map(allDrivers.map((d) => [d.driverId, d]));

  // 4. Collect all unique driverIds that appear in attendance OR are active
  const attendanceDriverIds = new Set(records.map((r) => r.driverId));
  const activeDriverIds = new Set(allDrivers.filter((d) => d.active).map((d) => d.driverId));
  const allDriverIds = new Set([...attendanceDriverIds, ...activeDriverIds]);

  // 5. Build PayrollDriverRow for each
  const payrollDrivers: PayrollDriverRow[] = [];

  for (const driverId of allDriverIds) {
    const driverRecord = driverMap.get(driverId);
    const driverRecords = records.filter((r) => r.driverId === driverId);

    const attendanceByDate: Record<string, AttendanceStatus> = {};
    const notesByDate: Record<string, string | null> = {};
    for (const r of driverRecords) {
      attendanceByDate[r.date] = r.status as AttendanceStatus;
      notesByDate[r.date] = r.note;
    }

    // Name: use driver record if exists, else fallback to last seen in attendance
    const name = driverRecord?.name ?? (driverRecords[0]?.driverName ?? driverId);

    payrollDrivers.push({
      driverId,
      name,
      isTerminated: driverRecord ? !driverRecord.active : true,
      terminationType: driverRecord?.terminationType ?? null,
      terminationNote: driverRecord?.terminationNote ?? null,
      terminatedAt:    driverRecord?.terminatedAt ?? null,
      attendance:      attendanceByDate,
      notes:           notesByDate,
    });
  }

  // Sort: active drivers first (by name), terminated last (by name)
  payrollDrivers.sort((a, b) => {
    if (a.isTerminated !== b.isTerminated) return a.isTerminated ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return { weekStart, weekEnd, drivers: payrollDrivers, deductionAmount };
}

// ── Quick summary for dashboard payroll card ─────────────────────────────────

export type PayrollCardSummary = {
  weekStart: string;
  weekEnd: string;
  totalDrivers: number;
  totalWorkDays: number; // work counts 1, half_day counts 0.5
  traineeCount: number;
  hasData: boolean;
};

export async function getPayrollCardSummary(): Promise<PayrollCardSummary> {
  const orgId = await requireOrg();

  // Compute last completed week (Saturday → Friday)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun ... 6=Sat
  // Days back to most recent Friday (including today if today is Friday)
  const daysToFri = (dayOfWeek + 2) % 7;
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - daysToFri);
  const weekEnd = lastFriday.toISOString().slice(0, 10);
  const weekStartDate = new Date(lastFriday);
  weekStartDate.setDate(lastFriday.getDate() - 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  const records = await db
    .select({
      driverId: attendanceLog.driverId,
      status:   attendanceLog.status,
    })
    .from(attendanceLog)
    .where(
      and(
        eq(attendanceLog.organizationId, orgId),
        gte(attendanceLog.date, weekStart),
        lte(attendanceLog.date, weekEnd),
      )
    );

  if (records.length === 0) {
    return { weekStart, weekEnd, totalDrivers: 0, totalWorkDays: 0, traineeCount: 0, hasData: false };
  }

  const uniqueDriverIds = new Set(records.map((r) => r.driverId));
  let workDays = 0;
  let traineeDays = 0;
  for (const r of records) {
    if (r.status === "work") workDays += 1;
    else if (r.status === "half_day") workDays += 0.5;
    else if (r.status === "trainee") traineeDays += 1;
  }

  return {
    weekStart,
    weekEnd,
    totalDrivers: uniqueDriverIds.size,
    totalWorkDays: workDays,
    traineeCount: traineeDays,
    hasData: true,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any errors before proceeding.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Blake/Documents/wayneboard
git add lib/actions/attendance.ts
git commit -m "feat: add attendance server actions (upsert, range fetch, payroll week, card summary)"
```

---

## Task 3: Scheduling UI — Note Modal, Half Day, Attendance Writes, Trainee History

Modifies the coverage modal and trainee toggle to write to `attendanceLog`. Overlays Half Day visual badges on the coverage calendar.

**Files:**
- Modify: `lib/actions/scheduling.ts` (trainee toggle writes attendanceLog)
- Modify: `app/dashboard/scheduling/page.tsx` (fetch 60-day attendance for overlay)
- Modify: `app/dashboard/scheduling/scheduling-client.tsx` (note modal, Half Day button, cell overlays)

**Interfaces:**
- Consumes: `upsertAttendance`, `getAttendanceForRange`, `AttendanceRecord`, `AttendanceStatus` from `lib/actions/attendance.ts` (Task 2)
- Consumes: `attendanceLog`, `driverSchedules` tables from `lib/schema.ts` (Task 1)

- [ ] **Step 1: Modify `setDriverTrainee` in `lib/actions/scheduling.ts`**

Read `lib/actions/scheduling.ts` first.

Add `attendanceLog` to the existing schema import line at the top:
```ts
import { drivers, driverSchedules, timeOffEntries, scheduleOverrides, attendanceLog } from "@/lib/schema";
```

Replace the existing `setDriverTrainee` function with:

```ts
export async function setDriverTrainee(driverId: string, isTrainee: boolean) {
  const orgId = await requireOrg();

  // Update the driver's current trainee status
  await db.update(drivers).set({ isTrainee }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));

  // Write per-day attendance history for each scheduled day in the current week
  const [schedule] = await db
    .select()
    .from(driverSchedules)
    .where(eq(driverSchedules.driverId, driverId))
    .limit(1);

  const [driver] = await db
    .select({ name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)))
    .limit(1);

  if (schedule && driver) {
    // Compute current Saturday→Friday week
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun...6=Sat
    const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const weekSat = new Date(today);
    weekSat.setDate(today.getDate() - daysSinceSat);

    // Sat=+0, Sun=+1, Mon=+2, Tue=+3, Wed=+4, Thu=+5, Fri=+6
    const DAY_KEYS: Array<{ key: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; offset: number }> = [
      { key: "sat", offset: 0 },
      { key: "sun", offset: 1 },
      { key: "mon", offset: 2 },
      { key: "tue", offset: 3 },
      { key: "wed", offset: 4 },
      { key: "thu", offset: 5 },
      { key: "fri", offset: 6 },
    ];

    for (const { key, offset } of DAY_KEYS) {
      if (!schedule[key]) continue;
      const d = new Date(weekSat);
      d.setDate(weekSat.getDate() + offset);
      const dateStr = d.toISOString().slice(0, 10);
      const status = isTrainee ? ("trainee" as const) : ("work" as const);

      await db
        .insert(attendanceLog)
        .values({ organizationId: orgId, driverId, driverName: driver.name, date: dateStr, status, note: null })
        .onConflictDoUpdate({
          target: [attendanceLog.organizationId, attendanceLog.driverId, attendanceLog.date],
          set: { status, updatedAt: new Date() },
        });
    }
  }

  revalidatePath("/dashboard/scheduling");
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors before continuing.

- [ ] **Step 3: Modify `app/dashboard/scheduling/page.tsx` to fetch attendance**

Read `app/dashboard/scheduling/page.tsx` first.

Add import at the top:
```ts
import { getAttendanceForRange } from "@/lib/actions/attendance";
```

Also ensure `addDays` is imported from `date-fns` (add it to the existing date-fns import if not present):
```ts
import { format, addDays } from "date-fns";
```

In the `SchedulingPage` function, compute the attendance range and add it to the `Promise.all`. Find the existing `rangeStart` variable and add:
```ts
const rangeEnd = format(addDays(today, 14), "yyyy-MM-dd");
const attendanceStart = format(addDays(today, -60), "yyyy-MM-dd");
```

Add `getAttendanceForRange(attendanceStart, rangeEnd)` as the last item in the `Promise.all` array, and destructure it as `attendanceRecords`.

Pass the new prop to `<SchedulingClient>`:
```tsx
<SchedulingClient
  schedules={schedules as any}
  timeOff={timeOff as any}
  upcomingOverrides={upcomingOverrides as any}
  allOverrides={allOverrides as any}
  today={rangeStart}
  vehicles={vehicles as any}
  workAreas={workAreasList as any}
  dailyAssignments={dailyAssignments as any}
  droRoutes={droRoutesList}
  attendanceRecords={attendanceRecords}
/>
```

- [ ] **Step 4: Modify `scheduling-client.tsx` — props, state, and attendance lookup**

Read `app/dashboard/scheduling/scheduling-client.tsx` first (it is ~1500 lines; read it fully).

**A. Add imports at the top of the file:**
```ts
import { upsertAttendance } from "@/lib/actions/attendance";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/actions/attendance";
```

**B. Add `attendanceRecords` to the props destructuring and the props type:**
```ts
export default function SchedulingClient({
  schedules, timeOff, upcomingOverrides, allOverrides, today, vehicles, workAreas, dailyAssignments, droRoutes,
  attendanceRecords,
}: {
  // ...existing types...
  attendanceRecords: AttendanceRecord[];
}) {
```

**C. Add attendance lookup map** inside the component body, near the top (after the state declarations):
```ts
// Build lookup: "driverId|date" → { status, note }
const attendanceMap = new Map<string, { status: AttendanceStatus; note: string | null }>();
for (const r of attendanceRecords) {
  attendanceMap.set(`${r.driverId}|${r.date}`, { status: r.status, note: r.note });
}
```

**D. Add note modal state** near the coverage modal state section:
```ts
type AttendanceAction = "cut" | "call_out" | "half_day";
const [noteAction, setNoteAction] = useState<AttendanceAction | null>(null);
const [noteText, setNoteText] = useState("");
```

**E. Remove the existing `handleCutDay` and `handleCallOut` functions. Replace with `handleConfirmAttendance`:**
```ts
function handleConfirmAttendance() {
  if (!coverageModal || !noteAction) return;
  const { driver, dateStr } = coverageModal;
  const note = noteText.trim() || undefined;

  startTransition(async () => {
    if (noteAction === "cut" || noteAction === "call_out") {
      // Keep writing to timeOffEntries so coverage display continues to work
      const reason = noteAction === "cut" ? "Cut" : "Call Out";
      await addTimeOff(driver.driverId, dateStr, dateStr, reason, note);
    }
    // Write to attendanceLog for payroll tracking
    const status: AttendanceStatus =
      noteAction === "half_day" ? "half_day"
      : noteAction === "cut" ? "cut"
      : "call_out";
    await upsertAttendance(driver.driverId, driver.name, dateStr, status, note);

    setNoteAction(null);
    setNoteText("");
    setCoverageModal(null);
  });
}
```

**F. In the coverage modal JSX**, find the `<div className="grid grid-cols-2 gap-2">` that contains the Cut and Call Out buttons. Replace the entire grid (including the two buttons and the caption below) with a 3-column grid that opens the note modal:

```tsx
<div className="grid grid-cols-3 gap-2">
  <button
    onClick={() => { setNoteAction("cut"); setNoteText(""); }}
    disabled={isPending}
    className="py-3 rounded-xl text-[13px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
  >
    <X className="w-3.5 h-3.5" />
    Cut
  </button>
  <button
    onClick={() => { setNoteAction("call_out"); setNoteText(""); }}
    disabled={isPending}
    className="py-3 rounded-xl text-[13px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
  >
    <AlertTriangle className="w-3.5 h-3.5" />
    Call Out
  </button>
  <button
    onClick={() => { setNoteAction("half_day"); setNoteText(""); }}
    disabled={isPending}
    className="py-3 rounded-xl text-[13px] font-bold bg-yellow-500 text-white hover:bg-yellow-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
  >
    ½ Half Day
  </button>
</div>
<p className="text-[11px] text-slate-400">Cut = management · Call Out = driver · Half Day = left early</p>
```

**G. Add the note modal overlay inside the coverage modal's inner white card div.** Find the inner white card `<div className="bg-white rounded-2xl shadow-...">` and add `relative` to its className. Then add this JSX as the first child inside that div (before the header):

```tsx
{/* Note modal overlay */}
{noteAction && (
  <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 gap-4 z-10">
    <p className="text-[15px] font-extrabold text-slate-900 text-center">
      {noteAction === "cut" ? "Cut Day" : noteAction === "call_out" ? "Call Out" : "Half Day"}
      {" — "}{coverageModal?.driver.name}
    </p>
    <p className="text-[12px] text-slate-500 text-center">
      {noteAction === "cut" && "Management decision — not using this driver today."}
      {noteAction === "call_out" && "Driver called in and won't be coming in."}
      {noteAction === "half_day" && "Driver worked a partial day and left early."}
    </p>
    <textarea
      autoFocus
      placeholder="Add a note (optional)"
      value={noteText}
      onChange={(e) => setNoteText(e.target.value)}
      rows={3}
      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none"
    />
    <div className="flex gap-2 w-full">
      <button
        onClick={() => { setNoteAction(null); setNoteText(""); }}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleConfirmAttendance}
        disabled={isPending}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Confirm
      </button>
    </div>
  </div>
)}
```

**H. Add Half Day visual badge to coverage cells.**

In the coverage tab cell render, find the `.map((d) => ...)` that renders each working driver's button. Add the attendanceMap lookup and conditional Half Day styling:

```tsx
{working.map((d) => {
  const isLastDay = d.lastDay === dateStr;
  const isTrainee = d.isTrainee;
  const wa = getEffectiveWorkArea(d.driverId, d.defaultWorkAreaId, dateStr);
  const droRoute = d.workArea ? droRoutes.find(r => r.workAreaName === d.workArea) : null;
  const attendanceEntry = attendanceMap.get(`${d.driverId}|${dateStr}`);
  const isHalfDay = attendanceEntry?.status === "half_day";

  return (
    <div key={d.driverId} className="flex flex-col gap-0.5 w-full">
      <div className="flex items-center gap-1 w-full">
        <button
          onClick={() => openCoverageModal(d, dateStr)}
          className={`text-[11px] font-semibold px-2 py-1 rounded-md truncate text-left flex-1 min-w-0 transition-opacity hover:opacity-70 ${
            isHalfDay
              ? "text-yellow-800 bg-gradient-to-b from-yellow-200 to-white border border-yellow-300"
              : isTrainee
              ? "text-blue-700 bg-blue-50 border border-blue-100"
              : isLastDay
              ? "text-red-700 bg-red-50 border border-red-100"
              : "text-slate-700 bg-emerald-50 border border-emerald-100"
          }`}
        >
          <span className="flex items-center gap-1">
            {isHalfDay && <span className="text-[9px] font-extrabold text-yellow-700">½</span>}
            {d.name}
          </span>
        </button>
        {wa && !droRoute && (
          <>
            <span className="text-[10px] font-semibold text-slate-500 shrink-0 max-w-[36px] truncate">{wa.name}</span>
            <WorkAreaShape shape={wa.shape} color={wa.color} size={10} />
          </>
        )}
      </div>
      {droRoute && (
        <span className="text-[10px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 font-mono truncate">
          {droRoute.workAreaNumber} {droRoute.workAreaName.replace(/^742\s*/i, "")}
        </span>
      )}
    </div>
  );
})}
```

Also add Half Day to the legend (find the legend section and add):
```tsx
<span className="flex items-center gap-1.5">
  <span className="w-3 h-3 rounded-sm bg-gradient-to-b from-yellow-200 to-white border border-yellow-300 inline-block" />
  Half Day
</span>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 6: Manual browser verification**

1. Navigate to `/dashboard/scheduling` → Coverage tab
2. Click any working driver → coverage modal opens with 3 buttons: Cut, Call Out, Half Day
3. Click Cut → note modal overlay appears with "Cut Day — [Name]" and optional textarea
4. Click Cancel → returns to coverage modal (no changes made)
5. Click Cut → type a note → Confirm → modal closes; time-off tab shows the entry; DB has attendanceLog row
6. Click a driver → Half Day → Confirm → cell shows yellow gradient + ½ badge
7. On the schedules tab, toggle a driver's Trainee button → no errors; DB has attendanceLog rows for current week

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Blake/Documents/wayneboard
git add lib/actions/scheduling.ts app/dashboard/scheduling/page.tsx app/dashboard/scheduling/scheduling-client.tsx
git commit -m "feat: note modal + Half Day button in coverage modal; trainee toggle writes per-day attendance history"
```

---

## Task 4: Payroll Report Page + Dashboard Card Update

Create the full payroll report at `/dashboard/payroll` and update the dashboard payroll card.

**Files:**
- Create: `app/dashboard/payroll/page.tsx`
- Create: `app/dashboard/payroll/payroll-client.tsx`
- Modify: `components/cards/payroll-card.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getPayrollWeek`, `getPayrollCardSummary`, `PayrollWeekData`, `PayrollCardSummary`, `AttendanceStatus` from `lib/actions/attendance.ts` (Task 2)

- [ ] **Step 1: Create `app/dashboard/payroll/page.tsx`**

```tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getPayrollWeek } from "@/lib/actions/attendance";
import PayrollClient from "./payroll-client";

export const metadata: Metadata = { title: "Payroll" };

// Compute Saturday→Friday pay week bounds, offset by N completed weeks back
// offset=0 → most recently completed week, offset=1 → week before that, etc.
function getPayWeekBounds(offsetWeeks: number): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun ... 6=Sat
  // Days back to most recent Friday (including today if today IS Friday)
  const daysToFri = (dayOfWeek + 2) % 7;
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - daysToFri - offsetWeeks * 7);
  const weekEnd = lastFriday.toISOString().slice(0, 10);
  const satStart = new Date(lastFriday);
  satStart.setDate(lastFriday.getDate() - 6);
  const weekStart = satStart.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: { offset?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const offset = Math.max(0, parseInt(searchParams.offset ?? "0", 10));
  const { weekStart, weekEnd } = getPayWeekBounds(offset);
  const weekData = await getPayrollWeek(weekStart, weekEnd);

  return (
    <AppShell>
      <PayrollClient weekData={weekData} currentOffset={offset} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Create `app/dashboard/payroll/payroll-client.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import type { PayrollWeekData, AttendanceStatus } from "@/lib/actions/attendance";

// Column order: Sat, Sun, Mon, Tue, Wed, Thu, Fri
const WEEK_DAY_LABELS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Returns the 7 date strings for a week starting on weekStart (Saturday)
function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function StatusCell({ status, note }: { status: AttendanceStatus | undefined; note?: string | null }) {
  if (!status || status === "day_off") {
    return <span className="text-slate-300 text-[11px]">—</span>;
  }

  if (status === "work") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-emerald-500 text-[16px] font-bold leading-none" title={note ?? undefined}>●</span>
        {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
      </div>
    );
  }
  if (status === "half_day") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-yellow-600 text-[13px] font-extrabold leading-none" title={note ?? undefined}>½</span>
        {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
      </div>
    );
  }
  if (status === "cut") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200" title={note ?? undefined}>Cut</span>
        {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
      </div>
    );
  }
  if (status === "call_out") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200" title={note ?? undefined}>Out</span>
        {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
      </div>
    );
  }
  if (status === "trainee") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200" title={note ?? undefined}>T</span>
        {note && <span className="text-[9px] text-slate-400 leading-none" title={note}>📝</span>}
      </div>
    );
  }
  return <span className="text-slate-300 text-[11px]">—</span>;
}

function computeRowTotals(attendance: Record<string, AttendanceStatus>) {
  let workDays = 0;
  let traineeDays = 0;
  for (const status of Object.values(attendance)) {
    if (status === "work") workDays += 1;
    else if (status === "half_day") workDays += 0.5;
    else if (status === "trainee") traineeDays += 1;
  }
  return { workDays, traineeDays };
}

export default function PayrollClient({
  weekData,
  currentOffset,
}: {
  weekData: PayrollWeekData;
  currentOffset: number;
}) {
  const router = useRouter();
  const weekDates = getWeekDates(weekData.weekStart);
  const weekLabel = `${formatShortDate(weekData.weekStart)} – ${formatShortDate(weekData.weekEnd)}`;

  function navigate(newOffset: number) {
    router.push(`/dashboard/payroll?offset=${newOffset}`);
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 print:hidden">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            MyGroundOps · Admin
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Payroll
          </h1>
          <p className="text-[14px] text-slate-400 mt-2">
            Weekly attendance for payroll processing. Print this page and review with your records.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-6 print:mb-4">
        <button
          onClick={() => navigate(currentOffset + 1)}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors print:hidden"
          title="Previous week"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-[16px] font-extrabold text-slate-900">{weekLabel}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {currentOffset === 0
              ? "Most recent completed week"
              : `${currentOffset} week${currentOffset > 1 ? "s" : ""} ago`}
          </p>
        </div>
        <button
          onClick={() => navigate(Math.max(0, currentOffset - 1))}
          disabled={currentOffset === 0}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors print:hidden"
          title="Next week"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Print-only week header */}
      <div className="hidden print:block mb-4">
        <p className="text-[18px] font-extrabold">Payroll · {weekLabel}</p>
      </div>

      {/* Attendance grid */}
      {weekData.drivers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[15px] font-semibold text-slate-500">No attendance records for this week</p>
          <p className="text-[13px] text-slate-400 mt-1">
            Log Cut, Call Out, or Half Day from the Scheduling page to start tracking attendance.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider min-w-[160px]">
                    Driver
                  </th>
                  {WEEK_DAY_LABELS.map((day, i) => (
                    <th key={day} className="px-3 py-3 text-center min-w-[56px]">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{day}</div>
                      <div className="text-[10px] font-normal text-slate-300 normal-case">{formatShortDate(weekDates[i])}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center min-w-[60px]">
                    Days
                  </th>
                  <th className="px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center min-w-[60px]">
                    Trainee
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left min-w-[120px]">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {weekData.drivers.map((driver) => {
                  const { workDays, traineeDays } = computeRowTotals(driver.attendance);
                  const showDeduction = driver.isTerminated && driver.terminationType === "notice";
                  return (
                    <tr key={driver.driverId} className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/40">
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">{driver.name}</span>
                            {driver.isTerminated && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                                Terminated
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{driver.driverId}</span>
                          {driver.terminationNote && (
                            <span className="text-[11px] text-slate-400 italic">{driver.terminationNote}</span>
                          )}
                          {showDeduction && (
                            <span className="text-[11px] font-bold text-red-600 mt-0.5">
                              −${weekData.deductionAmount} · No Notice
                            </span>
                          )}
                        </div>
                      </td>
                      {weekDates.map((dateStr) => (
                        <td key={dateStr} className="px-3 py-3 text-center">
                          <StatusCell
                            status={driver.attendance[dateStr]}
                            note={driver.notes[dateStr]}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        <span className="text-[13px] font-bold text-slate-800">
                          {workDays % 1 === 0 ? workDays : workDays.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {traineeDays > 0 ? (
                          <span className="text-[13px] font-bold text-blue-600">{traineeDays}</span>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          {weekDates.map((dateStr, i) => {
                            const note = driver.notes[dateStr];
                            if (!note) return null;
                            const status = driver.attendance[dateStr];
                            return (
                              <span key={dateStr} className="text-[11px] text-slate-500">
                                <span className="font-semibold text-slate-600 mr-1">
                                  {WEEK_DAY_LABELS[i]}:
                                </span>
                                {note}
                                {status === "half_day" && " (half day)"}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-500 print:hidden">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-500 font-bold text-[14px] leading-none">●</span> Work
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-extrabold text-yellow-600">½</span> Half Day (0.5)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold">Cut</span> Management cut
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-bold">Out</span> Called out
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200 font-bold">T</span> Trainee day
            </span>
            <span className="flex items-center gap-1.5">📝 Note — hover to read</span>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:mb-4 { margin-bottom: 1rem !important; }
          .print\\:block { display: block !important; }
          body { font-size: 11px; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
```

- [ ] **Step 3: Replace `components/cards/payroll-card.tsx`**

Read the current file first. Then replace its entire contents:

```tsx
"use client";

import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";
import type { PayrollCardSummary } from "@/lib/actions/attendance";

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s} – ${e}`;
}

export default function PayrollCard({ summary }: { summary: PayrollCardSummary }) {
  return (
    <Link
      href="/dashboard/payroll"
      className="group bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col gap-5 cursor-pointer overflow-hidden
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.05)]
        hover:shadow-[0_8px_36px_rgba(0,0,0,0.11),0_2px_8px_rgba(0,0,0,0.06)]
        hover:-translate-y-1 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm">
            <DollarSign className="w-5 h-5 text-slate-900" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-900 leading-none">Payroll</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {summary.hasData
                ? formatWeekRange(summary.weekStart, summary.weekEnd)
                : "Weekly driver payroll"}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${
          summary.hasData
            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
            : "bg-slate-100 border-slate-200 text-slate-500"
        }`}>
          {summary.hasData ? "Ready" : "No Data"}
        </span>
      </div>

      {/* Stats */}
      {summary.hasData ? (
        <div className="flex gap-4">
          <div>
            <p className="text-[36px] font-extrabold text-slate-900 leading-none tracking-tight">
              {summary.totalWorkDays % 1 === 0 ? summary.totalWorkDays : summary.totalWorkDays.toFixed(1)}
            </p>
            <p className="text-[12px] text-slate-400 mt-1 font-medium">days worked</p>
          </div>
          {summary.traineeCount > 0 && (
            <div className="border-l border-slate-100 pl-4">
              <p className="text-[36px] font-extrabold text-blue-600 leading-none tracking-tight">
                {summary.traineeCount}
              </p>
              <p className="text-[12px] text-slate-400 mt-1 font-medium">trainee days</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[42px] font-extrabold text-slate-400 leading-none tracking-tight">$-</p>
          <p className="text-[12px] text-slate-400 mt-1 font-medium">No payroll records yet</p>
        </div>
      )}

      {/* Body */}
      {summary.hasData ? (
        <div className="bg-slate-50 rounded-xl px-4 py-3">
          <p className="text-[12px] text-slate-500">
            <span className="font-bold text-slate-700">{summary.totalDrivers}</span>{" "}
            driver{summary.totalDrivers !== 1 ? "s" : ""} with records
          </p>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-center flex-1 flex items-center justify-center">
          <p className="text-[12px] text-slate-400">
            Log attendance from Scheduling to populate payroll
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">
          {summary.hasData ? "Last completed week" : "No data yet"}
        </p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Update `app/dashboard/page.tsx`**

Read `app/dashboard/page.tsx` first.

Add import:
```ts
import { getPayrollCardSummary } from "@/lib/actions/attendance";
```

Inside the `Home()` function, add a call to fetch the summary. Find where other data is fetched (likely in a `Promise.all` or individual awaits) and add:
```ts
const payrollSummary = await getPayrollCardSummary();
```

Find where `<PayrollCard />` is rendered (no props currently) and update to:
```tsx
<PayrollCard summary={payrollSummary} />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit 2>&1 | head -30
```

Fix all errors before proceeding.

- [ ] **Step 6: Manual browser verification**

1. Navigate to `/dashboard` — payroll card shows "No Data" if no attendance yet, or last week's summary if records exist
2. Click the payroll card → goes to `/dashboard/payroll` (not `/reports/payroll`)
3. Payroll report loads with week grid: drivers as rows, Sat-Fri columns
4. Left arrow navigates to previous week; right arrow disabled at current week
5. Click Print → browser print dialog opens; nav elements hidden in print preview
6. If terminated drivers exist with attendance records, they appear with "Terminated" badge and deduction flag

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Blake/Documents/wayneboard
git add app/dashboard/payroll/page.tsx app/dashboard/payroll/payroll-client.tsx components/cards/payroll-card.tsx app/dashboard/page.tsx
git commit -m "feat: payroll report page at /dashboard/payroll with week nav + print; dashboard card shows last week summary"
```

---

## Task 5: Hard Delete Warning Upgrade

Upgrade the driver hard-delete modal to a two-step danger confirmation that lists what gets destroyed and requires typing the driver's exact name.

**Files:**
- Modify: `app/dashboard/drivers/page.tsx`

**Interfaces:**
- No new interfaces. UI-only change to the existing termination modal's "mistake" path.

- [ ] **Step 1: Read the existing delete modal**

Read `app/dashboard/drivers/page.tsx`. Locate:
- `deleteTarget` state: `{ id, driverId, name }`
- `terminationType` state: `"notice" | "fired" | "mistake" | null`
- `handleDeleteDriver` function
- All `setDeleteTarget(null)` calls (each needs `setDeleteConfirmText("")` alongside it)
- The modal JSX starting at `{deleteTarget && (`

Understand the flow before making any changes.

- [ ] **Step 2: Add `deleteConfirmText` state**

Find the state declarations block near `deleteTarget` and `terminationType`. Add:
```ts
const [deleteConfirmText, setDeleteConfirmText] = useState("");
```

- [ ] **Step 3: Reset `deleteConfirmText` wherever the modal closes**

Search for every `setDeleteTarget(null)` call in the file. Add `setDeleteConfirmText("")` alongside each one.

- [ ] **Step 4: Add the two-step danger block inside the modal**

Inside the termination modal JSX, find the section that renders the termination type options (notice / fired / mistake). After the type selection group (and before the existing warning paragraph about permanent deletion), insert this block that only appears when `terminationType === "mistake"`:

```tsx
{terminationType === "mistake" && (
  <div className="flex flex-col gap-3 mt-4">
    <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex flex-col gap-2">
      <p className="text-[13px] font-extrabold text-red-700">⚠ This permanently destroys:</p>
      <ul className="text-[12px] text-red-600 list-disc list-inside flex flex-col gap-1">
        <li>Driver account and login credentials</li>
        <li>All Ryde scores and customer reviews</li>
        <li>All attendance records (payroll history)</li>
        <li>Milestone claims</li>
      </ul>
      <p className="text-[12px] text-red-600 font-semibold mt-1">
        Consider using <strong>Terminate</strong> instead — it keeps the record and payroll history intact.
      </p>
    </div>
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        Type <span className="font-bold text-slate-800">{deleteTarget?.name}</span> to confirm
      </label>
      <input
        type="text"
        value={deleteConfirmText}
        onChange={(e) => setDeleteConfirmText(e.target.value)}
        placeholder={deleteTarget?.name ?? "Driver name"}
        className="w-full px-3.5 py-2.5 rounded-xl border border-red-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition bg-red-50/30"
        autoComplete="off"
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: Gate the Confirm button for "mistake" path**

Find the Confirm button inside the termination modal (the one that calls `handleDeleteDriver()`). Update its `disabled` prop to also require name confirmation when `terminationType === "mistake"`:

```tsx
disabled={
  !terminationType ||
  isPending ||
  (terminationType === "mistake" && deleteConfirmText.trim() !== deleteTarget?.name)
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd C:/Users/Blake/Documents/wayneboard && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 7: Manual browser verification**

1. Navigate to `/dashboard/drivers`
2. Click the terminate/delete button on any driver
3. Select "Account Mistake" (the hard delete path)
4. Confirm: a red danger box appears listing 4 items to be destroyed
5. Confirm: "Consider using Terminate instead" recommendation is visible
6. Confirm: Confirm button is disabled until driver's exact name is typed
7. Type wrong name → button stays disabled
8. Type exact name → button enables
9. Click Cancel → modal closes, input cleared, can re-open cleanly

- [ ] **Step 8: Commit**

```bash
cd C:/Users/Blake/Documents/wayneboard
git add app/dashboard/drivers/page.tsx
git commit -m "feat: upgrade hard-delete modal — two-step danger confirmation, destruction list, name-type gate"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| `attendanceLog` table with `UNIQUE (orgId, driverId, date)` | Task 1 |
| `driverId` as plain text (not FK), survives driver hard-delete | Task 1, 2 |
| `organizationId` FK to organizations (cascade) | Task 1 |
| Pay week runs Saturday → Friday | Task 2, 4 |
| `upsertAttendance` server action | Task 2 |
| `getAttendanceForRange` for scheduling overlay | Task 2 |
| `getPayrollWeek` with driver termination data + deduction amount | Task 2 |
| `no_notice_deduction_amount` from settings table, default "500" | Task 2 |
| Cut button → note modal → writes timeOffEntries + attendanceLog | Task 3 |
| Call Out button → note modal → writes timeOffEntries + attendanceLog | Task 3 |
| Half Day button (NEW) → note modal → writes attendanceLog only | Task 3 |
| Note modal: optional textarea, Cancel / Confirm | Task 3 |
| Half Day cell: ½ badge + yellow gradient in coverage view | Task 3 |
| Trainee toggle ON → write `status="trainee"` for current week's scheduled days | Task 3 |
| Trainee toggle OFF → write `status="work"` for current week's scheduled days | Task 3 |
| Payroll report replaces empty payroll card placeholder | Task 4 |
| Full payroll page at `/dashboard/payroll` | Task 4 |
| Default = most recently completed Sat→Fri week | Task 4 |
| Navigation arrows to go back/forward weeks | Task 4 |
| Grid: rows=drivers, columns=Sat/Sun/Mon/Tue/Wed/Thu/Fri | Task 4 |
| Work=green dot, Half Day=½, Cut=gray pill, Out=red pill, T=blue badge, dash=no record | Task 4 |
| 📝 note indicator with hover title | Task 4 |
| Row totals: days worked (half_day=0.5), trainee days | Task 4 |
| Deduction: `−$X · No Notice` when terminationType="notice" | Task 4 |
| Terminated drivers appear with "Terminated" badge | Task 4 |
| Print view: Print button, `@media print` hides nav chrome | Task 4 |
| Dashboard payroll card → shows last week summary | Task 4 |
| Dashboard payroll card → links to `/dashboard/payroll` | Task 4 |
| Hard delete → two-step danger modal | Task 5 |
| Hard delete → lists Ryde scores, reviews, attendance records | Task 5 |
| Hard delete → recommends Terminate instead | Task 5 |
| Hard delete → require typing driver name to confirm | Task 5 |

### Type Consistency Check

- `AttendanceStatus` exported from `lib/actions/attendance.ts`, imported in `scheduling-client.tsx` and `payroll-client.tsx` ✓
- `upsertAttendance(driverId, driverName, date, status, note?)` — matches all call sites ✓
- `getAttendanceForRange(startDate, endDate)` — matches call in scheduling `page.tsx` ✓
- `getPayrollWeek(weekStart, weekEnd)` → `PayrollWeekData` — matches payroll `page.tsx` call ✓
- `getPayrollCardSummary()` → `PayrollCardSummary` — matches dashboard `page.tsx` call ✓
- `PayrollWeekData.deductionAmount: number` — matches `−$${weekData.deductionAmount}` in client ✓
- `PayrollDriverRow.attendance: Record<string, AttendanceStatus>` — matches cell lookup ✓
- `PayrollCardSummary` imported in `payroll-card.tsx` as prop type ✓

### Placeholder Scan

✅ No TBD, TODO, or vague steps — all code is complete and concrete.
