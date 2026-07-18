export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import { getAllSchedules, getAllTimeOff, getAllUpcomingOverrides, getAllOverrides } from "@/lib/actions/scheduling";
import { getVehicles } from "@/lib/actions/vehicles";
import { assignDriverVehicle } from "@/lib/actions/drivers";
import { getWorkAreas, getAllDailyAssignments } from "@/lib/actions/work-areas";
import SchedulingClient from "./scheduling-client";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { droRoutes } from "@/lib/schema";
import { asc } from "drizzle-orm";

export { assignDriverVehicle };

export default async function SchedulingPage() {
  const today = new Date();
  const rangeStart = format(today, "yyyy-MM-dd");

  const [schedules, timeOff, upcomingOverrides, allOverrides, vehicles, workAreasList, dailyAssignments, droRoutesList] = await Promise.all([
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
  ]);

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
      />
    </AppShell>
  );
}
