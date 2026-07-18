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

// ── Login ─────────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

// Capture all API calls made while navigating the historical page
const historicalCalls = [];
page.on("response", res => {
  const url = res.url();
  if (url.includes("/api/")) historicalCalls.push({ method: res.request().method(), url, status: res.status() });
});

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
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(5000);
console.log("Logged in.");

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };
const planId = (await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers: h })).json()).planId;

// ── Navigate to HISTORICAL and watch network ──────────────────────────────────
console.log("\nClicking HISTORICAL…");
historicalCalls.length = 0; // reset

await page.evaluate(() => {
  const all = document.querySelectorAll('a, button, li, span');
  for (const el of all) {
    if (el.textContent?.trim() === "HISTORICAL" && el.getBoundingClientRect().width > 0) { el.click(); break; }
  }
});
await WAIT(5000);
await page.screenshot({ path: "scripts/hist-01-loaded.png" });

console.log("API calls during HISTORICAL load:");
historicalCalls.forEach(c => console.log(" ", c.status, c.method, c.url.replace(DRO_BASE,"")));

// ── Also navigate SWITCH VIEW → Sandbox ──────────────────────────────────────
console.log("\nClicking SWITCH VIEW…");
historicalCalls.length = 0;
await page.evaluate(() => {
  const all = document.querySelectorAll('a, button');
  for (const el of all) {
    if (el.textContent?.trim() === "SWITCH VIEW" && el.getBoundingClientRect().width > 0) { el.click(); break; }
  }
});
await WAIT(2000);
await page.screenshot({ path: "scripts/hist-02-switchview.png" });

// Try clicking Sandbox
await page.evaluate(() => {
  const all = document.querySelectorAll('a, button, li');
  for (const el of all) {
    const txt = el.textContent?.trim().toLowerCase();
    if ((txt === "sandbox" || txt?.includes("sandbox")) && el.getBoundingClientRect().width > 0) { el.click(); break; }
  }
});
await WAIT(3000);
await page.screenshot({ path: "scripts/hist-03-sandbox.png" });
console.log("API calls for Sandbox:");
historicalCalls.forEach(c => console.log(" ", c.status, c.method, c.url.replace(DRO_BASE,"")));

// ── Direct probes ─────────────────────────────────────────────────────────────
async function get(path) {
  const res = await fetch(DRO_BASE + path, { headers: h });
  const text = await res.text().catch(() => "");
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text.slice(0, 500) }; }
}

console.log("\n=== Probing historical endpoints ===");
const dates = ["2026-07-10", "2026-07-16", "2026-07-17", "2026-07-15"];
const probeResults = {};

for (const date of dates) {
  const paths = [
    `/api/api/service-areas/${SA_ID}/historical-summary?date=${date}`,
    `/api/api/service-areas/${SA_ID}/historical-summary?sortDate=${date}`,
    `/api/api/service-areas/${SA_ID}/historical-summary?startDate=${date}&endDate=${date}`,
    `/api/api/service-areas/${SA_ID}/historical?date=${date}`,
    `/api/api/service-areas/${SA_ID}/historical?sortDate=${date}`,
    `/api/api/stations/${STATION_ID}/historical?date=${date}`,
    `/api/api/stations/${STATION_ID}/historical-summary?date=${date}`,
    `/api/api/service-areas/${SA_ID}/report/historical?date=${date}`,
    `/api/api/service-areas/${SA_ID}/report/history?date=${date}`,
    `/api/api/service-areas/${SA_ID}/route-summary?date=${date}`,
    `/api/api/service-areas/${SA_ID}/route-summary?sortDate=${date}`,
    `/api/api/service-areas/${SA_ID}/waypoints?sortDate=${date}&solutionType=actual`,
  ];
  for (const path of paths) {
    const r = await get(path);
    const key = path.replace(DRO_BASE, "");
    if (r.status === 200) {
      probeResults[key] = r;
      const d = r.data;
      if (Array.isArray(d)) console.log(`✓ ${path.split("?")[0].split("/api/api/").at(-1).slice(0,50).padEnd(52)} Array[${d.length}] keys: ${d[0] ? Object.keys(d[0]).join(", ").slice(0,100) : "empty"}`);
      else if (typeof d === "object" && d) console.log(`✓ ${path.split("?")[0].split("/api/api/").at(-1).slice(0,50).padEnd(52)} Object keys: ${Object.keys(d).join(", ").slice(0,100)}`);
      else console.log(`✓ ${path.slice(0,80)}: ${String(d).slice(0,100)}`);
    }
  }
}

// Sandbox-specific probes
console.log("\n=== Probing sandbox endpoints ===");
const sandboxPaths = [
  `/api/api/service-areas/${SA_ID}/sandbox`,
  `/api/api/service-areas/${SA_ID}/sandbox/settings`,
  `/api/api/service-areas/${SA_ID}/sandbox/config`,
  `/api/api/service-areas/${SA_ID}/training-area/settings`,
  `/api/api/service-areas/3060744/training-area/settings`,
  `/api/api/service-areas/${SA_ID}/model`,
  `/api/api/service-areas/${SA_ID}/model/settings`,
  `/api/api/service-areas/${SA_ID}/simulation`,
  `/api/api/stations/${STATION_ID}/sandbox`,
  `/api/api/stations/${STATION_ID}/volume-settings`,
  `/api/api/stations/${STATION_ID}/inbound`,
  `/api/api/service-areas/${SA_ID}/inbound`,
  `/api/api/service-areas/${SA_ID}/inbound-packages`,
  `/api/api/service-areas/${SA_ID}/stationvolume`,
];
for (const path of sandboxPaths) {
  const r = await get(path);
  if (r.status === 200) {
    const d = r.data;
    probeResults[path] = r;
    if (Array.isArray(d)) console.log(`✓ ${path.split("/api/api/").at(-1).slice(0,60).padEnd(60)} Array[${d.length}]  keys: ${d[0] ? Object.keys(d[0]).join(", ").slice(0,100) : "empty"}`);
    else if (typeof d === "object" && d) console.log(`✓ ${path.split("/api/api/").at(-1).slice(0,60).padEnd(60)} Object  keys: ${Object.keys(d).join(", ").slice(0,100)}`);
    else console.log(`✓ ${path.split("/api/api/").at(-1)}: ${String(d).slice(0,100)}`);
  }
}

writeFileSync("scripts/dro-historical-data.json", JSON.stringify(probeResults, null, 2));
console.log("\nSaved → scripts/dro-historical-data.json");
await browser.close();
