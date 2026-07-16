import { db } from "@/lib/db";
import { dswRouteDays } from "@/lib/schema";
import { desc, gte } from "drizzle-orm";
import DswScorecardClient from "./dsw-scorecard-client";

function weekBounds(): { monday: string; sunday: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { monday: fmt(mon), sunday: fmt(sun) };
}

function ilsImpacts(vscan: number | null, ilsPct: number | null): number {
  if (vscan && vscan > 0 && ilsPct != null) return Math.round(vscan * (100 - ilsPct) / 100);
  return 0;
}

export default async function DswScorecard() {
  const { monday, sunday } = weekBounds();

  let rows: any[] = [];
  try {
    rows = await db.select().from(dswRouteDays)
      .where(gte(dswRouteDays.date, monday))
      .orderBy(desc(dswRouteDays.date));
  } catch { return null; }

  if (rows.length === 0) return null;

  // Only rows with a real driver name and vscan data
  const valid = rows.filter(r => r.driverNameRaw?.includes(",") && r.vscanPkgs != null);
  if (valid.length === 0) return null;

  // Latest date that has data
  const latestDate: string = valid[0]?.date ?? null;

  // Aggregate per driver across the week
  const byDriver: Record<string, {
    driverNameRaw: string;
    waName: string;
    totalVscan: number;
    totalImpacts: number;
    days: string[];
  }> = {};

  for (const r of valid) {
    const key = r.driverNameRaw.trim().toLowerCase();
    if (!byDriver[key]) {
      byDriver[key] = { driverNameRaw: r.driverNameRaw, waName: r.waName, totalVscan: 0, totalImpacts: 0, days: [] };
    }
    const impacts = ilsImpacts(r.vscanPkgs, r.ilsPct);
    byDriver[key].totalVscan  += r.vscanPkgs ?? 0;
    byDriver[key].totalImpacts += impacts;
    if (!byDriver[key].days.includes(r.date)) byDriver[key].days.push(r.date);
  }

  const drivers = Object.values(byDriver);

  return (
    <DswScorecardClient
      drivers={drivers}
      weekStart={monday}
      weekEnd={sunday}
      latestDate={latestDate}
    />
  );
}
