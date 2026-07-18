/**
 * Quick fetch of the newly discovered endpoints to see what data they return.
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE    = "https://dro.routesmart.com";
const CHROME      = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WAIT        = ms => new Promise(r => setTimeout(r, ms));

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

const SA_ID      = "3060743";
const STATION_ID = "259";

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
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);
await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
const stations = await page.$$('[class*="station" i]');
if (stations.length > 0) await stations[0].click();
await WAIT(4000);

const cookies = await page.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

// Get plan ID
const planRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
const plan = await planRes.json();
const planId = plan.planId;
console.log("planId:", planId);

const endpoints = [
  // Newly discovered
  `/api/api/service-areas/${SA_ID}/drivers`,
  `/api/api/service-areas/${SA_ID}/stop-overrides`,
  `/api/api/service-areas/${SA_ID}/report/packagedetail?unassigned=false`,
  `/api/api/service-areas/${SA_ID}/report/packagedetail?unassigned=true`,
  `/api/api/user/V2`,
  `/api/api/user/V2?service_area_id=${SA_ID}`,
  `/api/api/home/disabled-features`,
  `/api/api/home/version`,
  `/api/api/service-areas`,
  `/api/api/stations`,
  // Extra guesses based on what we now know
  `/api/api/service-areas/${SA_ID}/drivers/${267575}`,
  `/api/api/service-areas/${SA_ID}/report/routedetail`,
  `/api/api/service-areas/${SA_ID}/report/driverperformance`,
  `/api/api/service-areas/${SA_ID}/report/summary`,
  `/api/api/service-areas/${SA_ID}/report/stops`,
  `/api/api/service-areas/${SA_ID}/report/packages`,
  `/api/api/service-areas/${SA_ID}/report/exceptions`,
];

const results = {};
for (const ep of endpoints) {
  const res = await fetch(DRO_BASE + ep, { headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 500); }
  const key = ep.replace(`/api/api/service-areas/${SA_ID}/`, "").replace("/api/api/", "");
  results[key] = { status: res.status, data };

  const preview = JSON.stringify(data).slice(0, 300);
  console.log(`\n=== ${key} (${res.status}) ===`);
  if (res.status === 200) {
    if (Array.isArray(data)) console.log(`  Array[${data.length}] first item keys: ${data[0] ? Object.keys(data[0]).join(", ") : "(empty)"}`);
    else if (typeof data === "object") console.log(`  Object keys: ${Object.keys(data).join(", ")}`);
  }
  console.log(" ", preview.slice(0, 200));
}

writeFileSync("scripts/dro-new-endpoint-data.json", JSON.stringify(results, null, 2));
console.log("\nSaved → scripts/dro-new-endpoint-data.json");
await browser.close();
