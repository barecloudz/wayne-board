/**
 * Auto DRO sync engine.
 * Logs into dro.routesmart.com via Okta (Puppeteer), then pulls today's
 * route + stop data via the DRO REST API and stores it in Neon.
 *
 * Credentials come from environment variables:
 *   DRO_USERNAME, DRO_PASSWORD
 *
 * Called by:
 *   - POST /api/auto-dro/sync  (manual trigger from UI)
 *   - GitHub Actions nightly cron
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.tar";
import { neon } from "@neondatabase/serverless";

const DRO_BASE = "https://dro.routesmart.com";

export type DroSyncResult = {
  success: boolean;
  sortDate: string;
  routes: number;
  stops: number;
  anchorAreas?: number;
  stopsWithCoords?: number;
  error?: string;
};

export async function syncDro(): Promise<DroSyncResult> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Read credentials from DB settings first, fall back to env vars
  const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_username','dro_password')`;
  const credsMap  = Object.fromEntries(credsRows.map((r: any) => [r.key, r.value]));
  const username  = credsMap["dro_username"] || process.env.DRO_USERNAME;
  const password  = credsMap["dro_password"] || process.env.DRO_PASSWORD;

  if (!username || !password) {
    return { success: false, sortDate: "", routes: 0, stops: 0, error: "DRO credentials not configured. Set them in Auto DRO settings." };
  }

  let browser;
  try {
    // ── Step 1: Log in via Puppeteer / Okta ────────────────────────────────
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: true,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-features=WebBluetooth,WebUSB"],
    });

    const context = browser.defaultBrowserContext();
    await context.overridePermissions(DRO_BASE, []);

    const page = await browser.newPage();
    page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

    await page.goto(DRO_BASE, { waitUntil: "networkidle2" });

    // Click "Service Provider" → opens Okta popup
    const popupPromise = new Promise<any>(resolve =>
      browser!.once("targetcreated", (t: any) => resolve(t.page()))
    );

    await page.click('button::-p-text(Service Provider)');
    const popup = await popupPromise;
    await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    popup.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });

    // Dismiss passkey dialog if present
    try {
      await popup.waitForSelector('button::-p-text(Block)', { timeout: 4000 });
      await popup.click('button::-p-text(Block)');
    } catch {}

    // Fill username
    await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    await popup.type('input[name="identifier"]', username);
    await popup.click('input[type="submit"]');

    // Fill password
    await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
    await popup.type('input[type="password"]', password);
    // Okta password page uses input[type="submit"] with value "Verify"
    const pwSubmit = await popup.$('input[type="submit"], button[type="submit"], input[value="Verify"]');
    if (pwSubmit) await pwSubmit.click();
    else await popup.keyboard.press("Enter");

    // Wait for redirect back to DRO
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // ── Step 2: Select the single service area ──────────────────────────────
    await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
    const stationEls = await page.$$('[class*="station" i]');
    if (stationEls.length > 0) await stationEls[0].click();
    await new Promise(r => setTimeout(r, 4000));

    // ── Step 3: Extract session cookies from the main page ─────────────────
    const cookies = await page.cookies();
    const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");

    await browser.close();
    browser = undefined;

    // ── Step 4: Pull data via DRO REST API ─────────────────────────────────
    const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };
    const SA_ID = process.env.DRO_SERVICE_AREA_ID || "3060743";
    const STATION_ID = process.env.DRO_STATION_ID || "259";

    // Get active route plan ID
    const planRes  = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
    const plan     = await planRes.json() as any;
    const planId = plan.planId as number;

    // Get sort date
    // Sort date is a plain string like "2026-07-16"
    const sdText   = (await (await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, { headers })).text()).trim().replace(/^"|"$/g, "");
    const sortDate: string = /^\d{4}-\d{2}-\d{2}$/.test(sdText) ? sdText : new Date().toISOString().slice(0, 10);

    const routes    = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-summary?stationId=${STATION_ID}&solutionType=actual`, { headers })).json() as any[];
    const waypoints = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${planId}`, { headers })).json() as any[];

    // Pull anchor areas (polygon shapes in EPSG:3857)
    const anchorAreas = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers })).json() as any[];

    // Pull stop GPS coordinates from ArcGIS Layer 8
    // Encode single quotes as %27 (DRO's encoding convention)
    const encWhere = (s: string) => encodeURIComponent(s).replace(/'/g, "%27");
    const agsWhere = encWhere(`sort_date = date'${sortDate}' and station_id = '${STATION_ID}' and csa = '304169'`);
    const agsParamValues = encodeURIComponent(JSON.stringify({ sort_date: sortDate, station_id: STATION_ID }));
    const agsLayerParamValues = encodeURIComponent(JSON.stringify([{ "8": { sort_date: sortDate, station_id: STATION_ID } }, { "13": { sort_date: sortDate, station_id: STATION_ID } }]));
    // Use outSR=102100 (EPSG:3857 — same as DRO) and convert to WGS84 client-side
    const agsInner = `http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query?f=json&outFields=wid,route&where=${agsWhere}&returnGeometry=true&outSR=102100&parameterValues=${agsParamValues}&layerParameterValues=${agsLayerParamValues}`;
    const agsUrl = `${DRO_BASE}/api/api/Proxy?${agsInner}`;
    let agsFeatures: any[] = [];
    let agsError = "";
    try {
      const agsRes  = await fetch(agsUrl, { headers });
      const agsText = await agsRes.text();
      let agsData: any;
      try { agsData = JSON.parse(agsText); } catch { agsError = "JSON parse failed: " + agsText.slice(0, 200); }
      if (agsData?.error) agsError = JSON.stringify(agsData.error);
      agsFeatures = agsData?.features ?? [];
    } catch (e: any) { agsError = e?.message ?? String(e); }
    if (agsError) console.warn("ArcGIS Layer 8 query error:", agsError);

    // Build wid → [lat, lng] lookup (convert EPSG:3857 → WGS84 if needed)
    const merc2lat = (y: number) => (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
    const merc2lng = (x: number) => (x / 20037508.34) * 180;
    const widCoords: Record<string, [number, number]> = {};
    for (const f of agsFeatures) {
      if (f.geometry?.x != null && f.geometry?.y != null && f.attributes?.wid != null) {
        // If coordinates look like EPSG:3857 (large numbers), convert; else use as-is
        const x = f.geometry.x as number;
        const y = f.geometry.y as number;
        const lat = Math.abs(y) > 90 ? merc2lat(y) : y;
        const lng = Math.abs(x) > 180 ? merc2lng(x) : x;
        widCoords[String(f.attributes.wid)] = [lat, lng];
      }
    }

    // ── Step 5: Wipe today's ephemeral data and reload ──────────────────────
    await sql`DELETE FROM dro_stops`;
    await sql`DELETE FROM dro_routes`;
    await sql`DELETE FROM dro_anchor_areas`;

    // Insert routes
    if (routes.length > 0) {
      for (const r of routes) {
        await sql`
          INSERT INTO dro_routes
            (work_area_name, work_area_number, route_type, stops, packages,
             distance, time_hours, cube, vehicle_capacity, sort_date)
          VALUES (
            ${r.workAreaName     ?? ""},
            ${r.workAreaNumber   ?? ""},
            ${r.routeType        ?? ""},
            ${r.stops            ?? 0},
            ${r.packages         ?? 0},
            ${r.distance         ?? 0},
            ${parseFloat(r.time) || 0},
            ${r.cube             ?? 0},
            ${r.vehicleCapacity  ?? ""},
            ${sortDate}
          )
        `;
      }
    }

    // Insert stops in batches of 100
    const BATCH = 100;
    for (let i = 0; i < waypoints.length; i += BATCH) {
      const batch = waypoints.slice(i, i + BATCH);
      for (const w of batch) {
        const coords = widCoords[String(w.wid)] ?? [null, null];
        await sql`
          INSERT INTO dro_stops
            (waypoint_id, stop_id, firm_name, address, city, state, postal_code,
             actual_route, actual_sequence, arrival_time, stop_class,
             no_packages, total_weight, total_cube, is_lp_package, is_bulk_stop,
             work_area_number, lat, lng, sort_date)
          VALUES (
            ${w.waypointId       ?? ""},
            ${w.stopId           ?? ""},
            ${w.firmName         ?? ""},
            ${w.address          ?? ""},
            ${w.city             ?? ""},
            ${w.state            ?? ""},
            ${w.postalCode       ?? ""},
            ${w.actualRoute      ?? ""},
            ${w.actualSequence   ?? null},
            ${w.arrivalTimeText  ?? ""},
            ${w.stopClass        ?? ""},
            ${w.noPackages       ?? 0},
            ${w.totalWeight      ?? 0},
            ${w.totalCube        ?? 0},
            ${w.isLPPackage      ?? false},
            ${w.isBulkStop       ?? false},
            ${w.workAreaNumber   ?? ""},
            ${coords[0]},
            ${coords[1]},
            ${sortDate}
          )
        `;
      }
    }

    // Insert anchor areas
    for (const a of anchorAreas) {
      await sql`
        INSERT INTO dro_anchor_areas (anchor_area_id, name, shape_json, enabled_route_plans)
        VALUES (
          ${a.anchorAreaId},
          ${a.name ?? ""},
          ${typeof a.shape === "string" ? a.shape : JSON.stringify(a.shape ?? {})},
          ${JSON.stringify(a.enabledRoutePlans ?? [])}
        )
        ON CONFLICT (anchor_area_id) DO UPDATE SET
          name                = EXCLUDED.name,
          shape_json          = EXCLUDED.shape_json,
          enabled_route_plans = EXCLUDED.enabled_route_plans,
          synced_at           = NOW()
      `;
    }

    // Upsert daily totals aggregate (kept permanently, no PII)
    const totalStops    = routes.reduce((s: number, r: any) => s + (r.stops    ?? 0), 0);
    const totalPackages = routes.reduce((s: number, r: any) => s + (r.packages ?? 0), 0);
    const totalDistance = routes.reduce((s: number, r: any) => s + (r.distance ?? 0), 0);

    await sql`
      INSERT INTO dro_daily_totals (date, routes, total_stops, total_packages, total_distance)
      VALUES (${sortDate}, ${routes.length}, ${totalStops}, ${totalPackages}, ${totalDistance})
      ON CONFLICT (date) DO UPDATE SET
        routes         = EXCLUDED.routes,
        total_stops    = EXCLUDED.total_stops,
        total_packages = EXCLUDED.total_packages,
        total_distance = EXCLUDED.total_distance,
        synced_at      = NOW()
    `;

    // Update last synced timestamp in settings
    await sql`
      INSERT INTO settings (key, value) VALUES ('dro_last_synced_at', NOW()::text)
      ON CONFLICT (key) DO UPDATE SET value = NOW()::text
    `;

    return { success: true, sortDate, routes: routes.length, stops: waypoints.length, anchorAreas: anchorAreas.length, stopsWithCoords: agsFeatures.length };

  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, sortDate: "", routes: 0, stops: 0, error: err?.message ?? String(err) };
  }
}
