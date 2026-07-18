/**
 * Deep DRO exploration — screenshots every page/tab/panel,
 * captures all API calls, and probes known sub-paths.
 *
 * Usage: node scripts/explore-dro-deep.mjs
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE = "https://dro.routesmart.com";
const CHROME   = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WAIT     = ms => new Promise(r => setTimeout(r, ms));
const SS_DIR   = "scripts";

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");
const SA_ID    = "3060743";
const STATION_ID = "259";

const captured = new Map();
function record(method, url, status) {
  try {
    const u = new URL(url);
    if (!u.pathname.includes("/api/")) return;
    const key = `${method} ${u.pathname}`;
    if (!captured.has(key)) captured.set(key, { method, path: u.pathname, query: u.search.slice(0,300), status, count: 0 });
    captured.get(key).count++;
    if (status) captured.get(key).status = status;
  } catch {}
}

let ssIndex = 0;
async function screenshot(page, label) {
  const file = `${SS_DIR}/explore-${String(++ssIndex).padStart(2,"0")}-${label.replace(/[^a-z0-9]/gi,"-").slice(0,40)}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  console.log(`  📸 ${file}`);
}

// ── Launch ────────────────────────────────────────────────────────────────────
console.log("Launching Chrome…");
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1440, height: 900 },
});

async function attachListener(page) {
  page.on("response", res => {
    record(res.request().method(), res.url(), res.status());
  });
}

const page = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
await attachListener(page);

browser.on("targetcreated", async t => {
  const p = await t.page().catch(() => null);
  if (p) { p.on("dialog", async d => { try { await d.dismiss(); } catch {} }); await attachListener(p).catch(() => {}); }
});

// ── Login ─────────────────────────────────────────────────────────────────────
await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
await page.click("button::-p-text(Service Provider)");
const popup = await popupPromise;
await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
await popup.type('input[name="identifier"]', username);
await popup.click('input[type="submit"]');
await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
await popup.type('input[type="password"]', password);
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);
await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
const stations = await page.$$('[class*="station" i]');
if (stations.length > 0) await stations[0].click();
await WAIT(5000);
console.log("Logged in.");

// ── Grab cookies for direct API calls ───────────────────────���────────────────
const cookies = await page.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

const planRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
const plan = await planRes.json();
const planId = plan.planId;
console.log("planId:", planId);

// ── Screenshot initial state ──────────────────────────────────────────────────
await screenshot(page, "initial-dashboard");

// ── Find and click every top-level nav item ───────────────────────────────────
async function getAllClickableNavItems() {
  return page.evaluate(() => {
    const results = [];
    // Look for anything that looks like a top nav tab or primary nav element
    const candidates = [
      ...document.querySelectorAll('nav a, nav button, [role="tab"], [class*="nav-item"], [class*="navItem"], [class*="tab-item"], [class*="tabItem"], [class*="menu-item"], [class*="menuItem"], [class*="primary-nav"], header a, header button'),
    ];
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 50) ?? "";
      results.push({ text, tag: el.tagName, classes: el.className?.slice(0,80) ?? "" });
    }
    return results;
  });
}

const topNav = await getAllClickableNavItems();
console.log("\nTop nav items found:", topNav.map(n => `"${n.text}"`).join(", "));

// ── Click each top-level tab by text ─────────────────────────────────────────
const topLevelTabs = [
  "Plan", "Manage", "Dispatch", "Report", "Reports", "Analytics",
  "Settings", "History", "Overview", "Map", "Routes", "Stops",
  "Drivers", "Vehicles", "Fleet", "Schedule", "Sequence", "Optimize",
  "Upload", "Import", "Export", "Admin",
];

for (const tabText of topLevelTabs) {
  try {
    // Try multiple selector strategies
    const selectors = [
      `button::-p-text(${tabText})`,
      `a::-p-text(${tabText})`,
      `[role="tab"]::-p-text(${tabText})`,
      `li::-p-text(${tabText})`,
    ];
    let clicked = false;
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const visible = await el.isVisible().catch(() => false);
          if (!visible) continue;
          console.log(`\nClicking tab: "${tabText}"`);
          await el.click();
          await WAIT(2500);
          await screenshot(page, `tab-${tabText.toLowerCase()}`);
          clicked = true;

          // Now look for sub-tabs/items within this view
          await exploreSubItems(page, tabText);
          break;
        }
      } catch {}
    }
    if (!clicked) {
      // Try case-insensitive text match
      try {
        const found = await page.evaluate((text) => {
          const all = document.querySelectorAll('button, a, [role="tab"], li');
          for (const el of all) {
            if (el.textContent?.trim().toLowerCase() === text.toLowerCase()) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) return true;
            }
          }
          return false;
        }, tabText);
        if (found) {
          await page.evaluate((text) => {
            const all = document.querySelectorAll('button, a, [role="tab"], li');
            for (const el of all) {
              if (el.textContent?.trim().toLowerCase() === text.toLowerCase()) {
                el.click(); break;
              }
            }
          }, tabText);
          await WAIT(2500);
          await screenshot(page, `tab-${tabText.toLowerCase()}-found`);
          await exploreSubItems(page, tabText);
        }
      } catch {}
    }
  } catch (e) {
    console.log(`  error on tab "${tabText}": ${e.message?.slice(0,60)}`);
  }
}

async function exploreSubItems(page, parentLabel) {
  // Find all newly visible buttons/tabs/links that appeared after clicking
  const subItems = await page.evaluate(() => {
    const results = [];
    const candidates = document.querySelectorAll(
      '[role="tab"], [class*="sub-tab"], [class*="subtab"], [class*="sub-nav"], [class*="subnav"], ' +
      '[class*="sidebar-item"], [class*="sidebarItem"], [class*="list-item"], ' +
      'ul[class*="nav"] li, .dropdown-item, [class*="dropdown-item"]'
    );
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 50) ?? "";
      if (text) results.push(text);
    }
    return [...new Set(results)].slice(0, 20);
  });

  if (subItems.length > 0) {
    console.log(`  Sub-items under "${parentLabel}": ${subItems.join(", ")}`);
    for (const sub of subItems) {
      try {
        await page.evaluate((text) => {
          const all = document.querySelectorAll('[role="tab"], li, button, a, .dropdown-item, [class*="dropdown-item"]');
          for (const el of all) {
            if (el.textContent?.trim().replace(/\s+/g," ") === text) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) { el.click(); break; }
            }
          }
        }, sub);
        await WAIT(2000);
        await screenshot(page, `${parentLabel.toLowerCase()}-${sub.toLowerCase().replace(/\s+/g,"-").slice(0,20)}`);
      } catch {}
    }
  }
}

// ── Specifically look for the Manage tab and all its children ─────────────────
console.log("\n=== Specifically hunting Manage tab ===");
try {
  // Try clicking anything with "manage" in text or class
  const manageEl = await page.evaluateHandle(() => {
    const all = document.querySelectorAll('button, a, [role="tab"], li, span, div');
    for (const el of all) {
      const text = el.textContent?.trim().toLowerCase();
      const cls  = el.className?.toLowerCase() ?? "";
      if ((text === "manage" || cls.includes("manage")) && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  });
  if (manageEl.asElement()) {
    await manageEl.asElement().click();
    await WAIT(3000);
    await screenshot(page, "manage-tab-clicked");

    // Get all visible links/buttons in the manage view
    const manageItems = await page.evaluate(() => {
      const results = [];
      const all = document.querySelectorAll('a, button, [role="tab"], li');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = el.textContent?.trim().replace(/\s+/g," ").slice(0,50);
        if (text && text.length > 1) results.push({ text, tag: el.tagName, href: el.getAttribute("href") ?? "" });
      }
      return results;
    });
    console.log("Manage tab items:", JSON.stringify(manageItems.slice(0, 30), null, 2));

    // Click each item in Manage
    const seen = new Set();
    for (const item of manageItems.slice(0, 30)) {
      if (seen.has(item.text) || item.text.length < 2) continue;
      seen.add(item.text);
      try {
        await page.evaluate((text) => {
          const all = document.querySelectorAll('a, button, [role="tab"], li');
          for (const el of all) {
            if (el.textContent?.trim().replace(/\s+/g," ") === text) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0) { el.click(); break; }
            }
          }
        }, item.text);
        await WAIT(2500);
        await screenshot(page, `manage-${item.text.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,25)}`);
      } catch {}
    }
  } else {
    console.log("  Manage element not found by text search");
  }
} catch (e) {
  console.log("  Manage hunt error:", e.message?.slice(0,80));
}

// ── Probe more endpoint patterns based on what we now know ────────────────────
console.log("\n=== Probing more endpoints ===");

const moreGuesses = [
  // Report sub-paths (we know /report/packagedetail works)
  `/api/api/service-areas/${SA_ID}/report/routedetail`,
  `/api/api/service-areas/${SA_ID}/report/driverperformance`,
  `/api/api/service-areas/${SA_ID}/report/performance`,
  `/api/api/service-areas/${SA_ID}/report/manifest`,
  `/api/api/service-areas/${SA_ID}/report/stops`,
  `/api/api/service-areas/${SA_ID}/report/volume`,
  `/api/api/service-areas/${SA_ID}/report/daily`,
  `/api/api/service-areas/${SA_ID}/report/history`,
  `/api/api/service-areas/${SA_ID}/report/packagedetail`,
  // Stop-overrides sub-paths
  `/api/api/service-areas/${SA_ID}/stop-overrides-temp`,
  // Driver sub-paths
  `/api/api/service-areas/${SA_ID}/drivers/${267575}`,
  `/api/api/service-areas/${SA_ID}/drivers/${267575}/performance`,
  // Route plan sub-paths
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/route-summary`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/driver-assignments`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/sequence`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/solve-status`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/timing`,
  // Sequence/optimization
  `/api/api/service-areas/${SA_ID}/sequence`,
  `/api/api/service-areas/${SA_ID}/solve-status`,
  `/api/api/service-areas/${SA_ID}/routing-jobs`,
  `/api/api/service-areas/${SA_ID}/jobs`,
  // Manifest / upload
  `/api/api/service-areas/${SA_ID}/manifest`,
  `/api/api/service-areas/${SA_ID}/upload`,
  `/api/api/service-areas/${SA_ID}/imports`,
  `/api/api/service-areas/${SA_ID}/exports`,
  // Station sub-paths
  `/api/api/stations/${STATION_ID}/sort-date`,
  `/api/api/stations/${STATION_ID}/volume`,
  `/api/api/stations/${STATION_ID}/daily-volume`,
  `/api/api/stations/${STATION_ID}/active-route-plan`,
  `/api/api/stations/${STATION_ID}/route-plans`,
  `/api/api/stations/${STATION_ID}/service-areas`,
  // Misc
  `/api/api/service-areas/${SA_ID}/plan-settings`,
  `/api/api/service-areas/${SA_ID}/routing-settings`,
  `/api/api/service-areas/${SA_ID}/solver-settings`,
  `/api/api/service-areas/${SA_ID}/time-windows`,
  `/api/api/service-areas/${SA_ID}/exceptions`,
  `/api/api/service-areas/${SA_ID}/upload-history`,
  `/api/api/service-areas/${SA_ID}/package-types`,
  `/api/api/service-areas/${SA_ID}/service-types`,
  `/api/api/service-areas/${SA_ID}/stops/unassigned`,
];

const probeExtra = [];
for (const path of moreGuesses) {
  const res  = await fetch(DRO_BASE + path, { headers });
  const text = await res.text().catch(() => "");
  let data, preview = "";
  try { data = JSON.parse(text); preview = JSON.stringify(data).slice(0, 200); }
  catch { preview = text.slice(0, 200); }
  probeExtra.push({ path, status: res.status, preview });
  record("GET", DRO_BASE + path, res.status);
  const icon = res.status === 200 ? "✓" : res.status === 404 ? "✗" : `→${res.status}`;
  if (res.status === 200) {
    const label = path.split("/api/api/").at(-1).slice(0, 50);
    if (Array.isArray(data)) console.log(`  ${icon} ${label.padEnd(45)} Array[${data.length}]  keys: ${data[0] ? Object.keys(data[0]).join(", ").slice(0,100) : "empty"}`);
    else if (typeof data === "object") console.log(`  ${icon} ${label.padEnd(45)} Object  keys: ${Object.keys(data ?? {}).join(", ").slice(0,100)}`);
    else console.log(`  ${icon} ${label.padEnd(45)} ${preview.slice(0,80)}`);
  }
}

// ── Final wait ────────────────────────────────────────────────────────────────
await WAIT(3000);

// ── Save ──────────────────────────────────────────────────────────────────────
const allEndpoints = [...captured.values()]
  .filter(e => e.path.includes("/api/"))
  .sort((a, b) => a.path.localeCompare(b.path));

const report = {
  browserCaptured: allEndpoints,
  extraProbes: probeExtra.filter(r => r.status === 200),
  allProbes: probeExtra,
  summary: { browserCaptured: allEndpoints.length, extraProbes200: probeExtra.filter(r=>r.status===200).length },
};

writeFileSync("scripts/dro-deep-endpoints.json", JSON.stringify(report, null, 2));

console.log(`\nDone.`);
console.log(`Browser captured: ${allEndpoints.length} unique endpoints`);
console.log(`Extra probes 200: ${probeExtra.filter(r=>r.status===200).length}/${probeExtra.length}`);
console.log(`Screenshots saved to scripts/explore-*.png`);
console.log(`Full data → scripts/dro-deep-endpoints.json`);

await browser.close();
