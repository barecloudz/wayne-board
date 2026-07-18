import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE = "https://dro.routesmart.com";
const CHROME   = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SA_ID    = "3060743";
const WAIT     = ms => new Promise(r => setTimeout(r, ms));

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page    = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
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

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };

const AUTO_PLAN_ID = 2352850;

// Get the full vehicle set for AUTO
const avsRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/advanced-vehicle-set-with-routes`, { headers: h });
const avsData = await avsRes.json();
const vehicles = avsData.advancedVehicleSet;

console.log(`\n=== AUTO vehicle set (${vehicles.length} vehicles) ===`);
vehicles.forEach((v, i) => console.log(`  [${i}] vehicleSetId:${v.vehicleSetId}  vehicleId:${v.vehicleId}  name:"${v.vehicleName}"  cap:${v.capacity}  anchorAreas:${v.anchorAreas?.length}`));

writeFileSync("scripts/auto-vehicle-set.json", JSON.stringify(avsData, null, 2));
console.log("\nFull data saved → scripts/auto-vehicle-set.json");

// ── Try PUT to update the vehicle set (remove last vehicle as a test) ─────────
// We'll try on AUTO only — never touch Blake 13
const testVehiclesCopy = [...vehicles]; // all 13
const removedVehicle   = testVehiclesCopy.pop(); // remove last one
console.log(`\nTest: removing "${removedVehicle.vehicleName}" from AUTO...`);

const putAttempts = [
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/advanced-vehicle-set-with-routes`, b: { advancedVehicleSet: testVehiclesCopy } },
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/advanced-vehicle-set-with-routes`, b: testVehiclesCopy },
  { m: "PATCH", p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/advanced-vehicle-set-with-routes`, b: { advancedVehicleSet: testVehiclesCopy } },
  { m: "POST",  p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/advanced-vehicle-set-with-routes`, b: { advancedVehicleSet: testVehiclesCopy } },
  // Also try deleting just one vehicle by vehicleSetId
  { m: "DELETE", p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/advanced-vehicle-set/${removedVehicle.vehicleSetId}` },
  { m: "DELETE", p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/vehicles/${removedVehicle.vehicleId}` },
  { m: "DELETE", p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/vehicle-set/${removedVehicle.vehicleSetId}` },
];

for (const a of putAttempts) {
  const res = await fetch(DRO_BASE + a.p, {
    method: a.m,
    headers: h,
    body: a.b ? JSON.stringify(a.b) : undefined,
  });
  const text = await res.text().catch(() => "");
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  const status = res.status;
  if (status !== 404 && status !== 405) {
    console.log(`  ✓ ${a.m} ...${a.p.split("/").slice(-2).join("/")} → ${status}`, JSON.stringify(data).slice(0, 200));
  } else {
    console.log(`    ${a.m} ...${a.p.split("/").slice(-2).join("/")} → ${status}`);
  }
}

// ── Probe set-active-plan via different patterns ──────────────────────────────
console.log("\n=== Probing set-active-plan ===");
const setActiveAttempts = [
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/set-active` },
  { m: "POST",  p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/set-active` },
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/route-plans/set-active`, b: { planId: AUTO_PLAN_ID } },
  { m: "POST",  p: `/api/api/service-areas/${SA_ID}/route-plans/set-active`, b: { planId: AUTO_PLAN_ID } },
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/active-plan`, b: { planId: AUTO_PLAN_ID } },
  { m: "POST",  p: `/api/api/service-areas/${SA_ID}/active-plan`, b: { planId: AUTO_PLAN_ID } },
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/default` },
  { m: "POST",  p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/default` },
  // The create_solution_by_wave already uses planId — maybe setting active IS just using it in that call
];
for (const a of setActiveAttempts) {
  const res = await fetch(DRO_BASE + a.p, {
    method: a.m,
    headers: h,
    body: a.b ? JSON.stringify(a.b) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (res.status !== 404 && res.status !== 405) {
    console.log(`  ✓ ${a.m} ${a.p.split("/").slice(-2).join("/")} → ${res.status} ${text.slice(0, 100)}`);
  } else {
    console.log(`    ${a.m} ${a.p.split("/").slice(-2).join("/")} → ${res.status}`);
  }
}

await browser.close();
