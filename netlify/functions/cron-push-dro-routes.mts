/**
 * Netlify scheduled function — runs nightly at 11:30 PM Eastern (3:30 AM UTC).
 * Pushes the default route template to DRO using a stored session cookie.
 *
 * Schedule: 30 3 * * *  (3:30 UTC = 11:30 PM Eastern — inside DRO planning window)
 *
 * Requirements:
 *  - A valid DRO session cookie must be stored in settings (key: 'dro_session_cookie')
 *    — saved automatically by the push-routes API after a successful Puppeteer login
 *  - A default route template must exist (is_default = true)
 */

import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { getDroSession } from "../../lib/dro-session";

export const config: Config = {
  schedule: "30 3 * * *",
};

const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";

export default async function handler() {
  console.log("[cron-push-dro-routes] Starting nightly DRO push");

  try {
    // 1. Load session cookie from DB
    const cookieHeader = await getDroSession();
    if (!cookieHeader) {
      console.error("[cron-push-dro-routes] No DRO session cookie in DB — user must re-login via Wayne Board");
      return new Response(
        JSON.stringify({ success: false, error: "No DRO session cookie — login via Wayne Board first" }),
        { status: 503 }
      );
    }

    const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);

    // 2. Load the default template
    const templateRows = await sql`
      SELECT id, name FROM route_templates WHERE is_default = true LIMIT 1
    `;
    if (!templateRows.length) {
      console.error("[cron-push-dro-routes] No default template found");
      return new Response(
        JSON.stringify({ success: false, error: "No default route template found" }),
        { status: 500 }
      );
    }
    const templateId = templateRows[0].id as number;
    const templateName = templateRows[0].name as string;
    console.log(`[cron-push-dro-routes] Using template: ${templateName} (id=${templateId})`);

    // 3. Load template areas → workAreaNumber → routeLabel map
    const areaRows = await sql`
      SELECT anchor_area_name, work_area_number, route_label
      FROM route_template_areas
      WHERE template_id = ${templateId}
        AND work_area_number IS NOT NULL
        AND work_area_number != ''
    `;
    if (!areaRows.length) {
      console.error("[cron-push-dro-routes] Template has no area mappings");
      return new Response(
        JSON.stringify({ success: false, error: "Template has no area mappings" }),
        { status: 500 }
      );
    }

    const wanToRoute: Record<string, string> = {};
    for (const row of areaRows) {
      wanToRoute[row.work_area_number as string] = row.route_label as string;
    }

    const headers: Record<string, string> = {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    };

    // Helper: check for auth errors
    function isAuthError(status: number): boolean {
      return status === 401 || status === 403;
    }

    // 4. Get sort date
    const sdRes = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, { headers });
    if (isAuthError(sdRes.status)) {
      console.error("[cron-push-dro-routes] Session expired — user must re-login via Wayne Board");
      return new Response(
        JSON.stringify({ success: false, error: "Session expired — user must re-login via Wayne Board" }),
        { status: 503 }
      );
    }
    const sdText = (await sdRes.text()).trim().replace(/^"|"$/g, "");
    const sortDate = /^\d{4}-\d{2}-\d{2}$/.test(sdText)
      ? sdText
      : new Date().toISOString().slice(0, 10);
    console.log(`[cron-push-dro-routes] Sort date: ${sortDate}`);

    // 5. Get active plan
    const planRes = await fetch(
      `${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`,
      { headers }
    );
    if (isAuthError(planRes.status)) {
      console.error("[cron-push-dro-routes] Session expired — user must re-login via Wayne Board");
      return new Response(
        JSON.stringify({ success: false, error: "Session expired — user must re-login via Wayne Board" }),
        { status: 503 }
      );
    }
    const activePlan = await planRes.json() as { planId?: number; name?: string };
    const routePlanId = activePlan?.planId;
    if (!routePlanId) {
      console.error("[cron-push-dro-routes] Could not determine active DRO plan");
      return new Response(
        JSON.stringify({ success: false, error: "Could not determine active DRO plan" }),
        { status: 500 }
      );
    }
    console.log(`[cron-push-dro-routes] Active plan: ${activePlan.name} (id=${routePlanId})`);

    // 6. Fetch all waypoints from active plan
    const wpRes = await fetch(
      `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${routePlanId}`,
      { headers }
    );
    if (isAuthError(wpRes.status)) {
      console.error("[cron-push-dro-routes] Session expired — user must re-login via Wayne Board");
      return new Response(
        JSON.stringify({ success: false, error: "Session expired — user must re-login via Wayne Board" }),
        { status: 503 }
      );
    }
    const waypoints = await wpRes.json() as Array<{ workAreaNumber?: string; waypointId: string }>;

    // 7. Group waypointIds by routeLabel
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

    // 8. Push transferRoute for each non-empty bucket
    const results: { route: string; stops: number; ok: boolean; status?: number }[] = [];
    for (const [route, waypointIds] of Object.entries(buckets)) {
      if (!waypointIds.length) continue;
      const res = await fetch(
        `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ route, waypointIds, sort_date: sortDate }),
        }
      );
      if (isAuthError(res.status)) {
        console.error("[cron-push-dro-routes] Session expired during transferRoute — user must re-login via Wayne Board");
        return new Response(
          JSON.stringify({ success: false, error: "Session expired — user must re-login via Wayne Board" }),
          { status: 503 }
        );
      }
      results.push({ route, stops: waypointIds.length, ok: res.ok, status: res.status });
      console.log(`[cron-push-dro-routes] transferRoute ${route}: ${waypointIds.length} stops, ok=${res.ok}`);
    }

    // 9. Get waveId and call create_solution_by_wave
    const waveRes = await fetch(
      `${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`,
      { headers }
    );
    const waveData = await waveRes.json().catch(() => ({})) as { waves?: Array<{ waveId: number }> };
    const waveId = waveData?.waves?.[0]?.waveId ?? 84167;

    const solveRes = await fetch(
      `${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          alternateSolver: false,
          createInformedOptimal: false,
          submittedByStationUser: false,
          waves: [{ waveId, routePlanId, wave: 1 }],
        }),
      }
    );
    if (isAuthError(solveRes.status)) {
      console.error("[cron-push-dro-routes] Session expired during solve — user must re-login via Wayne Board");
      return new Response(
        JSON.stringify({ success: false, error: "Session expired — user must re-login via Wayne Board" }),
        { status: 503 }
      );
    }
    const solveBody = await solveRes.json().catch(() => ({})) as { id?: number };

    const totalStops = results.reduce((s, r) => s + r.stops, 0);
    const failed = results.filter((r) => !r.ok);

    console.log(
      `[cron-push-dro-routes] Done — ${results.length} routes, ${totalStops} stops, solve ok=${solveRes.ok}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        sortDate,
        activePlan: { id: routePlanId, name: activePlan.name },
        templateId,
        templateName,
        routesSent: results.length,
        totalStops,
        skippedStops: skipped,
        failed: failed.length > 0 ? failed : undefined,
        solveOk: solveRes.ok,
        solveJobId: solveBody?.id,
        routes: results,
      }),
      { status: 200 }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron-push-dro-routes] Unhandled error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 503 }
    );
  }
}
