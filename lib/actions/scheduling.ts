"use server";

import { db } from "@/lib/db";
import { drivers, driverSchedules, timeOffEntries } from "@/lib/schema";
import { eq, and, gte, lte, or } from "drizzle-orm";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// ── Schedules ─────────────────────────────────────────────────────────────────

export async function getAllSchedules() {
  const rows = await db
    .select({
      driverId: drivers.driverId,
      name:     drivers.name,
      active:   drivers.active,
      schedule: driverSchedules,
    })
    .from(drivers)
    .leftJoin(driverSchedules, eq(drivers.driverId, driverSchedules.driverId))
    .orderBy(drivers.name);
  return rows;
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
    .leftJoin(drivers, eq(timeOffEntries.driverId, drivers.driverId))
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
}

export async function deleteTimeOff(id: number) {
  await db.delete(timeOffEntries).where(eq(timeOffEntries.id, id));
}

// ── Coverage helpers ──────────────────────────────────────────────────────────
// Returns time-off entries that overlap with the given date range
export async function getTimeOffInRange(startDate: string, endDate: string) {
  return db
    .select({
      driverId:  timeOffEntries.driverId,
      startDate: timeOffEntries.startDate,
      endDate:   timeOffEntries.endDate,
      reason:    timeOffEntries.reason,
      name:      drivers.name,
    })
    .from(timeOffEntries)
    .leftJoin(drivers, eq(timeOffEntries.driverId, drivers.driverId))
    .where(
      and(
        lte(timeOffEntries.startDate, endDate),
        gte(timeOffEntries.endDate, startDate),
      )
    );
}
