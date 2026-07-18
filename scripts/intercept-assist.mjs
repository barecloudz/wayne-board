/**
 * intercept-assist.mjs
 * Logs in, navigates to MANAGE → ROUTE PLANS, then waits.
 * You manually do the operations — all API calls are intercepted and saved.
 *
 * Suggested order:
 *   1. Click Edit on any day row in the schedule table (top) → change plan → Save
 *   2. Click Edit on AUTO row → Update Vehicles tab → move a work area → Save
 *   3. Navigate to MANAGE → ANCHOR AREAS → edit an anchor area → Save
 *
 * Close the browser when done — results saved to scripts/intercepted-manual.json
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE = "https://dro.routesmart.com";
const CHROME   = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WAIT     = ms => new Promise(r => setTimeout(r, ms));

const env    = readFileSync(".env.local", "utf8");
const getEnv = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox", "--start-maximized"],
  defaultViewport: null,
});
const page = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

// ── Intercept all /api/ calls ─────────────────────────────────────────────────
const allCalls = [];

page.on("request", req => {
  const url = req.url(), meth = req.method();
  if (!url.includes("/api/")) return;
  let body = null;
  try { body = JSON.parse(req.postData() ?? "null"); } catch { body = req.postData(); }
  allCalls.push({ method: meth, url: url.replace(DRO_BASE, ""), body, responseStatus: null, response: null });
});

page.on("response", async res => {
  const url = res.url(), meth = res.request().method();
  if (!url.includes("/api/")) return;
  const entry = allCalls.findLast(c => c.url === url.replace(DRO_BASE, "") && c.method === meth && c.responseStatus === null);
  if (entry) {
    entry.responseStatus = res.status();
    try { entry.response = await res.json(); } catch {}
  }
});

// ── Also intercept on any new pages (tabs) that open ────────────────────────
browser.on("targetcreated", async target => {
  const p = await target.page().catch(() => null);
  if (!p) return;
  p.on("request", req => {
    const url = req.url(), meth = req.method();
    if (!url.includes("/api/")) return;
    let body = null;
    try { body = JSON.parse(req.postData() ?? "null"); } catch { body = req.postData(); }
    allCalls.push({ method: meth, url: url.replace(DRO_BASE, ""), body, responseStatus: null, response: null, tab: "popup" });
  });
  p.on("response", async res => {
    const url = res.url(), meth = res.request().method();
    if (!url.includes("/api/")) return;
    const entry = allCalls.findLast(c => c.url === url.replace(DRO_BASE, "") && c.method === meth && c.responseStatus === null);
    if (entry) {
      entry.responseStatus = res.status();
      try { entry.response = await res.json(); } catch {}
    }
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────
console.log("Logging in...");
await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
await page.click("button::-p-text(Service Provider)");
const popup = await popupPromise;
await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
await popup.type('input[name="identifier"]', getEnv("DRO_USERNAME"));
await popup.click('input[type="submit"]');
await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
await popup.type('input[type="password"]', getEnv("DRO_PASSWORD"));
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(3000);
console.log("✓ Logged in");

// ── Navigate to MANAGE → ROUTE PLANS ─────────────────────────────────────────
const manageBtn = await page.evaluate(() => {
  for (const el of document.querySelectorAll("a,button,li,span,div,[role='menuitem']")) {
    if (el.textContent?.trim() === "MANAGE" && el.getBoundingClientRect().width > 0) {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
});
if (manageBtn) {
  await page.mouse.move(manageBtn.x, manageBtn.y, { steps: 5 });
  await WAIT(600);
  const routePlansLink = await page.evaluate(() => {
    for (const el of document.querySelectorAll("a,li,[role='menuitem']")) {
      if (el.textContent?.trim().includes("ROUTE PLAN") && el.getBoundingClientRect().width > 0) {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  });
  if (routePlansLink) {
    await page.mouse.click(routePlansLink.x, routePlansLink.y);
    await WAIT(3000);
    console.log("✓ Navigated to MANAGE → ROUTE PLANS");
  }
}

// ── Print non-GET calls live as they happen ────────────────────────────────────
let lastCount = 0;
const monitor = setInterval(() => {
  const newCalls = allCalls.slice(lastCount).filter(c => c.method !== "GET" || c.responseStatus >= 400);
  if (newCalls.length > 0) {
    newCalls.forEach(c => {
      console.log(`\n★ [${c.method}] ${c.url} → ${c.responseStatus}`);
      if (c.body) console.log(`  BODY: ${JSON.stringify(c.body).slice(0, 800)}`);
      if (c.response) console.log(`  RESP: ${JSON.stringify(c.response).slice(0, 400)}`);
    });
    lastCount = allCalls.length;
  }
}, 1000);

// ── Wait for browser to close ─────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════");
console.log("  Browser is open — do your operations manually:");
console.log("  1. Edit a day row schedule (change plan → Save)");
console.log("  2. Edit AUTO → Update Vehicles → move work area → Save");
console.log("  3. MANAGE → ANCHOR AREAS → edit an area → Save");
console.log("  Close the browser when done.");
console.log("══════════════════════════════════════════════════════\n");

await new Promise(resolve => browser.on("disconnected", resolve));
clearInterval(monitor);

// ── Save results ──────────────────────────────────────────────────────────────
const mutationCalls = allCalls.filter(c => c.method !== "GET");
writeFileSync("scripts/intercepted-manual.json", JSON.stringify(allCalls, null, 2));
writeFileSync("scripts/intercepted-mutations.json", JSON.stringify(mutationCalls, null, 2));

console.log(`\n✓ Saved ${allCalls.length} total calls (${mutationCalls.length} mutations)`);
console.log("  → scripts/intercepted-manual.json");
console.log("  → scripts/intercepted-mutations.json");

console.log("\n══ MUTATIONS SUMMARY ══");
mutationCalls.forEach(c => {
  console.log(`\n[${c.method}] ${c.url} → ${c.responseStatus}`);
  if (c.body) console.log(`  BODY: ${JSON.stringify(c.body).slice(0, 1000)}`);
  if (c.response) console.log(`  RESP: ${JSON.stringify(c.response).slice(0, 500)}`);
});
