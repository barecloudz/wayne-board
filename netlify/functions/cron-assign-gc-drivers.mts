/**
 * Netlify scheduled function — runs every morning at 5:30 AM Eastern.
 * Assigns drivers to their routes in GroundCloud based on today's
 * daily_work_area_assignments in Wayne Board.
 *
 * Schedule: 30 9 * * *  (9:30 UTC = 5:30 AM Eastern)
 */

import type { Config } from "@netlify/functions";
import https from "https";
import { neon } from "@neondatabase/serverless";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

export const config: Config = {
  schedule: "30 9 * * *",
};

const BASE     = "https://www.groundcloud.io";
const CUSTOMER = 439;
const CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

function apiGet(cookieHdr: string, path: string): Promise<any> {
  return new Promise((resolve) => {
    const opts = { host: "www.groundcloud.io", path, headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" } };
    (https as any).get(opts, (res: any) => {
      let data = ""; res.on("data", (c: any) => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: { _raw: data.slice(0, 200) } }); } });
    }).on("error", (e: any) => resolve({ status: 0, body: { _err: e.message } }));
  });
}

function apiPatch(cookieHdr: string, path: string, body: any): Promise<any> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const csrf = cookieHdr.match(/csrftoken=([^;]+)/)?.[1] ?? "";
    const opts: any = {
      host: "www.groundcloud.io", path, method: "PATCH",
      headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json", "X-CSRFToken": csrf, "Content-Length": Buffer.byteLength(payload), Referer: "https://www.groundcloud.io/" },
    };
    const req = (https as any).request(opts, (res: any) => {
      let data = ""; res.on("data", (c: any) => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: {} }); } });
    });
    req.on("error", (e: any) => resolve({ status: 0, body: { _err: e.message } }));
    req.write(payload); req.end();
  });
}

export default async function handler() {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[cron-assign-gc-drivers] Running for ${today}`);

  try {
    // Load credentials
    const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('gc_username','gc_password')`;
    const creds = Object.fromEntries((credsRows as any[]).map(r => [r.key, r.value]));
    const username = creds["gc_username"] || "Blake742Logistics";
    const password = creds["gc_password"] || "dowell2026";

    // Load route map and driver map
    const routeMapRows = await sql`SELECT work_area_number, gc_route_id, gc_route_name, dro_name FROM gc_route_map WHERE active = true`;
    const driverRows   = await sql`SELECT driver_id, name, gc_driver_id FROM drivers WHERE active = true AND gc_driver_id IS NOT NULL`;

    // Load today's assignments
    const assignments = await sql`
      SELECT dwa.driver_id, d.name AS driver_name, d.gc_driver_id, wa.name AS work_area_name
      FROM daily_work_area_assignments dwa
      JOIN drivers d ON d.driver_id = dwa.driver_id
      JOIN work_areas wa ON wa.id = dwa.work_area_id
      WHERE dwa.date = ${today}
    `;

    if ((assignments as any[]).length === 0) {
      console.log(`[cron-assign-gc-drivers] No assignments for ${today} — skipping`);
      await sql`INSERT INTO settings (key,value) VALUES ('gc_last_assign_at', NOW()::text || ' (no assignments)') ON CONFLICT (key) DO UPDATE SET value = NOW()::text || ' (no assignments)'`;
      return new Response(JSON.stringify({ success: true, assigned: 0, reason: "no assignments" }), { status: 200 });
    }

    // Login
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: true,
      args: [...chromium.args, "--no-sandbox"],
    });
    const page = await browser.newPage();
    page.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });
    await page.goto(`${BASE}/dashboard/login/`, { waitUntil: "networkidle2" });
    const u = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
    const p = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
    if (u) await (u as any).type(username, { delay: 30 });
    if (p) await (p as any).type(password, { delay: 30 });
    await page.evaluate(() => (document.querySelector("form") as any)?.submit());
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    const cookies = await page.cookies();
    await browser.close();
    const sid = (cookies as any[]).find(c => c.name === "sessionid");
    if (!sid) throw new Error("GC login failed — no sessionid");
    const cookieHdr = `sessionid=${sid.value}; csrftoken=${(cookies as any[]).find(c => c.name === "csrftoken")?.value ?? ""}`;

    // Get today's route-days
    const rdResp = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${today}`);
    const routeDays: any[] = rdResp.body?.results ?? [];
    const rdByRoute: Record<string, any> = Object.fromEntries(routeDays.map(rd => [String(rd.route), rd]));

    let assigned = 0; const skipped: string[] = []; const failed: string[] = [];

    for (const a of assignments as any[]) {
      const { driver_name, gc_driver_id, work_area_name } = a;
      if (!gc_driver_id) { skipped.push(driver_name); continue; }

      const routeRow = (routeMapRows as any[]).find(r =>
        r.dro_name?.toUpperCase() === work_area_name?.toUpperCase() ||
        r.gc_route_name === work_area_name ||
        r.work_area_number === work_area_name
      );
      if (!routeRow) { skipped.push(driver_name); continue; }

      const rd = rdByRoute[String(routeRow.gc_route_id)];
      if (!rd) { skipped.push(driver_name); continue; }

      const patch = await apiPatch(cookieHdr, `/api/route-days/${rd.id}/`, { driver: gc_driver_id });
      if (patch.status >= 200 && patch.status < 300) { assigned++; }
      else { failed.push(driver_name); }

      await new Promise(r => setTimeout(r, 100));
    }

    await sql`INSERT INTO settings (key,value) VALUES ('gc_last_assign_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text`;

    console.log(`[cron-assign-gc-drivers] Done — assigned=${assigned} skipped=${skipped.length} failed=${failed.length}`);
    return new Response(JSON.stringify({ success: true, date: today, assigned, skipped, failed }), { status: 200 });

  } catch (err: any) {
    console.error("[cron-assign-gc-drivers] Error:", err?.message ?? err);
    return new Response(JSON.stringify({ success: false, error: err?.message ?? String(err) }), { status: 500 });
  }
}
