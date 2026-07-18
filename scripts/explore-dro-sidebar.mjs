/**
 * Targeted DRO sidebar exploration.
 * Clicks every known sidebar item + SWITCH VIEW, captures all API calls + screenshots.
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE = "https://dro.routesmart.com";
const CHROME   = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WAIT     = ms => new Promise(r => setTimeout(r, ms));
const SA_ID    = "3060743";
const STATION_ID = "259";

const env = readFileSync(".env.local", "utf8");
const getEnv = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

const captured = new Map();
function record(method, url, status) {
  try {
    const u = new URL(url);
    if (!u.pathname.includes("/api/")) return;
    const key = `${method} ${u.pathname}`;
    if (!captured.has(key)) captured.set(key, { method, path: u.pathname, query: u.search.slice(0, 300), status, count: 0 });
    captured.get(key).count++;
    if (status) captured.get(key).status = status;
  } catch {}
}

let ssIdx = 0;
async function ss(page, label) {
  const file = `scripts/sidebar-${String(++ssIdx).padStart(2,"0")}-${label.replace(/[^a-z0-9]/gi,"-").slice(0,40)}.png`;
  await page.screenshot({ path: file }).catch(() => {});
  console.log(`  📸 ${file}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1440, height: 900 },
});

async function listen(page) {
  page.on("response", res => record(res.request().method(), res.url(), res.status()));
}

const page = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
await listen(page);
browser.on("targetcreated", async t => {
  const p = await t.page().catch(() => null);
  if (p) { p.on("dialog", async d => { try { await d.dismiss(); } catch {} }); await listen(p).catch(() => {}); }
});

// Login
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
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(5000);
console.log("Logged in.");

const cookies = await page.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
const h = { Cookie: cookieHeader, "Content-Type": "application/json" };
const planId = (await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers: h })).json()).planId;
console.log("planId:", planId);

// Helper: click by exact text, wait, screenshot
async function clickText(text, label, wait = 3000) {
  const clicked = await page.evaluate((t) => {
    const all = document.querySelectorAll('a, button, li, span, div, [role="menuitem"], [role="tab"]');
    for (const el of all) {
      const txt = el.textContent?.trim().replace(/\s+/g," ");
      if (txt === t || txt?.toUpperCase() === t.toUpperCase()) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) { el.click(); return true; }
      }
    }
    return false;
  }, text);
  if (clicked) {
    console.log(`\nClicked: "${text}"`);
    await WAIT(wait);
    await ss(page, label || text);
  } else {
    console.log(`  NOT FOUND: "${text}"`);
  }
  return clicked;
}

// Helper: dump all visible text buttons/links
async function dumpVisible(label) {
  const items = await page.evaluate(() => {
    const results = [];
    const els = document.querySelectorAll('a, button, [role="tab"], [role="menuitem"], [role="button"]');
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const text = el.textContent?.trim().replace(/\s+/g," ").slice(0,60);
      if (text && text.length > 1) results.push(text);
    }
    return [...new Set(results)];
  });
  console.log(`  Visible items (${label}):`, items.join(" | "));
  return items;
}

await ss(page, "dashboard");
await dumpVisible("dashboard");

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
console.log("\n=== DASHBOARD ===");
await clickText("DASHBOARD", "dashboard-clicked");

// ── MAP ───────────────────────────────────────────────────────────────────────
console.log("\n=== MAP ===");
await clickText("MAP", "map");
await WAIT(2000);
await ss(page, "map-loaded");

// ── REPORT ────────────────────────────────────────────────────────────────────
console.log("\n=== REPORT ===");
await clickText("REPORT", "report");
await WAIT(1000);
const reportItems = await dumpVisible("report");
// Click each report sub-item
for (const item of reportItems) {
  if (["DASHBOARD","MAP","REPORT","MANAGE","HISTORICAL","Log Out","SWITCH VIEW","SWITCH SERVICE AREA","User Guide","en"].includes(item)) continue;
  await clickText(item, `report-${item.toLowerCase().replace(/\s+/g,"-").slice(0,20)}`);
}

// ── MANAGE ────────────────────────────────────────────────────────────────────
console.log("\n=== MANAGE ===");
await clickText("MANAGE", "manage");
await WAIT(1000);
const manageItems = await dumpVisible("manage");
for (const item of ["CONTACTS","ROUTE PLANS","DRIVERS","FLEET","STOP ADDRESSES","STREET SETTINGS"]) {
  await clickText(item, `manage-${item.toLowerCase().replace(/\s+/g,"-")}`);
  await WAIT(1000);
  await dumpVisible(`manage-${item}`);
}

// ── HISTORICAL ────────────────────────────────────────────────────────────────
console.log("\n=== HISTORICAL ===");
await clickText("HISTORICAL", "historical");
await WAIT(2000);
await ss(page, "historical-loaded");
await dumpVisible("historical");

// ── SWITCH VIEW ───────────────────────────────────────────────────────────────
console.log("\n=== SWITCH VIEW ===");
await clickText("SWITCH VIEW", "switch-view");
await WAIT(1500);
await ss(page, "switch-view-menu");
const switchItems = await dumpVisible("switch-view-menu");
// Click each view option
for (const item of switchItems) {
  if (["Log Out","SWITCH VIEW","SWITCH SERVICE AREA","User Guide","en","DASHBOARD","MAP","REPORT","MANAGE","HISTORICAL"].includes(item)) continue;
  if (item.length < 2) continue;
  console.log(`  Trying view: "${item}"`);
  await clickText(item, `view-${item.toLowerCase().replace(/\s+/g,"-").slice(0,25)}`);
  await WAIT(3000);
  await dumpVisible(`view-${item}`);
  // Go back to switch view for next item
  await clickText("SWITCH VIEW", "back-to-switch").catch(() => {});
  await WAIT(1000);
}

// ── Direct API probes ─────────────────────────────────────────────────────────
console.log("\n=== API Probes ===");
const probes = [
  // Contacts
  `/api/api/service-areas/${SA_ID}/contacts`,
  `/api/api/service-areas/${SA_ID}/customers`,
  `/api/api/service-areas/${SA_ID}/recipients`,
  // Route plans
  `/api/api/service-areas/${SA_ID}/route-plans`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/routes`,
  `/api/api/service-areas/${SA_ID}/route-plans/${planId}/route-summary`,
  // Fleet / vehicles
  `/api/api/service-areas/${SA_ID}/fleet`,
  `/api/api/service-areas/${SA_ID}/vehicles`,
  `/api/api/service-areas/${SA_ID}/fleet/${611610}`,
  // Stop addresses
  `/api/api/service-areas/${SA_ID}/stop-addresses`,
  `/api/api/service-areas/${SA_ID}/addresses`,
  `/api/api/service-areas/${SA_ID}/address-overrides`,
  // Street settings
  `/api/api/service-areas/${SA_ID}/street-settings`,
  `/api/api/service-areas/${SA_ID}/streets`,
  `/api/api/service-areas/${SA_ID}/road-settings`,
  // Historical
  `/api/api/service-areas/${SA_ID}/historical`,
  `/api/api/service-areas/${SA_ID}/history`,
  `/api/api/service-areas/${SA_ID}/historical-routes`,
  `/api/api/service-areas/${SA_ID}/past-routes`,
  `/api/api/service-areas/${SA_ID}/route-history`,
  // Reports
  `/api/api/service-areas/${SA_ID}/report/packagedetail?routePlanId=${planId}`,
  `/api/api/service-areas/${SA_ID}/report/manifest`,
  `/api/api/service-areas/${SA_ID}/report/route-manifest`,
  `/api/api/service-areas/${SA_ID}/report/driver`,
  `/api/api/service-areas/${SA_ID}/report/stop`,
  // Solve / dispatch
  `/api/api/service-areas/${SA_ID}/dispatch`,
  `/api/api/service-areas/${SA_ID}/dispatch-jobs`,
  `/api/api/service-areas/${SA_ID}/solve-jobs`,
  `/api/api/stations/${STATION_ID}/dispatch-settings`,
  // Stop overrides temp full data
  `/api/api/service-areas/${SA_ID}/stop-overrides-temp`,
];

const probeResults = [];
for (const path of probes) {
  const res = await fetch(DRO_BASE + path, { headers: h });
  const text = await res.text().catch(() => "");
  let data, preview = "";
  try { data = JSON.parse(text); preview = JSON.stringify(data).slice(0, 250); }
  catch { preview = text.slice(0, 250); }
  probeResults.push({ path, status: res.status, data: data ?? preview });
  record("GET", DRO_BASE + path, res.status);
  const icon = res.status === 200 ? "✓" : res.status === 404 ? "✗" : `→${res.status}`;
  if (res.status === 200) {
    const label = path.split("/api/api/").at(-1).slice(0, 55);
    if (Array.isArray(data)) console.log(`  ${icon} ${label.padEnd(55)} Array[${data.length}] keys: ${data[0] ? Object.keys(data[0]).join(", ").slice(0,100) : "empty"}`);
    else if (typeof data === "object" && data) console.log(`  ${icon} ${label.padEnd(55)} Object keys: ${Object.keys(data).join(", ").slice(0,100)}`);
    else console.log(`  ${icon} ${label.padEnd(55)} ${preview.slice(0,80)}`);
  }
}

await WAIT(3000);

const allEndpoints = [...captured.values()].filter(e => e.path.includes("/api/")).sort((a,b) => a.path.localeCompare(b.path));
const report = {
  browserCaptured: allEndpoints,
  probes200: probeResults.filter(r => r.status === 200),
  allProbes: probeResults,
};
writeFileSync("scripts/dro-sidebar-endpoints.json", JSON.stringify(report, null, 2));
console.log(`\nDone. Browser: ${allEndpoints.length} endpoints. Probes 200: ${probeResults.filter(r=>r.status===200).length}/${probeResults.length}`);
console.log("Saved → scripts/dro-sidebar-endpoints.json");
await browser.close();
