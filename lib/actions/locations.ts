"use server";

import { db } from "@/lib/db";
import { locations, userLocations } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function getLocations() {
  const orgId = await requireOrg();
  return db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, orgId))
    .orderBy(locations.name);
}

export async function createLocation(data: {
  name: string;
  terminalId?: string;
  gcTerminalId?: number;
}) {
  const orgId = await requireOrg();
  await db.insert(locations).values({
    organizationId: orgId,
    name: data.name.trim(),
    terminalId: data.terminalId?.trim() || null,
    gcTerminalId: data.gcTerminalId ?? null,
  });
  revalidatePath("/dashboard/settings");
}

export async function updateLocation(
  id: number,
  data: { name: string; terminalId?: string; gcTerminalId?: number },
) {
  const orgId = await requireOrg();
  await db
    .update(locations)
    .set({
      name: data.name.trim(),
      terminalId: data.terminalId?.trim() || null,
      gcTerminalId: data.gcTerminalId ?? null,
    })
    .where(and(eq(locations.id, id), eq(locations.organizationId, orgId)));
  revalidatePath("/dashboard/settings");
}

export async function deleteLocation(id: number) {
  const orgId = await requireOrg();
  await db
    .delete(locations)
    .where(and(eq(locations.id, id), eq(locations.organizationId, orgId)));
  revalidatePath("/dashboard/settings");
}

export async function getUserLocationIds(userId: string): Promise<number[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({ locationId: userLocations.locationId })
    .from(userLocations)
    .where(
      and(
        eq(userLocations.organizationId, orgId),
        eq(userLocations.userId, userId),
      ),
    );
  return rows.map((r) => r.locationId);
}

export async function setUserLocations(userId: string, locationIds: number[]) {
  const orgId = await requireOrg();

  // Delete all existing assignments for this user in this org
  await db
    .delete(userLocations)
    .where(
      and(
        eq(userLocations.organizationId, orgId),
        eq(userLocations.userId, userId),
      ),
    );

  // Insert new assignments
  if (locationIds.length > 0) {
    await db.insert(userLocations).values(
      locationIds.map((locationId) => ({
        organizationId: orgId,
        userId,
        locationId,
      })),
    );
  }

  revalidatePath("/dashboard/settings");
}
