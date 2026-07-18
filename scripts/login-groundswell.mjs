/**
 * GroundSwell login + API capture script.
 * Auth0 flow: username first → Continue → password → Continue
 * Takes screenshots at each step for verification.
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
  return (
    !url.match(/\.(js|css|png|jpg|svg|woff|ico|webp|gif)(\?|$)/) &&
    !url.includes("openstreetmap.org") &&
    !url.includes("tile.") &&
    !url.includes("analytics") &&
    !url.includes("sentry") &&
    !url.includes("hotjar") &&
    !url.includes("intercom") &&
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

async function screenshot(page, name) {
  const p = path.join(__dirname, `gs-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 Screenshot: gs-${name}.png`);
  return p;
}

async function run() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-features=WebBluetooth,WebUSB"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  browser.on("targetcreated", async (target) => {
    const p = await target.page().catch(() => null);
    if (p) {
      attachListener(p);
      p.on("dialog", async d => { try { await d.dismiss(); } catch {} });
    }
  });

  attachListener(page);

  // ── Step 1: Navigate to GroundSwell ────────────────────────────────────────
  console.log("\n→ Navigating to GroundSwell...");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await wait(2000);
  console.log("  URL:", page.url());
  await screenshot(page, "01-initial");

  // ── Step 2: Fill username (Auth0) ──────────────────────────────────────────
  console.log("\n→ Looking for username field...");
  try {
    await page.waitForSelector('input#username, input[name="username"], input[type="email"]', { timeout: 10000 });
    const sel = await page.$('input#username') ? 'input#username'
              : await page.$('input[name="username"]') ? 'input[name="username"]'
              : 'input[type="email"]';
    console.log("  Found input:", sel);
    await page.click(sel);
    await page.type(sel, EMAIL, { delay: 50 });
    console.log("  ✓ Entered email");
    await screenshot(page, "02-username-filled");
  } catch (e) {
    console.log("  ✗ Username field not found:", e.message);
    await screenshot(page, "02-no-username");
  }

  // ── Step 3: Click Continue ─────────────────────────────────────────────────
  console.log("\n→ Clicking Continue...");
  try {
    // Try various button selectors
    const continueBtn = await page.$('button[type="submit"], button[data-action-button-primary="true"], button::-p-text(Continue)');
    if (continueBtn) {
      await continueBtn.click();
      console.log("  ✓ Clicked Continue");
    } else {
      await page.keyboard.press("Enter");
      console.log("  ✓ Pressed Enter");
    }
    await wait(2000);
    await screenshot(page, "03-after-continue");
    console.log("  URL after continue:", page.url());
  } catch (e) {
    console.log("  ✗ Continue failed:", e.message);
  }

  // ── Step 4: Fill password ──────────────────────────────────────────────────
  console.log("\n→ Looking for password field...");
  try {
    await page.waitForSelector('input[type="password"], input#password', { timeout: 8000 });
    const pwSel = await page.$('input#password') ? 'input#password' : 'input[type="password"]';
    console.log("  Found password input:", pwSel);
    await page.click(pwSel);
    await page.type(pwSel, PASSWORD, { delay: 50 });
    console.log("  ✓ Entered password");
    await screenshot(page, "04-password-filled");
  } catch (e) {
    console.log("  ✗ Password field not found:", e.message);
    await screenshot(page, "04-no-password");
  }

  // ── Step 5: Submit login ───────────────────────────────────────────────────
  console.log("\n→ Submitting login...");
  try {
    const submitBtn = await page.$('button[type="submit"], button[data-action-button-primary="true"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log("  ✓ Clicked submit");
    } else {
      await page.keyboard.press("Enter");
      console.log("  ✓ Pressed Enter");
    }
  } catch (e) {
    console.log("  ✗ Submit failed:", e.message);
  }

  // ── Step 6: Wait for redirect to app ──────────────────────────────────────
  console.log("\n→ Waiting for app to load...");
  try {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 });
  } catch {}
  await wait(4000);
  console.log("  URL after login:", page.url());
  await screenshot(page, "05-after-login");

  // Check if we're on the app
  const currentUrl = page.url();
  if (currentUrl.includes("groundswell.risingtide.us") || currentUrl.includes("risingtide.us/app")) {
    console.log("  ✅ Successfully logged in!");
  } else {
    console.log("  ⚠️  Still on auth page, may need more steps");
    await screenshot(page, "05b-still-auth");
  }

  save();

  // ── Step 7: Navigate all sections ─────────────────────────────────────────
  const sections = [
    { name: "Dashboard",   path: "/dashboard" },
    { name: "Schedule",    path: "/schedule" },
    { name: "Fleet",       path: "/fleet" },
    { name: "Routes",      path: "/routes" },
    { name: "Manifests",   path: "/manifests" },
    { name: "Reports",     path: "/reports" },
    { name: "Operations",  path: "/operations" },
    { name: "Settings",    path: "/settings" },
  ];

  console.log(`\n${"=".repeat(60)}`);
  console.log("Navigating all sections...");
  console.log("=".repeat(60));

  for (const section of sections) {
    try {
      console.log(`\n→ ${section.name}`);
      await page.goto(`${BASE_URL}${section.path}`, { waitUntil: "networkidle2", timeout: 15000 });
      await wait(3000);
      await screenshot(page, `section-${section.name.toLowerCase()}`);
      console.log(`  ✓ Loaded (${captured.length} API calls so far)`);
      save();
    } catch (e) {
      console.log(`  ✗ ${section.name}: ${e.message}`);
    }
  }

  // ── Step 8: Try clicking common interactive elements ───────────────────────
  console.log("\n→ Back to dashboard for deeper interaction...");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
  await wait(4000);

  // Click sidebar links to see what's available
  const links = await page.$$('nav a, aside a, [role="navigation"] a');
  console.log(`  Found ${links.length} nav links`);
  for (let i = 0; i < Math.min(links.length, 30); i++) {
    try {
      const text = await links[i].evaluate(el => el.textContent?.trim() || el.getAttribute("href") || "");
      const href = await links[i].evaluate(el => el.getAttribute("href") || "");
      if (text && href) console.log(`    Link: "${text}" → ${href}`);
    } catch {}
  }

  // Try "I Want To" or action menus
  const actionBtns = await page.$$('button');
  console.log(`  Found ${actionBtns.length} buttons`);
  for (let i = 0; i < Math.min(actionBtns.length, 20); i++) {
    try {
      const text = await actionBtns[i].evaluate(el => el.textContent?.trim() || el.getAttribute("title") || el.getAttribute("aria-label") || "");
      if (text) console.log(`    Button ${i}: "${text}"`);
    } catch {}
  }

  save();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Captured ${captured.length} API calls → ${OUTPUT}`);
  console.log("Browser staying open for manual exploration...\n");

  // Auto-save every 15s
  await new Promise(resolve => {
    const iv = setInterval(() => {
      save();
      console.log(`[auto-save] ${captured.length} calls`);
    }, 15000);
    browser.on("disconnected", () => { clearInterval(iv); resolve(); });
  });

  save();
  console.log(`\n✅ Final: ${captured.length} API calls saved.`);
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
