"use server";

import { db } from "@/lib/db";
import { gateCodes, gateCodeReports } from "@/lib/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { GateCodeRow } from "@/lib/gate-code-constants";
export type { GateArea, GateCodeRow } from "@/lib/gate-code-constants";

export async function getGateCodes(driverId: string): Promise<GateCodeRow[]> {
  const rows = await db
    .select({
      id:          gateCodes.id,
      location:    gateCodes.location,
      code:        gateCodes.code,
      addedByName: gateCodes.addedByName,
      active:      gateCodes.active,
      createdAt:   gateCodes.createdAt,
      reportCount: sql<number>`cast(count(${gateCodeReports.id}) as int)`,
    })
    .from(gateCodes)
    .leftJoin(gateCodeReports, eq(gateCodeReports.gateCodeId, gateCodes.id))
    .groupBy(gateCodes.id)
    .orderBy(gateCodes.location, desc(gateCodes.createdAt));

  // Fetch which ones this driver has reported
  const myReports = await db
    .select({ gateCodeId: gateCodeReports.gateCodeId })
    .from(gateCodeReports)
    .where(eq(gateCodeReports.driverId, driverId));
  const mySet = new Set(myReports.map((r) => r.gateCodeId));

  return rows.map((r) => ({ ...r, myReport: mySet.has(r.id) }));
}

export async function addGateCode(
  location: string,
  code: string,
  driverId: string,
  driverName: string,
) {
  await db.insert(gateCodes).values({
    location: location.trim(),
    code: code.trim(),
    addedBy: driverId,
    addedByName: driverName,
  });
  revalidatePath("/driver");
}

export async function reportNotWorking(
  gateCodeId: number,
  driverId: string,
  newCode?: string,
  newLocation?: string,
  driverName?: string,
) {
  // Record the report (ignore if already reported by this driver)
  await db
    .insert(gateCodeReports)
    .values({ gateCodeId, driverId })
    .onConflictDoNothing();

  // If they provided a new code, add it as a new active entry
  if (newCode?.trim() && newLocation && driverName) {
    await db.insert(gateCodes).values({
      location:    newLocation.trim(),
      code:        newCode.trim(),
      addedBy:     driverId,
      addedByName: driverName,
    });
  }

  revalidatePath("/driver");
}

export async function deleteGateCode(id: number) {
  await db.delete(gateCodes).where(eq(gateCodes.id, id));
  revalidatePath("/driver");
}
