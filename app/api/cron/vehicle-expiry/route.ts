export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vehicles, notifications } from "@/lib/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { differenceInDays, startOfDay, endOfDay } from "date-fns";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

const COMPLIANCE_FIELDS: Array<{
  key: keyof typeof vehicles.$inferSelect;
  label: string;
}> = [
  { key: "mmrDue",               label: "MMR Due" },
  { key: "federalInspectionDue", label: "Federal Inspection" },
  { key: "registrationExpiry",   label: "Registration Expiry" },
];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfDay(new Date());

  // Fetch all active vehicles
  const activeVehicles = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.active, true));

  // Fetch today's vehicle_expiry notifications up front (for dedup)
  const todayExpiryNotifs = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.type, NOTIFICATION_TYPES.VEHICLE_EXPIRY),
        gte(notifications.createdAt, today),
        lt(notifications.createdAt, endOfDay(today)),
      )
    );

  let processed = 0;
  let sent = 0;

  for (const vehicle of activeVehicles) {
    processed++;

    for (const { key, label } of COMPLIANCE_FIELDS) {
      const rawDate = vehicle[key] as string | null | undefined;
      if (!rawDate) continue;

      const complianceDate = startOfDay(new Date(rawDate));
      const daysUntil = differenceInDays(complianceDate, today);

      // Default timing days from DEFAULT_PREFERENCES — but createNotification loads prefs itself.
      // We check against the defaults here; if org has overridden prefs we may fire extra/fewer,
      // but deduplication prevents double-sending on the same day.
      const defaultTiming = [60, 30, 7, 0];
      if (!defaultTiming.includes(daysUntil)) continue;

      // Deduplicate: skip if we already sent this vehicle+field today
      const alreadySent = todayExpiryNotifs.some((n) => {
        const meta = n.metadata as Record<string, unknown> | null;
        return (
          n.organizationId === vehicle.organizationId &&
          meta?.vehicleId === vehicle.id &&
          meta?.field === key
        );
      });
      if (alreadySent) continue;

      await createNotification({
        organizationId: vehicle.organizationId,
        type: NOTIFICATION_TYPES.VEHICLE_EXPIRY,
        title: "Vehicle Compliance Expiring Soon",
        body: `Truck ${vehicle.unitNumber}: ${label} expires in ${daysUntil} day(s).`,
        linkTo: "/dashboard/fleet",
        metadata: {
          vehicleId: vehicle.id,
          truckNumber: vehicle.unitNumber,
          field: key,
          daysUntil,
        },
      });
      sent++;
    }
  }

  return NextResponse.json({ processed, sent });
}
