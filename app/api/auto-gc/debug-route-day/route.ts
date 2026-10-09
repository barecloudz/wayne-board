/**
 * Temporary debug endpoint — returns the raw GroundCloud route-day detail
 * for the most recent sync'd day so we can see what vehicle/mileage fields exist.
 * DELETE this file once we've confirmed the fields we need.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import https from "https";
import { neon } from "@neondatabase/serverless";

const GC_BASE = "https://www.groundcloud.io";
const CUSTOMER = 6711;

function parseCookieValue(headers: string[], name: string): string | null {
  for (const h of headers) {
    const match = h.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function apiGet(cookieHdr: string, path: string): Promise<unknown> {
  return new Promise((resolve) => {
    const opts = {
      host: "www.groundcloud.io",
      path,
      headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" },
    };
    https.get(opts as unknown as Parameters<typeof https.get>[0], (res) => {
      let data = "";
      res.on("data", (c: Buffer) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data.slice(0, 2000) }); }
      });
    }).on("error", (e: Error) => resolve({ _err: e.message }));
  });
}

export async function GET() {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
  const orgId = (orgRows as { id: number }[])[0]?.id;
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 500 });

  const credsRows = await sql`
    SELECT key, value FROM settings
    WHERE organization_id = ${orgId} AND key IN ('gc_username', 'gc_password')
  `;
  const credsMap = Object.fromEntries(
    (credsRows as { key: string; value: string }[]).map(r => [r.key, r.value])
  );
  const username = credsMap["gc_username"] || process.env.GC_USERNAME;
  const password = credsMap["gc_password"] || process.env.GC_PASSWORD;

  if (!username || !password) {
    return NextResponse.json({ error: "GC credentials not configured" }, { status: 400 });
  }

  // Login
  const loginPageRes = await fetch(`${GC_BASE}/api/auth/login/`, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  const setCookieHeaders = loginPageRes.headers.getSetCookie
    ? loginPageRes.headers.getSetCookie()
    : [(loginPageRes.headers.get("set-cookie") ?? "")];
  const csrfFromGet = parseCookieValue(setCookieHeaders, "csrftoken");

  const loginBody = new URLSearchParams({
    username, password, csrfmiddlewaretoken: csrfFromGet ?? "",
  });
  const loginRes = await fetch(`${GC_BASE}/api/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${GC_BASE}/api/auth/login/`,
      Cookie: csrfFromGet ? `csrftoken=${csrfFromGet}` : "",
      "X-CSRFToken": csrfFromGet ?? "",
    },
    body: loginBody.toString(),
    redirect: "manual",
  });

  const loginCookies = loginRes.headers.getSetCookie
    ? loginRes.headers.getSetCookie()
    : [(loginRes.headers.get("set-cookie") ?? "")];
  const sid = parseCookieValue(loginCookies, "sessionid");
  const csrf = parseCookieValue(loginCookies, "csrftoken") ?? csrfFromGet ?? "";

  if (!sid) {
    return NextResponse.json(
      { error: `GC login failed (HTTP ${loginRes.status})` },
      { status: 500 }
    );
  }

  const cookieHdr = `sessionid=${sid}; csrftoken=${csrf}`;

  // Find most recent date we have synced data for
  const recentRow = await sql`
    SELECT date FROM gc_route_days
    WHERE organization_id = ${orgId}
    ORDER BY date DESC LIMIT 1
  `;
  const targetDate = (recentRow as { date: string }[])[0]?.date;
  if (!targetDate) {
    return NextResponse.json({
      error: "No synced route days found. Run a sync first from Auto GC.",
    });
  }

  // Fetch route-day list for that date
  const listResp = await apiGet(
    cookieHdr,
    `/api/route-days/?customer=${CUSTOMER}&day=${targetDate}`
  ) as { results?: { id: number }[] };
  const routeDays = listResp.results ?? [];

  if (routeDays.length === 0) {
    return NextResponse.json({ error: `No GC route days found for ${targetDate}` });
  }

  // Fetch full detail for first route-day — this is what we want to inspect
  const firstId = routeDays[0].id;
  const detail = await apiGet(cookieHdr, `/api/route-days/${firstId}/`);

  return NextResponse.json({
    _note: "Raw GroundCloud route-day detail. Look for vehicle/odometer/mileage fields.",
    date: targetDate,
    gcRouteDayId: firstId,
    totalRouteDaysThisDate: routeDays.length,
    detail,
  });
}
