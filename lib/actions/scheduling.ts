"use server";

import { db } from "@/lib/db";
import { drivers, driverSchedules, timeOffEntries, scheduleOverrides } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// ── Schedules ─────────────────────────────────────────────────────────────────

export async function getAllSchedules() {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:                drivers.id,
      driverId:          drivers.driverId,
      name:              drivers.name,
      active:            drivers.active,
      workArea:          drivers.workArea,
      defaultWorkAreaId: drivers.defaultWorkAreaId,
      isTrainee:         drivers.isTrainee,
      noticeDate:        drivers.noticeDate,
      lastDay:           drivers.lastDay,
      assignedVehicleId: drivers.assignedVehicleId,
      schedule:          driverSchedules,
    })
    .from(drivers)
    .leftJoin(driverSchedules, eq(drivers.driverId, driverSchedules.driverId))
    .where(eq(drivers.organizationId, orgId))
    .orderBy(drivers.name);
  return rows;
}

export async function setDriverNoticeDate(driverId: string, noticeDate: string | null) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ noticeDate }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function setDriverLastDay(driverId: string, lastDay: string | null) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ lastDay }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function updateDriverInfo(driverId: string, name: string, workArea: string | null) {
  const orgId = await requireOrg();
  await db.update(drivers)
    .set({ name: name.trim(), workArea: workArea?.trim() || null })
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function setDriverActive(driverId: string, active: boolean) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ active }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function setDriverTrainee(driverId: string, isTrainee: boolean) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ isTrainee }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function upsertSchedule(
  driverId: string,
  days: Record<DayKey, boolean>,
  notes?: string,
) {
  await db
    .insert(driverSchedules)
    .values({ driverId, ...days, notes: notes ?? null })
    .onConflictDoUpdate({
      target: driverSchedules.driverId,
      set: { ...days, notes: notes ?? null, updatedAt: new Date() },
    });
  revalidatePath("/dashboard/scheduling");
}

export async function getDriverSchedule(driverId: string) {
  const [row] = await db
    .select()
    .from(driverSchedules)
    .where(eq(driverSchedules.driverId, driverId))
    .limit(1);
  return row ?? null;
}

// ── Time Off ──────────────────────────────────────────────────────────────────

export async function getAllTimeOff() {
  const orgId = await requireOrg();
  return db
    .select({
      id:        timeOffEntries.id,
      driverId:  timeOffEntries.driverId,
      startDate: timeOffEntries.startDate,
      endDate:   timeOffEntries.endDate,
      reason:    timeOffEntries.reason,
      note:      timeOffEntries.note,
      createdAt: timeOffEntries.createdAt,
      name:      drivers.name,
    })
    .from(timeOffEntries)
    .leftJoin(drivers, and(eq(timeOffEntries.driverId, drivers.driverId), eq(drivers.organizationId, orgId)))
    .where(eq(drivers.organizationId, orgId))
    .orderBy(timeOffEntries.startDate);
}

export async function getDriverTimeOff(driverId: string) {
  return db
    .select()
    .from(timeOffEntries)
    .where(eq(timeOffEntries.driverId, driverId))
    .orderBy(timeOffEntries.startDate);
}

export async function addTimeOff(
  driverId: string,
  startDate: string,
  endDate: string,
  reason: string,
  note?: string,
) {
  await db.insert(timeOffEntries).values({ driverId, startDate, endDate, reason, note: note ?? null });
  revalidatePath("/dashboard/scheduling");
}

export async function updateTimeOff(
  id: number,
  startDate: string,
  endDate: string,
  reason: string,
  note?: string,
) {
  await db.update(timeOffEntries)
    .set({ startDate, endDate, reason, note: note ?? null })
    .where(eq(timeOffEntries.id, id));
  revalidatePath("/dashboard/scheduling");
}

export async function deleteTimeOff(id: number) {
  await db.delete(timeOffEntries).where(eq(timeOffEntries.id, id));
  revalidatePath("/dashboard/scheduling");
}

// ── Coverage helpers ──────────────────────────────────────────────────────────
// ── Schedule Overrides (one-time extra working days) ─────────────────────────

export async function addScheduleOverride(driverId: string, date: string, note?: string) {
  await db.insert(scheduleOverrides)
    .values({ driverId, date, note: note ?? null })
    .onConflictDoNothing();
  revalidatePath("/dashboard/scheduling");
}

export async function removeScheduleOverride(id: number) {
  await db.delete(scheduleOverrides).where(eq(scheduleOverrides.id, id));
  revalidatePath("/dashboard/scheduling");
}

export async function getOverridesInRange(startDate: string, endDate: string) {
  return db.select().from(scheduleOverrides)
    .where(and(gte(scheduleOverrides.date, startDate), lte(scheduleOverrides.date, endDate)));
}

export async function getAllUpcomingOverrides(fromDate: string) {
  return db.select().from(scheduleOverrides)
    .where(gte(scheduleOverrides.date, fromDate))
    .orderBy(scheduleOverrides.driverId, scheduleOverrides.date);
}

export async function getAllOverrides() {
  return db.select().from(scheduleOverrides)
    .orderBy(scheduleOverrides.driverId, scheduleOverrides.date);
}

// Returns time-off entries that overlap with the given date range
export async function getTimeOffInRange(startDate: string, endDate: string) {
  const orgId = await requireOrg();
  return db
    .select({
      driverId:  timeOffEntries.driverId,
      startDate: timeOffEntries.startDate,
      endDate:   timeOffEntries.endDate,
      reason:    timeOffEntries.reason,
      name:      drivers.name,
    })
    .from(timeOffEntries)
    .leftJoin(drivers, and(eq(timeOffEntries.driverId, drivers.driverId), eq(drivers.organizationId, orgId)))
    .where(
      and(
        eq(drivers.organizationId, orgId),
        lte(timeOffEntries.startDate, endDate),
        gte(timeOffEntries.endDate, startDate),
      )
    );
}
