/**
 * Auto GC sync engine.
 * Logs into groundcloud.io via the DRF session endpoint (fetch-based),
 * pulls route-day performance data, name-matches drivers to Wayne Board, upserts.
 *
 * Credentials come from DB settings (gc_username, gc_password)
 * or env vars GC_USERNAME, GC_PASSWORD.
 */

import https from "https";
import { neon } from "@neondatabase/serverless";

const GC_BASE = "https://www.groundcloud.io";
const CUSTOMER = 6711;

export type GcSyncResult = {
  success: boolean;
  date: string;
  routeDays: number;
  matched: number;
  error?: string;
};

function parseCookieValue(headers: string[], name: string): string | null {
  for (const h of headers) {
    const match = h.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function apiGet(cookieHdr: string, path: string): Promise<any> {
  return new Promise((resolve) => {
    const opts = {
      host: "www.groundcloud.io",
      path,
      headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" },
    };
    https.get(opts as any, (res: any) => {
      let data = "";
      res.on("data", (c: any) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data.slice(0, 300) }); }
      });
    }).on("error", (e: any) => resolve({ _err: e.message }));
  });
}

export async function syncGc(dateOverride?: string, orgIdOverride?: number): Promise<GcSyncResult> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Resolve orgId · required for gc_route_days unique constraint (organization_id, gc_route_day_id)
  let orgId = orgIdOverride;
  if (!orgId) {
    const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
    orgId = (orgRows as any[])[0]?.id;
  }
  if (!orgId) {
    return { success: false, date: "", routeDays: 0, matched: 0, error: "No organization found." };
  }

  // Read credentials from DB, fall back to env vars
  const credsRows = await sql`SELECT key, value FROM settings WHERE organization_id = ${orgId} AND key IN ('gc_username', 'gc_password')`;
  const credsMap  = Object.fromEntries((credsRows as any[]).map((r) => [r.key, r.value]));
  const username  = credsMap["gc_username"] || process.env.GC_USERNAME;
  const password  = credsMap["gc_password"] || process.env.GC_PASSWORD;

  if (!username || !password) {
    return { success: false, date: "", routeDays: 0, matched: 0, error: "GroundCloud credentials not configured. Set them in Auto GC settings." };
  }

  // Target date: yesterday by default
  const targetDate = dateOverride || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  try {
    // ── Login via DRF session endpoint (fetch-based, no Puppeteer) ────────────
    // Step 1: GET /api/auth/login/ to obtain the csrftoken cookie
    const loginPageRes = await fetch(`${GC_BASE}/api/auth/login/`, {
      headers: { "Accept": "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!loginPageRes.ok) {
      throw new Error(`GroundCloud login page returned ${loginPageRes.status}`);
    }

    // Extract csrftoken from Set-Cookie header
    const setCookieHeaders = loginPageRes.headers.getSetCookie
      ? loginPageRes.headers.getSetCookie()
      : [(loginPageRes.headers.get("set-cookie") ?? "")];

    const csrfFromGet = parseCookieValue(setCookieHeaders, "csrftoken");

    // Step 2: POST credentials to DRF login endpoint
    const body = new URLSearchParams({
      username,
      password,
      csrfmiddlewaretoken: csrfFromGet ?? "",
    });

    const loginRes = await fetch(`${GC_BASE}/api/auth/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": `${GC_BASE}/api/auth/login/`,
        "Cookie": csrfFromGet ? `csrftoken=${csrfFromGet}` : "",
        "X-CSRFToken": csrfFromGet ?? "",
      },
      body: body.toString(),
      redirect: "manual",
    });

    // Collect all Set-Cookie headers from login response
    const loginCookieHeaders = loginRes.headers.getSetCookie
      ? loginRes.headers.getSetCookie()
      : [(loginRes.headers.get("set-cookie") ?? "")];

    const sidValue  = parseCookieValue(loginCookieHeaders, "sessionid");
    const csrfValue = parseCookieValue(loginCookieHeaders, "csrftoken") ?? csrfFromGet ?? "";

    if (!sidValue) {
      // Provide a richer error: include status and redirect location to aid debugging
      const redirectTo = loginRes.headers.get("location") ?? "(no redirect)";
      throw new Error(
        `GroundCloud login failed · no session ID cookie (HTTP ${loginRes.status}, location: ${redirectTo}). ` +
        `Check that your GroundCloud credentials are correct.`
      );
    }

    const cookieHdr = `sessionid=${sidValue}; csrftoken=${csrfValue}`;

    // ── Fetch route-day list ──────────────────────────────────────────────────
    const rdResp   = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${targetDate}`);
    const routeDays: any[] = rdResp.results || [];

    if (routeDays.length === 0) {
      await sql`INSERT INTO settings (organization_id, key, value) VALUES (${orgId}, 'gc_last_synced_at', NOW()::text) ON CONFLICT (organization_id, key) DO UPDATE SET value = NOW()::text`;
      return { success: true, date: targetDate, routeDays: 0, matched: 0 };
    }

    // ── Fetch full detail for each route-day (stops_per_hour lives here) ──────
    const details: any[] = [];
    for (const rd of routeDays) {
      const detail = await apiGet(cookieHdr, `/api/route-days/${rd.id}/`);
      if (!detail._raw && !detail._err) details.push(detail);
    }

    // ── Load Wayne Board drivers for name matching ────────────────────────────
    const wbDrivers = await sql`SELECT driver_id, name FROM drivers WHERE active = true`;

    function normName(n: string) {
      return n.toLowerCase().trim().replace(/\s+/g, " ");
    }

    const wbByName: Record<string, string> = {};
    for (const d of wbDrivers as any[]) {
      wbByName[normName(d.name)] = d.driver_id;
    }

    // Load manual name mappings (gc_name → driver_id overrides)
    const mappingRows = await sql`SELECT gc_name, driver_id FROM gc_name_mappings WHERE organization_id = ${orgId}`;
    const gcMappings: Record<string, string> = {};
    for (const m of mappingRows as any[]) {
      gcMappings[normName(m.gc_name)] = m.driver_id;
    }

    // ── Upsert each route-day ────────────────────────────────────────────────
    let matched = 0;
    for (const detail of details) {
      const gcDriverName = detail.driver?.user
        ? `${detail.driver.user.first_name} ${detail.driver.user.last_name}`.trim()
        : "";

      const norm = normName(gcDriverName);
      // Manual mapping takes priority, then exact name, then first-name fallback
      let driverId: string | null = gcMappings[norm] ?? wbByName[norm] ?? null;

      if (!driverId && norm) {
        const firstName = norm.split(" ")[0];
        const hit = Object.entries(wbByName).find(([k]) => k.startsWith(firstName + " "));
        if (hit) driverId = hit[1];
      }

      if (driverId) matched++;

      const sph   = parseFloat(detail.stops_per_hour) || null;
      const miles = parseFloat(detail.miles_total)    || null;
      const trav  = parseFloat(detail.miles_traveled) || null;
      const dt    = detail.drive_time != null ? Math.round(detail.drive_time) : null;

      // Try to match route to a location via GC terminal ID
      const routeTerminalId = detail.route?.terminal?.id ?? null;
      let routeLocationId: number | null = null;
      if (routeTerminalId) {
        const locRow = await sql`
          SELECT id FROM locations
          WHERE organization_id = ${orgId} AND gc_terminal_id = ${routeTerminalId}
          LIMIT 1
        `;
        routeLocationId = (locRow as any[])[0]?.id ?? null;
      }

      await sql`
        INSERT INTO gc_route_days
          (organization_id, gc_route_day_id, driver_id, driver_name, route_name, date,
           stops_per_hour, miles_total, miles_traveled, drive_time, status, location_id)
        VALUES (
          ${orgId},
          ${detail.id},
          ${driverId},
          ${gcDriverName},
          ${detail.route?.name ?? ""},
          ${targetDate},
          ${sph},
          ${miles},
          ${trav},
          ${dt},
          ${detail.status ?? ""},
          ${routeLocationId}
        )
        ON CONFLICT (organization_id, gc_route_day_id) DO UPDATE SET
          driver_id      = EXCLUDED.driver_id,
          driver_name    = EXCLUDED.driver_name,
          route_name     = EXCLUDED.route_name,
          date           = EXCLUDED.date,
          stops_per_hour = EXCLUDED.stops_per_hour,
          miles_total    = EXCLUDED.miles_total,
          miles_traveled = EXCLUDED.miles_traveled,
          drive_time     = EXCLUDED.drive_time,
          status         = EXCLUDED.status,
          location_id    = EXCLUDED.location_id,
          synced_at      = NOW()
      `;
    }

    await sql`INSERT INTO settings (organization_id, key, value) VALUES (${orgId}, 'gc_last_synced_at', NOW()::text) ON CONFLICT (organization_id, key) DO UPDATE SET value = NOW()::text`;

    return { success: true, date: targetDate, routeDays: details.length, matched };

  } catch (err: any) {
    return { success: false, date: "", routeDays: 0, matched: 0, error: err?.message ?? String(err) };
  }
}
