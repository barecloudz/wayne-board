/**
 * DRO (dro.routesmart.com) API explorer.
 * Logs in with provided credentials, navigates the app, and records
 * all network requests/responses so we can map the full API surface.
 *
 * Run: node scripts/inspect-dro.mjs
 * Output: scripts/dro-api-calls.json
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USERNAME = "6367044";
const PASSWORD = "LightningZeus#4";
const BASE_URL = "https://dro.routesmart.com";
const OUTPUT   = path.join(__dirname, "dro-api-calls.json");

const captured = [];

function shouldCapture(url) {
  // Only record calls to the DRO API, skip static assets
  return url.includes("routesmart.com") && !url.match(/\.(js|css|png|jpg|svg|woff|ico)(\?|$)/);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-notifications",
      "--disable-infobars",
      "--disable-features=WebBluetooth,WebUSB,WebNFC",
    ],
  });

  const context = browser.defaultBrowserContext();
  // Auto-grant or deny permission prompts so they don't block the script
  await context.overridePermissions("https://dro.routesmart.com", []);

  const page = await browser.newPage();

  // Auto-dismiss any JS alert/confirm/prompt dialogs
  page.on("dialog", async (dialog) => {
    console.log("Dialog dismissed:", dialog.type(), dialog.message().slice(0, 100));
    await dialog.dismiss();
  });

  // Intercept all network responses
  page.on("response", async (response) => {
    const url = response.url();
    if (!shouldCapture(url)) return;

    const method  = response.request().method();
    const status  = response.status();
    const reqBody = response.request().postData() || null;

    let body = null;
    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json")) {
        body = await response.json();
      }
    } catch {}

    const entry = { method, url, status, reqBody, body };
    captured.push(entry);
    console.log(`[${method}] ${status} ${url}`);
    if (body && typeof body === "object") {
      console.log("  →", JSON.stringify(body).slice(0, 200));
    }
  });

  // ── Step 1: Load login page ────────────────────────────────────────────────
  console.log("\n=== Navigating to DRO login page ===");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000));

  // Dump what's on the page
  const title = await page.title();
  console.log("Page title:", title);

  // Take a screenshot of the login page
  await page.screenshot({ path: path.join(__dirname, "dro-ss-login.png"), fullPage: true });
  console.log("Screenshot saved: dro-ss-login.png");

  // ── Step 1b: Click "Service Provider" — this opens an Okta popup window ──
  console.log("\n=== Clicking Service Provider ===");

  // Listen for the popup before clicking
  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));

  const spSelectors = [
    'button::-p-text(Service Provider)',
    '[class*="service" i]',
    'div::-p-text(Service Provider)',
    'span::-p-text(Service Provider)',
    'a::-p-text(Service Provider)',
  ];
  let clicked = false;
  for (const sel of spSelectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click(); console.log("Clicked:", sel); clicked = true; break; }
    } catch {}
  }
  if (!clicked) {
    const [el] = await page.$x('//*[contains(translate(text(),"abcdefghijklmnopqrstuvwxyz","ABCDEFGHIJKLMNOPQRSTUVWXYZ"),"SERVICE PROVIDER")]');
    if (el) { await el.click(); console.log("Clicked via XPath"); clicked = true; }
  }
  if (!clicked) console.log("⚠️  Service Provider button not found");

  // ── Step 2: Switch to the Okta popup window ────────────────────────────────
  console.log("Waiting for Okta popup...");
  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  console.log("Popup URL:", popup.url());

  // Auto-dismiss JS dialogs in the popup too
  popup.on("dialog", async (dialog) => {
    console.log("Popup dialog dismissed:", dialog.message().slice(0, 100));
    await dialog.dismiss();
  });

  // ── Step 2b: Dismiss the "Access other apps and devices" Chrome dialog ─────
  // This appears as an in-page element with Allow/Block buttons
  console.log("Looking for permission dialog (Block button)...");
  await new Promise(r => setTimeout(r, 2000));
  try {
    // Try clicking Block button
    const blockBtn = await popup.waitForSelector(
      'button::-p-text(Block), [aria-label*="Block" i]',
      { timeout: 5000 }
    );
    if (blockBtn) { await blockBtn.click(); console.log("Clicked Block on permission dialog"); }
  } catch {
    console.log("No Block button found — permission dialog may not have appeared");
  }
  await new Promise(r => setTimeout(r, 1000));
  await popup.screenshot({ path: path.join(__dirname, "dro-ss-after-sp.png") });

  // ── Step 3: Fill username in the Okta popup ────────────────────────────────
  console.log("\n=== Filling username in Okta popup ===");
  try {
    await popup.waitForSelector('input[name="identifier"], input[name="username"], input[type="text"]', { timeout: 10000 });
  } catch { console.log("Timed out waiting for username field"); }

  const inputs = await popup.evaluate(() =>
    [...document.querySelectorAll("input")].map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder }))
  );
  console.log("Popup inputs:", JSON.stringify(inputs, null, 2));

  const usernameSelectors = ['input[name="identifier"]', 'input[name="username"]', 'input[type="text"]'];
  let usernameEl = null;
  for (const sel of usernameSelectors) {
    usernameEl = await popup.$(sel);
    if (usernameEl) { console.log("Username field:", sel); break; }
  }

  if (usernameEl) {
    await usernameEl.click({ clickCount: 3 });
    await usernameEl.type(USERNAME);
    await popup.screenshot({ path: path.join(__dirname, "dro-ss-username-filled.png") });

    // Click Next button
    const nextBtn = await popup.$('input[value="Next"], button::-p-text(Next), [data-type="save"]');
    if (nextBtn) { await nextBtn.click(); console.log("Clicked Next"); }
    else { await popup.keyboard.press("Enter"); console.log("Pressed Enter"); }
  } else {
    console.log("⚠️  Username field not found in popup");
  }

  // ── Step 4: Wait for password field ───────────────────────────────────────
  console.log("\n=== Waiting for password field ===");
  try {
    await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
    console.log("Password field appeared");
  } catch { console.log("Timed out waiting for password field"); }

  const passwordEl = await popup.$('input[type="password"]');
  if (passwordEl) {
    await passwordEl.click({ clickCount: 3 });
    await passwordEl.type(PASSWORD);
    await popup.screenshot({ path: path.join(__dirname, "dro-ss-password-filled.png") });

    const verifyBtn = await popup.$('input[value="Verify"], button::-p-text(Verify), button[type="submit"]');
    if (verifyBtn) { await verifyBtn.click(); console.log("Clicked Verify/Submit"); }
    else { await popup.keyboard.press("Enter"); console.log("Pressed Enter"); }
  } else {
    console.log("⚠️  Password field not found");
  }

  // ── Step 3: Wait for post-login redirect back to DRO ─────────────────────
  console.log("\n=== Waiting for post-login redirect ===");
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-after-login.png"), fullPage: true });
  console.log("Main page URL:", page.url());
  console.log("Popup URL:", popup.url());

  // ── Step 4: Select station ─────────────────────────────────────────────────
  console.log("\n=== Looking for station selector ===");
  // Station selection may be on the main page or popup — check both
  for (const p of [page, popup]) {
    try {
      const url = p.url();
      if (!url || url === "about:blank") continue;
      const text = await p.evaluate(() => document.body?.innerText?.slice(0, 500));
      console.log(`[${url.slice(0, 60)}] page text preview:`, text?.slice(0, 200));
    } catch {}
  }

  // Try to find and click the station on the main page
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-station-select.png"), fullPage: true });

  // Look for station cards/buttons/links — they're often a list of clickable items
  const stationSelectors = [
    '[class*="station" i]',
    '[class*="location" i]',
    '[data-testid*="station" i]',
    'li button', 'ul li', '.card', '[role="listitem"]',
  ];
  let stationClicked = false;
  for (const sel of stationSelectors) {
    const els = await page.$$(sel);
    if (els.length > 0) {
      console.log(`Found ${els.length} element(s) matching "${sel}" — clicking first`);
      await els[0].click();
      stationClicked = true;
      break;
    }
  }
  if (!stationClicked) console.log("⚠️  Station selector not found — may need manual click");

  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-main-dashboard.png"), fullPage: true });
  console.log("After station select URL:", page.url());

  // ── Step 5: Dump nav structure ─────────────────────────────────────────────
  console.log("\n=== Navigation items ===");
  const navLinks = await page.evaluate(() =>
    [...document.querySelectorAll("a, [role='menuitem'], nav button, [class*='nav' i] button")].map(el => ({
      text: el.textContent?.trim().slice(0, 60),
      href: el.href || null,
    })).filter(l => l.text)
  );
  navLinks.forEach(l => console.log(" -", l.text, l.href ? `(${l.href})` : ""));

  // ── Step 6: Click CSV button next to "Route Summary" ─────────────────────
  console.log("\n=== Looking for Route Summary CSV button ===");
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: __dirname });

  // The CSV icon is near the "ROUTE SUMMARY" heading — find it by proximity
  const csvClicked = await page.evaluate(() => {
    // Find any element with "csv" in class/title/aria near Route Summary
    const candidates = [...document.querySelectorAll('[title*="CSV" i], [aria-label*="CSV" i], [class*="csv" i], img[src*="csv" i]')];
    if (candidates.length > 0) { candidates[0].click(); return candidates[0].outerHTML.slice(0, 100); }
    // Fallback: find the Route Summary heading, then click nearby buttons/icons
    const heading = [...document.querySelectorAll('*')].find(el => el.textContent?.trim() === 'ROUTE SUMMARY');
    if (heading) {
      const parent = heading.closest('div, section, header') || heading.parentElement;
      const btn = parent?.querySelector('button, a, [role="button"], svg');
      if (btn) { btn.click(); return btn.outerHTML.slice(0, 100); }
    }
    return null;
  });
  console.log("CSV click result:", csvClicked);
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-after-csv.png"), fullPage: true });

  // ── Step 7: Explore nav sections ──────────────────────────────────────────
  console.log("\n=== Exploring nav sections ===");

  async function clickNav(label) {
    const found = await page.evaluate((text) => {
      const all = [...document.querySelectorAll("a, button, li, [role='menuitem'], [role='button'], nav *, aside *")];
      const match = all.find(el => {
        const t = el.innerText?.trim().toUpperCase() || el.textContent?.trim().toUpperCase() || "";
        return t === text || t.startsWith(text);
      });
      if (match) { match.click(); return match.innerText?.trim() || match.textContent?.trim(); }
      return null;
    }, label.toUpperCase());
    if (found) console.log(`Clicked nav: "${found}"`);
    else console.log(`⚠️  Nav item not found: "${label}"`);
    return !!found;
  }

  // Go to MAP
  await clickNav("MAP");
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-map.png"), fullPage: true });
  console.log("Map URL:", page.url());

  // Try clicking on a route in the map sidebar
  const routeClicked = await page.evaluate(() => {
    const items = [...document.querySelectorAll("[class*='route' i], [class*='work-area' i], [class*='workarea' i], li, [role='listitem']")];
    const route = items.find(el => el.innerText?.includes("742") || el.textContent?.includes("742"));
    if (route) { route.click(); return route.innerText?.trim().slice(0, 80); }
    return null;
  });
  console.log("Route clicked:", routeClicked);
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-map-route.png"), fullPage: true });

  // Go to REPORT
  await clickNav("REPORT");
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-report.png"), fullPage: true });
  console.log("Report URL:", page.url());

  // Go back to Dashboard to try ROUTE PLANS
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 3000));
  await clickNav("ROUTE PLANS");
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(__dirname, "dro-ss-routeplans.png"), fullPage: true });

  await new Promise(r => setTimeout(r, 2000));

  // ── Step 5: Save results ───────────────────────────────────────────────────
  fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
  console.log(`\n✅ Captured ${captured.length} API calls → ${OUTPUT}`);

  // Keep browser open for manual exploration
  console.log("\nBrowser staying open for 60s — explore manually if needed.");
  await new Promise(r => setTimeout(r, 60000));

  await browser.close();
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
