"use server";

import { db } from "@/lib/db";
import { dswRouteDays } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/session";

export type DswDayRow = {
  date: string;
  waNumber: string;
  waName: string;
  driverNameRaw: string;
  driverId: string | null;
  ilsPct: number | null;
  actDelStps: number | null;
  ilsImpactPkgs: number | null;
  code85: number | null;
  allStatusCodePkgs: number | null;
  dna: number | null;
  codeBreakdown: Record<string, number> | null;
  pldImpactPkgs: number | null;  // PLD-computed: code 27 + ghost (0/0) packages
  pldGhostPkgs: number | null;   // PLD-computed: VSA=0 & STAR=0 (never scanned)
  locationId: number | null;
};

export async function getDswDataForRange(startDate: string, endDate: string): Promise<DswDayRow[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({
      date: dswRouteDays.date,
      waNumber: dswRouteDays.waNumber,
      waName: dswRouteDays.waName,
      driverNameRaw: dswRouteDays.driverNameRaw,
      driverId: dswRouteDays.driverId,
      ilsPct: dswRouteDays.ilsPct,
      actDelStps: dswRouteDays.actDelStps,
      ilsImpactPkgs: dswRouteDays.ilsImpactPkgs,
      code85: dswRouteDays.code85,
      allStatusCodePkgs: dswRouteDays.allStatusCodePkgs,
      dna: dswRouteDays.dna,
      codeBreakdown: dswRouteDays.codeBreakdown,
      pldImpactPkgs: dswRouteDays.pldImpactPkgs,
      pldGhostPkgs: dswRouteDays.pldGhostPkgs,
      locationId: dswRouteDays.locationId,
    })
    .from(dswRouteDays)
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        gte(dswRouteDays.date, startDate),
        lte(dswRouteDays.date, endDate),
      )
    );

  return rows.map((r) => ({
    ...r,
    date: typeof r.date === "string" ? r.date.slice(0, 10) : new Date(r.date as unknown as string).toISOString().slice(0, 10),
    codeBreakdown: r.codeBreakdown
      ? (() => { try { return JSON.parse(r.codeBreakdown!); } catch { return null; } })()
      : null,
    pldImpactPkgs: r.pldImpactPkgs ?? null,
    pldGhostPkgs: r.pldGhostPkgs ?? null,
    locationId: r.locationId ?? null,
  }));
}
