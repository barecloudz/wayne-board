import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { vehicles, drivers, inspections } from "@/lib/schema";
import { desc } from "drizzle-orm";
import ReportView, { type FleetRow, type DriverRow } from "./report-view";

const REPORT_META: Record<string, { title: string; period: string }> = {
  fleet:   { title: "Fleet & Maintenance Report", period: "Q2 2026" },
  payroll: { title: "Payroll Report",              period: "Q2 2026" },
  drivers: { title: "Driver Performance Report",   period: "Q2 2026" },
  routes:  { title: "Route Coverage Report",       period: "Q2 2026" },
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = REPORT_META[slug];
  if (!meta) notFound();

  let fleetData: FleetRow[] = [];
  let driverData: DriverRow[] = [];

  if (slug === "fleet") {
    const vehicleRows = await db
      .select()
      .from(vehicles)
      .orderBy(vehicles.unitNumber);

    const allInspections = await db
      .select({
        vehicleId: inspections.vehicleId,
        status:    inspections.status,
        inspectionDate: inspections.inspectionDate,
      })
      .from(inspections)
      .orderBy(desc(inspections.createdAt));

    const latestByVehicle = new Map<number, { status: string; inspectionDate: string }>();
    for (const insp of allInspections) {
      if (!latestByVehicle.has(insp.vehicleId)) {
        latestByVehicle.set(insp.vehicleId, {
          status: insp.status,
          inspectionDate: insp.inspectionDate,
        });
      }
    }

    fleetData = vehicleRows.map((v) => ({
      unitNumber:      v.unitNumber,
      make:            v.make,
      model:           v.model,
      year:            v.year,
      mileage:         v.mileage,
      lastInspection:  latestByVehicle.get(v.id)?.inspectionDate ?? null,
      status:          latestByVehicle.get(v.id)?.status ?? "No Inspection",
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
      .orderBy(drivers.id);

    driverData = driverRows.map((d) => ({
      name:      d.name,
      driverId:  d.driverId,
      role:      d.role,
      active:    d.active,
      createdAt: d.createdAt
        ? new Date(d.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day:   "numeric",
            year:  "numeric",
          })
        : "—",
    }));
  }

  return (
    <ReportView
      slug={slug}
      title={meta.title}
      period={meta.period}
      fleetData={fleetData}
      driverData={driverData}
    />
  );
}
