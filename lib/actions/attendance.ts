"use server";

import { db } from "@/lib/db";
import { attendanceLog, drivers, settings, driverSchedules } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg(): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type AttendanceStatus = "work" | "half_day" | "cut" | "call_out" | "trainee" | "day_off" | "holiday";

export type AttendanceRecord = {
  driverId: string;
  driverName: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
};

// ── Helper: normalize any date value to "YYYY-MM-DD" string ─────────────────
// Postgres `date` columns may return full ISO timestamps or Date objects
// depending on the driver/ORM version. Slicing to 10 chars handles both.

function normalizeDate(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ── Helper: map a date string to the schedule boolean key ────────────────────

function getScheduleKey(dateStr: string): "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri" {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  return keys[day];
}

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
  return rows.map(r => ({ ...r, date: normalizeDate(r.date) })) as AttendanceRecord[];
}

// ── Types for payroll report ─────────────────────────────────────────────────

export type PayrollDriverRow = {
  driverId: string;
  name: string;
  isTerminated: boolean;
  terminationType: string | null;
  terminationNote: string | null;
  terminatedAt: Date | null;
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

  const [deductionSetting] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, "no_notice_deduction_amount")))
    .limit(1);
  const deductionAmount = parseInt(deductionSetting?.value ?? "500", 10);

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

  // Fetch schedules for all drivers
  const schedules = await db
    .select()
    .from(driverSchedules);
  const scheduleMap = new Map(schedules.map(s => [s.driverId, s]));

  const driverMap = new Map(allDrivers.map((d) => [d.driverId, d]));

  const attendanceDriverIds = new Set(records.map((r) => r.driverId));
  const activeDriverIds = new Set(allDrivers.filter((d) => d.active).map((d) => d.driverId));
  const allDriverIds = new Set([...attendanceDriverIds, ...activeDriverIds]);

  const payrollDrivers: PayrollDriverRow[] = [];

  for (const driverId of allDriverIds) {
    const driverRecord = driverMap.get(driverId);
    const driverRecords = records.filter((r) => r.driverId === driverId);

    const attendanceByDate: Record<string, AttendanceStatus> = {};
    const notesByDate: Record<string, string | null> = {};
    for (const r of driverRecords) {
      attendanceByDate[normalizeDate(r.date)] = r.status as AttendanceStatus;
      notesByDate[normalizeDate(r.date)] = r.note;
    }

    // Infer "work" for scheduled days with no attendance record (active drivers only)
    const isActive = driverRecord ? driverRecord.active : false;
    const schedule = scheduleMap.get(driverId);
    if (isActive && schedule) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart + "T00:00:00");
        d.setDate(d.getDate() + i);
        const dateStr = normalizeDate(d.toISOString().slice(0, 10));
        if (attendanceByDate[dateStr]) continue; // already has a record
        const key = getScheduleKey(dateStr);
        if (schedule[key]) {
          attendanceByDate[dateStr] = "work";
          // no note for inferred work days
        }
      }
    }

    // Skip drivers with no attendance data for this week
    if (Object.keys(attendanceByDate).length === 0) continue;

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

  payrollDrivers.sort((a, b) => {
    if (a.isTerminated !== b.isTerminated) return a.isTerminated ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return { weekStart, weekEnd, drivers: payrollDrivers, deductionAmount };
}

// ── Mark all drivers on a day as Holiday ─────────────────────────────────────

export async function markDayHoliday(
  date: string,
  drivers: Array<{ driverId: string; driverName: string }>,
): Promise<void> {
  const orgId = await requireOrg();
  for (const { driverId, driverName } of drivers) {
    await db
      .insert(attendanceLog)
      .values({ organizationId: orgId, driverId, driverName, date, status: "holiday", note: null })
      .onConflictDoUpdate({
        target: [attendanceLog.organizationId, attendanceLog.driverId, attendanceLog.date],
        set: { status: "holiday", note: null, updatedAt: new Date() },
      });
  }
  revalidatePath("/dashboard/scheduling");
  revalidatePath("/dashboard/payroll");
}

// ── Remove Holiday status for all drivers on a day ───────────────────────────

export async function unmarkDayHoliday(
  date: string,
  driverIds: string[],
): Promise<void> {
  const orgId = await requireOrg();
  for (const driverId of driverIds) {
    await db
      .delete(attendanceLog)
      .where(
        and(
          eq(attendanceLog.organizationId, orgId),
          eq(attendanceLog.driverId, driverId),
          eq(attendanceLog.date, date),
          eq(attendanceLog.status, "holiday"),
        )
      );
  }
  revalidatePath("/dashboard/scheduling");
  revalidatePath("/dashboard/payroll");
}

// ── Quick summary for dashboard payroll card ─────────────────────────────────

export type PayrollCardSummary = {
  weekStart: string;
  weekEnd: string;
  totalDrivers: number;
  totalWorkDays: number;
  traineeCount: number;
  hasData: boolean;
};

export async function getPayrollCardSummary(): Promise<PayrollCardSummary> {
  const orgId = await requireOrg();

  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToFri = ((dayOfWeek + 2) % 7) || 7;
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - daysToFri);
  const weekEnd = lastFriday.toISOString().slice(0, 10);
  const weekStartDate = new Date(lastFriday);
  weekStartDate.setDate(lastFriday.getDate() - 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  const records = await db
    .select({
      driverId: attendanceLog.driverId,
      date:     attendanceLog.date,
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

  // Fetch active drivers and their schedules
  const activeDriversList = await db
    .select({ driverId: drivers.driverId })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));

  const schedulesList = await db
    .select()
    .from(driverSchedules);
  const scheduleMap = new Map(schedulesList.map(s => [s.driverId, s]));

  // Build attendance map from logged records
  const attendanceByDriver = new Map<string, Map<string, string>>();
  for (const r of records) {
    if (!attendanceByDriver.has(r.driverId)) attendanceByDriver.set(r.driverId, new Map());
    attendanceByDriver.get(r.driverId)!.set(normalizeDate(r.date), r.status);
  }

  // Add inferred work days for active drivers
  for (const { driverId } of activeDriversList) {
    const schedule = scheduleMap.get(driverId);
    if (!schedule) continue;
    if (!attendanceByDriver.has(driverId)) attendanceByDriver.set(driverId, new Map());
    const driverAttendance = attendanceByDriver.get(driverId)!;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + i);
      const dateStr = normalizeDate(d.toISOString().slice(0, 10));
      if (driverAttendance.has(dateStr)) continue;
      const key = getScheduleKey(dateStr);
      if (schedule[key]) driverAttendance.set(dateStr, "work");
    }
  }

  // Count totals from merged data
  const uniqueDriverIds = new Set(attendanceByDriver.keys());
  let workDays = 0;
  let traineeDays = 0;
  for (const [, dayMap] of attendanceByDriver) {
    for (const status of dayMap.values()) {
      if (status === "work") workDays += 1;
      else if (status === "half_day") workDays += 0.5;
      else if (status === "trainee") traineeDays += 1;
    }
  }

  const hasData = uniqueDriverIds.size > 0;
  if (!hasData) {
    return { weekStart, weekEnd, totalDrivers: 0, totalWorkDays: 0, traineeCount: 0, hasData: false };
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
