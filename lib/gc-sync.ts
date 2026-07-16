/**
 * Auto GC sync engine.
 * Logs into groundcloud.io via Puppeteer (Django session), pulls today's
 * route-day performance data, name-matches drivers to Wayne Board, upserts.
 *
 * Credentials come from DB settings (gc_username, gc_password)
 * or env vars GC_USERNAME, GC_PASSWORD.
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import https from "https";
import { neon } from "@neondatabase/serverless";

const GC_BASE = "https://www.groundcloud.io";
const CUSTOMER = 439;

export type GcSyncResult = {
  success: boolean;
  date: string;
  routeDays: number;
  matched: number;
  error?: string;
};

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

export async function syncGc(dateOverride?: string): Promise<GcSyncResult> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Read credentials from DB, fall back to env vars
  const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('gc_username', 'gc_password')`;
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

  let browser: any;
  try {
    // ── Login via Puppeteer (Django form submit) ───────────────────────────────
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      headless: true,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-features=WebBluetooth,WebUSB"],
    });

    const page = await browser.newPage();
    page.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });

    await page.goto(`${GC_BASE}/dashboard/login/`, { waitUntil: "networkidle2" });

    const userInput = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
    const passInput = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
    if (userInput) await (userInput as any).type(username, { delay: 30 });
    if (passInput) await (passInput as any).type(password, { delay: 30 });

    // Submit via form.submit() — button click approach causes waitForNavigation race
    await page.evaluate(() => { (document.querySelector("form") as HTMLFormElement)?.submit(); });
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

    const cookies = await page.cookies();
    await browser.close();
    browser = undefined;

    const sid = (cookies as any[]).find((c) => c.name === "sessionid");
    if (!sid) throw new Error("GroundCloud login failed — no sessionid cookie");

    const csrf     = (cookies as any[]).find((c) => c.name === "csrftoken");
    const cookieHdr = `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;

    // ── Fetch route-day list ──────────────────────────────────────────────────
    const rdResp   = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${targetDate}`);
    const routeDays: any[] = rdResp.results || [];

    if (routeDays.length === 0) {
      await sql`INSERT INTO settings (key, value) VALUES ('gc_last_synced_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text`;
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

    // ── Upsert each route-day ────────────────────────────────────────────────
    let matched = 0;
    for (const detail of details) {
      const gcDriverName = detail.driver?.user
        ? `${detail.driver.user.first_name} ${detail.driver.user.last_name}`.trim()
        : "";

      const norm = normName(gcDriverName);
      let driverId: string | null = wbByName[norm] ?? null;

      // Fallback: first-name match
      if (!driverId && norm) {
        const firstName = norm.split(" ")[0];
        const hit = Object.entries(wbByName).find(([k]) => k.startsWith(firstName + " "));
        if (hit) driverId = hit[1];
      }

      if (driverId) matched++;

      const sph   = parseFloat(detail.stops_per_hour) || null;
      const miles = parseFloat(detail.miles_total)    || null;
      const trav  = parseFloat(detail.miles_traveled) || null;
      const dt    = detail.drive_time ?? null;

      await sql`
        INSERT INTO gc_route_days
          (gc_route_day_id, driver_id, driver_name, route_name, date,
           stops_per_hour, miles_total, miles_traveled, drive_time, status)
        VALUES (
          ${detail.id},
          ${driverId},
          ${gcDriverName},
          ${detail.route?.name ?? ""},
          ${targetDate},
          ${sph},
          ${miles},
          ${trav},
          ${dt},
          ${detail.status ?? ""}
        )
        ON CONFLICT (gc_route_day_id) DO UPDATE SET
          driver_id      = EXCLUDED.driver_id,
          driver_name    = EXCLUDED.driver_name,
          route_name     = EXCLUDED.route_name,
          date           = EXCLUDED.date,
          stops_per_hour = EXCLUDED.stops_per_hour,
          miles_total    = EXCLUDED.miles_total,
          miles_traveled = EXCLUDED.miles_traveled,
          drive_time     = EXCLUDED.drive_time,
          status         = EXCLUDED.status,
          synced_at      = NOW()
      `;
    }

    await sql`INSERT INTO settings (key, value) VALUES ('gc_last_synced_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text`;

    return { success: true, date: targetDate, routeDays: details.length, matched };

  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, date: "", routeDays: 0, matched: 0, error: err?.message ?? String(err) };
  }
}
