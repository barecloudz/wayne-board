import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers, traineeWorkDays } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";

/** Returns YYYY-MM-DD for the Monday of the week containing `date`. */
function weekMonday(date: string): string {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Returns the 7 dates (Mon–Sun) for the week starting on `monday`. */
function weekDates(monday: string): string[] {
  const d = new Date(monday + "T12:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("weekStart");

  // Default to current week's Monday
  const today = new Date().toISOString().slice(0, 10);
  const monday = weekParam ? weekMonday(weekParam) : weekMonday(today);
  const sunday = weekDates(monday)[6];

  // All active trainees
  const allTrainees = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.active, true), eq(drivers.isTrainee, true)))
    .orderBy(drivers.name);

  // Work days in this week
  const workDays = await db
    .select({ driverId: traineeWorkDays.driverId, date: traineeWorkDays.date })
    .from(traineeWorkDays)
    .where(and(gte(traineeWorkDays.date, monday), lte(traineeWorkDays.date, sunday)));

  // Build per-trainee lookup
  const byDriver: Record<string, Set<string>> = {};
  for (const { driverId, date } of workDays) {
    if (!byDriver[driverId]) byDriver[driverId] = new Set();
    byDriver[driverId].add(date);
  }

  const trainees = allTrainees.map((t) => {
    const days = byDriver[t.driverId] ? [...byDriver[t.driverId]].sort() : [];
    return { driverId: t.driverId, name: t.name, days, total: days.length };
  });

  return NextResponse.json({ weekStart: monday, dates: weekDates(monday), trainees });
}
