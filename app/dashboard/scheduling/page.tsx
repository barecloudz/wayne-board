export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = { title: "Scheduling" };
import { getAllSchedules, getAllTimeOff, getAllUpcomingOverrides, getAllOverrides } from "@/lib/actions/scheduling";
import { getVehicles } from "@/lib/actions/vehicles";
import { assignDriverVehicle } from "@/lib/actions/drivers";
import { getWorkAreas, getAllDailyAssignments } from "@/lib/actions/work-areas";
import { getAttendanceForRange } from "@/lib/actions/attendance";
import SchedulingClient from "./scheduling-client";
import { format, addDays } from "date-fns";
import { db } from "@/lib/db";
import { droRoutes, driverLocations, drivers as driversTable } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export { assignDriverVehicle };

export default async function SchedulingPage() {
  const today = new Date();
  const rangeStart = format(today, "yyyy-MM-dd");
  const rangeEnd = format(addDays(today, 14), "yyyy-MM-dd");
  const attendanceStart = format(addDays(today, -60), "yyyy-MM-dd");

  const session = await getSession();
  const orgId = session!.organizationId;

  const [schedules, timeOff, upcomingOverrides, allOverrides, vehicles, workAreasList, dailyAssignments, droRoutesList, attendanceRecords, driverLocRows, allDriversRows] = await Promise.all([
    getAllSchedules(),
    getAllTimeOff(),
    getAllUpcomingOverrides(rangeStart),
    getAllOverrides(),
    getVehicles(),
    getWorkAreas(),
    getAllDailyAssignments(),
    db.select({
      workAreaName:   droRoutes.workAreaName,
      workAreaNumber: droRoutes.workAreaNumber,
    }).from(droRoutes).orderBy(asc(droRoutes.workAreaName)),
    getAttendanceForRange(attendanceStart, rangeEnd),
    db.select({ driverId: driverLocations.driverId, locationId: driverLocations.locationId })
      .from(driverLocations)
      .where(eq(driverLocations.organizationId, orgId)),
    db.select({ driverId: driversTable.driverId, allLocations: driversTable.allLocations })
      .from(driversTable)
      .where(eq(driversTable.organizationId, orgId)),
  ]);

  const driverLocationMap: Record<string, number[]> = {};
  for (const row of driverLocRows) {
    if (!driverLocationMap[row.driverId]) driverLocationMap[row.driverId] = [];
    driverLocationMap[row.driverId].push(row.locationId);
  }

  const driverAllLocationsMap: Record<string, boolean> = {};
  for (const row of allDriversRows) {
    driverAllLocationsMap[row.driverId] = row.allLocations;
  }

  return (
    <AppShell>
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
        driverLocationMap={driverLocationMap}
        driverAllLocationsMap={driverAllLocationsMap}
      />
    </AppShell>
  );
}
