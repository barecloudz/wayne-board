/**
 * POST /api/dro/push-routes
 * Pushes today's route assignments to DRO using the selected template.
 *
 * Algorithm (template-based, NOT geometry-based):
 *  1. Load template areas → workAreaNumber→routeLabel map
 *  2. Login to DRO via getDroHeaders (uses @sparticuz/chromium-min, works on Netlify)
 *  3. Fetch waypoints from active DRO plan
 *  4. Group waypointIds by routeLabel (via workAreaNumber lookup)
 *  5. Call transferRoute for each non-empty group
 *  6. Trigger solve
 *
 * Body: { templateId: number }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 180; // 3 minutes for Netlify

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getDroHeaders } from "@/lib/dro-client";
import { getSession } from "@/lib/session";

const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const templateId: number | undefined = body.templateId;

    if (!templateId) {
      return NextResponse.json({ error: "templateId required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

    // Load template areas → workAreaNumber→routeLabel
    const templateRows = await sql`
      SELECT rta.anchor_area_name, rta.work_area_number, rta.route_label
      FROM route_template_areas rta
      WHERE rta.template_id = ${templateId}
        AND rta.work_area_number IS NOT NULL
        AND rta.work_area_number != ''
    `;

    if (templateRows.length === 0) {
      return NextResponse.json({ error: "Template not found or has no area mappings" }, { status: 404 });
    }

    const wanToRoute: Record<string, string> = {};
    for (const row of templateRows as any[]) {
      wanToRoute[row.work_area_number] = row.route_label;
    }

    // Login to DRO (uses cached session or runs Puppeteer via @sparticuz/chromium-min)
    const headers = await getDroHeaders();

    // Get sort date
    const sdText = (await (await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, { headers })).text())
      .trim().replace(/^"|"$/g, "");
    const sortDate = /^\d{4}-\d{2}-\d{2}$/.test(sdText) ? sdText : new Date().toISOString().slice(0, 10);

    // Get active plan ID
    const activePlan = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers })).json();
    const routePlanId = activePlan?.planId;
    if (!routePlanId) {
      return NextResponse.json({ error: "Could not determine active DRO plan" }, { status: 500 });
    }

    // Fetch all waypoints from active plan
    const waypoints: any[] = await (await fetch(
      `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${routePlanId}`,
      { headers }
    )).json();

    // Group waypointIds by route label
    const buckets: Record<string, string[]> = {};
    let skipped = 0;
    for (const wp of waypoints) {
      const wan = wp.workAreaNumber?.trim();
      if (!wan) { skipped++; continue; }
      const routeLabel = wanToRoute[wan];
      if (!routeLabel) { skipped++; continue; }
      if (!buckets[routeLabel]) buckets[routeLabel] = [];
      buckets[routeLabel].push(wp.waypointId);
    }

    // Push transferRoute for each bucket
    const results: { route: string; stops: number; ok: boolean; status?: number }[] = [];
    for (const [route, waypointIds] of Object.entries(buckets)) {
      if (!waypointIds.length) continue;
      const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`, {
        method: "POST", headers,
        body: JSON.stringify({ route, waypointIds, sort_date: sortDate }),
      });
      results.push({ route, stops: waypointIds.length, ok: res.ok, status: res.status });
    }

    // Trigger solve
    const waveRes = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`, { headers });
    const waveData = await waveRes.json().catch(() => ({}));
    const waveId = waveData?.waves?.[0]?.waveId ?? 84167;

    const solveRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`, {
      method: "POST", headers,
      body: JSON.stringify({
        alternateSolver: false,
        createInformedOptimal: false,
        submittedByStationUser: false,
        waves: [{ waveId, routePlanId, wave: 1 }],
      }),
    });
    const solveBody = await solveRes.json().catch(() => ({}));

    const totalStops = results.reduce((s, r) => s + r.stops, 0);
    const failed = results.filter(r => !r.ok);

    return NextResponse.json({
      success: true,
      sortDate,
      activePlan: { id: routePlanId, name: activePlan?.name },
      templateId,
      routesSent: results.length,
      totalStops,
      skippedStops: skipped,
      failed: failed.length > 0 ? failed : undefined,
      solveOk: solveRes.ok,
      solveJobId: solveBody?.id,
      routes: results,
    });

  } catch (err: any) {
    console.error("[push-routes]", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
