import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gcRouteDays, settings } from "@/lib/schema";
import { desc, eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;
  const [rows, lastSynced, autoEnabled, autoTime] = await Promise.all([
    db.select().from(gcRouteDays).where(eq(gcRouteDays.organizationId, orgId)).orderBy(desc(gcRouteDays.date), gcRouteDays.driverName).limit(50),
    db.select().from(settings).where(and(eq(settings.key, "gc_last_synced_at"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? ""),
    db.select().from(settings).where(and(eq(settings.key, "gc_auto_sync_enabled"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "false"),
    db.select().from(settings).where(and(eq(settings.key, "gc_auto_sync_time"), eq(settings.organizationId, orgId))).then(r => r[0]?.value ?? "07:00"),
  ]);

  return NextResponse.json({ rows, lastSynced, autoEnabled: autoEnabled === "true", autoTime });
}
