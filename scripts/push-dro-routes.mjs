/**
 * Template-based DRO route push
 * Assigns stops to routes using the anchor area template (workAreaNumber → routeLabel).
 * This replaces the geometry-guessing approach in sync-and-run.mjs.
 *
 * Usage: node scripts/push-dro-routes.mjs [templateName]
 *   templateName defaults to "AUTO — 13 drivers"
 *
 * Prerequisites:
 *   - DRO plan for today is already set as ACTIVE in DRO UI
 *   - Template is saved in route_template_areas table
 */

import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const TEMPLATE_NAME = args[0] ?? "AUTO — 13 drivers";
const CHROME     = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";

const env        = readFileSync(".env.local", "utf8");
const getEnv     = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const DATABASE_URL = getEnv("DATABASE_URL_POOLER") || getEnv("DATABASE_URL");
const sql        = neon(DATABASE_URL);
const username   = getEnv("DRO_USERNAME");
const password   = getEnv("DRO_PASSWORD");

// ── Login ─────────────────────────────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════════════
console.log(`Template: "${TEMPLATE_NAME}"`);

// Load template from DB
const templateRows = await sql`
  SELECT rta.anchor_area_name, rta.work_area_number, rta.route_label
  FROM route_template_areas rta
  JOIN route_templates rt ON rt.id = rta.template_id
  WHERE rt.name = ${TEMPLATE_NAME}
    AND rta.work_area_number IS NOT NULL
    AND rta.work_area_number != ''
`;

if (!templateRows.length) {
  console.error(`No template areas found for "${TEMPLATE_NAME}". Check the template name.`);
  process.exit(1);
}

const wanToRoute = {};
for (const row of templateRows) {
  wanToRoute[row.work_area_number] = row.route_label;
}
const uniqueRoutes = [...new Set(Object.values(wanToRoute))];
console.log(`Template: ${templateRows.length} areas, ${uniqueRoutes.length} routes`);
console.log(`Routes: ${uniqueRoutes.join(", ")}`);

// Login
console.log("\nLogging into DRO...");
const cookieHeader = await droLogin();
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };
console.log("Logged in ✓");

// Get sort date
const sdText = (await (await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, { headers })).text()).trim().replace(/^"|"$/g, "");
const sortDate = /^\d{4}-\d{2}-\d{2}$/.test(sdText) ? sdText : new Date().toISOString().slice(0, 10);
console.log(`Sort date: ${sortDate}`);

// Get active plan
const activePlan = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers })).json();
const routePlanId = activePlan?.planId;
console.log(`Active plan: [${routePlanId}] ${activePlan?.name}`);

// Fetch waypoints
console.log("Fetching waypoints...");
const waypoints = await (await fetch(
  `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${routePlanId}`,
  { headers }
)).json();
console.log(`Waypoints: ${waypoints.length}`);

// Group by route
const buckets = {};
let skipped = 0;
let noWan = 0;
for (const wp of waypoints) {
  const wan = wp.workAreaNumber?.trim();
  if (!wan) { noWan++; continue; }
  const routeLabel = wanToRoute[wan];
  if (!routeLabel) { skipped++; continue; }
  if (!buckets[routeLabel]) buckets[routeLabel] = [];
  buckets[routeLabel].push(wp.waypointId);
}

console.log(`\nAssignment:`);
for (const [route, ids] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${route.padEnd(24)} ${String(ids.length).padStart(3)} stops`);
}
console.log(`  Kept as-is (no WAN):       ${String(noWan).padStart(3)} stops`);
console.log(`  Unknown WAN (skipped):     ${String(skipped).padStart(3)} stops`);
console.log(`  Total:                     ${String(waypoints.length).padStart(3)} stops`);

// Push transferRoute
console.log("\nPushing routes to DRO...");
const results = [];
for (const [route, waypointIds] of Object.entries(buckets)) {
  if (!waypointIds.length) continue;
  const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`, {
    method: "POST", headers,
    body: JSON.stringify({ route, waypointIds, sort_date: sortDate }),
  });
  const ok = res.ok;
  console.log(`  ${ok ? "✓" : "✗"} ${route} (${waypointIds.length} stops)`);
  if (!ok) console.error(`    HTTP ${res.status}: ${await res.text()}`);
  results.push({ route, stops: waypointIds.length, ok });
}

// Trigger solve
console.log("\nTriggering solve...");
const waveRes = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`, { headers });
const waveData = await waveRes.json().catch(() => ({}));
const waveId = waveData?.waves?.[0]?.waveId ?? 84167;

const solveRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`, {
  method: "POST", headers,
  body: JSON.stringify({
    alternateSolver: false,
    createInformedOptimal: false,
    submittedByStationUser: false,
    waves: [{ waveId, routePlanId, wave: 1 }],
  }),
});
const solveBody = await solveRes.json().catch(() => ({}));

if (solveRes.ok) {
  console.log(`✓ Solve triggered — job ${solveBody.id}, sort date ${solveBody.sortDate}`);
} else {
  console.log(`⚠ Solve returned ${solveRes.status}: ${solveBody.message ?? JSON.stringify(solveBody)}`);
  console.log("  (If outside planning window, solve will run at the designated time)");
}

const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.error(`\n⚠ ${failed.length} route(s) failed: ${failed.map(r => r.route).join(", ")}`);
  process.exit(1);
}

console.log(`\n✓ Done — ${results.length} routes pushed, ${waypoints.length - noWan - skipped} stops assigned`);
