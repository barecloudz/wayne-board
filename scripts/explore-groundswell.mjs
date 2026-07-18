/**
 * GroundSwell deep exploration.
 * Clicks actual sidebar buttons, Import from LIVE, and individual route items.
 * Appends to groundswell-api-calls.json
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL  = "https://groundswell.risingtide.us";
const OUTPUT    = path.join(__dirname, "groundswell-api-calls.json");

const EMAIL    = "bnardoni87@gmail.com";
const PASSWORD = "LightningZeus#4";

// Load existing calls
let captured = [];
try { captured = JSON.parse(fs.readFileSync(OUTPUT, "utf8")); } catch {}
console.log(`Loaded ${captured.length} existing calls`);

function shouldCapture(url) {
  return (
    !url.match(/\.(js|css|png|jpg|svg|woff|ico|webp|gif)(\?|$)/) &&
    !url.includes("openstreetmap.org") &&
    !url.includes("tile.") &&
    !url.includes("browser-intake-datadoghq") &&
    !url.includes("userguiding.com") &&
    !url.includes("events.mapbox.com") &&
    !url.includes("auth0") &&
    !url.includes("auth.risingtide.us")
  );
}

function save() {
  fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
}

function attachListener(page) {
  page.on("response", async (response) => {
    const url = response.url();
    if (!shouldCapture(url)) return;

    const method  = response.request().method();
    const status  = response.status();
    const reqBody = response.request().postData() || null;
    const resHdrs = response.headers();

    let body = null;
    try {
      const ct = resHdrs["content-type"] || "";
      if (ct.includes("json")) body = await response.json();
    } catch {}

    // Parse GraphQL operation name
    let opName = "";
    if (url.includes("graphql") && reqBody) {
      try { opName = JSON.parse(reqBody).operationName || ""; } catch {}
    }

    const entry = { method, url: url.replace(BASE_URL, ""), status, reqBody, body, opName, ts: new Date().toISOString() };
    captured.push(entry);

    const isWrite = ["POST","PUT","PATCH","DELETE"].includes(method);
    const tag     = isWrite ? "🔴 WRITE" : "     GET";
    const label   = opName ? `[GQL:${opName}]` : entry.url.slice(0, 80);
    console.log(`${tag} [${status}] ${label}`);
    if (body?.data) {
      const keys = Object.keys(body.data);
      console.log("       data:", keys.join(", "));
    }
    save();
  });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, name) {
  const p = path.join(__dirname, `gs-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 gs-${name}.png`);
}

async function login(page, browser) {
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await wait(2000);

  try {
    await page.waitForSelector('input#username, input[name="username"]', { timeout: 8000 });
    const sel = await page.$('input#username') ? 'input#username' : 'input[name="username"]';
    await page.type(sel, EMAIL, { delay: 30 });
    const continueBtn = await page.$('button[type="submit"]');
    if (continueBtn) await continueBtn.click(); else await page.keyboard.press("Enter");
    await wait(2000);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.type('input[type="password"]', PASSWORD, { delay: 30 });
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click(); else await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await wait(3000);
    console.log("✅ Logged in. URL:", page.url());
  } catch (e) {
    console.log("Login error:", e.message);
    await screenshot(page, "login-error");
  }
}

async function run() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  browser.on("targetcreated", async (target) => {
    const p = await target.page().catch(() => null);
    if (p) { attachListener(p); p.on("dialog", async d => { try { await d.dismiss(); } catch {} }); }
  });

  attachListener(page);

  await login(page, browser);
  await screenshot(page, "explore-start");

  // ── Click all sidebar nav buttons ─────────────────────────────────────────
  const sidebarSections = ["Schedule", "Fleet", "Personnel", "Addresses", "Geofences"];

  for (const label of sidebarSections) {
    console.log(`\n→ Clicking "${label}" in sidebar...`);
    try {
      // Find button/link with matching text
      const els = await page.$$('button, a, [role="button"]');
      let found = false;
      for (const el of els) {
        const text = await el.evaluate(e => e.textContent?.trim() || "");
        if (text === label || text.includes(label)) {
          await el.click();
          found = true;
          console.log(`  Clicked "${text}"`);
          break;
        }
      }
      if (!found) {
        // Try newer XPath API
        try {
          const xEl = await page.$(`xpath//*//*[contains(text(),"${label}")]`);
          if (xEl) { await xEl.click(); found = true; console.log(`  Clicked via XPath`); }
        } catch {}
      }
      if (!found) console.log(`  ✗ "${label}" not found`);
      await wait(4000);
      await screenshot(page, `nav-${label.toLowerCase()}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // ── Back to dashboard ──────────────────────────────────────────────────────
  console.log("\n→ Back to dashboard...");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
  await wait(4000);
  await screenshot(page, "dashboard-fresh");

  // ── Click "Import from LIVE" button ───────────────────────────────────────
  console.log("\n→ Clicking Import from LIVE...");
  try {
    const importEls = await page.$$('xpath//.//*[contains(text(),"Import") or contains(text(),"LIVE")]');
    if (importEls.length) {
      console.log("  Found", importEls.length, "import elements");
      await importEls[0].click();
      await wait(5000);
      await screenshot(page, "after-import-click");
      // Close modal if any
      await page.keyboard.press("Escape");
      await wait(1000);
    } else {
      console.log("  Import button not found");
    }
  } catch (e) { console.log("  Error:", e.message); }

  // ── Click individual route cards ───────────────────────────────────────────
  console.log("\n→ Clicking route items to see stop data...");
  const routeCards = await page.$$('[class*="route"], [class*="Route"], [data-testid*="route"]');
  console.log(`  Found ${routeCards.length} route-like elements`);
  for (let i = 0; i < Math.min(routeCards.length, 3); i++) {
    try {
      await routeCards[i].click();
      await wait(3000);
      await screenshot(page, `route-detail-${i}`);
      await page.keyboard.press("Escape");
      await wait(1000);
    } catch {}
  }

  // ── Look for anchor area / geofence management ─────────────────────────────
  console.log("\n→ Looking for Geofences section...");
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
    await wait(2000);
    const geoEls = await page.$$('xpath//.//*[contains(text(),"Geofence") or contains(text(),"geofence") or contains(text(),"Anchor")]');
    if (geoEls.length) {
      await geoEls[0].click();
      await wait(4000);
      await screenshot(page, "geofences");
    }
  } catch (e) { console.log("  Geofence error:", e.message); }

  // ── Try settings/config ────────────────────────────────────────────────────
  console.log("\n→ Looking for settings gear...");
  try {
    const settingsBtn = await page.$('[aria-label*="setting" i], button[title*="setting" i], .settings-btn');
    if (!settingsBtn) {
      // Try gear icon button
      const btns = await page.$$('button');
      for (const btn of btns) {
        const ariaLabel = await btn.evaluate(e => (e.getAttribute('aria-label') || e.getAttribute('title') || '').toLowerCase());
        if (ariaLabel.includes('setting') || ariaLabel.includes('config') || ariaLabel.includes('gear')) {
          await btn.click();
          await wait(3000);
          await screenshot(page, "settings");
          break;
        }
      }
    }
  } catch (e) { console.log("  Settings error:", e.message); }

  save();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Total captured: ${captured.length} API calls`);
  console.log("Browser staying open for manual exploration...\n");

  await new Promise(resolve => {
    const iv = setInterval(() => {
      save();
      console.log(`[auto-save] ${captured.length} calls`);
    }, 15000);
    browser.on("disconnected", () => { clearInterval(iv); resolve(); });
  });

  save();
  console.log("Done.");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
