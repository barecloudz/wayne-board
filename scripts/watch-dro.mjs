/**
 * DRO passive API watcher.
 * Logs in automatically, then hands you the browser to navigate freely.
 * Captures ALL network requests (including writes) while you interact.
 *
 * Run: node scripts/watch-dro.mjs
 * Output: scripts/dro-watch-calls.json
 *
 * Try moving stops between routes while this is running — it will capture
 * the exact write API calls needed for automated route cutting.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [k, ...v] = line.split("=");
  if (k?.trim() && v.length) process.env[k.trim()] = v.join("=").trim();
}

const USERNAME = process.env.DRO_USERNAME;
const PASSWORD = process.env.DRO_PASSWORD;
const BASE_URL  = "https://dro.routesmart.com";
const OUTPUT    = path.join(__dirname, "dro-watch-calls.json");

const captured = [];

function shouldCapture(url) {
  return url.includes("routesmart.com/api/") && !url.match(/\.(js|css|png|jpg|svg|woff|ico)(\?|$)/);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null, // full window
    args: ["--no-sandbox", "--start-maximized", "--disable-features=WebBluetooth,WebUSB"],
  });

  const context = browser.defaultBrowserContext();
  await context.overridePermissions(BASE_URL, []);

  const page = await browser.newPage();
  page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

  // Attach listener to any new page/tab that opens
  browser.on("targetcreated", async (target) => {
    const newPage = await target.page().catch(() => null);
    if (newPage) attachListener(newPage);
  });

  function attachListener(p) {
    p.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });
    p.on("response", async (response) => {
      const url = response.url();
      if (!shouldCapture(url)) return;
      const method  = response.request().method();
      const status  = response.status();
      const reqBody = response.request().postData() || null;
      let body = null;
      try { const ct = response.headers()["content-type"] || ""; if (ct.includes("json")) body = await response.json(); } catch {}
      const entry = { method, url: url.replace(BASE_URL, ""), status, reqBody, body, ts: new Date().toISOString() };
      captured.push(entry);
      const isWrite = ["POST","PUT","PATCH","DELETE"].includes(method);
      const prefix  = isWrite ? "🔴 WRITE" : "     GET";
      console.log(`${prefix} [${status}] ${entry.url.slice(0, 120)}`);
      if (isWrite && reqBody) console.log("       body:", reqBody.slice(0, 500));
      if (isWrite && body)    console.log("       resp:", JSON.stringify(body).slice(0, 500));
      if (isWrite) fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
    });
  }

  // ── Attach listener to main page ──────────────────────────────────────────
  attachListener(page);

  // ── Auto login ─────────────────────────────────────────────────────────────
  console.log("Logging in...");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });

  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
  await page.click('button::-p-text(Service Provider)');
  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  popup.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

  attachListener(popup);

  try { await popup.waitForSelector('button::-p-text(Block)', { timeout: 4000 }); await popup.click('button::-p-text(Block)'); } catch {}
  await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
  await popup.type('input[name="identifier"]', USERNAME);
  await popup.click('input[type="submit"]');
  await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
  await popup.type('input[type="password"]', PASSWORD);
  const pwBtn = await popup.$('input[type="submit"], button[type="submit"]');
  if (pwBtn) await pwBtn.click(); else await popup.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Select station
  await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
  const stEls = await page.$$('[class*="station" i]');
  if (stEls.length) await stEls[0].click();
  await new Promise(r => setTimeout(r, 4000));

  // ── Hand off to user ────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("✅ Logged in and on the MAP page.");
  console.log("   Navigate freely — all API calls are being captured.");
  console.log("   Try moving a stop to a different route.");
  console.log("   Write calls (POST/PUT/PATCH) are highlighted in 🔴 red.");
  console.log("=".repeat(60) + "\n");

  // Keep running until browser is closed
  await new Promise(resolve => {
    browser.on("disconnected", resolve);
    // Also save every 30 seconds
    const interval = setInterval(() => {
      fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
      console.log(`[auto-save] ${captured.length} calls captured so far`);
    }, 30000);
    browser.on("disconnected", () => { clearInterval(interval); resolve(); });
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
  console.log(`\n✅ Done. ${captured.length} total API calls → ${OUTPUT}`);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
