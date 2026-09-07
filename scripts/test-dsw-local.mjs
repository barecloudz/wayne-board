/**
 * Local DSW sync test — runs with headed Chrome so you can watch every step.
 * Dumps raw table rows with column indices so you can verify the field mapping.
 * Does NOT write to the database — diagnostic/dry-run only.
 *
 * Usage:
 *   node scripts/test-dsw-local.mjs              # yesterday
 *   node scripts/test-dsw-local.mjs 2026-09-06   # specific date
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0 && !line.startsWith("#")) {
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

if (!process.env.CHROME_EXECUTABLE_PATH) {
  console.error("CHROME_EXECUTABLE_PATH not set in .env.local");
  process.exit(1);
}

const username = process.env.DRO_USERNAME;
const password = process.env.DRO_PASSWORD;
if (!username || !password) {
  console.error("DRO_USERNAME / DRO_PASSWORD not set in .env.local");
  process.exit(1);
}

// Target date
const dateArg = process.argv[2];
const targetDateObj = dateArg
  ? new Date(dateArg + "T12:00:00")
  : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
const targetDateIso = targetDateObj.toISOString().slice(0, 10);
const targetDateDsw = `${targetDateObj.getMonth() + 1}/${targetDateObj.getDate()}/${targetDateObj.getFullYear()}`;

console.log("=== DSW Local Test ===");
console.log("Chrome:", process.env.CHROME_EXECUTABLE_PATH);
console.log("Username:", username);
console.log("Date:", targetDateIso, `(DSW format: ${targetDateDsw})`);
console.log("");

const MYBIZ_BASE = "https://mybizaccount.fedex.com";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH,
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
});

try {
  const page = await browser.newPage();
  page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

  // ── Login ───────────────────────────────────────────────────────────────────
  console.log("[1] Navigating to MyBiz...");
  await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  const signIn = await page.$('input[value="Sign In"]') || await page.$('input[type="submit"]');
  if (signIn) await signIn.click();
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  try {
    await page.waitForSelector('button::-p-text(Cancel)', { timeout: 3000 });
    await page.click('button::-p-text(Cancel)');
    await new Promise(r => setTimeout(r, 1000));
  } catch {}

  console.log("[2] Entering username...");
  await page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
  const uf = await page.$('input[name="identifier"]') || await page.$('input[type="text"]');
  if (uf) { await uf.click({ clickCount: 3 }); await uf.type(username, { delay: 40 }); }
  const nb = await page.$('input[type="submit"], button[type="submit"]');
  if (nb) await nb.click(); else await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  console.log("[3] Entering password...");
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  const pf = await page.$('input[type="password"]');
  if (pf) { await pf.click({ clickCount: 3 }); await pf.type(password, { delay: 40 }); }
  const pb = await page.$('input[type="submit"], button[type="submit"]');
  if (pb) await pb.click(); else await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));

  // ── Navigate to DSW ─────────────────────────────────────────────────────────
  console.log("[4] Looking for Daily Service Wk link...");
  const pagesBefore = browser.targets().filter(t => t.type() === "page").length;

  const frames = page.frames();
  let clicked = false;
  for (const frame of frames) {
    try {
      const el = await frame.$('a::-p-text(Daily Service Wk)') || await frame.$('a::-p-text(Daily Service)');
      if (el) { await el.click(); clicked = true; break; }
    } catch {}
  }
  if (!clicked) throw new Error("Could not find Daily Service link — are you logged in?");

  console.log("[5] Waiting for DSW tab...");
  await new Promise(r => setTimeout(r, 6000));
  const allTargets = browser.targets().filter(t => t.type() === "page");

  let dswPage = page;
  if (allTargets.length > pagesBefore) {
    const allPages = await Promise.all(allTargets.map(t => t.page()));
    const valid = allPages.filter(Boolean);
    dswPage = valid[valid.length - 1];
    dswPage.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });
    await new Promise(r => setTimeout(r, 4000));
  }

  // ── Set date ────────────────────────────────────────────────────────────────
  console.log("[6] Setting date to", targetDateDsw, "...");
  await dswPage.evaluate((date) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    for (const inp of inputs.slice(0, 2)) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(inp, date);
      else inp.value = date;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, targetDateDsw);

  const searchClicked = await dswPage.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Search");
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!searchClicked) throw new Error("Could not find Search button");

  console.log("[7] Waiting for results (8s)...");
  await new Promise(r => setTimeout(r, 8000));

  // ── Scrape ──────────────────────────────────────────────────────────────────
  console.log("[8] Scraping table...");
  const { headers, tableRows } = await dswPage.evaluate(() => {
    const ths = Array.from(document.querySelectorAll("th"));
    const headers = ths.map(th => th.textContent?.trim().replace(/\s+/g, " ") || "");
    const result = [];
    for (const tr of Array.from(document.querySelectorAll("tr"))) {
      const cells = Array.from(tr.querySelectorAll("td"))
        .map(td => td.textContent?.trim().replace(/\s+/g, " ") || "");
      if (cells.length > 10) result.push(cells);
    }
    return { headers, tableRows: result };
  });

  // ── Dump headers ────────────────────────────────────────────────────────────
  console.log("\n=== TABLE HEADERS ===");
  if (headers.length > 0) {
    headers.forEach((h, i) => console.log(`  [${i}] ${h || "(blank)"}`));
  } else {
    console.log("  (no <th> found — DSW uses td-only rows)");
  }

  console.log(`\n=== RAW ROWS: ${tableRows.length} data rows ===`);
  if (tableRows.length === 0) {
    console.log("  No rows found. Check the date or whether you are logged in.");
    await browser.close();
    process.exit(0);
  }

  // Full dump of first 3 rows
  tableRows.slice(0, 3).forEach((row, ri) => {
    console.log(`\n--- Row ${ri} (${row.length} cells) ---`);
    row.forEach((cell, ci) => console.log(`  [${ci}] ${cell || "(blank)"}`));
  });

  // ── Preview inserts ─────────────────────────────────────────────────────────
  const parseInt2 = (s) => { if (!s?.trim()) return null; const n = parseInt(s.trim(), 10); return isNaN(n) ? null : n; };
  const parseIls  = (s) => { if (!s) return null; const n = parseFloat(s.replace("%", "")); return (isNaN(n) || n < 0 || n > 100) ? null : n; };

  console.log("\n=== WHAT WOULD BE INSERTED (first 5 rows) ===");
  let shown = 0;
  for (const row of tableRows) {
    if (shown >= 5) break;
    const driverRaw = row[4] || "";
    const waName    = row[2] || "";
    if (!driverRaw && !waName) continue;
    shown++;
    console.log(`\n  [row ${tableRows.indexOf(row)}]`);
    console.log(`  driver_name_raw : [4]  "${driverRaw}"`);
    console.log(`  wa_name         : [2]  "${waName}"`);
    console.log(`  wa_number       : [5]  "${row[5] || ""}"`);
    console.log(`  vscan_pkgs      : [7]  ${parseInt2(row[7])}`);
    console.log(`  del_stps_planned: [8]  ${parseInt2(row[8])}`);
    console.log(`  act_del_stps    : [11] ${parseInt2(row[11])}`);
    console.log(`  act_del_pkgs    : [12] ${parseInt2(row[12])}`);
    console.log(`  ils_pct         : [15] ${parseIls(row[15])}  (raw: "${row[15]}")`);
    console.log(`  ils_impact_pkgs : [16] ${parseInt2(row[16])}  ← NEW column`);
    console.log(`  row[17] (blank?): [17] "${row[17] || ""}"  ← should be blank`);
    console.log(`  non_delvd_stps  : [18] ${parseInt2(row[18])}  ← FIXED (was row[17])`);
    console.log(`  all_status_pkgs : [19] ${parseInt2(row[19])}`);
    console.log(`  dna (code 27)   : [21] ${parseInt2(row[21])}  ← NEW column`);
    console.log(`  code_85         : [23] ${parseInt2(row[23])}  ← NEW column`);
    console.log(`  miles           : [26] ${parseInt2(row[26])}`);
    console.log(`  on_road_hours   : [27] "${row[27] || ""}"`);
    console.log(`  on_duty_hours   : [28] "${row[28] || ""}"`);
  }

  console.log("\n=== Done. Verify the values above match expectations, then close the browser. ===");
  await new Promise(r => setTimeout(r, 300_000)); // keep open 5 min for inspection

} catch (err) {
  console.error("\n[ERROR]", err?.message ?? err);
  await browser.close();
  process.exit(1);
}
