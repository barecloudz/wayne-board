/**
 * Inspect which workAreaNumbers in DRO don't match our template,
 * and which template entries don't match any DRO waypoints.
 * Usage: node scripts/inspect-wan-gaps.mjs
 */
import { readFileSync } from "fs";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const CHROME     = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";
const AUTO_PLAN_ID = 2352850;

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const DATABASE_URL = getEnv("DATABASE_URL_POOLER") || getEnv("DATABASE_URL");
const sql      = neon(DATABASE_URL);
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

async function droLogin() {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
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
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
  const stations = await page.$$('[class*="station" i]');
  if (stations.length) await stations[0].click();
  await new Promise(r => setTimeout(r, 3000));
  const cookies = await page.cookies();
  await browser.close();
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

console.log("Logging in...");
const cookieHeader = await droLogin();
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

// Fetch waypoints
console.log("Fetching waypoints...");
const wpRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${AUTO_PLAN_ID}`, { headers });
const waypoints = await wpRes.json();
console.log(`Total waypoints: ${waypoints.length}`);

// Load template from DB
const templateRows = await sql`
  SELECT rta.anchor_area_name, rta.work_area_number, rta.route_label, rta.route_slot
  FROM route_template_areas rta
  JOIN route_templates rt ON rt.id = rta.template_id
  WHERE rt.name = 'AUTO — 13 drivers'
`;
const wanToRoute = {};
for (const row of templateRows) {
  if (row.work_area_number) wanToRoute[row.work_area_number] = row.route_label;
}
console.log(`Template entries: ${templateRows.length}, unique WANs: ${Object.keys(wanToRoute).length}`);

// Count stops per workAreaNumber in DRO
const wanCounts = {};
for (const wp of waypoints) {
  const wan = wp.workAreaNumber?.trim() ?? "(null)";
  wanCounts[wan] = (wanCounts[wan] ?? 0) + 1;
}

// Which WANs from DRO are NOT in the template?
const unmatched = Object.entries(wanCounts)
  .filter(([wan]) => !wanToRoute[wan])
  .sort((a, b) => b[1] - a[1]);

console.log("\n── WANs in DRO not in template ──────────────────────────");
for (const [wan, count] of unmatched) {
  // Also show what actualRoute those stops are on
  const routes = new Set(waypoints.filter(w => (w.workAreaNumber?.trim() ?? "(null)") === wan).map(w => w.actualRoute?.trim()));
  console.log(`  WAN "${wan}"  →  ${count} stops  →  routes: ${[...routes].join(", ")}`);
}

// Which template WANs have NO stops in DRO?
console.log("\n── Template WANs with 0 DRO stops ──────────────────────");
for (const [wan, route] of Object.entries(wanToRoute)) {
  if (!wanCounts[wan]) {
    console.log(`  WAN "${wan}"  →  ${route}  (0 stops in DRO today)`);
  }
}

// Show full WAN distribution in DRO
console.log("\n── All DRO workAreaNumbers ──────────────────────────────");
for (const [wan, count] of Object.entries(wanCounts).sort((a, b) => b[1] - a[1])) {
  const mapped = wanToRoute[wan] ?? "⚠ NOT IN TEMPLATE";
  console.log(`  "${wan}".padEnd(8) ${String(count).padStart(4)} stops → ${mapped}`);
}

// Show template anchor areas for routes with 0 stops
console.log("\n── Template entries for 0-stop routes ──────────────────");
const zeroRoutes = new Set(Object.values(wanToRoute).filter(r => {
  const stopsOnRoute = waypoints.filter(w => w.actualRoute?.includes(r.replace("742 ", "")));
  return stopsOnRoute.length === 0;
}));
for (const row of templateRows) {
  if (zeroRoutes.has(row.route_label)) {
    console.log(`  ${row.route_label.padEnd(22)} WAN=${row.work_area_number}  area=${row.anchor_area_name}`);
  }
}
