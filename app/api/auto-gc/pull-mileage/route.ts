import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
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

async function gcFetch(cookieHdr: string, path: string): Promise<any> {
  const res = await fetch(`${GC_BASE}${path}`, {
    headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`GC API ${path} returned ${res.status}`);
  return res.json();
}

async function gcLogin(username: string, password: string): Promise<string> {
  const getRes = await fetch(`${GC_BASE}/api/auth/login/`, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  const getCookies = getRes.headers.getSetCookie
    ? getRes.headers.getSetCookie()
    : [(getRes.headers.get("set-cookie") ?? "")];
  const csrf1 = parseCookieValue(getCookies, "csrftoken");

  const loginRes = await fetch(`${GC_BASE}/api/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${GC_BASE}/api/auth/login/`,
      Cookie: csrf1 ? `csrftoken=${csrf1}` : "",
      "X-CSRFToken": csrf1 ?? "",
    },
    body: new URLSearchParams({ username, password, csrfmiddlewaretoken: csrf1 ?? "" }).toString(),
    redirect: "manual",
  });
  const loginCookies = loginRes.headers.getSetCookie
    ? loginRes.headers.getSetCookie()
    : [(loginRes.headers.get("set-cookie") ?? "")];
  const sid = parseCookieValue(loginCookies, "sessionid");
  const csrf2 = parseCookieValue(loginCookies, "csrftoken") ?? csrf1 ?? "";
  if (!sid) throw new Error(`GC login failed (HTTP ${loginRes.status}). Check credentials.`);
  return `sessionid=${sid}; csrftoken=${csrf2}`;
}

/** Paginate through /api/vehicles/ with odometer flag — returns all vehicles */
async function fetchAllVehicles(cookieHdr: string): Promise<any[]> {
  const results: any[] = [];
  let path: string | null =
    `/api/vehicles/?customer=${CUSTOMER}&with_last_vehicle_maintenance_odometer=true&page_size=100`;
  while (path) {
    const page = await gcFetch(cookieHdr, path);
    results.push(...(page.results ?? []));
    if (page.next) {
      const nextUrl = new URL(page.next);
      path = nextUrl.pathname + nextUrl.search;
    } else {
      path = null;
    }
  }
  return results;
}

/**
 * For a specific date: fetch the closest odometer reading on or before that date
 * for a given GC vehicle ID (used for MMR month-specific pulls).
 */
