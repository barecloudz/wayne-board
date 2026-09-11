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

export type AttendanceStatus = "work" | "half_day" | "cut" | "call_out" | "trainee" | "day_off" | "holiday";

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
      attendanceByDate[r.date] = r.status as AttendanceStatus;
      notesByDate[r.date] = r.note;
    }

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
