import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { vehicles, drivers, inspections } from "@/lib/schema";
import { desc, eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getPayrollWeek } from "@/lib/actions/attendance";
import ReportView, { type FleetRow, type DriverRow, type PayrollRow } from "./report-view";

function getPreviousMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff - 7);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

const REPORT_TITLES: Record<string, string> = {
  fleet:   "Fleet & Maintenance Report",
  payroll: "Payroll Report",
  drivers: "Driver Performance Report",
  routes:  "Route Coverage Report",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!REPORT_TITLES[slug]) notFound();

  const session = await getSession();
  if (!session) notFound();
  const orgId = session.organizationId;

  const now = new Date();
  const currentPeriod = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  let fleetData: FleetRow[] = [];
  let driverData: DriverRow[] = [];
  let payrollData: PayrollRow[] = [];
  let period = currentPeriod;

  if (slug === "fleet") {
    const vehicleRows = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.organizationId, orgId), eq(vehicles.active, true)))
      .orderBy(vehicles.unitNumber);

    const allInspections = await db
      .select({
        vehicleId:      inspections.vehicleId,
        status:         inspections.status,
        inspectionDate: inspections.inspectionDate,
      })
      .from(inspections)
      .where(eq(inspections.organizationId, orgId))
      .orderBy(desc(inspections.createdAt));

    const latestByVehicle = new Map<number, { status: string; inspectionDate: string }>();
    for (const insp of allInspections) {
      if (!latestByVehicle.has(insp.vehicleId)) {
        latestByVehicle.set(insp.vehicleId, { status: insp.status, inspectionDate: insp.inspectionDate });
      }
    }

    fleetData = vehicleRows.map((v) => ({
      unitNumber:     v.unitNumber,
      make:           v.make,
      model:          v.model,
      year:           v.year,
      mileage:        v.mileage,
      lastInspection: latestByVehicle.get(v.id)?.inspectionDate ?? null,
      status:         latestByVehicle.get(v.id)?.status ?? "No Inspection",
    }));
  }

  if (slug === "drivers") {
    const driverRows = await db
      .select({
        name:      drivers.name,
        driverId:  drivers.driverId,
        role:      drivers.role,
        active:    drivers.active,
        createdAt: drivers.createdAt,
      })
      .from(drivers)
      .where(eq(drivers.organizationId, orgId))
      .orderBy(drivers.name);

    driverData = driverRows.map((d) => ({
      name:      d.name,
      driverId:  d.driverId,
      role:      d.role,
      active:    d.active,
      createdAt: d.createdAt
        ? new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "-",
    }));
  }

  if (slug === "payroll") {
    const weekStart = getPreviousMonday();
    const weekEnd   = addDays(weekStart, 6);
    period = fmtPeriod(weekStart, weekEnd);
    const weekData = await getPayrollWeek(weekStart, weekEnd);
    payrollData = weekData.drivers
      .map((d) => {
        const daysWorked = Object.values(d.attendance).filter(
          (s) => s === "work" || s === "half_day" || s === "trainee"
        ).length;
        const statusCounts: Record<string, number> = {};
        for (const s of Object.values(d.attendance)) {
          statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        }
        return {
          driverId:     d.driverId,
          name:         d.name,
          daysWorked,
          cut:          statusCounts["cut"] ?? 0,
          callOut:      statusCounts["call_out"] ?? 0,
          isTrainee:    d.isTrainee,
          isTerminated: d.isTerminated,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <ReportView
      slug={slug}
      title={REPORT_TITLES[slug]}
      period={period}
      fleetData={fleetData}
      driverData={driverData}
      payrollData={payrollData}
    />
  );
}
