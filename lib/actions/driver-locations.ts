"use server";

import { db } from "@/lib/db";
import { driverLocations, locations, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function getLocationsForOrg(): Promise<Array<{ id: number; name: string; terminalId: string | null }>> {
  const session = await requireSession();
  return db
    .select({ id: locations.id, name: locations.name, terminalId: locations.terminalId })
    .from(locations)
    .where(eq(locations.organizationId, session.organizationId))
    .orderBy(locations.name);
}

export async function getDriverLocations(driverId: string): Promise<number[]> {
  const session = await requireSession();
  const rows = await db
    .select({ locationId: driverLocations.locationId })
    .from(driverLocations)
    .where(and(
      eq(driverLocations.organizationId, session.organizationId),
      eq(driverLocations.driverId, driverId),
    ));
  return rows.map(r => r.locationId);
}

export async function setDriverLocations(
  driverId: string,
  locationIds: number[],
  allLocations: boolean,
): Promise<void> {
  const session = await requireSession();
  const orgId = session.organizationId;

  await db.delete(driverLocations).where(
    and(eq(driverLocations.organizationId, orgId), eq(driverLocations.driverId, driverId))
  );

  if (locationIds.length > 0) {
    await db.insert(driverLocations).values(
      locationIds.map(locationId => ({ organizationId: orgId, driverId, locationId }))
    );
  }

  await db.update(drivers)
    .set({ allLocations })
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));

  revalidatePath("/dashboard/drivers");
  revalidatePath("/dashboard/scheduling");
  revalidatePath("/dashboard/payroll");
}

export async function getAssignedDriverIds(): Promise<string[]> {
  const session = await requireSession();
  const rows = await db
    .selectDistinct({ driverId: driverLocations.driverId })
    .from(driverLocations)
    .where(eq(driverLocations.organizationId, session.organizationId));
  return rows.map(r => r.driverId);
}
