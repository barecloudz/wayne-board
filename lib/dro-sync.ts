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

import { neon } from "@neondatabase/serverless";
import { getDroHeadersStrict } from "@/lib/dro-client";

const DRO_BASE = "https://dro.routesmart.com";

export type DroSyncResult = {
  success: boolean;
  sortDate: string;
  routes: number;
  stops: number;
  unroutable?: number;
  anchorAreas?: number;
  stopsWithCoords?: number;
  routePlans?: number;
  stopOverrides?: number;
  planningWindowOpen?: boolean;
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

  try {
    // ── Step 1: Get headers (strict — cached session only, never runs Puppeteer) ─
    const headers = await getDroHeadersStrict();

    // ── Step 2: Pull data via DRO REST API ────────────────────────────────
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

    // Fetch core data in parallel
    const [routes, waypoints, anchorAreasRaw, allRoutePlans, stopOverridesRaw, packageDetail, planningWindowRaw] = await Promise.all([
      fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-summary?stationId=${STATION_ID}&solutionType=actual`, { headers }).then(r => r.json()) as Promise<any[]>,
      fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${planId}`, { headers }).then(r => r.json()) as Promise<any[]>,
      fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers }).then(r => r.json()) as Promise<any[]>,
      fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans`, { headers }).then(r => r.json()).catch(() => []) as Promise<any[]>,
      fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/stop-overrides`, { headers }).then(r => r.json()).catch(() => []) as Promise<any[]>,
      fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/report/packagedetail?routePlanId=${planId}`, { headers }).then(r => r.json()).catch(() => []) as Promise<any[]>,
      fetch(`${DRO_BASE}/api/api/service-areas/station/${STATION_ID}/planningWindowState`, { headers }).then(r => r.json()).catch(() => false),
    ]);

    const anchorAreas = anchorAreasRaw;
    const planningWindowOpen = !!planningWindowRaw;

    // Build packageDetail lookup: workAreaNumber → detail row
    const pkgDetailByRoute: Record<string, any> = {};
    for (const d of (packageDetail ?? [])) {
      if (d.workAreaNumber) pkgDetailByRoute[d.workAreaNumber] = d;
    }

    // Pull unroutable/unassigned waypoints — DRO couldn't assign these to any route
    let unroutableWaypoints: any[] = [];
    try {
      const unroutRes  = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/UnroutableWaypoints?`, { headers });
      const unroutData = await unroutRes.json() as any;
      unroutableWaypoints = unroutData?.eligible ?? [];
    } catch { /* non-fatal */ }

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

    // Insert routes with LP/SM/bulk/reg breakdown from packagedetail
    if (routes.length > 0) {
      for (const r of routes) {
        const pd = pkgDetailByRoute[r.workAreaNumber ?? ""] ?? {};
        await sql`
          INSERT INTO dro_routes
            (work_area_name, work_area_number, route_type, stops, packages,
             distance, time_hours, cube, vehicle_capacity, sort_date,
             lp_stops, lp_packages, sm_stops, sm_packages,
             bulk_stops, bulk_packages, reg_stops, reg_packages,
             exceeded_target_duration, time_critical_stops)
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
            ${sortDate},
            ${pd.lpStops         ?? 0},
            ${pd.lpPackages      ?? 0},
            ${pd.smStops         ?? 0},
            ${pd.smPackages      ?? 0},
            ${pd.bulkStops       ?? 0},
            ${pd.bulkPackages    ?? 0},
            ${pd.regStops        ?? 0},
            ${pd.regPackages     ?? 0},
            ${pd.exceededTargetDuration ?? false},
            ${pd.timeCriticalStops ?? 0}
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
             work_area_number, lat, lng, sort_date,
             wid, optimal_route, optimal_sequence, window_open, window_close,
             is_small_stop, is_cdo_stop, is_hazardous, is_heavyweight,
             tracking_ids, actual_assignment_type, pickup_type, reason_code,
             overflowed_route, num_lp_packages)
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
            ${sortDate},
            ${w.wid              ?? null},
            ${w.optimalRoute     ?? ""},
            ${w.optimalSequence  ?? null},
            ${w.windowOpen       ?? ""},
            ${w.windowClose      ?? ""},
            ${w.isSmallStop      ?? false},
            ${w.isCdoStop        ?? false},
            ${w.isHazardous      ?? false},
            ${w.isHeavyweight    ?? false},
            ${JSON.stringify(w.trackingIds ?? [])},
            ${w.actualAssignmentType ?? ""},
            ${w.pickupType       ?? ""},
            ${w.reasonCode       ?? ""},
            ${w.overflowedRoute  ?? ""},
            ${w.numLPPackages    ?? 0}
          )
        `;
      }
    }

    // Insert unroutable stops (no actualRoute — plan engine will assign them)
    for (let i = 0; i < unroutableWaypoints.length; i += BATCH) {
      const batch = unroutableWaypoints.slice(i, i + BATCH);
      for (const w of batch) {
        const coords = widCoords[String(w.wid)] ?? [null, null];
        await sql`
          INSERT INTO dro_stops
            (waypoint_id, stop_id, firm_name, address, city, state, postal_code,
             actual_route, actual_sequence, arrival_time, stop_class,
             no_packages, total_weight, total_cube, is_lp_package, is_bulk_stop,
             work_area_number, lat, lng, sort_date,
             wid, optimal_route, optimal_sequence, window_open, window_close,
             is_small_stop, is_cdo_stop, is_hazardous, is_heavyweight,
             tracking_ids, actual_assignment_type, pickup_type, reason_code,
             overflowed_route, num_lp_packages)
          VALUES (
            ${w.waypointId       ?? ""},
            ${w.stopId           ?? ""},
            ${w.firmName         ?? ""},
            ${w.address          ?? ""},
            ${w.city             ?? ""},
            ${w.state            ?? ""},
            ${w.postalCode       ?? ""},
            ${""},
            ${null},
            ${""},
            ${w.stopClass        ?? ""},
            ${w.noPackages       ?? 0},
            ${w.totalWeight      ?? 0},
            ${w.totalCube        ?? 0},
            ${w.isLPPackage      ?? false},
            ${w.isBulkStop       ?? false},
            ${w.workAreaNumber   ?? ""},
            ${coords[0]},
            ${coords[1]},
            ${sortDate},
            ${w.wid              ?? null},
            ${w.optimalRoute     ?? ""},
            ${w.optimalSequence  ?? null},
            ${w.windowOpen       ?? ""},
            ${w.windowClose      ?? ""},
            ${w.isSmallStop      ?? false},
            ${w.isCdoStop        ?? false},
            ${w.isHazardous      ?? false},
            ${w.isHeavyweight    ?? false},
            ${JSON.stringify(w.trackingIds ?? [])},
            ${w.actualAssignmentType ?? ""},
            ${w.pickupType       ?? ""},
            ${w.reasonCode       ?? ""},
            ${w.overflowedRoute  ?? ""},
            ${w.numLPPackages    ?? 0}
          )
        `;
      }
    }

    // Upsert route plans
    for (const p of (allRoutePlans ?? [])) {
      await sql`
        INSERT INTO dro_route_plans
          (plan_id, name, total_routes, lp_routes, bulk_routes, reg_routes, small_routes, is_active, last_used_date)
        VALUES (
          ${p.planId},
          ${p.name ?? ""},
          ${p.totalRoutes ?? 0},
          ${p.lpRoutes    ?? 0},
          ${p.bulkRoutes  ?? 0},
          ${p.regRoutes   ?? 0},
          ${p.smallRoutes ?? 0},
          ${p.planId === planId},
          ${p.lastUsedDate ?? ""}
        )
        ON CONFLICT (plan_id) DO UPDATE SET
          name           = EXCLUDED.name,
          total_routes   = EXCLUDED.total_routes,
          is_active      = EXCLUDED.is_active,
          last_used_date = EXCLUDED.last_used_date,
          synced_at      = NOW()
      `;
    }

    // Upsert permanent stop overrides
    for (const o of (stopOverridesRaw ?? [])) {
      await sql`
        INSERT INTO dro_stop_overrides
          (override_id, stop_id, recipient_name, address, postal_code,
           type, value, window_open, window_close, work_area_num, route_plan_ids)
        VALUES (
          ${String(o.stopOverride_id ?? o.id ?? "")},
          ${o.stopId        ?? ""},
          ${o.recipientName ?? ""},
          ${o.address       ?? ""},
          ${o.postal_code   ?? ""},
          ${o.type          ?? ""},
          ${String(o.value  ?? "")},
          ${String(o.open   ?? "")},
          ${String(o.closed ?? "")},
          ${String(o.workAreaNum ?? "")},
          ${JSON.stringify(o.routePlanIds ?? o.activeRoutePlans ?? [])}
        )
        ON CONFLICT (override_id) DO UPDATE SET
          value         = EXCLUDED.value,
          work_area_num = EXCLUDED.work_area_num,
          synced_at     = NOW()
      `;
    }

    // Persist planning window state
    await sql`
      INSERT INTO settings (key, value) VALUES ('dro_planning_window_open', ${String(planningWindowOpen)})
      ON CONFLICT (key) DO UPDATE SET value = ${String(planningWindowOpen)}
    `;

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

    return { success: true, sortDate, routes: routes.length, stops: waypoints.length, unroutable: unroutableWaypoints.length, anchorAreas: anchorAreas.length, stopsWithCoords: agsFeatures.length, routePlans: (allRoutePlans ?? []).length, stopOverrides: (stopOverridesRaw ?? []).length, planningWindowOpen };

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg === "SESSION_EXPIRED") {
      return { success: false, sortDate: "", routes: 0, stops: 0, error: "DRO session expired. Go to Auto DRO → click Connect to DRO first, then sync again." };
    }
    return { success: false, sortDate: "", routes: 0, stops: 0, error: msg };
  }
}
