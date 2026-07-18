/**
 * Deep GroundSwell recon.
 * Logs in, intercepts ALL network traffic including XHR/fetch with full headers,
 * clicks every interactive element, captures all GraphQL mutations and REST writes.
 * Auth token is captured and saved so we can replay calls later.
 * Output: scripts/groundswell-deep.json
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL  = "https://groundswell.risingtide.us";
const API_BASE  = "https://api.risingtide.us";
const OUTPUT    = path.join(__dirname, "groundswell-deep.json");

const EMAIL    = "bnardoni87@gmail.com";
const PASSWORD = "LightningZeus#4";

const captured = { calls: [], bearerToken: null, cookies: null };

function shouldCapture(url) {
  return (
    !url.match(/\.(js|css|png|jpg|svg|woff|ico|webp|gif|glb)(\?|$)/) &&
    !url.includes("browser-intake-datadoghq") &&
    !url.includes("userguiding.com") &&
    !url.includes("events.mapbox.com") &&
    !url.includes("sentry.io") &&
    !url.includes("fonts.google") &&
    !url.includes("fonts.gstatic") &&
    !url.includes("atlassian.net") &&
    !url.includes("auth.risingtide.us") // skip auth0 internal
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
    const reqHdrs = response.request().headers();
    const resHdrs = response.headers();

    // Capture bearer token from any request
    if (reqHdrs.authorization && reqHdrs.authorization.startsWith("Bearer ")) {
      const token = reqHdrs.authorization;
      if (captured.bearerToken !== token) {
        captured.bearerToken = token;
        console.log("🔑 Bearer token captured!");
        save();
      }
    }

    let body = null;
    try {
      const ct = resHdrs["content-type"] || "";
      if (ct.includes("json")) body = await response.json();
    } catch {}

    // Parse GraphQL op name
    let opName = "";
    if (url.includes("graphql") && reqBody) {
      try {
        const parsed = JSON.parse(reqBody);
        opName = parsed.operationName || "";
      } catch {}
    }

    const isWrite = ["POST","PUT","PATCH","DELETE"].includes(method);
    const isInteresting = isWrite || url.includes("api.risingtide.us") || url.includes("copilotkit");

    const entry = {
      method, url: url.replace(BASE_URL, "").replace(API_BASE, "[API]"),
      status, reqBody, body, opName,
      reqHdrs: isWrite ? reqHdrs : undefined,
      ts: new Date().toISOString(),
    };
    captured.calls.push(entry);

    const tag = isWrite ? "🔴 WRITE" : "     GET";
    const label = opName ? `[GQL:${opName}]` : entry.url.slice(0, 90);
    console.log(`${tag} [${status}] ${label}`);
    if (body?.data && opName) {
      console.log("       data keys:", Object.keys(body.data).join(", "));
    }
    if (isWrite && reqBody) {
      const preview = reqBody.slice(0, 200);
      console.log("       req:", preview);
    }
    if (isWrite || status >= 400) save();
  });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ss(page, name) {
  const p = path.join(__dirname, `gd-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 gd-${name}.png`);
}

async function clickText(page, text, timeout = 3000) {
  try {
    const el = await page.waitForSelector(`xpath//.//*[normalize-space(text())="${text}"]`, { timeout });
    if (el) { await el.click(); return true; }
  } catch {}
  try {
    // looser match
    const el = await page.$(`xpath//.//*[contains(text(),"${text}")]`);
    if (el) { await el.click(); return true; }
  } catch {}
  return false;
}

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await wait(2000);

  try {
    await page.waitForSelector('input#username', { timeout: 8000 });
    await page.type('input#username', EMAIL, { delay: 30 });
    await page.click('button[type="submit"]');
    await wait(1500);
    await page.waitForSelector('input[type="password"]', { timeout: 8000 });
    await page.type('input[type="password"]', PASSWORD, { delay: 30 });
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await wait(3000);
    console.log("✅ Logged in:", page.url());

    // Save cookies
    const cookies = await page.cookies();
    captured.cookies = cookies;
    save();
  } catch (e) {
    console.log("Login error:", e.message);
    await ss(page, "login-error");
  }
}

async function run() {
  console.log("Launching browser with CDP...");
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true, // Opens DevTools automatically
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  browser.on("targetcreated", async (target) => {
    const p = await target.page().catch(() => null);
    if (p) { attachListener(p); p.on("dialog", async d => { try { await d.dismiss(); } catch {} }); }
  });

  attachListener(page);

  await login(page);

  // ── Explore every sidebar section ─────────────────────────────────────────
  console.log("\n=== EXPLORING SIDEBAR SECTIONS ===");
  await wait(3000);
  await ss(page, "dashboard");

  // ── Try "Import from LIVE" ─────────────────────────────────────────────────
  console.log("\n→ Clicking Import from LIVE...");
  await wait(2000);
  const importBtn = await page.$('[class*="import" i], button');
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = await btn.evaluate(e => e.textContent?.trim() || "");
    if (text.includes("Import") || text.includes("LIVE")) {
      console.log(`  Found button: "${text}"`);
      await btn.click();
      await wait(4000);
      await ss(page, "after-import");
      // Look for confirmation button
      const confirmBtns = await page.$$('button');
      for (const cb of confirmBtns) {
        const ct = await cb.evaluate(e => e.textContent?.trim() || "");
        if (ct.match(/confirm|yes|import|proceed|run/i)) {
          console.log(`  Clicking confirmation: "${ct}"`);
          await cb.click();
          await wait(5000);
          await ss(page, "import-confirmed");
          break;
        }
      }
      await page.keyboard.press("Escape");
      await wait(1000);
      break;
    }
  }

  // ── Fleet section ──────────────────────────────────────────────────────────
  console.log("\n→ Fleet section...");
  if (await clickText(page, "Fleet")) {
    await wait(4000);
    await ss(page, "fleet");

    // Try clicking a vehicle to see details
    const rows = await page.$$('tr, [class*="row"]');
    console.log(`  Found ${rows.length} rows`);
    for (let i = 1; i < Math.min(rows.length, 4); i++) {
      try {
        await rows[i].click();
        await wait(3000);
        await ss(page, `fleet-detail-${i}`);
        await page.keyboard.press("Escape");
        await wait(1000);
      } catch {}
    }

    // Try "Add from DRO" button
    const addDroBtn = await page.$('xpath//.//*[contains(text(),"Add from DRO")]');
    if (addDroBtn) {
      console.log("  Clicking Add from DRO...");
      await addDroBtn.click();
      await wait(4000);
      await ss(page, "fleet-add-from-dro");
      await page.keyboard.press("Escape");
      await wait(1000);
    }

    // Try "Edit" pencil icons
    const editBtns = await page.$$('[class*="edit" i] button, button[title*="edit" i], [aria-label*="edit" i]');
    if (editBtns.length > 0) {
      console.log(`  Clicking first edit button (${editBtns.length} found)...`);
      await editBtns[0].click();
      await wait(3000);
      await ss(page, "fleet-edit");
      await page.keyboard.press("Escape");
    }
  }

  // ── Personnel section ──────────────────────────────────────────────────────
  console.log("\n→ Personnel section...");
  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle2" }).catch(() => {});
  await wait(2000);
  if (await clickText(page, "Personnel")) {
    await wait(4000);
    await ss(page, "personnel");

    // Click a person to see their data
    const rows = await page.$$('tr');
    for (let i = 1; i < Math.min(rows.length, 3); i++) {
      try {
        await rows[i].click();
        await wait(2000);
        await ss(page, `personnel-detail-${i}`);
        await page.keyboard.press("Escape");
        await wait(1000);
      } catch {}
    }
  }

  // ── Addresses section ──────────────────────────────────────────────────────
  console.log("\n→ Addresses section...");
  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle2" }).catch(() => {});
  await wait(2000);
  if (await clickText(page, "Addresses")) {
    await wait(4000);
    await ss(page, "addresses");
  }

  // ── Geofences section ─────────────────────────────────────────────────────
  console.log("\n→ Geofences section...");
  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle2" }).catch(() => {});
  await wait(2000);
  if (await clickText(page, "Geofences")) {
    await wait(4000);
    await ss(page, "geofences");
    // Click a geofence to see edit UI
    const rows = await page.$$('tr, li');
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      try {
        await rows[i].click();
        await wait(2000);
        await ss(page, `geofence-detail-${i}`);
        await page.keyboard.press("Escape");
        await wait(500);
      } catch {}
    }
  }

  // ── Back to dashboard — interact with route items ─────────────────────────
  console.log("\n→ Back to dashboard — clicking route cards...");
  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle2" }).catch(() => {});
  await wait(5000);
  await ss(page, "dashboard-final");

  // Look for route list items (route cards in sidebar or on map)
  const routeItems = await page.$$('[class*="route" i][class*="item" i], [data-route-id], [class*="RouteCard" i]');
  console.log(`Found ${routeItems.length} route items`);
  for (let i = 0; i < Math.min(routeItems.length, 3); i++) {
    try {
      await routeItems[i].click();
      await wait(3000);
      await ss(page, `route-click-${i}`);
      await page.keyboard.press("Escape");
      await wait(1000);
    } catch {}
  }

  // ── Click the gear/settings icon ─────────────────────────────────────────
  console.log("\n→ Settings...");
  const settingsBtns = await page.$$('button');
  for (const btn of settingsBtns) {
    const label = await btn.evaluate(e => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').toLowerCase());
    if (label.includes('setting') || label.includes('config')) {
      await btn.click();
      await wait(3000);
      await ss(page, "settings");
      break;
    }
  }

  // ── CoPilotKit AI assistant ───────────────────────────────────────────────
  console.log("\n→ Looking for AI assistant...");
  const aiEls = await page.$$('xpath//.//*[contains(text(),"GroundSwell Assistant") or contains(text(),"Copilot") or contains(text(),"AI")]');
  console.log(`Found ${aiEls.length} AI elements`);
  if (aiEls.length > 0) {
    await aiEls[0].click();
    await wait(2000);
    await ss(page, "ai-assistant");

    // Try typing a question
    const aiInput = await page.$('input[placeholder*="route" i], input[placeholder*="ask" i], textarea[placeholder*="ask" i]');
    if (aiInput) {
      await aiInput.type("How many routes do we have today and what is the estimated completion time?", { delay: 20 });
      await page.keyboard.press("Enter");
      await wait(8000);
      await ss(page, "ai-response");
    }
  }

  save();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Total: ${captured.calls.length} API calls`);
  console.log(`Bearer token: ${captured.bearerToken ? "CAPTURED" : "not found"}`);
  console.log(`Output: ${OUTPUT}`);
  console.log("\nBrowser staying open — explore manually, auto-saves every 15s\n");

  await new Promise(resolve => {
    const iv = setInterval(() => {
      save();
      console.log(`[auto-save] ${captured.calls.length} calls, token: ${captured.bearerToken ? "yes" : "no"}`);
    }, 15000);
    browser.on("disconnected", () => { clearInterval(iv); resolve(); });
  });

  save();
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
