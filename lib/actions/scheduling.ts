"use server";

import { db } from "@/lib/db";
import { drivers, driverSchedules, timeOffEntries, scheduleOverrides, attendanceLog } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getActiveLocationId } from "@/lib/active-location";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// ── Schedules ─────────────────────────────────────────────────────────────────

export async function getAllSchedules() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;
  // BC role sees all locations regardless of the location switcher
  const locationId = session.role === "bc" ? null : await getActiveLocationId();
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
    .where(
      and(
        eq(drivers.organizationId, orgId),
        locationId !== null ? eq(drivers.locationId, locationId) : undefined
      )
    )
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
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const weekSat = new Date(today);
    weekSat.setDate(today.getDate() - daysSinceSat);

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

      if (!isTrainee) {
        // Only overwrite to "work" if existing status is "trainee" (or no record exists)
        const [existing] = await db
          .select({ status: attendanceLog.status })
          .from(attendanceLog)
          .where(and(
            eq(attendanceLog.organizationId, orgId),
            eq(attendanceLog.driverId, driverId),
            eq(attendanceLog.date, dateStr),
          ))
          .limit(1);
        if (existing && existing.status !== "trainee") continue;
      }

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
  const orgId = await requireOrg();
  return db.select({ id: scheduleOverrides.id, driverId: scheduleOverrides.driverId, date: scheduleOverrides.date, note: scheduleOverrides.note, createdAt: scheduleOverrides.createdAt })
    .from(scheduleOverrides)
    .innerJoin(drivers, and(eq(scheduleOverrides.driverId, drivers.driverId), eq(drivers.organizationId, orgId)))
    .where(and(gte(scheduleOverrides.date, startDate), lte(scheduleOverrides.date, endDate)));
}

export async function getAllUpcomingOverrides(fromDate: string) {
  const orgId = await requireOrg();
  return db.select({ id: scheduleOverrides.id, driverId: scheduleOverrides.driverId, date: scheduleOverrides.date, note: scheduleOverrides.note, createdAt: scheduleOverrides.createdAt })
    .from(scheduleOverrides)
    .innerJoin(drivers, and(eq(scheduleOverrides.driverId, drivers.driverId), eq(drivers.organizationId, orgId)))
    .where(gte(scheduleOverrides.date, fromDate))
    .orderBy(scheduleOverrides.driverId, scheduleOverrides.date);
}

export async function getAllOverrides() {
  const orgId = await requireOrg();
  return db.select({ id: scheduleOverrides.id, driverId: scheduleOverrides.driverId, date: scheduleOverrides.date, note: scheduleOverrides.note, createdAt: scheduleOverrides.createdAt })
    .from(scheduleOverrides)
    .innerJoin(drivers, and(eq(scheduleOverrides.driverId, drivers.driverId), eq(drivers.organizationId, orgId)))
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
