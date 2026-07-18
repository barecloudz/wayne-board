/**
 * DRO endpoint discovery script.
 * Logs in via Puppeteer, navigates every visible tab/link in the DRO UI,
 * and intercepts every outbound API request the frontend makes.
 *
 * Usage:
 *   node scripts/discover-dro-endpoints.mjs
 *
 * Output:
 *   scripts/dro-discovered-endpoints.json
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE    = "https://dro.routesmart.com";
const CHROME      = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WAIT        = ms => new Promise(r => setTimeout(r, ms));

// Load credentials from .env.local
const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

// ── All intercepted requests go here ──────────────────────────────────────────
const captured = new Map(); // key: "METHOD path" → { method, path, status, count, exampleQuery }

function record(method, url, status) {
  try {
    const u    = new URL(url);
    const path = u.pathname + (u.search ? "?" : ""); // strip actual query values but note if present
    const key  = `${method} ${path}`;
    if (!captured.has(key)) {
      captured.set(key, { method, path, query: u.search.slice(0, 200), status, count: 0 });
    }
    captured.get(key).count++;
    if (status) captured.get(key).status = status;
  } catch {}
}

// ── Launch ────────────────────────────────────────────────────────────────────
console.log("Launching Chrome…");
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false, // visible so you can watch — set true if you want background
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1440, height: 900 },
});

// Intercept on every new page/target
async function attachInterceptor(page) {
  // Listen to responses only — no interception needed, just observe
  page.on("response", res => {
    const url = res.url();
    if (url.includes("/api/")) record(res.request().method(), url, res.status());
  });
}

const mainPage = await browser.newPage();
mainPage.on("dialog", async d => { try { await d.dismiss(); } catch {} });
await attachInterceptor(mainPage);

// Watch for any popup pages too
browser.on("targetcreated", async target => {
  const p = await target.page().catch(() => null);
  if (p) {
    p.on("dialog", async d => { try { await d.dismiss(); } catch {} });
    await attachInterceptor(p).catch(() => {});
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
console.log("Navigating to DRO…");
await mainPage.goto(DRO_BASE, { waitUntil: "networkidle2" });

const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
await mainPage.click("button::-p-text(Service Provider)");
const popup = await popupPromise;
await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
await attachInterceptor(popup).catch(() => {});

try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}

console.log("Logging in…");
await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
await popup.type('input[name="identifier"]', username);
await popup.click('input[type="submit"]');
await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
await popup.type('input[type="password"]', password);
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");

await mainPage.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);

// Select station
await mainPage.waitForSelector('[class*="station" i]', { timeout: 10000 });
const stations = await mainPage.$$('[class*="station" i]');
if (stations.length > 0) await stations[0].click();
await WAIT(4000);

console.log("Logged in. Starting exploration…");

// ── Helper: click something and wait for network to settle ────────────────────
async function clickAndWait(page, selector, label) {
  try {
    const el = await page.$(selector);
    if (!el) { console.log(`  skip: ${label} (not found)`); return false; }
    console.log(`  click: ${label}`);
    await el.click();
    await WAIT(2500);
    return true;
  } catch (e) {
    console.log(`  error clicking ${label}: ${e.message?.slice(0, 60)}`);
    return false;
  }
}

// ── Explore every nav tab / sidebar item visible ───────────────────────────────
// Strategy: find all clickable top-level nav elements and click each one.
// After each click, scroll the page to trigger lazy-loaded content.

async function exploreNavItems(page) {
  // Common DRO nav patterns: tabs, sidebar links, menu items
  const navSelectors = [
    // Top nav tabs
    'nav a', 'nav button', '[role="tab"]',
    // Sidebar
    '[class*="sidebar"] a', '[class*="sidebar"] button',
    '[class*="nav"] a', '[class*="nav"] button',
    // Generic tab bars
    '[class*="tab"] button', '[class*="tab"] a',
    // Menu items
    '[class*="menu-item"]', '[class*="menuItem"]',
  ];

  const seen = new Set();
  for (const sel of navSelectors) {
    const els = await page.$$(sel).catch(() => []);
    for (const el of els) {
      const text = (await el.evaluate(e => e.textContent?.trim() ?? "")).slice(0, 40);
      const href = await el.evaluate(e => e.getAttribute("href") ?? "").catch(() => "");
      const key  = text + href;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!text && !href) continue;

      console.log(`  nav: "${text}" ${href}`);
      try {
        await el.click();
        await WAIT(2000);
        // Scroll to trigger any lazy loaders
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await WAIT(1000);
        await page.evaluate(() => window.scrollTo(0, 0));
        await WAIT(500);
      } catch {}
    }
  }
}

// ── Explore dropdowns / action menus ──────────────────────────────────────────
async function exploreDropdowns(page) {
  const dropdownSelectors = [
    'button[class*="dropdown"]',
    '[class*="dropdown-toggle"]',
    '[class*="action"] button',
    'button[aria-haspopup]',
    '[data-toggle="dropdown"]',
  ];
  for (const sel of dropdownSelectors) {
    const els = await page.$$(sel).catch(() => []);
    for (const el of els) {
      try {
        await el.click();
        await WAIT(1000);
        // Close by pressing Escape
        await page.keyboard.press("Escape");
        await WAIT(300);
      } catch {}
    }
  }
}

// ── Main exploration pass ──────────────────────────────────────────────────────
await exploreNavItems(mainPage);
await exploreDropdowns(mainPage);

// ── Try clicking route rows to see route-detail API calls ────────────────────
console.log("Exploring route detail views…");
const routeRows = await mainPage.$$('[class*="route"][class*="row"], [class*="route-item"], tbody tr').catch(() => []);
for (const row of routeRows.slice(0, 5)) {
  try { await row.click(); await WAIT(1500); } catch {}
}

// ── Try clicking stop/waypoint rows ──────────────────────────────────────────
console.log("Exploring stop detail views…");
const stopRows = await mainPage.$$('[class*="stop"][class*="row"], [class*="waypoint"], [class*="stop-item"]').catch(() => []);
for (const row of stopRows.slice(0, 5)) {
  try { await row.click(); await WAIT(1000); } catch {}
}

// ── Probe additional endpoint patterns manually ───────────────────────────────
// Use whatever session cookies are now active to directly hit guessed endpoints
console.log("Probing additional endpoint guesses…");
const cookies = await mainPage.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

const SA_ID      = "3060743";
const STATION_ID = "259";

// Get active plan ID for plan-scoped endpoints
let planId = null;
try {
  const pr = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
  planId = (await pr.json()).planId;
} catch {}

const guesses = [
  // Service area level
  `/api/api/service-areas/${SA_ID}/drivers`,
  `/api/api/service-areas/${SA_ID}/users`,
  `/api/api/service-areas/${SA_ID}/exceptions`,
  `/api/api/service-areas/${SA_ID}/alerts`,
  `/api/api/service-areas/${SA_ID}/notifications`,
  `/api/api/service-areas/${SA_ID}/manifests`,
  `/api/api/service-areas/${SA_ID}/notes`,
  `/api/api/service-areas/${SA_ID}/history`,
  `/api/api/service-areas/${SA_ID}/stops`,
  `/api/api/service-areas/${SA_ID}/packages`,
  `/api/api/service-areas/${SA_ID}/deliveries`,
  `/api/api/service-areas/${SA_ID}/metrics`,
  `/api/api/service-areas/${SA_ID}/kpi`,
  `/api/api/service-areas/${SA_ID}/performance`,
  `/api/api/service-areas/${SA_ID}/audit-log`,
  `/api/api/service-areas/${SA_ID}/audit`,
  `/api/api/service-areas/${SA_ID}/settings`,
  `/api/api/service-areas/${SA_ID}/config`,
  `/api/api/service-areas/${SA_ID}/zones`,
  `/api/api/service-areas/${SA_ID}/regions`,
  `/api/api/service-areas/${SA_ID}/geofences`,
  `/api/api/service-areas/${SA_ID}/service-area`,
  `/api/api/service-areas/${SA_ID}/capacity`,
  `/api/api/service-areas/${SA_ID}/solve-history`,
  `/api/api/service-areas/${SA_ID}/solutions`,
  `/api/api/service-areas/${SA_ID}/solve-results`,
  `/api/api/service-areas/${SA_ID}/route-plans/history`,
  `/api/api/service-areas/${SA_ID}/waypoints/unroutable`,
  `/api/api/service-areas/${SA_ID}/waypoints/overrides`,
  `/api/api/service-areas/${SA_ID}/waypoints/exceptions`,
  `/api/api/service-areas/${SA_ID}/stop-overrides`,
  `/api/api/service-areas/${SA_ID}/stop-exceptions`,
  `/api/api/service-areas/${SA_ID}/business-exceptions`,
  `/api/api/service-areas/${SA_ID}/time-windows`,
  `/api/api/service-areas/${SA_ID}/priority-stops`,
  `/api/api/service-areas/${SA_ID}/bulk-stops`,
  // Station level
  `/api/api/stations/${STATION_ID}/drivers`,
  `/api/api/stations/${STATION_ID}/manifests`,
  `/api/api/stations/${STATION_ID}/packages`,
  `/api/api/stations/${STATION_ID}/performance`,
  `/api/api/stations/${STATION_ID}/exceptions`,
  `/api/api/stations/${STATION_ID}/alerts`,
  `/api/api/stations/${STATION_ID}/config`,
  `/api/api/stations/${STATION_ID}/settings`,
  `/api/api/stations/${STATION_ID}/history`,
  `/api/api/stations/${STATION_ID}/waves`,
  `/api/api/stations/${STATION_ID}/routes`,
  `/api/api/stations/${STATION_ID}/kpi`,
  // Plan-scoped (if we have a plan ID)
  ...(planId ? [
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/routes`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/waypoints`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/solve-history`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/metrics`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/kpi`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/capacity`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/exceptions`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/fleet`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/vehicle-set`,
    `/api/api/service-areas/${SA_ID}/route-plans/${planId}/stop-overrides`,
  ] : []),
  // User/auth
  `/api/api/users/me`,
  `/api/api/users/current`,
  `/api/api/auth/me`,
  `/api/api/profile`,
  // Org/company level
  `/api/api/companies`,
  `/api/api/organizations`,
  `/api/api/contractors`,
];

const probeResults = [];
for (const path of guesses) {
  try {
    const res  = await fetch(DRO_BASE + path, { headers });
    const text = await res.text().catch(() => "");
    let preview = "";
    try {
      const j = JSON.parse(text);
      preview = JSON.stringify(j).slice(0, 150);
    } catch {
      preview = text.slice(0, 150);
    }
    probeResults.push({ path, status: res.status, preview });
    record("GET", DRO_BASE + path, res.status);
    const emoji = res.status === 200 ? "✓" : res.status === 404 ? "✗" : `→${res.status}`;
    console.log(`  ${emoji} ${path.split("/").at(-1).padEnd(30)} ${res.status}  ${preview.slice(0, 80)}`);
  } catch (e) {
    probeResults.push({ path, status: "err", preview: e.message });
  }
}

// ── Final wait — catch any deferred requests ──────────────────────────────────
await WAIT(3000);

// ── Save results ──────────────────────────────────────────────────────────────
const allEndpoints = [...captured.values()]
  .filter(e => e.path.includes("/api/"))
  .sort((a, b) => a.path.localeCompare(b.path));

const report = {
  capturedFromBrowser: allEndpoints,
  probeResults: probeResults.sort((a, b) => a.status - b.status),
  summary: {
    totalUnique:    allEndpoints.length,
    responding200:  probeResults.filter(r => r.status === 200).length,
    totalProbed:    probeResults.length,
  },
};

writeFileSync("scripts/dro-discovered-endpoints.json", JSON.stringify(report, null, 2));
console.log(`\nDone. ${allEndpoints.length} unique endpoints captured from browser.`);
console.log(`Probe: ${probeResults.filter(r => r.status === 200).length}/${probeResults.length} returned 200.`);
console.log("Saved → scripts/dro-discovered-endpoints.json");

await browser.close();
