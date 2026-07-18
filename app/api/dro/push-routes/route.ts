/**
 * POST /api/dro/push-routes
 * Pushes today's route assignments to DRO using the selected template.
 *
 * Algorithm (template-based, NOT geometry-based):
 *  1. Load template areas → workAreaNumber→routeLabel map
 *  2. Fetch waypoints from active DRO plan
 *  3. Group waypointIds by routeLabel (via workAreaNumber lookup)
 *  4. Call transferRoute for each non-empty group
 *  5. Trigger solve
 *
 * Body: { templateId: number }
 * Runs Puppeteer locally. Will return 503 if Chrome is unavailable.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 180; // 3 minutes for Netlify

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { saveDroSession } from "@/lib/dro-session";

const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";

async function droLogin(): Promise<string> {
  // Dynamically import puppeteer-core so this fails gracefully if unavailable
  const puppeteer = await import("puppeteer-core").then(m => m.default ?? m);
  const CHROME = process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const username = process.env.DRO_USERNAME ?? "";
  const password = process.env.DRO_PASSWORD ?? "";

  const browser = await (puppeteer as any).launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    page.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });
    await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
    const popupPromise = new Promise<any>(resolve => browser.once("targetcreated", (t: any) => resolve(t.page())));
    await page.click("button::-p-text(Service Provider)");
    const popup = await popupPromise;
    await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    popup.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });
    try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
    await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    await popup.type('input[name="identifier"]', username);
    await popup.click('input[type="submit"]');
    await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
    await popup.type('input[type="password"]', password);
    const btn = await popup.$('input[type="submit"], button[type="submit"]');
    if (btn) await btn.click(); else await popup.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
    const stations = await page.$$('[class*="station" i]');
    if (stations.length) await (stations[0] as any).click();
    await new Promise(r => setTimeout(r, 3000));
    const cookies = await page.cookies() as any[];
    return cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

export async function POST(request: Request) {
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
    const uniqueRoutes = [...new Set(Object.values(wanToRoute))];

    // Login to DRO
    let cookieHeader: string;
    try {
      cookieHeader = await droLogin();
    } catch (err: any) {
      return NextResponse.json({
        error: "DRO login failed — Chrome not available on this host",
        detail: err?.message,
        hint: "Run 'node scripts/push-dro-routes.mjs' locally instead",
      }, { status: 503 });
    }

    // Persist cookie for cron reuse
    await saveDroSession(cookieHeader).catch((e) =>
      console.warn("[push-routes] Failed to save DRO session cookie:", e)
    );

    const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

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
