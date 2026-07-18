import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";
const CHROME     = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const env     = readFileSync(".env.local", "utf8");
const getEnv  = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
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
const submitBtn = await popup.$('input[type="submit"], button[type="submit"]');
if (submitBtn) await submitBtn.click(); else await popup.keyboard.press("Enter");

await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));
await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
const stations = await page.$$('[class*="station" i]');
if (stations.length > 0) await stations[0].click();
await new Promise(r => setTimeout(r, 3000));

const cookies = await page.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

// Get active route plan
const planRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
const plan = await planRes.json();
const routePlanId = plan.planId;
console.log("routePlanId:", routePlanId);

const endpoints = [
  `/api/api/service-areas/${SA_ID}/route-plans`,
  `/api/api/service-areas/${SA_ID}/anchor-area`,
  `/api/api/service-areas/${SA_ID}/stop-overrides-temp`,
  `/api/api/service-areas/${SA_ID}/UnroutableWaypoints?`,
  `/api/api/service-areas/${SA_ID}/fleet`,
  `/api/api/service-areas/${SA_ID}/custom-routing-options`,
  `/api/api/service-areas/${SA_ID}/route-plans/${routePlanId}/anchor-area-temp?`,
  `/api/api/service-areas/${SA_ID}/route-plans/${routePlanId}/advanced-vehicle-set-with-routes`,
  `/api/api/stations/${STATION_ID}/stationvolume`,
  `/api/api/service-areas/${SA_ID}/routingstatus?`,
];

const results = {};
for (const ep of endpoints) {
  const res = await fetch(DRO_BASE + ep, { headers });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { j = text; }
  const key = ep.split("/").at(-1).split("?")[0];
  results[key] = j;
  console.log(`\n=== ${key} (${res.status}) ===`);
  console.log(JSON.stringify(j).slice(0, 500));
}

writeFileSync("scripts/dro-route-plan-endpoints.json", JSON.stringify(results, null, 2));
console.log("\nSaved to scripts/dro-route-plan-endpoints.json");
await browser.close();