async function fetchOdometerAtDate(
  cookieHdr: string,
  gcVehicleId: number,
  date: string
): Promise<number | null> {
  const data = await gcFetch(
    cookieHdr,
    `/api/vehicle-maintenances/?vehicle=${gcVehicleId}&record_type=odometer&ordering=-date&date__lte=${date}&page_size=1`
  );
  return data.results?.[0]?.odometer ?? null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // date: if provided, fetch odometer closest to that date; otherwise use latest from vehicles list
  const date: string | null = body.date ?? null;

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
  const orgId: number = (orgRows as any[])[0]?.id;
  if (!orgId) return NextResponse.json({ error: "No organization found." }, { status: 500 });

  const credsRows = await sql`
    SELECT key, value FROM settings
    WHERE organization_id = ${orgId} AND key IN ('gc_username', 'gc_password')
  `;
  const credsMap = Object.fromEntries((credsRows as any[]).map((r: any) => [r.key, r.value]));
  const username = credsMap["gc_username"] || process.env.GC_USERNAME;
  const password = credsMap["gc_password"] || process.env.GC_PASSWORD;
  if (!username || !password) {
    return NextResponse.json(
      { error: "GroundCloud credentials not configured. Set them in Auto GC settings." },
      { status: 400 }
    );
  }

  try {
    const cookieHdr = await gcLogin(username, password);
    const gcVehicles = await fetchAllVehicles(cookieHdr);

    // Load our vehicles for matching by unit_number
    const vehicleRows = await sql`
      SELECT id, unit_number FROM vehicles
      WHERE organization_id = ${orgId} AND active = true
    `;
    const vehicleByUnit = new Map<string, number>();
    for (const v of vehicleRows as any[]) {
      vehicleByUnit.set((v.unit_number as string).toLowerCase().trim(), v.id as number);
    }

    type ResultRow = {
      gcVehicleId: number;
      gcName: string;
      unitNumber: string | null;
      odometer: number | null;
      status: "matched" | "unmatched";
      isAnomaly: boolean;
      anomalyReason: string | null;
    };

    const results: ResultRow[] = [];
    let vehiclesMatched = 0;
    let anomaliesCount = 0;
    const effectiveDate = date ?? new Date().toISOString().slice(0, 10);

    for (const gcV of gcVehicles) {
      const gcVehicleId: number = gcV.id;
      const gcName: string = gcV.name ?? String(gcVehicleId);

      // Get odometer: date-specific query if date param provided, else latest from vehicles list
      let odometer: number | null = null;

      if (date) {
        odometer = await fetchOdometerAtDate(cookieHdr, gcVehicleId, date);
      } else {
        odometer = gcV.last_vehicle_maintenance_odometer ?? null;
      }

      if (odometer === null) continue;

      const matchKey = gcName.toLowerCase().trim();
      const vehicleId = vehicleByUnit.get(matchKey) ?? null;
      const unitNumber = vehicleId
        ? (vehicleRows as any[]).find((v: any) => v.id === vehicleId)?.unit_number ?? null
        : null;
      if (vehicleId) vehiclesMatched++;

      // Anomaly detection
      let isAnomaly = false;
      let anomalyReason: string | null = null;

      if (vehicleId !== null) {
        const historyRows = await sql`
          SELECT odometer, date FROM gc_vehicle_mileage
          WHERE organization_id = ${orgId}
            AND vehicle_id = ${vehicleId}
            AND date < ${effectiveDate}
            AND odometer IS NOT NULL
          ORDER BY date DESC
          LIMIT 30
        `;
        const history = historyRows as any[];

        if (history.length > 0) {
          const prevOdometer = history[0].odometer as number;

          if (odometer < prevOdometer) {
            isAnomaly = true;
            anomalyReason = `Odometer went backward: ${odometer} < previous ${prevOdometer}`;
          } else if (history.length >= 2) {
            let totalInc = 0;
            let incCount = 0;
            for (let i = 0; i < history.length - 1; i++) {
              const inc = (history[i].odometer as number) - (history[i + 1].odometer as number);
              if (inc > 0) { totalInc += inc; incCount++; }
            }
            const avgInc = incCount > 0 ? totalInc / incCount : 0;
            const todayInc = odometer - prevOdometer;

            if (avgInc > 0 && todayInc > avgInc * 4) {
              isAnomaly = true;
              anomalyReason = `Unusually large jump: +${todayInc} miles (avg daily: ${avgInc.toFixed(0)})`;
            } else if (avgInc > 50 && todayInc < avgInc * 0.05) {
              isAnomaly = true;
              anomalyReason = `Suspiciously low increment: +${todayInc} miles (avg daily: ${avgInc.toFixed(0)})`;
            }
          }
        }
      }

      if (isAnomaly) anomaliesCount++;

      // Upsert into gc_vehicle_mileage
      await sql`
        INSERT INTO gc_vehicle_mileage
          (organization_id, date, gc_vehicle_id, vehicle_name, vehicle_id, unit_number,
           odometer, is_anomaly, anomaly_reason)
        VALUES (
          ${orgId}, ${effectiveDate}, ${gcVehicleId}, ${gcName}, ${vehicleId}, ${unitNumber},
          ${Math.round(odometer)}, ${isAnomaly}, ${anomalyReason}
        )
        ON CONFLICT (organization_id, date, vehicle_name) DO UPDATE SET
          gc_vehicle_id  = EXCLUDED.gc_vehicle_id,
          vehicle_id     = EXCLUDED.vehicle_id,
          unit_number    = EXCLUDED.unit_number,
          odometer       = EXCLUDED.odometer,
          is_anomaly     = EXCLUDED.is_anomaly,
          anomaly_reason = EXCLUDED.anomaly_reason,
          pulled_at      = NOW()
      `;

      // Update vehicles.mileage with latest odometer (skip anomalies)
      if (vehicleId !== null && !isAnomaly) {
        await sql`
          UPDATE vehicles SET mileage = ${Math.round(odometer)}
          WHERE id = ${vehicleId} AND organization_id = ${orgId}
        `;
      }

      results.push({
        gcVehicleId,
        gcName,
        unitNumber,
        odometer: Math.round(odometer),
        status: vehicleId ? "matched" : "unmatched",
        isAnomaly,
        anomalyReason,
      });
    }

    // Save last-pulled timestamp
    await sql`
      INSERT INTO settings (organization_id, key, value)
      VALUES (${orgId}, 'gc_mileage_last_pulled', NOW()::text)
      ON CONFLICT (organization_id, key) DO UPDATE SET value = NOW()::text
    `;

    revalidatePath("/dashboard/mmr");
    revalidatePath("/dashboard/auto-gc");

    return NextResponse.json({
      success: true,
      date: effectiveDate,
      vehiclesFound: results.length,
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
