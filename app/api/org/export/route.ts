import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drivers, rydeScores, rydeReviews, settings, organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = session.organizationId;

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const [org, allDrivers, scores, reviews, orgSettings, dswRows, routeRows, scheduleRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1).then(r => r[0] ?? null),
    db.select().from(drivers).where(eq(drivers.organizationId, orgId)),
    db.select().from(rydeScores).where(eq(rydeScores.organizationId, orgId)),
    db.select().from(rydeReviews).where(eq(rydeReviews.organizationId, orgId)),
    db.select({ key: settings.key, value: settings.value }).from(settings).where(eq(settings.organizationId, orgId)),
    sql`SELECT * FROM dsw_data WHERE organization_id = ${orgId}`.catch(() => []),
    sql`SELECT * FROM routes WHERE organization_id = ${orgId}`.catch(() => []),
    sql`SELECT ds.*, d.name AS driver_name FROM driver_schedules ds JOIN drivers d ON d.driver_id = ds.driver_id WHERE d.organization_id = ${orgId}`.catch(() => []),
  ]);

  const SENSITIVE_KEYS = ["spotlight_password", "dro_password", "spotlight_otp", "spotlight_sync_triggered_by"];
  const safeSettings = (orgSettings as any[]).filter(r => !SENSITIVE_KEYS.includes(r.key));

  const payload = {
    exportedAt: new Date().toISOString(),
    organization: org ? { id: (org as any).id, name: (org as any).name, plan: (org as any).plan, subscriptionStatus: (org as any).subscriptionStatus } : null,
    drivers: allDrivers,
    rydeScores: scores,
    rydeReviews: reviews,
    dswData: dswRows,
    routes: routeRows,
    schedules: scheduleRows,
    settings: safeSettings,
  };

  const json = JSON.stringify(payload, null, 2);
  const orgName = ((org as any)?.name ?? `org-${orgId}`).replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const filename = `${orgName}-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
