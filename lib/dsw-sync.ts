/**
 * Auto DSW sync engine.
 * Logs into mybizaccount.fedex.com via PurpleID Okta (same creds as DRO),
 * navigates to Daily Service Worksheet, sets date, scrapes driver metrics.
 *
 * Driver-level metrics only. NO customer PII.
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.tar";
import { neon } from "@neondatabase/serverless";

const MYBIZ_BASE = "https://mybizaccount.fedex.com";

export type DswSyncResult = {
  success: boolean;
  date: string;
  rows: number;
  matched: number;
  error?: string;
};

// Parse "LASTNAME,FIRSTNAME MIDDLE" → normalized full name for matching
function parseDriverName(raw: string): { display: string; normalized: string } {
  if (!raw) return { display: "", normalized: "" };
  const [last, ...rest] = raw.split(",");
  const first = rest.join(" ").trim();
  const display = first ? `${first} ${last}`.trim() : last.trim();
  return {
    display: display
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" "),
    normalized: display.toLowerCase().trim().replace(/\s+/g, " "),
  };
}

function parseIls(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace("%", ""));
  return isNaN(n) ? null : n;
}

function parseInt2(s: string): number | null {
  if (!s || s.trim() === "") return null;
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : n;
}

export async function syncDsw(dateOverride?: string): Promise<DswSyncResult> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // DSW uses same credentials as DRO
  const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_username', 'dro_password')`;
  const credsMap  = Object.fromEntries((credsRows as any[]).map((r) => [r.key, r.value]));
  const username  = credsMap["dro_username"] || process.env.DRO_USERNAME;
  const password  = credsMap["dro_password"] || process.env.DRO_PASSWORD;

  if (!username || !password) {
    return { success: false, date: "", rows: 0, matched: 0, error: "DRO credentials not configured." };
  }

  // Target date: yesterday by default, in M/D/YYYY format for DSW
  const targetDateObj = dateOverride
    ? new Date(dateOverride + "T12:00:00")
    : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
  const targetDateIso  = targetDateObj.toISOString().slice(0, 10);
  const targetDateDsw  = `${targetDateObj.getMonth() + 1}/${targetDateObj.getDate()}/${targetDateObj.getFullYear()}`;

  let browser: any;
  try {
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: true,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-features=WebBluetooth,WebUSB"],
    });

    const page = await browser.newPage();
    page.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });

    // ── Login ────────────────────────────────────────────────────────────────
    await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));

    const signIn = await page.$('input[value="Sign In"]') || await page.$('input[type="submit"]');
    if (signIn) await (signIn as any).click();
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    try {
      await page.waitForSelector('button::-p-text(Cancel)', { timeout: 3000 });
      await page.click('button::-p-text(Cancel)');
      await new Promise(r => setTimeout(r, 1000));
    } catch {}

    await page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    const uf = await page.$('input[name="identifier"]') || await page.$('input[type="text"]');
    if (uf) { await (uf as any).click({ clickCount: 3 }); await (uf as any).type(username, { delay: 40 }); }
    const nb = await page.$('input[type="submit"], button[type="submit"]');
    if (nb) await (nb as any).click(); else await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    const pf = await page.$('input[type="password"]');
    if (pf) { await (pf as any).click({ clickCount: 3 }); await (pf as any).type(password, { delay: 40 }); }
    const pb = await page.$('input[type="submit"], button[type="submit"]');
    if (pb) await (pb as any).click(); else await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));

    // ── Click "Daily Service Wk" from FCC Links iframe ───────────────────────
    const pagesBefore = (browser.targets() as any[]).filter((t: any) => t.type() === "page").length;

    const frames = page.frames();
    let clicked = false;
    for (const frame of frames) {
      try {
        const el = await frame.$('a::-p-text(Daily Service Wk)') || await frame.$('a::-p-text(Daily Service)');
        if (el) { await (el as any).click(); clicked = true; break; }
      } catch {}
    }
    if (!clicked) throw new Error("Could not find Daily Service link");

    // Wait for DSW tab
    await new Promise(r => setTimeout(r, 6000));
    const allTargets = (browser.targets() as any[]).filter((t: any) => t.type() === "page");
    const pagesAfter = allTargets.length;

    let dswPage: any = page;
    if (pagesAfter > pagesBefore) {
      const allPages = await Promise.all(allTargets.map((t: any) => t.page()));
      const validPages = allPages.filter(Boolean);
      dswPage = validPages[validPages.length - 1];
      dswPage.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });
      await new Promise(r => setTimeout(r, 4000));
    }

    // ── Set date and search ──────────────────────────────────────────────────
    await dswPage.evaluate((date: string) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
      for (const inp of inputs.slice(0, 2)) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (setter) { setter.call(inp, date); }
        else { inp.value = date; }
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, targetDateDsw);

    // Click Search
    const searchClicked = await dswPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b: any) => b.textContent?.trim() === "Search");
      if (btn) { (btn as any).click(); return true; }
      return false;
    });
    if (!searchClicked) throw new Error("Could not find Search button");

    await new Promise(r => setTimeout(r, 8000));

    // ── Scrape table ─────────────────────────────────────────────────────────
    const tableRows: string[][] = await dswPage.evaluate(() => {
      const result: string[][] = [];
      const trs = Array.from(document.querySelectorAll("tr"));
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll("td"))
          .map(td => (td as any).textContent?.trim().replace(/\s+/g, " ") || "");
        if (cells.length > 10) result.push(cells);
      }
      return result;
    });

    await browser.close();
    browser = undefined;

    if (tableRows.length === 0) {
      return { success: true, date: targetDateIso, rows: 0, matched: 0 };
    }

    // ── Match and upsert ─────────────────────────────────────────────────────
    const wbDrivers = await sql`SELECT driver_id, name FROM drivers WHERE active = true`;
    const wbByName: Record<string, string> = {};
    for (const d of wbDrivers as any[]) {
      wbByName[d.name.toLowerCase().trim().replace(/\s+/g, " ")] = d.driver_id;
    }

    let matched = 0;
    let inserted = 0;

    // Delete today's existing data for this date first
    await sql`DELETE FROM dsw_route_days WHERE date = ${targetDateIso}`;

    for (const row of tableRows) {
      const driverRaw = row[4] || "";
      const waName    = row[2] || "";
      const waNumber  = row[5] || "";

      if (!driverRaw && !waName) continue;

      const { normalized } = parseDriverName(driverRaw);

      // Try exact match, then first+last without middle
      let driverId: string | null = wbByName[normalized] ?? null;
      if (!driverId && normalized) {
        const parts = normalized.split(" ");
        if (parts.length > 2) {
          // Try first + last only
          const firstLast = `${parts[0]} ${parts[parts.length - 1]}`;
          driverId = wbByName[firstLast] ?? null;
        }
        if (!driverId) {
          // Try first name prefix match
          const firstName = parts[0];
          const hit = Object.entries(wbByName).find(([k]) => k.startsWith(firstName + " "));
          if (hit) driverId = hit[1];
        }
      }

      if (driverId) matched++;

      await sql`
        INSERT INTO dsw_route_days
          (date, driver_id, driver_name_raw, wa_name, wa_number,
           ils_pct, act_del_stps, act_del_pkgs, non_delvd_stps,
           all_status_code_pkgs, miles, on_road_hours, on_duty_hours,
           vscan_pkgs, del_stps_planned)
        VALUES (
          ${targetDateIso},
          ${driverId},
          ${driverRaw},
          ${waName},
          ${waNumber},
          ${parseIls(row[15])},
          ${parseInt2(row[11])},
          ${parseInt2(row[12])},
          ${parseInt2(row[17])},
          ${parseInt2(row[19])},
          ${parseInt2(row[26])},
          ${row[27] || null},
          ${row[28] || null},
          ${parseInt2(row[7])},
          ${parseInt2(row[8])}
        )
      `;
      inserted++;
    }

    await sql`INSERT INTO settings (key, value) VALUES ('dsw_last_synced_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text`;

    return { success: true, date: targetDateIso, rows: inserted, matched };

  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, date: "", rows: 0, matched: 0, error: err?.message ?? String(err) };
  }
}
