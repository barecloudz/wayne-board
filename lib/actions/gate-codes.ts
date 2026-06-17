"use server";

import { db } from "@/lib/db";
import { gateCodes, gateCodeReports, settings } from "@/lib/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { DEFAULT_GATE_AREAS } from "@/lib/gate-code-constants";
import type { GateCodeRow } from "@/lib/gate-code-constants";
export type { GateArea, GateCodeRow } from "@/lib/gate-code-constants";

const GATE_AREAS_KEY = "gate_areas_extra";

export async function getGateAreas(): Promise<string[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, GATE_AREAS_KEY)).limit(1);
  const extra: string[] = row ? JSON.parse(row.value) : [];
  // Merge defaults with custom, preserving order
  const all = [...DEFAULT_GATE_AREAS];
  for (const a of extra) {
    if (!all.includes(a)) all.push(a);
  }
  return all;
}

export async function addGateArea(area: string) {
  const trimmed = area.trim();
  if (!trimmed) return;
  const [row] = await db.select().from(settings).where(eq(settings.key, GATE_AREAS_KEY)).limit(1);
  const extra: string[] = row ? JSON.parse(row.value) : [];
  if (!DEFAULT_GATE_AREAS.includes(trimmed) && !extra.includes(trimmed)) {
    extra.push(trimmed);
    await db
      .insert(settings)
      .values({ key: GATE_AREAS_KEY, value: JSON.stringify(extra) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(extra) } });
  }
  revalidatePath("/driver");
}

export async function getGateCodes(driverId: string): Promise<GateCodeRow[]> {
  const rows = await db
    .select({
      id:          gateCodes.id,
      location:    gateCodes.location,
      roadName:    gateCodes.roadName,
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
  roadName: string,
  code: string,
  driverId: string,
  driverName: string,
) {
  await db.insert(gateCodes).values({
    location: location.trim(),
    roadName: roadName.trim() || null,
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
  newRoadName?: string,
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
      roadName:    newRoadName?.trim() || null,
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
