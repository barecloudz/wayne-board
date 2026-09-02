import { db } from "@/lib/db";
import { dswRouteDays } from "@/lib/schema";
import { desc } from "drizzle-orm";
import DswScorecardClient from "./dsw-scorecard-client";

export default async function DswScorecard() {
  let rows: any[] = [];
  try { rows = await db.select().from(dswRouteDays).orderBy(desc(dswRouteDays.date)).limit(80); }
  catch { return null; }

  const latestDate = rows[0]?.date ?? null;
  if (!latestDate) return null;

  const drivers = rows.filter(r =>
    r.date === latestDate && r.driverNameRaw?.includes(",") && r.vscanPkgs != null
  );
  if (drivers.length === 0) return null;

  return <DswScorecardClient drivers={drivers} latestDate={latestDate} />;
}
