import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dswRouteDays, settings } from "@/lib/schema";
import { desc, eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;
  const [rows, lastSynced, autoEnabled, autoTime, lastSyncResultRaw] = await Promise.all([
    db.select().from(dswRouteDays).where(eq(dswRouteDays.organizationId, orgId)).orderBy(desc(dswRouteDays.date), dswRouteDays.waName).limit(60),
    db.select().from(settings).where(and(eq(settings.key, "dsw_last_synced_at"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "dsw_auto_sync_enabled"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(and(eq(settings.key, "dsw_auto_sync_time"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "07:00"),
    db.select().from(settings).where(and(eq(settings.key, "dsw_last_sync_result"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
  ]);

  let lastSyncResult: any = null;
  try { if (lastSyncResultRaw) lastSyncResult = JSON.parse(lastSyncResultRaw); } catch {}

  return NextResponse.json({ rows, lastSynced, autoEnabled: autoEnabled === "true", autoTime, lastSyncResult });
}
