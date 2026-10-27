"use server";

import { db } from "@/lib/db";
import { dswRouteDays, drivers } from "@/lib/schema";
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

export type DswDriverSummary = {
  driverId: string;
  driverName: string;
  daysWorked: number;
  totalCode85: number;
  totalDna: number;
  totalNonDelvd: number;
  totalActDel: number;
  avgIls: number | null;
};

export async function getDswDriverSummary(startDate: string, endDate: string): Promise<DswDriverSummary[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({
      driverId:      dswRouteDays.driverId,
      driverName:    drivers.name,
      daysWorked:    db.$count(dswRouteDays.id),
      totalCode85:   dswRouteDays.code85,
      totalDna:      dswRouteDays.dna,
      totalNonDelvd: dswRouteDays.nonDelvdStps,
      totalActDel:   dswRouteDays.actDelStps,
      avgIls:        dswRouteDays.ilsPct,
    })
    .from(dswRouteDays)
    .leftJoin(drivers, and(eq(drivers.driverId, dswRouteDays.driverId), eq(drivers.organizationId, orgId)))
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        gte(dswRouteDays.date, startDate),
        lte(dswRouteDays.date, endDate),
      )
    );

  // Aggregate manually since Drizzle doesn't support SUM/AVG in select without raw sql easily
  const map = new Map<string, DswDriverSummary>();
  for (const r of rows) {
    if (!r.driverId) continue;
    const prev = map.get(r.driverId);
    if (prev) {
      prev.daysWorked   += 1;
      prev.totalCode85  += r.totalCode85  ?? 0;
      prev.totalDna     += r.totalDna     ?? 0;
      prev.totalNonDelvd+= r.totalNonDelvd?? 0;
      prev.totalActDel  += r.totalActDel  ?? 0;
      if (r.avgIls != null) {
        // re-average: accumulate sum, divide at end
        prev.avgIls = (prev.avgIls ?? 0) + r.avgIls;
      }
    } else {
      map.set(r.driverId, {
        driverId:       r.driverId,
        driverName:     r.driverName ?? r.driverId,
        daysWorked:     1,
        totalCode85:    r.totalCode85  ?? 0,
        totalDna:       r.totalDna     ?? 0,
        totalNonDelvd:  r.totalNonDelvd?? 0,
        totalActDel:    r.totalActDel  ?? 0,
        avgIls:         r.avgIls ?? null,
      });
    }
  }

  // Finalise avgIls (we accumulated a sum, convert to average)
  const dayCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.driverId && r.avgIls != null) {
      dayCounts.set(r.driverId, (dayCounts.get(r.driverId) ?? 0) + 1);
    }
  }
  for (const [id, entry] of map) {
    const n = dayCounts.get(id) ?? 0;
    entry.avgIls = n > 0 && entry.avgIls != null ? entry.avgIls / n : null;
  }

  return Array.from(map.values())
    .filter(d => d.totalCode85 > 0 || d.totalDna > 0 || d.totalNonDelvd > 0 || d.avgIls != null)
    .sort((a, b) => (b.totalCode85 + b.totalDna) - (a.totalCode85 + a.totalDna));
}
