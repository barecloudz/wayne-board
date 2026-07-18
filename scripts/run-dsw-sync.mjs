/**
 * Local DSW sync — uses local Chrome, writes to production DB.
 * Run: node scripts/run-dsw-sync.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const MYBIZ_BASE = "https://mybizaccount.fedex.com";
const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// Get creds
const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_username', 'dro_password')`;
const creds = Object.fromEntries(credsRows.map(r => [r.key, r.value]));
const username = creds["dro_username"];
const password = creds["dro_password"];
if (!username || !password) { console.error("No DRO credentials in DB — set them in Auto DRO settings"); process.exit(1); }

// Today
const d = new Date();
const iso = d.toISOString().slice(0, 10);
const dswDate = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
console.log(`Syncing DSW for: ${iso}`);

function parseIls(s) { if (!s) return null; const n = parseFloat(s.replace("%","")); return isNaN(n)?null:n; }
function parseInt2(s) { if (!s||s.trim()==="") return null; const n = parseInt(s.trim(),10); return isNaN(n)?null:n; }
function parseName(raw) {
  if (!raw) return "";
  const [last, ...rest] = raw.split(",");
  const first = rest.join(" ").trim();
  const display = first ? `${first} ${last}`.trim() : last.trim();
  return display.toLowerCase().trim().replace(/\s+/g, " ");
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on("dialog", async dlg => { try { await dlg.dismiss(); } catch {} });

  // ── Navigate to mybiz ────────────────────────────────────────────────────────
  await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  console.log("Landed:", page.url());

  // Click Sign In if present
  const signInBtn = await page.$('input[value="Sign In"]') ?? await page.$('input[type="submit"]');
  if (signInBtn) {
    await signInBtn.click();
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    console.log("After Sign In click:", page.url());
  }

  // Handle any JS alert popups throughout the session
  page.on("dialog", async dlg => { console.log("Dialog:", dlg.message()); try { await dlg.dismiss(); } catch {} });

  // ── Okta login — wait up to 30s for identifier field ────────────────────────
  try {
    await page.waitForSelector('input[name="identifier"]', { timeout: 30000 });
    console.log("Entering username...");
    const uf = await page.$('input[name="identifier"]');
    await uf.click({ clickCount: 3 });
    await uf.type(username, { delay: 40 });
    const nextBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (nextBtn) await nextBtn.click(); else await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 3000));

    console.log("Entering password...");
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    const pf = await page.$('input[type="password"]');
    await pf.click({ clickCount: 3 });
    await pf.type(password, { delay: 40 });
    const pwBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (pwBtn) await pwBtn.click(); else await page.keyboard.press("Enter");

    // Wait for the full SAML redirect chain back to mybizaccount
    console.log("Waiting for redirect back to mybizaccount...");
    await new Promise(r => setTimeout(r, 15000));
  } catch {
    console.log("No login form found — may already be authenticated");
  }
  console.log("✓ Post-auth URL:", page.url());

  // ── Click Daily Service Wk ───────────────────────────────────────────────────
  const pagesBefore = browser.targets().filter(t => t.type() === "page").length;
  const frames = page.frames();
  let clicked = false;
  for (const frame of frames) {
    try {
      const el = await frame.$('a::-p-text(Daily Service Wk)') ?? await frame.$('a::-p-text(Daily Service)');
      if (el) { await el.click(); clicked = true; console.log("✓ Clicked Daily Service link"); break; }
    } catch {}
  }
  if (!clicked) {
    // Try direct link
    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).map(a => ({ text: a.textContent?.trim(), href: a.href }))
    );
    const dswLink = allLinks.find(l => l.text?.includes("Daily Service") || l.href?.includes("dsw") || l.href?.includes("daily"));
    if (dswLink) {
      await page.goto(dswLink.href, { waitUntil: "networkidle2", timeout: 20000 });
      clicked = true;
      console.log("✓ Navigated to DSW via href:", dswLink.href);
    }
  }
  if (!clicked) throw new Error("Could not find Daily Service Worksheet link");

  // Wait for new tab
  await new Promise(r => setTimeout(r, 6000));
  const allTargets = browser.targets().filter(t => t.type() === "page");
  let dswPage = page;
  if (allTargets.length > pagesBefore) {
    const pages = (await Promise.all(allTargets.map(t => t.page()))).filter(Boolean);
    dswPage = pages[pages.length - 1];
    dswPage.on("dialog", async dlg => { try { await dlg.dismiss(); } catch {} });
    await new Promise(r => setTimeout(r, 4000));
  }
  console.log("✓ DSW page:", dswPage.url());

  // ── Set date and search ──────────────────────────────────────────────────────
  await dswPage.evaluate((date) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    for (const inp of inputs.slice(0, 2)) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter ? setter.call(inp, date) : (inp.value = date);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, dswDate);

  const searchOk = await dswPage.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Search");
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!searchOk) throw new Error("Could not find Search button");
  console.log("✓ Search submitted, waiting...");
  await new Promise(r => setTimeout(r, 10000));

  // ── Scrape ───────────────────────────────────────────────────────────────────
  const tableRows = await dswPage.evaluate(() => {
    return Array.from(document.querySelectorAll("tr"))
      .map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent?.trim().replace(/\s+/g, " ") || ""))
      .filter(cells => cells.length > 10);
  });
  console.log(`✓ Scraped ${tableRows.length} rows`);

  if (tableRows.length === 0) { console.log("No data for this date."); process.exit(0); }

  // ── Match and upsert ─────────────────────────────────────────────────────────
  const wbDrivers = await sql`SELECT driver_id, name FROM drivers WHERE active = true`;
  const byName = {};
  for (const dr of wbDrivers) byName[dr.name.toLowerCase().trim().replace(/\s+/g, " ")] = dr.driver_id;

  await sql`DELETE FROM dsw_route_days WHERE date = ${iso}`;

  let inserted = 0, matched = 0;
  for (const row of tableRows) {
    const driverRaw = row[4] || "";
    const waName = row[2] || "";
    const waNumber = row[5] || "";
    if (!driverRaw && !waName) continue;

    const norm = parseName(driverRaw);
    let driverId = byName[norm] ?? null;
    if (!driverId && norm) {
      const parts = norm.split(" ");
      if (parts.length > 2) driverId = byName[`${parts[0]} ${parts[parts.length-1]}`] ?? null;
      if (!driverId) {
        const hit = Object.entries(byName).find(([k]) => k.startsWith(parts[0] + " "));
        if (hit) driverId = hit[1];
      }
    }
    if (driverId) matched++;

    await sql`INSERT INTO dsw_route_days
      (date, driver_id, driver_name_raw, wa_name, wa_number, ils_pct, act_del_stps, act_del_pkgs,
       non_delvd_stps, all_status_code_pkgs, miles, on_road_hours, on_duty_hours, vscan_pkgs, del_stps_planned)
      VALUES (${iso}, ${driverId}, ${driverRaw}, ${waName}, ${waNumber},
        ${parseIls(row[15])}, ${parseInt2(row[11])}, ${parseInt2(row[12])},
        ${parseInt2(row[17])}, ${parseInt2(row[19])}, ${parseInt2(row[26])},
        ${row[27]||null}, ${row[28]||null}, ${parseInt2(row[7])}, ${parseInt2(row[8])})`;
    inserted++;
  }

  await sql`INSERT INTO settings (key,value) VALUES ('dsw_last_synced_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text`;
  console.log(`\n✅ ${inserted} routes saved · ${matched} matched to Wayne Board drivers`);
  console.log("Now refresh /wayne-board to see the scorecard.");

} finally {
  await browser.close();
}
