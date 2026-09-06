/**
 * fill-daily-performance.mjs
 * Run: node scripts/fill-daily-performance.mjs
 *
 * Fills "Apparo Manager Daily Performance.xlsx" with data from:
 *  - DSW (Daily Service Worksheet) scraped from mybizaccount.fedex.com
 *  - RYDE scores CSV from ~/Downloads/ryde-scores.csv
 *
 * Covers every Mon–Sat from FORCE_FROM through yesterday.
 * Dates with existing rows → UPDATE those rows.
 * Dates with no rows → CREATE new rows.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createRequire } from "module";
import os from "os";
import puppeteer from "puppeteer";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ── Config ─────────────────────────────────────────────────────────────────────
const EXCEL_PATH  = join(os.homedir(), "Downloads", "Apparo Manager Daily Performance.xlsx");
const RYDE_CSV    = join(os.homedir(), "Downloads", "ryde-scores.csv");
const MYBIZ_BASE  = "https://mybizaccount.fedex.com";
const FORCE_FROM  = "2026-07-27"; // re-process everything from this date forward
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Compute today's local date (not UTC) so late-night runs get the right date
const _now = new Date();
const TODAY_STR = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,"0")}-${String(_now.getDate()).padStart(2,"0")}`;
console.log(`Today: ${TODAY_STR}  (will fill up to yesterday)`);

// Excel column indices (0-based, confirmed from file inspection)
const COL_SERIAL  = 0;  // Excel date serial number
const COL_DATESTR = 1;  // "1/2/26 FRI" display string
const COL_DRIVER  = 2;  // driver name / "TEAM"
const COL_ROUTE   = 3;  // service area number
const COL_ILS_PCT = 4;  // ILS% (e.g. 97.8)
const COL_STATCNT = 5;  // all status code packages (ILS impact count)
// col 6 = status breakdown text ("4 x 04") — manual only, never touch
const COL_85S     = 7;  // Code 85 count (small number, e.g. 0–5)
const COL_RYDE    = 9;  // RYDE customer score text ("3 x 5, 1 x 4")

// DSW table column indices (row[] from scraped <td> cells, confirmed vs dsw-sync.ts)
const DSW_COL_WA_NAME  = 2;   // WA Name (route label)
const DSW_COL_DRIVER   = 4;   // Driver: "LASTNAME,FIRSTNAME MIDDLE"
const DSW_COL_WA_NUM   = 5;   // WA Number (route number, may have leading zero)
const DSW_COL_VSCAN      = 7;   // VScan Pkgs (total packages — NOT written to Excel)
const DSW_COL_ILS_PCT    = 15;  // ILS%
const DSW_COL_ILS_IMPACT = 16;  // ILS Impact Pkgs — packages that actually caused ILS to drop (= COL_STATCNT)
const DSW_COL_CODE85     = 23;  // Code 85 count — returned with no scan code at all (= COL_85S)
//  Status Code Packages section: 19=All Status | 20=PL | 21=DNA | 22=Snd Agn | 23=Code 85 | 24=VSA vs STAR

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Name helpers ───────────────────────────────────────────────────────────────
// Normalize full name for matching: lowercase, letters only
function normName(n) { return n.toLowerCase().replace(/[^a-z]/g, ""); }

// Extract last name only (for RYDE CSV which uses "C. INGUANTA" format)
function normLastName(n) {
  const parts = n.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, "");
}

// DSW "LASTNAME,FIRSTNAME MIDDLE" → "Firstname Lastname"
function parseDswName(raw) {
  if (!raw) return "";
  const [last, ...rest] = raw.split(",");
  const first = rest.join(" ").trim();
  const full = first ? `${first} ${last}` : last;
  return full.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

// ── Date helpers (all UTC-based to avoid timezone bugs) ────────────────────────
function serialToIso(serial) {
  const ms = (serial - 25569) * 86400000 + 43200000; // noon UTC = safe for any TZ
  return new Date(ms).toISOString().slice(0, 10);
}
function isoToSerial(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}
// "YYYY-MM-DD" → "1/2/26 FRI" (Excel display column B format)
function isoToExcelStr(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}/${String(y).slice(2)} ${DAY_NAMES[dow]}`;
}
// "YYYY-MM-DD" → "1/2/2026" (DSW date input format)
function isoToDswStr(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function getDow(iso) { // 0=Sun
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ── Load .env.local ────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const USERNAME = process.env.SPOTLIGHT_USERNAME || process.env.DRO_USERNAME;
const PASSWORD = process.env.SPOTLIGHT_PASSWORD || process.env.DRO_PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error("Missing credentials in .env.local (DRO_USERNAME / DRO_PASSWORD)");
  process.exit(1);
}

// ── Step 1: Read Excel ─────────────────────────────────────────────────────────
console.log("\n=== Step 1: Reading Excel ===");
if (!existsSync(EXCEL_PATH)) { console.error(`Excel not found: ${EXCEL_PATH}`); process.exit(1); }

const wb = XLSX.readFile(EXCEL_PATH, { cellStyles: true, bookVBA: true, dense: false });
const SHEET_NAME = "2026 Daily (DSW+Spotlight+FCC)";
const ws = wb.Sheets[SHEET_NAME];
if (!ws) { console.error(`Sheet "${SHEET_NAME}" not found`); process.exit(1); }

const range = XLSX.utils.decode_range(ws["!ref"]);

// Scan existing rows to understand what's in the sheet
let lastFilledSerial = 0;         // most recent date that has real ILS data
const rosterByDate  = {};         // isoDate → [{driver, route}]
const rowsByDate    = {};         // isoDate → { driverRows: [rowIdx], teamRow: rowIdx|null }
const datesWithIls  = new Set();  // iso dates where ≥1 driver row has ILS% filled

for (let R = range.s.r + 1; R <= range.e.r; R++) {
  const serialCell = ws[XLSX.utils.encode_cell({ r: R, c: COL_SERIAL })];
  const serial = serialCell?.v;
  if (!serial || typeof serial !== "number" || serial < 45657) continue; // skip pre-2026 / blank

  const iso       = serialToIso(serial);
  const driverVal = String(ws[XLSX.utils.encode_cell({ r: R, c: COL_DRIVER })]?.v ?? "").trim();
  const ilsVal    = ws[XLSX.utils.encode_cell({ r: R, c: COL_ILS_PCT })]?.v;
  const routeVal  = ws[XLSX.utils.encode_cell({ r: R, c: COL_ROUTE })]?.v ?? "";

  if (!rowsByDate[iso]) rowsByDate[iso] = { driverRows: [], teamRow: null };

  if (driverVal.toUpperCase() === "TEAM") {
    rowsByDate[iso].teamRow = R;
    continue;
  }

  // Skip rows where "driver" is just a number — those are facility-total rows (e.g. "86", "469")
  // that were incorrectly written by previous script runs. We'll clean them up in Step 0.
  if (/^\d+$/.test(driverVal)) continue;

  if (driverVal) {
    rowsByDate[iso].driverRows.push(R);
    if (!rosterByDate[iso]) rosterByDate[iso] = [];
    rosterByDate[iso].push({ driver: driverVal, route: routeVal, rowIdx: R });
  }

  if (ilsVal !== undefined && ilsVal !== "" && ilsVal !== null) {
    datesWithIls.add(iso);
    if (serial > lastFilledSerial) lastFilledSerial = serial;
  }
}

const lastFilledIso = serialToIso(lastFilledSerial);
const roster = rosterByDate[lastFilledIso] || [];
console.log(`Last date with ILS data: ${lastFilledIso}`);
console.log(`Driver roster (${roster.length}): ${roster.map(r => r.driver).join(", ")}`);

// Find last row with any data (to know where to append new rows)
let lastDataRow = range.s.r;
for (let R = range.s.r + 1; R <= range.e.r; R++) {
  const sv = ws[XLSX.utils.encode_cell({ r: R, c: COL_SERIAL })]?.v;
  if (sv && typeof sv === "number" && sv > 45657) lastDataRow = R;
}
console.log(`Last row with data: row ${lastDataRow + 1}`);

// Build list of all Mon–Sat dates from FORCE_FROM to yesterday
const allDates = [];
for (let iso = FORCE_FROM; iso < TODAY_STR; iso = addDays(iso, 1)) {
  if (getDow(iso) === 0) continue; // skip Sunday
  allDates.push({
    isoStr:   iso,
    serial:   isoToSerial(iso),
    excelStr: isoToExcelStr(iso),
    dswStr:   isoToDswStr(iso),
    hasRows:  !!(rowsByDate[iso]?.driverRows?.length > 0),
    hasData:  datesWithIls.has(iso),
  });
}

console.log(`\nDates to process (${allDates.length} total Mon–Sat from ${FORCE_FROM} to yesterday):`);
const newDates    = allDates.filter(d => !d.hasRows);
const refillDates = allDates.filter(d => d.hasRows);
console.log(`  ${newDates.length} dates need NEW rows`);
console.log(`  ${refillDates.length} dates have existing rows (will UPDATE DSW + TEAM data)`);

// Also find rows with ILS% but no RYDE yet (for RYDE-only backfill)
const rydeOnlyRows = [];
for (let R = range.s.r + 1; R <= range.e.r; R++) {
  const serialCell = ws[XLSX.utils.encode_cell({ r: R, c: COL_SERIAL })];
  const serial = serialCell?.v;
  if (!serial || typeof serial !== "number" || serial < 45657) continue;
  const iso     = serialToIso(serial);
  if (iso < FORCE_FROM) continue; // only look at dates we're responsible for
  const driver  = String(ws[XLSX.utils.encode_cell({ r: R, c: COL_DRIVER })]?.v ?? "").trim();
  if (!driver || driver.toUpperCase() === "TEAM" || /^\d+$/.test(driver)) continue;
  const ils  = ws[XLSX.utils.encode_cell({ r: R, c: COL_ILS_PCT })]?.v;
  const ryde = ws[XLSX.utils.encode_cell({ r: R, c: COL_RYDE })]?.v;
  if ((ils !== undefined && ils !== "" && ils !== null) &&
      (ryde === undefined || ryde === "" || ryde === null)) {
    rydeOnlyRows.push({ rowIdx: R, driver, isoStr: iso });
  }
}

// ── Step 0: Clean up bad data from previous script runs ────────────────────────
console.log("\n=== Step 0: Cleaning up bad data ===");

function clearCell(row, col) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  if (ws[addr]) { ws[addr].v = ""; ws[addr].t = "s"; delete ws[addr].w; }
}

let cleanedNumericRows = 0;
let cleared85s = 0;

for (let R = range.s.r + 1; R <= range.e.r; R++) {
  const serialCell = ws[XLSX.utils.encode_cell({ r: R, c: COL_SERIAL })];
  const serial = serialCell?.v;
  if (!serial || typeof serial !== "number" || serial < 45657) continue;

  const iso    = serialToIso(serial);
  const driver = String(ws[XLSX.utils.encode_cell({ r: R, c: COL_DRIVER })]?.v ?? "").trim();

  // Remove numeric "driver" rows (facility total rows written by mistake)
  if (/^\d+$/.test(driver) && iso >= FORCE_FROM) {
    // Blank out key cells so this row is inert
    clearCell(R, COL_SERIAL);
    clearCell(R, COL_DATESTR);
    clearCell(R, COL_DRIVER);
    clearCell(R, COL_ILS_PCT);
    clearCell(R, COL_STATCNT);
    clearCell(R, COL_85S);
    clearCell(R, COL_RYDE);
    cleanedNumericRows++;
    continue;
  }

  // Clear COL_85S for all rows in FORCE_FROM range — previous run wrote vscan (wrong)
  if (iso >= FORCE_FROM && driver && driver.toUpperCase() !== "TEAM") {
    const cell85 = ws[XLSX.utils.encode_cell({ r: R, c: COL_85S })];
    if (cell85?.v !== undefined && cell85.v !== "" && cell85.v !== null) {
      clearCell(R, COL_85S);
      cleared85s++;
    }
  }
}

console.log(`  Cleared ${cleanedNumericRows} bogus numeric-driver rows`);
console.log(`  Cleared ${cleared85s} wrong Code-85 values (were vscan totals)`);

// ── Step 2: Load RYDE CSV ─────────────────────────────────────────────────────
console.log("\n=== Step 2: Loading RYDE scores ===");
// RYDE CSV uses "C. INGUANTA" format → key by normalized last name
const rydeByLastName = {}; // normLastName → { byWeek: { weekKey: [stars] } }

if (existsSync(RYDE_CSV)) {
  const lines = readFileSync(RYDE_CSV, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line + ",") {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    const [name, , reviewDate, stars] = cols;
    if (!name || !stars) continue;
    const rd = new Date(reviewDate);
    if (isNaN(rd.getTime())) continue;
    const utc = new Date(Date.UTC(rd.getFullYear(), rd.getMonth(), rd.getDate()));
    const dow2 = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dow2);
    const jan1 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((utc - jan1) / 86400000 + 1) / 7);
    const weekKey = `${utc.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
    const key = normLastName(name);
    if (!rydeByLastName[key]) rydeByLastName[key] = { byWeek: {} };
    if (!rydeByLastName[key].byWeek[weekKey]) rydeByLastName[key].byWeek[weekKey] = [];
    rydeByLastName[key].byWeek[weekKey].push(Math.round(parseFloat(stars) || 0));
  }
  console.log(`Loaded RYDE data for ${Object.keys(rydeByLastName).length} drivers`);
} else {
  console.warn(`RYDE CSV not found at ${RYDE_CSV} — RYDE column will be skipped`);
}

function getWeekKey(isoDate) {
  const utc = new Date(isoDate + "T12:00:00Z");
  const dow2 = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dow2);
  const jan1 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((utc - jan1) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function getRydeText(driverName, isoDate) {
  const key = normLastName(driverName);
  const entry = rydeByLastName[key];
  if (!entry) return null;
  const scores = entry.byWeek[getWeekKey(isoDate)] || [];
  if (scores.length === 0) return null;
  const counts = {};
  for (const s of scores) counts[s] = (counts[s] || 0) + 1;
  return Object.keys(counts).sort((a, b) => b - a).map(s => `${counts[s]} x ${s}`).join(", ");
}

// ── Step 3: Scrape DSW ─────────────────────────────────────────────────────────
// dswDataByIso[isoStr] = {
//   [normDriverName]: { driverName, route, ilsPct, statPkgs, code85 },
//   __teamIls: number | null   ← from "Contract C8888312 Total" row
// }
const dswDataByIso = {};

const needsScraping = allDates; // scrape everything (we're re-doing from FORCE_FROM)

if (needsScraping.length === 0) {
  console.log("\nNo dates to scrape — Excel is already up to date!");
  process.exit(0);
}

console.log(`\n=== Step 3: Opening DSW browser (${needsScraping.length} dates) ===`);

const browser = await puppeteer.launch({
  headless: false,
  args: ["--no-sandbox", "--start-maximized"],
  defaultViewport: null,
});

try {
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("Logging into MyBiz...");
  await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(1500);
  const signIn = await page.$('input[value="Sign In"]') || await page.$('input[type="submit"]');
  if (signIn) { await signIn.click(); await sleep(2000); }
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  try {
    await page.waitForSelector('button::-p-text(Cancel)', { timeout: 3000 });
    await page.click('button::-p-text(Cancel)'); await sleep(1000);
  } catch {}
  await page.waitForSelector('input[name="identifier"]', { timeout: 15000 });
  const uf = await page.$('input[name="identifier"]') || await page.$('input[type="text"]');
  if (uf) { await uf.click({ clickCount: 3 }); await uf.type(USERNAME, { delay: 40 }); }
  const nb = await page.$('input[type="submit"], button[type="submit"]');
  if (nb) await nb.click(); else await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await sleep(2000);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  const pf = await page.$('input[type="password"]');
  if (pf) { await pf.click({ clickCount: 3 }); await pf.type(PASSWORD, { delay: 40 }); }
  const pb = await page.$('input[type="submit"], button[type="submit"]');
  if (pb) await pb.click(); else await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await sleep(5000);

  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (/verify|authenticat|code|factor/i.test(bodyText)) {
    console.log("\n⚠  MFA detected — complete it in the browser, then press Enter here...");
    await new Promise(r => process.stdin.once("data", r));
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
    await sleep(3000);
  }

  // ── Open DSW tab ────────────────────────────────────────────────────────────
  console.log("Opening Daily Service Worksheet tab...");
  await sleep(3000);

  const pagesBefore = browser.targets().filter(t => t.type() === "page").length;
  let clicked = false;
  for (const frame of page.frames()) {
    for (const sel of [
      'a::-p-text(Daily Service Wk)',
      'a::-p-text(Daily Service Worksheet)',
      'a::-p-text(Daily Service)',
      'a[href*="dsw"]',
      'a[href*="DSW"]',
    ]) {
      try {
        const el = await frame.$(sel);
        if (el) { await el.click(); clicked = true; break; }
      } catch {}
    }
    if (clicked) break;
  }

  if (!clicked) {
    console.log("\n⚠  Could not auto-click the DSW link.");
    console.log("   Please click 'Daily Service Worksheet' in the browser, then press Enter...");
    await new Promise(r => process.stdin.once("data", r));
  } else {
    await sleep(2000);
  }

  await sleep(6000);

  const allTargets = browser.targets().filter(t => t.type() === "page");
  let dswPage = page;
  if (allTargets.length > pagesBefore) {
    const pages = (await Promise.all(allTargets.map(t => t.page()))).filter(Boolean);
    dswPage = pages[pages.length - 1];
    dswPage.on("dialog", async d => { try { await d.dismiss(); } catch {} });
    await sleep(4000);
  }

  const hasSearch = await dswPage.evaluate(() =>
    !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Search")
  );
  if (!hasSearch) {
    console.log("\n⚠  DSW page doesn't have a Search button yet.");
    console.log("   Navigate to Daily Service Worksheet in the browser, then press Enter...");
    await new Promise(r => process.stdin.once("data", r));
    await sleep(3000);
  }

  // ── Loop each date ─────────────────────────────────────────────────────────
  let firstDate = true;
  for (const { dswStr, isoStr, excelStr } of needsScraping) {
    console.log(`\n--- Scraping ${excelStr} (DSW: ${dswStr}) ---`);

    // Set date in both date fields
    await dswPage.evaluate((date) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      for (const inp of inputs.slice(0, 2)) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(inp, date); else inp.value = date;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, dswStr);

    const searchOk = await dswPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Search");
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!searchOk) { console.log("  ⚠ Search button missing — skipping"); continue; }

    await sleep(8000);

    const tableRows = await dswPage.evaluate(() => {
      const result = [];
      for (const tr of document.querySelectorAll("tr")) {
        const cells = Array.from(tr.querySelectorAll("td"))
          .map(td => td.textContent?.trim().replace(/\s+/g, " ") || "");
        if (cells.length > 10) result.push(cells);
      }
      return result;
    });

    console.log(`  ${tableRows.length} table rows from DSW`);

    if (firstDate && tableRows.length > 0) {
      console.log("  Column index map (first data row, non-empty):");
      tableRows[0].forEach((v, i) => { if (v) console.log(`    [${i}] = "${v}"`); });
      firstDate = false;
    }

    dswDataByIso[isoStr] = { __teamIls: null };

    for (const row of tableRows) {
      const rowText = row.join(" ");

      // ── Company total row (Apparo) ──────────────────────────────────────────
      // Identified by "C8888312" appearing anywhere in the row.
      // This row has a merged label cell that shifts all column indices vs driver rows,
      // so we can't use DSW_COL_ILS_PCT (15). Instead find the first "XX.X%" value in the row.
      if (/C8888312/i.test(rowText) || /contract.*total/i.test(rowText)) {
        // ILS% cell reads "99.2% via Local Service Worksheet" — find the first cell
        // containing a percentage, with or without the trailing link text.
        const ilsCell = row.find(cell => /\d+\.?\d*%\s*via/i.test(cell))
                     || row.find(cell => /^\d+\.?\d*%$/.test(cell.trim()) && parseFloat(cell) >= 50 && parseFloat(cell) <= 100);
        const ilsMatch = ilsCell ? ilsCell.match(/(\d+\.?\d*)%/) : null;
        const ils = ilsMatch ? parseFloat(ilsMatch[1]) : null;
        if (ils !== null && !isNaN(ils) && ils >= 0 && ils <= 100) {
          dswDataByIso[isoStr].__teamIls = ils;
          console.log(`  Company total (C8888312): ILS = ${ils}%`);
        } else {
          console.log(`  Company total (C8888312): ILS not found — cells: ${row.filter(c=>c).join(" | ")}`);
        }
        continue; // not a driver row
      }

      const driverRaw = (row[DSW_COL_DRIVER] || "").trim();
      if (!driverRaw) continue;

      // Skip facility-wide total row (numeric "driver" like "469", "86")
      if (/^\d+$/.test(driverRaw)) continue;

      const driverName = parseDswName(driverRaw);
      const norm       = normName(driverName);

      const ilsRaw  = (row[DSW_COL_ILS_PCT] || "").replace("%", "").trim();
      const ilsPct  = parseFloat(ilsRaw);
      const statPkgs = parseInt(row[DSW_COL_ILS_IMPACT], 10); // ILS impact packages (col 16)
      const code85   = parseInt(row[DSW_COL_CODE85], 10);     // Code 85 — no scan, no code (col 23)

      // Try to match route from DSW (waNumber may have leading zeros)
      const waNumRaw = (row[DSW_COL_WA_NUM] || "").trim();
      const waNum    = parseInt(waNumRaw, 10) || null;

      dswDataByIso[isoStr][norm] = {
        driverName,
        route:    waNum,
        ilsPct:   isNaN(ilsPct) ? null : ilsPct,
        statPkgs: isNaN(statPkgs) ? null : statPkgs,
        code85:   isNaN(code85)  ? null : code85,
      };
    }

    const driverCount = Object.keys(dswDataByIso[isoStr]).filter(k => k !== "__teamIls").length;
    console.log(`  Parsed ${driverCount} drivers | TEAM ILS: ${dswDataByIso[isoStr].__teamIls ?? "not found"}`);
    if (driverCount > 0) {
      // Log a sample row to verify Code 85 is correct (should be small number, 0-10)
      const sample = Object.values(dswDataByIso[isoStr]).find(v => v && typeof v === "object" && v.driverName);
      if (sample) {
        console.log(`  Sample → "${sample.driverName}": ILS=${sample.ilsPct}% Code85=${sample.code85} StatPkgs=${sample.statPkgs}`);
      }
    }
  }

  await browser.close();

} catch (err) {
  await browser.close().catch(() => {});
  console.error("\n✗ Browser error:", err.message);
  process.exit(1);
}

// ── Step 4: Write to Excel ─────────────────────────────────────────────────────
console.log("\n=== Step 4: Writing to Excel ===");

function setCell(row, col, value) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  if (!ws[addr]) ws[addr] = {};
  ws[addr].v = value;
  ws[addr].t = typeof value === "number" ? "n" : "s";
  delete ws[addr].w;
}

// Find DSW entry for a driver by normalized name (with fallback prefix match)
function findDswDriver(dswDay, driverName) {
  const norm = normName(driverName);
  if (dswDay[norm]) return dswDay[norm];
  // Try prefix match (handles middle names, slight spelling diffs)
  const key = Object.keys(dswDay).find(k =>
    k !== "__teamIls" && (k.startsWith(norm.slice(0, 6)) || norm.startsWith(k.slice(0, 6)))
  );
  return key ? dswDay[key] : null;
}

// Find route for a driver: prefer DSW route, fall back to roster
function getRoute(dswEntry, driverName) {
  if (dswEntry?.route) return dswEntry.route;
  const r = roster.find(d => normName(d.driver).startsWith(normName(driverName).slice(0, 5)));
  return r?.route ?? "";
}

let nextRow = lastDataRow + 1;
let totalWritten = 0;

for (const { serial, excelStr, isoStr, hasRows } of allDates) {
  const dswDay = dswDataByIso[isoStr] || {};
  const teamIls = dswDay.__teamIls ?? null;

  if (hasRows && rowsByDate[isoStr]) {
    // ── UPDATE MODE: rows already exist, overwrite DSW fields ─────────────────
    const { driverRows, teamRow } = rowsByDate[isoStr];

    for (const R of driverRows) {
      const driverName = String(ws[XLSX.utils.encode_cell({ r: R, c: COL_DRIVER })]?.v ?? "").trim();
      if (!driverName || driverName.toUpperCase() === "TEAM") continue;

      const dsw = findDswDriver(dswDay, driverName);
      if (dsw) {
        if (dsw.ilsPct  !== null) setCell(R, COL_ILS_PCT, dsw.ilsPct);
        if (dsw.statPkgs !== null) setCell(R, COL_STATCNT, dsw.statPkgs);
        if (dsw.code85  !== null) setCell(R, COL_85S, dsw.code85);
      }
      // Write RYDE if not already set
      const rydeCell = ws[XLSX.utils.encode_cell({ r: R, c: COL_RYDE })];
      if (!rydeCell?.v) {
        const rydeText = getRydeText(driverName, isoStr);
        if (rydeText) setCell(R, COL_RYDE, rydeText);
      }
      totalWritten++;
    }

    // Update TEAM row
    if (teamRow !== null && teamIls !== null) {
      setCell(teamRow, COL_ILS_PCT, teamIls);
      console.log(`  UPDATE ${excelStr}: ${driverRows.length} driver rows | TEAM ILS=${teamIls}%`);
    } else {
      console.log(`  UPDATE ${excelStr}: ${driverRows.length} driver rows | TEAM ILS=${teamIls ?? "missing"}`);
    }

  } else {
    // ── CREATE MODE: build rows from DSW data ─────────────────────────────────
    const dswDrivers = Object.entries(dswDay)
      .filter(([k]) => k !== "__teamIls")
      .map(([, v]) => v)
      .filter(v => v && v.driverName);

    // If DSW had no drivers for this date, fall back to roster (leave data blank)
    const dayDrivers = dswDrivers.length > 0 ? dswDrivers : roster.map(r => ({
      driverName: r.driver,
      route:      r.route,
      ilsPct:     null,
      statPkgs:   null,
      code85:     null,
    }));

    const startRow = nextRow;
    for (const drv of dayDrivers) {
      const route    = getRoute(drv, drv.driverName);
      const rydeText = getRydeText(drv.driverName, isoStr);

      setCell(nextRow, COL_SERIAL,  serial);
      setCell(nextRow, COL_DATESTR, excelStr);
      setCell(nextRow, COL_DRIVER,  drv.driverName);
      if (route)           setCell(nextRow, COL_ROUTE,   route);
      if (drv.ilsPct  !== null) setCell(nextRow, COL_ILS_PCT, drv.ilsPct);
      if (drv.statPkgs !== null) setCell(nextRow, COL_STATCNT, drv.statPkgs);
      if (drv.code85  !== null) setCell(nextRow, COL_85S, drv.code85);
      if (rydeText)        setCell(nextRow, COL_RYDE,    rydeText);
      nextRow++;
      totalWritten++;
    }

    // TEAM row
    setCell(nextRow, COL_SERIAL,  serial);
    setCell(nextRow, COL_DATESTR, excelStr);
    setCell(nextRow, COL_DRIVER,  "TEAM");
    if (teamIls !== null) setCell(nextRow, COL_ILS_PCT, teamIls);
    nextRow++;

    console.log(`  CREATE ${excelStr}: ${dayDrivers.length} drivers + TEAM row (rows ${startRow+1}–${nextRow})`);
  }
}

// ── RYDE backfill: catch any remaining rows that still have no RYDE ────────────
if (rydeOnlyRows.length > 0) {
  console.log(`\nRYDE backfill: checking ${rydeOnlyRows.length} rows...`);
  let rydeCount = 0;
  for (const { rowIdx, driver, isoStr } of rydeOnlyRows) {
    // Only fill if still empty (may have been set above in UPDATE pass)
    const rydeCell = ws[XLSX.utils.encode_cell({ r: rowIdx, c: COL_RYDE })];
    if (rydeCell?.v) continue;
    const rydeText = getRydeText(driver, isoStr);
    if (rydeText) {
      setCell(rowIdx, COL_RYDE, rydeText);
      rydeCount++;
    }
  }
  console.log(`  ${rydeCount} RYDE values filled`);
}

// Update sheet range to cover newly added rows
const newRange = XLSX.utils.encode_range({
  s: range.s,
  e: { r: Math.max(nextRow - 1, range.e.r), c: range.e.c },
});
ws["!ref"] = newRange;

XLSX.writeFile(wb, EXCEL_PATH, { bookVBA: true });
console.log(`\n✓ Done — ${totalWritten} driver rows written`);
console.log(`  ${EXCEL_PATH}\n`);
