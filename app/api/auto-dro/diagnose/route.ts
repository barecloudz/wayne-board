export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = process.env.DRO_SERVICE_AREA_ID || "3060743";
const STATION_ID = process.env.DRO_STATION_ID      || "259";

async function check(label: string, fn: () => Promise<string>): Promise<{ label: string; ok: boolean; detail: string }> {
  try {
    const detail = await fn();
    return { label, ok: true, detail };
  } catch (err: any) {
    return { label, ok: false, detail: err?.message ?? String(err) };
  }
}

export async function GET() {
  const results = [];

  // 1. Database connectivity
  results.push(await check("Database connection", async () => {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const rows = await sql`SELECT 1 AS ok`;
    return `Connected · ${rows.length} row returned`;
  }));

  // 2. DRO credentials in DB or env
  results.push(await check("DRO credentials", async () => {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const rows = await sql`SELECT key FROM settings WHERE key IN ('dro_username','dro_password')`;
    const keys = rows.map((r: any) => r.key);
    const hasDbUser = keys.includes("dro_username");
    const hasDbPass = keys.includes("dro_password");
    const hasEnvUser = !!process.env.DRO_USERNAME;
    const hasEnvPass = !!process.env.DRO_PASSWORD;
    const user = hasDbUser ? "DB" : hasEnvUser ? "env" : null;
    const pass = hasDbPass ? "DB" : hasEnvPass ? "env" : null;
    if (!user || !pass) throw new Error(`Missing: ${!user ? "username" : ""} ${!pass ? "password" : ""}`.trim());
    return `username=${user}, password=${pass}`;
  }));

  // 3. Session cookies exist
  let cookieStr = "";
  let sessionExpiry = "";
  results.push(await check("DRO session cookies", async () => {
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    const rows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_session_cookies','dro_session_expires_at')`;
    const cache = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    cookieStr   = cache["dro_session_cookies"] ?? "";
    sessionExpiry = cache["dro_session_expires_at"] ?? "";
    if (!cookieStr) throw new Error("No session cookies stored · click Connect to DRO first");
    if (!sessionExpiry) throw new Error("Cookies stored but no expiry recorded");
    const exp = new Date(sessionExpiry);
    const isValid = exp > new Date();
    if (!isValid) throw new Error(`Session expired at ${exp.toISOString()} (now ${new Date().toISOString()})`);
    return `Valid until ${exp.toISOString()} · ${Math.round((exp.getTime() - Date.now()) / 60000)} min remaining`;
  }));

  // 4. DRO API reachable (unauthenticated ping)
  results.push(await check("DRO API reachable", async () => {
    const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, {
      signal: AbortSignal.timeout(8000),
      headers: cookieStr ? { Cookie: cookieStr, "Content-Type": "application/json" } : {},
    });
    if (res.status === 401 || res.status === 403) throw new Error(`Auth error ${res.status} · session may be invalid`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    const planId = json?.planId;
    return `HTTP 200 · planId=${planId ?? "null"}`;
  }));

  // 5. Sort date endpoint
  results.push(await check("DRO sort date", async () => {
    if (!cookieStr) throw new Error("Skipped · no session cookies");
    const res = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, {
      signal: AbortSignal.timeout(8000),
      headers: { Cookie: cookieStr, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim().replace(/^"|"$/g, "");
    return `sortDate = ${text}`;
  }));

  // 6. Waypoints endpoint (just count)
  results.push(await check("DRO waypoints", async () => {
    if (!cookieStr) throw new Error("Skipped · no session cookies");
    const planRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, {
      headers: { Cookie: cookieStr, "Content-Type": "application/json" },
    });
    const plan = await planRes.json().catch(() => ({})) as any;
    const planId = plan?.planId;
    if (!planId) throw new Error("Could not get planId");
    const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${planId}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Cookie: cookieStr, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    const count = Array.isArray(data) ? data.length : "non-array response";
    return `${count} waypoints returned`;
  }));

  // 7. ArcGIS proxy (GPS coordinates source)
  results.push(await check("ArcGIS GPS proxy", async () => {
    if (!cookieStr) throw new Error("Skipped · no session cookies");
    const today = new Date().toISOString().slice(0, 10);
    const where = encodeURIComponent(`sort_date = date'${today}' and station_id = '${STATION_ID}' and csa = '304169'`);
    const inner = `http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query?f=json&outFields=wid,route&where=${where}&returnGeometry=true&outSR=102100&resultRecordCount=1`;
    const url   = `${DRO_BASE}/api/api/Proxy?${inner}`;
    const res   = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Cookie: cookieStr } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    if (json?.error) throw new Error(JSON.stringify(json.error));
    const count = json?.features?.length ?? 0;
    return `${count} feature(s) returned (sample of 1 requested)`;
  }));

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ allOk, checks: results });
}
