import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dswRouteDays, settings } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const [rows, lastSynced, autoEnabled, autoTime, lastSyncResultRaw] = await Promise.all([
    db.select().from(dswRouteDays).orderBy(desc(dswRouteDays.date), dswRouteDays.waName).limit(60),
    db.select().from(settings).where(eq(settings.key, "dsw_last_synced_at")).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(eq(settings.key, "dsw_auto_sync_enabled")).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(eq(settings.key, "dsw_auto_sync_time")).then(r => r[0]?.value ?? "07:00"),
    db.select().from(settings).where(eq(settings.key, "dsw_last_sync_result")).then(r => r[0]?.value ?? ""),
  ]);

  let lastSyncResult: any = null;
  try { if (lastSyncResultRaw) lastSyncResult = JSON.parse(lastSyncResultRaw); } catch {}

  return NextResponse.json({ rows, lastSynced, autoEnabled: autoEnabled === "true", autoTime, lastSyncResult });
}
