/**
 * pull-spotlight-ryde.mjs
 * Run: node scripts/pull-spotlight-ryde.mjs
 *
 * 1. Opens browser, auto-logs into MyBiz
 * 2. Captures Bearer token from MyBiz background API calls
 * 3. Sends OTP to your FedEx email via MFA API
 * 4. Shows a floating OTP box IN THE BROWSER — you type the code there
 * 5. Verifies OTP, gets EmbedToken, queries Power BI, writes to DB
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import os from "os";

const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

import puppeteer from "puppeteer";
import { neon } from "@neondatabase/serverless";

const MYBIZ_BASE = "https://mybizaccount.fedex.com";
const MFA_BASE   = "https://api.dataworks.fedex.com/mfa-api/mfa/v1";
const SPOI_BASE  = "https://api.dataworks.fedex.com/spoi-api/spoi/v1";
const WABI       = "https://wabi-us-north-central-e-primary-redirect.analysis.windows.net";
const DATASET_ID = "16d67ff6-ea2d-42ba-8650-a7983b9f6262";
const REPORT_ID  = "8dc4a4f1-561f-4a04-a947-628cea03ee2d";
const GROUP_ID   = "2532655f-c864-4c3f-8626-b800f6ed5180";
const CSA_ID     = "304169";

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_username', 'dro_password')`.catch(() => []);
const creds = Object.fromEntries(credsRows.map(r => [r.key, r.value]));
const USERNAME = creds["dro_username"] || process.env.SPOTLIGHT_USERNAME;
const PASSWORD = creds["dro_password"] || process.env.SPOTLIGHT_PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error("Add to .env.local:\n  SPOTLIGHT_USERNAME=your_fedex_id\n  SPOTLIGHT_PASSWORD=your_password");
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function col(row, key) {
  return row[`RYDE Detail[${key}]`] ?? row[`Resource Names[${key}]`] ?? row[`[${key}]`] ?? row[key] ?? "";
}
// Parse "J. GEARHART (7763046)" → { name: "J. GEARHART", fedexId: "7763046" }
function parseResource(resource) {
  const m = resource.match(/^(.*?)\s*\((\d+)\)\s*$/);
  if (m) return { name: m[1].trim(), fedexId: m[2].trim() };
  return { name: resource.trim(), fedexId: "" };
}
function dateToWeekStr(raw) {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(0, 10);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((utc.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
function normName(n) { return n.toLowerCase().replace(/[^a-z]/g, ""); }

const browser = await puppeteer.launch({
  headless: false,
  args: [
    "--no-sandbox",
    "--start-maximized",
    "--disable-features=IsolateOrigins,site-per-process", // put all iframes in same process so CDP sees them
  ],
});

let bearerToken = "";
let embedToken  = "";
let embedMeta   = null;
let wabiUrl     = WABI;
let resourceKey = "";
let rydeDataRows     = null; // captured from Spotlight's own Power BI response
let resourceDataRows = null;

try {
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  // Inject fetch/XHR override into every frame (including cross-origin iframes) before they load
  // This exposes Power BI data responses via window.__pbiCaptures
  await page.evaluateOnNewDocument(() => {
    window.__pbiCaptures = [];
    const _fetch = window.fetch;
    window.fetch = async function(input, init) {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const res = await _fetch.apply(this, arguments);
      if ((url.includes("analysis.windows.net") || url.includes("powerbi.com")) && res.status === 200) {
        const clone = res.clone();
        clone.text().then(t => {
          if (t.length > 100) window.__pbiCaptures.push({ url, body: t });
        }).catch(() => {});
      }
      return res;
    };
  });

  // Intercept requests/responses to capture Bearer + EmbedToken from Spotlight's own calls
  function attachListeners(p) {
    p.on("dialog", async d => { try { await d.dismiss(); } catch {} });
    p.on("request", req => {
      const url = req.url();
      const auth = req.headers()["authorization"] ?? "";
      // Bearer from Spotlight API calls
      if (url.includes("api.dataworks.fedex.com") && auth.startsWith("Bearer ") && !bearerToken) {
        bearerToken = auth;
        console.log("✅ Bearer token captured");
      }
      // EmbedToken from outgoing Power BI requests (Spotlight sends it when loading the report)
      if ((url.includes("analysis.windows.net") || url.includes("powerbi.com")) && auth.startsWith("EmbedToken ") && !embedToken) {
        embedToken = auth.replace("EmbedToken ", "");
        console.log("✅ EmbedToken captured from Power BI request");
      }
    });
    p.on("response", async res => {
      try {
        if (res.url().includes("powerbi/dashboard") && res.status() === 200) {
          const json = await res.json().catch(() => null);
          if (json?.embedToken?.token && !embedToken) {
            embedToken = json.embedToken.token;
            resourceKey = json.embedToken.tokenId ?? "";
            embedMeta = json;
            console.log("✅ EmbedToken captured, tokenId:", resourceKey || "(none)");
          }
        }
        // Capture Power BI data responses — log all wabi/powerbi traffic
        const url = res.url();
        const isPbi = url.includes("analysis.windows.net") || url.includes("powerbi.com") || url.includes("wabi");
        if (isPbi && res.status() === 200) {
          console.log(`  [pbi-response] ${url} status=${res.status()}`);  // FULL URL
          const buf = await res.buffer().catch(() => null);
          if (!buf || buf.length < 10) return;
          let json; try { json = JSON.parse(buf.toString()); } catch { return; }
          // Look for any response with rows data — Power BI uses several endpoint patterns
          const rows = json?.results?.[0]?.tables?.[0]?.rows   // executeQueries format
                    ?? json?.data?.dsr?.DS?.[0]?.PH?.[0]?.DM0  // explore format
                    ?? json?.tables?.[0]?.rows                  // alternate format
                    ?? null;
          if (!rows?.length) {
            return;
          }
          const sample = rows[0];
          const keys = Object.keys(sample).map(k => k.toLowerCase());
          console.log(`  [pbi-response] ${rows.length} rows, keys: ${Object.keys(sample).slice(0,6).join(", ")}`);
          if (!rydeDataRows && keys.some(k => k.includes("ryde") || k.includes("driver") || k.includes("star") || k.includes("week") || k.includes("rate"))) {
            rydeDataRows = rows; console.log(`✅ RYDE data from response listener: ${rows.length} rows`);
          } else if (!resourceDataRows && keys.some(k => k.includes("fdxid") || k.includes("name") || k.includes("resource"))) {
            resourceDataRows = rows; console.log(`✅ Resource names from response listener: ${rows.length} rows`);
          }
        }
      } catch {}
    });
  }

  attachListeners(page);
  browser.on("targetcreated", async t => {
    const p = await t.page().catch(() => null);
    if (p) attachListeners(p);
  });

  // ── 1. MyBiz login ────────────────────────────────────────────────────────
  console.log("🌐 Logging into MyBiz...");
  await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(2000);

  const signInBtn = await page.$('input[value="Sign In"]') ?? await page.$('input[type="submit"]');
  if (signInBtn) {
    await signInBtn.click();
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await sleep(2000);
  }

  try {
    await page.waitForSelector('input[name="identifier"]', { timeout: 15000 });
    console.log("  Entering credentials...");
    const uf = await page.$('input[name="identifier"]');
    await uf.click({ clickCount: 3 });
    await uf.type(USERNAME, { delay: 40 });
    const nb = await page.$('input[type="submit"], button[type="submit"]');
    if (nb) await nb.click(); else await page.keyboard.press("Enter");
    await sleep(3000);
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    const pf = await page.$('input[type="password"]');
    await pf.click({ clickCount: 3 });
    await pf.type(PASSWORD, { delay: 40 });
    const sb = await page.$('input[type="submit"], button[type="submit"]');
    if (sb) await sb.click(); else await page.keyboard.press("Enter");
    await sleep(15000);
  } catch { console.log("  Already authenticated"); }
  console.log("✅ MyBiz ready");

  // ── 2. Click SPOTlight link in the frame ──────────────────────────────────
  console.log("  Finding SPOTlight link in frames...");
  let clickedSpotlight = false;
  for (const frame of page.frames()) {
    try {
      const el = await frame.$('a::-p-text(SPOTlight)');
      if (el) {
        console.log("  Clicking SPOTlight in frame:", frame.url().slice(0, 60));
        await el.click();
        clickedSpotlight = true;
        break;
      }
    } catch {}
  }
  if (!clickedSpotlight) console.log("  ⚠️  Could not auto-click SPOTlight — please click it manually in the browser");

  // ── 3. Find Spotlight window and attach request listener directly ──────────
  await sleep(3000); // give it time to open

  let spotPage = null;
  for (const t of browser.targets()) {
    if (t.url().includes("spotlight.fedex.com")) {
      spotPage = await t.page().catch(() => null);
      break;
    }
  }

  if (spotPage) {
    console.log("  Spotlight window found:", spotPage.url().slice(0, 70));

    // Attach request listener to capture Bearer
    spotPage.on("request", req => {
      if (req.url().includes("api.dataworks.fedex.com")) {
        const auth = req.headers()["authorization"];
        if (auth?.startsWith("Bearer ") && !bearerToken) {
          bearerToken = auth;
          console.log("✅ Bearer token captured from Spotlight");
        }
      }
    });

    // Click the LOGIN button on the Spotlight landing page
    try {
      const loginBtn = await spotPage.$('button.fdx-c-button--primary') ??
                       await spotPage.$('button::-p-text(Login)') ??
                       await spotPage.$('button::-p-text(LOGIN)');
      if (loginBtn) {
        console.log("  Clicking LOGIN button...");
        await loginBtn.click();
        await sleep(3000);
      }
    } catch (e) { console.log("  LOGIN click error:", e.message); }

    // Wait for Okta form (after LOGIN redirect)
    try {
      await spotPage.waitForSelector('input[name="identifier"]', { timeout: 15000 });
      console.log("  Filling Spotlight Okta username...");
      const uf = await spotPage.$('input[name="identifier"]');
      await uf.click({ clickCount: 3 });
      await uf.type(USERNAME, { delay: 40 });
      const nb = await spotPage.$('input[type="submit"], button[type="submit"]');
      if (nb) await nb.click(); else await spotPage.keyboard.press("Enter");
      await sleep(3000);
      await spotPage.waitForSelector('input[type="password"]', { timeout: 15000 });
      console.log("  Filling Spotlight Okta password...");
      const pf = await spotPage.$('input[type="password"]');
      await pf.click({ clickCount: 3 });
      await pf.type(PASSWORD, { delay: 40 });
      const sb = await spotPage.$('input[type="submit"], button[type="submit"]');
      if (sb) await sb.click(); else await spotPage.keyboard.press("Enter");
      console.log("  Spotlight Okta submitted — waiting for MFA...");
      await sleep(3000);
    } catch (e) { console.log("  Okta fill:", e.message); }

    // Auto-select Email on login-preference page and click Send Passcode
    try {
      await spotPage.waitForSelector('input[type="radio"][value="email"]', { timeout: 15000 });
      console.log("  Selecting email on MFA preference page...");
      // Click the LABEL (not the input) — Angular requires label click
      const emailLabel = await spotPage.$('label[for="email"]');
      if (emailLabel) await emailLabel.click();
      else await spotPage.$eval('input[type="radio"][value="email"]', el => el.click());
      await sleep(500);
      const sendBtn = await spotPage.$('button.sr-pref-card-btn-login');
      if (sendBtn) { console.log("  Clicking Send Passcode..."); await sendBtn.click(); }
    } catch (e) { console.log("  MFA auto-select:", e.message); }

  } else {
    console.log("  ⚠️  Spotlight window not found — please click LOGIN manually in the browser");
  }

  // ── 3. Wait for you to enter the OTP in Spotlight tab ────────────────────
  console.log("\n👆 Check your email for the Spotlight passcode, enter it in the Spotlight tab, press Verify.");
  console.log("   Script will continue automatically once you're in.\n");

  const embedDeadline = Date.now() + 15 * 60 * 1000;
  while (!embedToken && Date.now() < embedDeadline) await sleep(500);
  if (!embedToken) throw new Error("EmbedToken not captured within 10 minutes");

  // ── Attach CDP to Power BI OOPIF targets ─────────────────────────────────
  if (!spotPage) throw new Error("Spotlight page not found");

  const attachedTargets = new Set();
  async function setupTargetCdp(target) {
    const url = target.url();
    const type = target.type();
    if (!url || url.startsWith("about:") || url.startsWith("chrome:")) return;
    if (attachedTargets.has(url)) return;
    attachedTargets.add(url);
    console.log(`  [target] ${type}: ${url.slice(0,80)}`);
    const isPbi = url.includes("app.powerbi.com") || url.includes("powerbi.com") || url.includes("analysis.windows.net");
    if (!isPbi) return;
    try {
      const cdp = await target.createCDPSession();
      await cdp.send("Network.enable");
      console.log(`  [pbi-cdp] Attached to ${type}: ${url.slice(0,80)}`);
    } catch (e) {
      console.log(`  [pbi-cdp] Attach failed for ${url.slice(0,60)}: ${e.message}`);
    }
  }

  for (const t of browser.targets()) await setupTargetCdp(t);
  browser.on("targetcreated", setupTargetCdp);
  browser.on("targetchanged", setupTargetCdp);

  // ── Auto-navigate to RYDE report ─────────────────────────────────────────
  try {
    console.log("  Navigating to RYDE report...");
    const uspd = await spotPage.waitForSelector('button::-p-text(U.S. Pickup & Delivery), a::-p-text(U.S. Pickup & Delivery), [class*="card"]::-p-text(U.S. Pickup)', { timeout: 15000 }).catch(() => null);
    if (uspd) { await uspd.click(); await sleep(1500); console.log("  ✓ Clicked U.S. Pickup & Delivery"); }

    const contractDrop = await spotPage.$('select, [role="listbox"], [class*="dropdown"]').catch(() => null);
    if (contractDrop) {
      await contractDrop.click(); await sleep(500);
      const opt = await spotPage.$(`option[value="${CSA_ID}"], li::-p-text(${CSA_ID})`).catch(() => null);
      if (opt) { await opt.click(); await sleep(500); console.log("  ✓ Selected contract 304169"); }
    }

    const reportSel = await spotPage.$('button::-p-text(Report Selection), a::-p-text(Report Selection)').catch(() => null);
    if (reportSel) { await reportSel.click(); await sleep(1500); console.log("  ✓ Clicked Report Selection"); }

    const pdNav = await spotPage.$('[class*="dropdown"]::-p-text(P&D Customer Experience), button::-p-text(P&D Customer Experience), a::-p-text(P&D Customer Experience)').catch(() => null);
    if (pdNav) { await pdNav.click(); await sleep(800); console.log("  ✓ Opened P&D Customer Experience"); }

    const rydeNav = await spotPage.$('a::-p-text(RYDE), button::-p-text(RYDE), li::-p-text(RYDE)').catch(() => null);
    if (rydeNav) { await rydeNav.click(); await sleep(3000); console.log("  ✓ Clicked RYDE"); }
    else { console.log("  ⚠️  Could not auto-click RYDE — please click it manually"); }

    const pkgDetail = await spotPage.$('button::-p-text(Package Detail), a::-p-text(Package Detail), [role="tab"]::-p-text(Package Detail)').catch(() => null);
    if (pkgDetail) { await pkgDetail.click(); await sleep(3000); console.log("  ✓ Clicked Package Detail"); }
    else { console.log("  ⚠️  Could not auto-click Package Detail — please click it manually"); }
  } catch (e) { console.log("  Nav error:", e.message); }

  console.log("\n👆 Click Package Detail tab in the RYDE report. Script will scrape the table automatically.\n");

  // ── DOM scraping with virtual scroll accumulation ─────────────────────────
  async function getPbiFrame() {
    const pages = await browser.pages();
    for (const p of pages) {
      const frame = p.frames().find(f =>
        f.url().includes("app.powerbi.com") || f.url().includes("reportEmbed")
      );
      if (frame) return frame;
    }
    return null;
  }

  async function scrapePbiTable() {
    try {
      const pbiFrame = await getPbiFrame();
      if (!pbiFrame) { console.log(`  [scrape] No PBI frame found`); return null; }

      return await pbiFrame.evaluate(() => {
        const allRows = Array.from(document.querySelectorAll("[class*='row'][role='row']"));
        const dataRows = allRows.filter(row => {
          const text = row.textContent ?? "";
          return !text.includes("Track ID") && !text.includes("CSA Overview") && text.includes("Select Row");
        });

        const parsed = dataRows.map(row => {
          const text = row.textContent ?? "";
          const trackMatch = text.match(/^Select Row(\d{8,})/);
          const trackId = trackMatch ? trackMatch[1] : null;
          const driverMatch = text.match(/([A-Z]\.\s+[A-Z]+(?:\s+[A-Z]+)?)\s+\((\d{6,8})\)/);
          if (!driverMatch) return { _skip: text.slice(0, 80) };
          const resource = `${driverMatch[1]} (${driverMatch[2]})`;
          const afterDriver = text.slice(text.indexOf(resource) + resource.length).trim();
          const starMatch = afterDriver.match(/^(\d)/);
          if (!starMatch) return { _skip: `no star in: ${afterDriver.slice(0, 60)}` };
          const star = starMatch[1];
          const afterStar = afterDriver.slice(1).trim();
          const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? [];
          const delv_date   = dates[0] ?? "";
          const survey_date = dates[1] ?? dates[0] ?? "";
          const yesNoIdx = afterStar.search(/(Yes|No)[A-Z]/);
          const why = yesNoIdx >= 0 ? afterStar.slice(0, yesNoIdx).trim() : afterStar.slice(0, 200).trim();
          return { trackId, resource, star, why, comments: "", delv_date, survey_date };
        });

        return {
          dataRows: dataRows.length,
          parsed: parsed.filter(r => r && !r._skip && r.resource && r.star),
        };
      }).catch(e => { console.log("  [scrape] eval error:", e.message); return null; });
    } catch (e) {
      console.log("  [scrape] error:", e.message);
      return null;
    }
  }

  async function scrollPbiTable() {
    try {
      const pbiFrame = await getPbiFrame();
      if (!pbiFrame) return;
      const scrolled = await pbiFrame.evaluate(() => {
        const dataRow = Array.from(document.querySelectorAll("[class*='row'][role='row']"))
          .find(r => r.textContent?.includes("Select Row"));
        if (!dataRow) return "no-row";
        let el = dataRow.parentElement;
        while (el && el !== document.documentElement) {
          if (el.scrollHeight > el.clientHeight + 5) {
            const before = el.scrollTop;
            el.scrollTop += 900;
            return `scrolled ${el.className.slice(0,40)} from ${before} to ${el.scrollTop}`;
          }
          el = el.parentElement;
        }
        window.scrollBy(0, 900);
        return "fallback-window-scroll";
      });
      console.log(`  [scroll-fn] ${scrolled}`);
    } catch {}
  }

  const dataDeadline = Date.now() + 10 * 60 * 1000;
  const accumulated = new Map();
  let noNewCount = 0;
  const MAX_NO_NEW = 4;

  console.log("  Waiting for Package Detail table...");
  while (Date.now() < dataDeadline) {
    await sleep(3000);
    const scraped = await scrapePbiTable();
    if (!scraped || !scraped.parsed?.length) {
      if (accumulated.size > 0) { noNewCount++; if (noNewCount >= MAX_NO_NEW) break; }
      continue;
    }
    let newCount = 0;
    for (const row of scraped.parsed) {
      const key = row.trackId || `${row.resource}::${row.delv_date}::${row.star}::${row.why?.slice(0,30)}`;
      if (!accumulated.has(key)) { accumulated.set(key, row); newCount++; }
    }
    if (newCount > 0) {
      noNewCount = 0;
      console.log(`  [scroll] +${newCount} new rows → total: ${accumulated.size} (visible: ${scraped.dataRows})`);
      await scrollPbiTable();
    } else {
      noNewCount++;
      console.log(`  [scroll] No new rows (${noNewCount}/${MAX_NO_NEW}), total: ${accumulated.size}`);
      if (noNewCount >= MAX_NO_NEW) break;
      await scrollPbiTable();
    }
  }

  if (accumulated.size > 0) {
    rydeDataRows = Array.from(accumulated.values());
    console.log(`✅ RYDE data scraped from DOM: ${rydeDataRows.length} total rows`);
  }

  await browser.close();
  if (!rydeDataRows) throw new Error("RYDE data not captured — did you click Package Detail in the RYDE report?");
  console.log(`✅ ${rydeDataRows.length} RYDE rows`);
  const rydeRows = rydeDataRows;
  const resourceRows = [];

  // ── CSV export (always runs first, before any DB writes) ───────────────────
  {
    const csvRows = ["Driver Name,FedEx ID,Review Date,Stars,Comment"];
    for (const row of rydeRows) {
      const { name, fedexId } = parseResource(row.resource ?? "");
      const date = row.survey_date || row.delv_date || "";
      const comment = (row.why || "").replace(/"/g, '""').trim();
      csvRows.push(`"${name}","${fedexId}","${date}","${row.star || ""}","${comment}"`);
    }
    const csvPath = join(os.homedir(), "Downloads", "ryde-scores.csv");
    writeFileSync(csvPath, csvRows.join("\n"), "utf8");
    console.log(`\n📄 CSV saved: ${csvPath} (${rydeRows.length} rows)`);
  }

  // ── 7. Write to DB ─────────────────────────────────────────────────────────
  const fdxToName = {};
  for (const r of resourceRows) {
    const id = col(r, "fdxid"), name = col(r, "name");
    if (id && name) fdxToName[id] = name;
  }

  const dbDrivers = await sql`SELECT driver_id, name, fedex_id FROM drivers WHERE active = true`;
  const byFedex = {}, byName = {};
  for (const d of dbDrivers) {
    if (d.fedex_id) byFedex[String(d.fedex_id)] = d.driver_id;
    byName[normName(d.name)] = d.driver_id;
  }
  function resolveDriver(fdxId) {
    if (byFedex[fdxId]) return byFedex[fdxId];
    const n = fdxToName[fdxId];
    return n ? (byName[normName(n)] ?? null) : null;
  }

  console.log("💾 Writing scores...");
  const buckets = new Map();
  for (const row of rydeRows) {
    const { name, fedexId } = parseResource(row.resource ?? "");
    if (!fedexId && !name) continue;
    const rawDate = row.survey_date || row.delv_date;
    const week = rawDate ? dateToWeekStr(rawDate) : "unknown";
    const key = `${fedexId || name}::${week}`;
    if (!buckets.has(key)) buckets.set(key, { fedexId, name, week, stars: [] });
    const star = parseInt(row.star, 10);
    if (star >= 1 && star <= 5) buckets.get(key).stars.push(star);
  }

  let scoreCount = 0;
  const weeksSeen = new Set();
  for (const [, b] of buckets) {
    const ourId = resolveDriver(b.fedexId) ?? (byName[normName(b.name)] ?? null);
    if (!ourId || !b.stars.length) continue;
    const avg = b.stars.reduce((s, x) => s + x, 0) / b.stars.length;
    const pos = b.stars.filter(s => s >= 4).length;
    weeksSeen.add(b.week);
    await sql`
      INSERT INTO ryde_scores (driver_id, score, week, deliveries, positive_reviews)
      VALUES (${ourId}, ${avg}, ${b.week}, ${b.stars.length}, ${pos})
      ON CONFLICT (driver_id, week) DO UPDATE SET
        score=EXCLUDED.score, deliveries=EXCLUDED.deliveries, positive_reviews=EXCLUDED.positive_reviews
    `;
    scoreCount++;
  }

  console.log("💾 Writing reviews...");
  let reviewCount = 0, skipped = 0;
  const seenDrivers = new Set();

  // Build the full list of reviews first so we can dedup by (driver_id, week) before inserting
  const reviewsToInsert = [];
  for (const row of rydeRows) {
    const { name, fedexId } = parseResource(row.resource ?? "");
    const ourId = resolveDriver(fedexId) ?? (byName[normName(name)] ?? null);
    if (!ourId) { skipped++; console.log(`  Skipped: ${row.resource}`); continue; }
    seenDrivers.add(row.resource);
    const star = parseInt(row.star, 10);
    const why  = (row.why || row.comments || "").trim();
    const rawDate = row.survey_date || row.delv_date;
    const week = rawDate ? dateToWeekStr(rawDate) : "unknown";
    const type = star >= 4 ? "positive" : "negative";
    const category = type === "positive" ? "positive_feedback" : (row.problem?.trim() || "general");
    const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const customerInitials = ALPHA[Math.floor(Math.random()*26)] + ALPHA[Math.floor(Math.random()*26)];
    const trackId = row.trackId ?? null;
    reviewsToInsert.push({ ourId, type, star, category, content: why || category, week, customerInitials, trackId });
  }

  // Insert with ON CONFLICT (track_id) DO NOTHING — track_id is the natural dedup key.
  // If a row's tracking number is already in the DB it's skipped. Truly new reviews are inserted.
  // Manually-added reviews (no track_id, source=null) are never affected.
  for (const r of reviewsToInsert) {
    const result = await sql`
      INSERT INTO ryde_reviews (driver_id, type, stars, category, content, week, at_fault, customer_initials, source, track_id)
      VALUES (${r.ourId}, ${r.type}, ${r.star}, ${r.category}, ${r.content}, ${r.week}, false, ${r.customerInitials}, 'spotlight', ${r.trackId})
      ON CONFLICT (track_id) WHERE track_id IS NOT NULL DO NOTHING
    `;
    if (result.count > 0) reviewCount++;
  }

  console.log("\n✅ Done!");
  console.log(`   Weeks  : ${[...weeksSeen].sort().join(", ")}`);
  console.log(`   Scores : ${scoreCount} upserted`);
  console.log(`   Reviews: ${reviewCount} inserted`);
  if (skipped) console.log(`   Skipped: ${skipped} unmatched drivers`);
  console.log("\n   Drivers matched:");
  for (const r of seenDrivers) console.log(`     ✓ ${r}`);

  console.log("\n🎉 Done\n");

} catch (err) {
  await browser.close().catch(() => {});
  console.error("\n❌", err.message);
  process.exit(1);
}
