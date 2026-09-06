/**
 * Opens DRO in a visible browser, logs in, and captures all API calls.
 * Leave the browser open and manually create/edit/delete an anchor area.
 * All network requests + responses are saved to scripts/captured-anchor-calls.json
 *
 * Usage: node scripts/capture-anchor-api.mjs
 */

import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

// Load .env.local manually
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
  }
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "captured-anchor-calls.json");

const CHROME = process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE = "https://dro.routesmart.com";
const username = process.env.DRO_USERNAME ?? "";
const password = process.env.DRO_PASSWORD ?? "";

const captured = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  defaultViewport: null,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
});

const page = await browser.newPage();

// Intercept all requests to DRO API
await page.setRequestInterception(true);

page.on("request", (req) => {
  if (req.url().includes("/api/api/")) {
    captured.push({
      type: "REQUEST",
      method: req.method(),
      url: req.url(),
      postData: req.postData() ?? null,
      time: new Date().toISOString(),
    });
    fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2));
  }
  req.continue();
});

page.on("response", async (res) => {
  if (res.url().includes("/api/api/") && ["POST", "PUT", "DELETE", "PATCH"].includes(res.request().method())) {
    let body = null;
    try { body = await res.json(); } catch { try { body = await res.text(); } catch {} }
    captured.push({
      type: "RESPONSE",
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
      body,
      time: new Date().toISOString(),
    });
    fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2));
    console.log(`[${res.request().method()}] ${res.status()} ${res.url()}`);
  }
});

page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

console.log("Logging in to DRO...");
await page.goto(DRO_BASE, { waitUntil: "networkidle2" });

const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
await page.click("button::-p-text(Service Provider)");
const popup = await popupPromise;
await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
popup.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });
try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
await popup.type('input[name="identifier"]', username);
await popup.click('input[type="submit"]');
await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
await popup.type('input[type="password"]', password);
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));
await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
const stations = await page.$$('[class*="station" i]');
if (stations.length) await stations[0].click();
await new Promise(r => setTimeout(r, 3000));

console.log("\n✅ Logged in. Browser is open.");
console.log("👉 Now manually CREATE, EDIT, or DELETE an anchor area in DRO.");
console.log(`📄 All API calls are being saved to: ${OUT_FILE}`);
console.log("⏳ Close the browser when done.\n");

browser.on("disconnected", () => {
  fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2));
  console.log(`\n✅ Done. ${captured.length} calls captured → ${OUT_FILE}`);
  process.exit(0);
});
