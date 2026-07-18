/**
 * GroundSwell API watcher.
 * Logs in, navigates all major sections, captures every API call.
 * Output: scripts/groundswell-api-calls.json
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

const captured = [];

function shouldCapture(url) {
  // Skip static assets, tiles, analytics
  return (
    !url.match(/\.(js|css|png|jpg|svg|woff|ico|webp|gif)(\?|$)/) &&
    !url.includes("openstreetmap.org") &&
    !url.includes("tile.") &&
    !url.includes("analytics") &&
    !url.includes("sentry") &&
    !url.includes("hotjar") &&
    !url.includes("intercom")
  );
}

function save() {
  fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
}

function attachListener(page) {
  page.on("response", async (response) => {
    const url    = response.url();
    if (!shouldCapture(url)) return;

    const method  = response.request().method();
    const status  = response.status();
    const reqBody = response.request().postData() || null;
    const reqHdrs = response.request().headers();
    const resHdrs = response.headers();

    let body = null;
    try {
      const ct = resHdrs["content-type"] || "";
      if (ct.includes("json")) body = await response.json();
    } catch {}

    const entry = {
      method,
      url: url.replace(BASE_URL, ""),
      status,
      reqBody,
      body,
      ts: new Date().toISOString(),
    };
    captured.push(entry);

    const isWrite = ["POST","PUT","PATCH","DELETE"].includes(method);
    const tag     = isWrite ? "🔴 WRITE" : "     GET";
    const bodyStr = Array.isArray(body)
      ? `array[${body.length}]`
      : body ? JSON.stringify(body).slice(0,120) : "";

    console.log(`${tag} [${status}] ${entry.url.slice(0, 100)}`);
    if (body && !Array.isArray(body) && typeof body === "object") {
      console.log("       keys:", Object.keys(body).join(", "));
    }
    if (isWrite) {
      if (reqBody) console.log("       req:", reqBody.slice(0, 300));
      if (bodyStr) console.log("       res:", bodyStr.slice(0, 300));
      save();
    }
  });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized", "--disable-features=WebBluetooth,WebUSB"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  browser.on("targetcreated", async (target) => {
    const p = await target.page().catch(() => null);
    if (p) { attachListener(p); p.on("dialog", async d => { try { await d.dismiss(); } catch {} }); }
  });

  attachListener(page);

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("\nNavigating to GroundSwell...");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await wait(2000);

  // Try to find and fill login form
  try {
    // Look for email input
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]', { timeout: 8000 });
    await page.type('input[type="email"], input[name="email"], input[placeholder*="email" i]', EMAIL);
    console.log("✓ Filled email");
  } catch {
    // Maybe it goes straight to a different auth flow
    console.log("Email field not found, looking for alternatives...");
    const inputs = await page.$$("input");
    console.log("Found", inputs.length, "inputs on page");
    const url = page.url();
    console.log("Current URL:", url);
  }

  try {
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    await page.type('input[type="password"]', PASSWORD);
    console.log("✓ Filled password");

    // Submit
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) await submitBtn.click();
    else await page.keyboard.press("Enter");
    console.log("✓ Submitted login");
  } catch {
    console.log("Password field not found yet");
  }

  // Wait for dashboard to load
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await wait(4000);

  console.log("Current URL after login:", page.url());
  console.log(`\n${"=".repeat(60)}`);
  console.log("Systematically navigating all sections...");
  console.log("=".repeat(60));

  // ── Navigate sections ──────────────────────────────────────────────────────
  const sections = [
    { name: "Dashboard / Map",    path: "/dashboard" },
    { name: "Schedule",            path: "/schedule" },
    { name: "Fleet",               path: "/fleet" },
  ];

  for (const section of sections) {
    try {
      console.log(`\n→ ${section.name}`);
      await page.goto(`${BASE_URL}${section.path}`, { waitUntil: "networkidle2", timeout: 15000 });
      await wait(4000);
      console.log(`  ✓ Loaded ${section.name} (${captured.length} calls so far)`);
      save();
    } catch (e) {
      console.log(`  ✗ ${section.name}: ${e.message}`);
    }
  }

  // ── Back to dashboard — interact with map controls ─────────────────────────
  console.log("\n→ Returning to dashboard for map interaction...");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
  await wait(5000);

  // Try clicking "I WANT TO" button
  try {
    const btn = await page.$x('//*[contains(text(),"I WANT TO") or contains(text(),"want to")]');
    if (btn.length) { await btn[0].click(); await wait(2000); console.log("✓ Clicked I WANT TO"); save(); }
  } catch {}

  // Try clicking Import / Re-dispatch options
  const clickTargets = [
    'Import from LIVE', 'Import', 'Re-dispatch', 'Export', 'Clear Plans',
  ];
  for (const label of clickTargets) {
    try {
      const el = await page.$x(`//*[contains(text(),"${label}")]`);
      if (el.length) {
        console.log(`→ Clicking "${label}"`);
        await el[0].click();
        await wait(3000);
        save();
        // Close any modal
        await page.keyboard.press("Escape");
        await wait(1000);
      }
    } catch {}
  }

  // Try clicking anchor icon / route plan controls
  console.log("\n→ Trying map toolbar buttons...");
  const toolbarBtns = await page.$$('button, [role="button"]');
  console.log(`  Found ${toolbarBtns.length} buttons on page`);

  // Click map toolbar items
  for (let i = 0; i < Math.min(toolbarBtns.length, 20); i++) {
    try {
      const text = await toolbarBtns[i].evaluate(el => el.textContent?.trim() || el.getAttribute("title") || el.getAttribute("aria-label") || "");
      if (text) {
        console.log(`  Button ${i}: "${text}"`);
      }
    } catch {}
  }

  save();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Captured ${captured.length} API calls → ${OUTPUT}`);
  console.log("Browser staying open for manual exploration...");
  console.log("Close the browser when done.\n");

  // Stay open for manual exploration
  await new Promise(resolve => {
    browser.on("disconnected", resolve);
    const iv = setInterval(() => {
      save();
      console.log(`[auto-save] ${captured.length} calls`);
    }, 15000);
    browser.on("disconnected", () => { clearInterval(iv); resolve(); });
  });

  save();
  console.log(`\n✅ Final: ${captured.length} API calls saved to ${OUTPUT}`);
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
