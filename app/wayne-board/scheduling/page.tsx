import AppShell from "@/components/app-shell";
import { getAllSchedules, getAllTimeOff, getTimeOffInRange, getAllUpcomingOverrides } from "@/lib/actions/scheduling";
import SchedulingClient from "./scheduling-client";
import { addDays, format } from "date-fns";

export default async function SchedulingPage() {
  const today = new Date();
  const rangeEnd = addDays(today, 13);
  const rangeStart = format(today, "yyyy-MM-dd");
  const rangeEndStr = format(rangeEnd, "yyyy-MM-dd");

  const [schedules, timeOff, coverageTimeOff, upcomingOverrides] = await Promise.all([
    getAllSchedules(),
    getAllTimeOff(),
    getTimeOffInRange(rangeStart, rangeEndStr),
    getAllUpcomingOverrides(rangeStart),
  ]);

  return (
    <AppShell>
      <SchedulingClient
        schedules={schedules as any}
        timeOff={timeOff as any}
        coverageTimeOff={coverageTimeOff as any}
        upcomingOverrides={upcomingOverrides as any}
        today={rangeStart}
      />
    </AppShell>
  );
}
