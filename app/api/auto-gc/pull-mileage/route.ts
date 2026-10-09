// ── GC VEHICLE MILEAGE FIELD MAPPING ──────────────────────────────────────────
// Run GET /api/auto-gc/debug-route-day to inspect the raw GC response and
// confirm these field names. Update the extractMileage() function below.

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import https from "https";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

const GC_BASE = "https://www.groundcloud.io";
const CUSTOMER = 6711;

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

function extractMileage(detail: any): { vehicleName: string | null; endMileage: number | null; startMileage: number | null } {
  const vehicleName =
    detail.vehicle?.unit_number ??
    detail.vehicle?.name ??
    detail.vehicle?.label ??
    detail.vehicle_unit ??
    null;
  const endMileage =
    parseFloat(detail.end_mileage) ||
    parseFloat(detail.vehicle_end_mileage) ||
    parseFloat(detail.ending_mileage) ||
    parseFloat(detail.mileage_end) ||
    null;
  const startMileage =
    parseFloat(detail.start_mileage) ||
    parseFloat(detail.vehicle_start_mileage) ||
    parseFloat(detail.starting_mileage) ||
    parseFloat(detail.mileage_start) ||
    null;
  return { vehicleName, endMileage, startMileage };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date: string = body.date ?? new Date().toISOString().slice(0, 10);

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Resolve orgId
  const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
  const orgId: number = (orgRows as any[])[0]?.id;
  if (!orgId) {
    return NextResponse.json({ error: "No organization found." }, { status: 500 });
  }

  // Read credentials
  const credsRows = await sql`SELECT key, value FROM settings WHERE organization_id = ${orgId} AND key IN ('gc_username', 'gc_password')`;
  const credsMap = Object.fromEntries((credsRows as any[]).map((r: any) => [r.key, r.value]));
  const username = credsMap["gc_username"] || process.env.GC_USERNAME;
  const password = credsMap["gc_password"] || process.env.GC_PASSWORD;

  if (!username || !password) {
    return NextResponse.json({ error: "GroundCloud credentials not configured. Set them in Auto GC settings." }, { status: 400 });
  }

  try {
    // ── Login via DRF session endpoint ────────────────────────────────────────
    // Step 1: GET /api/auth/login/ to obtain csrftoken cookie
    const loginPageRes = await fetch(`${GC_BASE}/api/auth/login/`, {
      headers: { "Accept": "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!loginPageRes.ok) {
      throw new Error(`GroundCloud login page returned ${loginPageRes.status}`);
    }

    const setCookieHeaders = loginPageRes.headers.getSetCookie
      ? loginPageRes.headers.getSetCookie()
      : [(loginPageRes.headers.get("set-cookie") ?? "")];

    const csrfFromGet = parseCookieValue(setCookieHeaders, "csrftoken");

    // Step 2: POST credentials
    const formBody = new URLSearchParams({
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
      body: formBody.toString(),
      redirect: "manual",
    });

    const loginCookieHeaders = loginRes.headers.getSetCookie
      ? loginRes.headers.getSetCookie()
      : [(loginRes.headers.get("set-cookie") ?? "")];

    const sidValue = parseCookieValue(loginCookieHeaders, "sessionid");
    const csrfValue = parseCookieValue(loginCookieHeaders, "csrftoken") ?? csrfFromGet ?? "";

    if (!sidValue) {
      const redirectTo = loginRes.headers.get("location") ?? "(no redirect)";
      throw new Error(
        `GroundCloud login failed · no session ID cookie (HTTP ${loginRes.status}, location: ${redirectTo}). ` +
        `Check that your GroundCloud credentials are correct.`
      );
    }

    const cookieHdr = `sessionid=${sidValue}; csrftoken=${csrfValue}`;

    // ── Fetch route-day list ──────────────────────────────────────────────────
    const rdResp = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${date}`);
    const routeDays: any[] = rdResp.results || [];

    if (routeDays.length === 0) {
      return NextResponse.json({
        success: true,
        date,
        vehiclesFound: 0,
        vehiclesMatched: 0,
        anomalies: 0,
        results: [],
        message: "No route-days found for this date in GroundCloud.",
      });
    }

    // ── Fetch full detail for each route-day ─────────────────────────────────
    const details: any[] = [];
    for (const rd of routeDays) {
      const detail = await apiGet(cookieHdr, `/api/route-days/${rd.id}/`);
      if (!detail._raw && !detail._err) details.push(detail);
    }

    // ── Extract mileage data ─────────────────────────────────────────────────
    type MileageEntry = {
      gcRouteDayId: number;
      vehicleName: string;
      startMileage: number | null;
      endMileage: number | null;
    };

    const entries: MileageEntry[] = [];
    for (const detail of details) {
      const { vehicleName, endMileage, startMileage } = extractMileage(detail);
      if (vehicleName && (endMileage !== null || startMileage !== null)) {
        entries.push({ gcRouteDayId: detail.id, vehicleName, startMileage, endMileage });
      }
    }

    if (entries.length === 0) {
      return NextResponse.json({
        success: false,
        date,
        vehiclesFound: 0,
        vehiclesMatched: 0,
        anomalies: 0,
        results: [],
        message:
          "No mileage data found in GC response. Run /api/auto-gc/debug-route-day to inspect the raw fields.",
      });
    }

    // ── Load vehicles for this org (for matching) ────────────────────────────
    const vehicleRows = await sql`
      SELECT id, unit_number FROM vehicles
      WHERE organization_id = ${orgId} AND active = true
    `;
    const vehicleByUnit = new Map<string, number>();
    for (const v of vehicleRows as any[]) {
      vehicleByUnit.set((v.unit_number as string).toLowerCase().trim(), v.id as number);
    }

    // ── Process each entry: anomaly detection + upsert ───────────────────────
    type ResultRow = {
      vehicleName: string;
      unitNumber: string | null;
      startMileage: number | null;
      endMileage: number | null;
      status: "matched" | "unmatched";
      isAnomaly: boolean;
      anomalyReason: string | null;
    };

    const results: ResultRow[] = [];
    let vehiclesMatched = 0;
    let anomaliesCount = 0;

    for (const entry of entries) {
      const matchKey = entry.vehicleName.toLowerCase().trim();
      const vehicleId = vehicleByUnit.get(matchKey) ?? null;
      const unitNumber = vehicleId
        ? (vehicleRows as any[]).find((v: any) => v.id === vehicleId)?.unit_number ?? null
        : null;

      if (vehicleId) vehiclesMatched++;

      // ── Anomaly detection ─────────────────────────────────────────────────
      let isAnomaly = false;
      let anomalyReason: string | null = null;

      if (entry.endMileage !== null && vehicleId !== null) {
        // Query last 30 days of records for this vehicle
        const historyRows = await sql`
          SELECT end_mileage, start_mileage, date FROM gc_vehicle_mileage
          WHERE organization_id = ${orgId}
            AND vehicle_id = ${vehicleId}
            AND date < ${date}
            AND end_mileage IS NOT NULL
          ORDER BY date DESC
          LIMIT 30
        `;
        const history = historyRows as any[];

        if (history.length > 0) {
          const mostRecentEnd = history[0].end_mileage as number;

          // Rule 1: odometer went backward
          if (entry.endMileage < mostRecentEnd) {
            isAnomaly = true;
            anomalyReason = `Odometer went backward: ${entry.endMileage} < previous ${mostRecentEnd}`;
          }

          // Calculate average daily increment for rules 2 & 3
          if (!isAnomaly && history.length >= 2) {
            let totalIncrement = 0;
            let incrementCount = 0;
            for (let i = 0; i < history.length - 1; i++) {
              const inc = (history[i].end_mileage as number) - (history[i + 1].end_mileage as number);
              if (inc > 0) { totalIncrement += inc; incrementCount++; }
            }
            const avgIncrement = incrementCount > 0 ? totalIncrement / incrementCount : 0;
            const todayIncrement = entry.endMileage - mostRecentEnd;

            // Rule 2: huge jump (> 4x average)
            if (avgIncrement > 0 && todayIncrement > avgIncrement * 4) {
              isAnomaly = true;
              anomalyReason = `Unusually large jump: +${todayIncrement.toFixed(0)} miles (avg daily: ${avgIncrement.toFixed(0)})`;
            }

            // Rule 3: suspiciously low if normally active
            if (!isAnomaly && avgIncrement > 50 && todayIncrement < avgIncrement * 0.05) {
              isAnomaly = true;
              anomalyReason = `Suspiciously low increment: +${todayIncrement.toFixed(0)} miles (avg daily: ${avgIncrement.toFixed(0)})`;
            }
          }
        }
      }

      if (isAnomaly) anomaliesCount++;

      // ── Upsert into gc_vehicle_mileage ────────────────────────────────────
      await sql`
        INSERT INTO gc_vehicle_mileage
          (organization_id, date, gc_route_day_id, vehicle_name, vehicle_id, unit_number,
           start_mileage, end_mileage, is_anomaly, anomaly_reason)
        VALUES (
          ${orgId},
          ${date},
          ${entry.gcRouteDayId},
          ${entry.vehicleName},
          ${vehicleId},
          ${unitNumber},
          ${entry.startMileage !== null ? Math.round(entry.startMileage) : null},
          ${entry.endMileage !== null ? Math.round(entry.endMileage) : null},
          ${isAnomaly},
          ${anomalyReason}
        )
        ON CONFLICT (organization_id, date, vehicle_name) DO UPDATE SET
          gc_route_day_id = EXCLUDED.gc_route_day_id,
          vehicle_id      = EXCLUDED.vehicle_id,
          unit_number     = EXCLUDED.unit_number,
          start_mileage   = EXCLUDED.start_mileage,
          end_mileage     = EXCLUDED.end_mileage,
          is_anomaly      = EXCLUDED.is_anomaly,
          anomaly_reason  = EXCLUDED.anomaly_reason,
          pulled_at       = NOW()
      `;

      // ── Update vehicles.mileage with end mileage ─────────────────────────
      if (vehicleId !== null && entry.endMileage !== null && !isAnomaly) {
        await sql`
          UPDATE vehicles SET mileage = ${Math.round(entry.endMileage)}
          WHERE id = ${vehicleId} AND organization_id = ${orgId}
        `;
      }

      results.push({
        vehicleName: entry.vehicleName,
        unitNumber,
        startMileage: entry.startMileage !== null ? Math.round(entry.startMileage) : null,
        endMileage: entry.endMileage !== null ? Math.round(entry.endMileage) : null,
        status: vehicleId ? "matched" : "unmatched",
        isAnomaly,
        anomalyReason,
      });
    }

    // ── Save last-pulled timestamp ────────────────────────────────────────────
    await sql`
      INSERT INTO settings (organization_id, key, value)
      VALUES (${orgId}, 'gc_mileage_last_pulled', NOW()::text)
      ON CONFLICT (organization_id, key) DO UPDATE SET value = NOW()::text
    `;

    revalidatePath("/dashboard/mmr");

    return NextResponse.json({
      success: true,
      date,
      vehiclesFound: entries.length,
      vehiclesMatched,
      anomalies: anomaliesCount,
      results,
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
