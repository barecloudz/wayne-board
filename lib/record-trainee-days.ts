import { db } from "@/lib/db";
import { drivers, driverSchedules, timeOffEntries, scheduleOverrides, traineeWorkDays } from "@/lib/schema";
import { eq, and, lte, gte, not, inArray } from "drizzle-orm";

type DowKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Compute the Monday of the week containing `date` (YYYY-MM-DD). */
function weekMonday(date: string): string {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a worked day for every trainee who is scheduled on `date`
 * and not on time off. Idempotent (unique constraint on driver+date).
 * Returns the count of trainees recorded.
 */
export async function recordTraineeWorkDays(date: string): Promise<number> {
  const dow = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as DowKey[])[
    new Date(date + "T12:00:00").getDay()
  ];
  const weekStart = weekMonday(date);

  // Trainees on time off today
  const onTimeOff = await db
    .select({ driverId: timeOffEntries.driverId })
    .from(timeOffEntries)
    .where(and(lte(timeOffEntries.startDate, date), gte(timeOffEntries.endDate, date)));
  const timeOffIds = onTimeOff.map((r) => r.driverId);

  // Trainees on their regular weekly schedule for today's DOW
  const scheduled = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .innerJoin(driverSchedules, eq(drivers.driverId, driverSchedules.driverId))
    .where(
      and(
        eq(drivers.active, true),
        eq(drivers.isTrainee, true),
        eq(driverSchedules[dow], true),
        ...(timeOffIds.length > 0 ? [not(inArray(drivers.driverId, timeOffIds))] : [])
      )
    );

  // Trainees with a one-off schedule override for today
  const overrides = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .innerJoin(
      scheduleOverrides,
      and(eq(drivers.driverId, scheduleOverrides.driverId), eq(scheduleOverrides.date, date))
    )
    .where(and(eq(drivers.active, true), eq(drivers.isTrainee, true)));

  // Merge + deduplicate
  const seen = new Set(scheduled.map((d) => d.driverId));
  const allTrainees = [...scheduled];
  for (const d of overrides) {
    if (!seen.has(d.driverId)) { allTrainees.push(d); seen.add(d.driverId); }
  }

  if (allTrainees.length === 0) return 0;

  for (const t of allTrainees) {
    await db
      .insert(traineeWorkDays)
      .values({ driverId: t.driverId, date, weekStart })
      .onConflictDoNothing();
  }

  return allTrainees.length;
}
