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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
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
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(4000);

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };
const planId = (await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers: h })).json()).planId;
console.log("planId:", planId);

async function get(path) {
  const res = await fetch(DRO_BASE + path, { headers: h });
  const text = await res.text().catch(() => "");
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

const results = {};

// ── Newly discovered endpoints ─────────────────────────────────────────────────
const toFetch = {
  "route-plans":               `/api/api/service-areas/${SA_ID}/route-plans`,
  "historical-summary":        `/api/api/service-areas/${SA_ID}/historical-summary`,
  "GetCSPLargePackageRules":   `/api/api/service-areas/${SA_ID}/GetCSPLargePackageRules`,
  "create-routes":             `/api/api/service-areas/${SA_ID}/create-routes`,
  "routes":                    `/api/api/service-areas/${SA_ID}/routes`,
  "waypoints-extent":          `/api/api/service-areas/${SA_ID}/waypoints/extent`,
  "dynamic-zone-settings":     `/api/api/service-areas/route-plan/${planId}/dynamic-zone-settings`,
  "planningWindowState":       `/api/api/service-areas/station/${STATION_ID}/planningWindowState`,
  "GetActiveServiceAreas":     `/api/api/stations/${STATION_ID}/GetActiveServiceAreas`,
  "sort-plans-lastsubmission": `/api/api/stations/${STATION_ID}/sort-plans/lastsubmission/wave/1`,
  "report-base":               `/api/api/service-areas/${SA_ID}/report`,
  "stop-overrides-temp-full":  `/api/api/service-areas/${SA_ID}/stop-overrides-temp`,
  "report-packagedetail-plan": `/api/api/service-areas/${SA_ID}/report/packagedetail?routePlanId=${planId}`,
  // Report sub-paths found in UI
  "report-solution-summary":   `/api/api/service-areas/${SA_ID}/report/solution-summary`,
  "report-cost-detail":        `/api/api/service-areas/${SA_ID}/report/cost-detail`,
  "report-costdetail":         `/api/api/service-areas/${SA_ID}/report/costdetail`,
  "report-time-distance":      `/api/api/service-areas/${SA_ID}/report/time-distance`,
  "report-timeanddistance":    `/api/api/service-areas/${SA_ID}/report/timeanddistance`,
  "report-package-type":       `/api/api/service-areas/${SA_ID}/report/package-type`,
  "report-packagetype":        `/api/api/service-areas/${SA_ID}/report/packagetype`,
  "report-section-avail":      `/api/api/service-areas/${SA_ID}/report/section-availability`,
  "report-sectionavail":       `/api/api/service-areas/${SA_ID}/report/sectionavailability`,
  "report-inbound":            `/api/api/service-areas/${SA_ID}/report/inbound`,
  "report-inbound-package":    `/api/api/service-areas/${SA_ID}/report/inboundpackage`,
  "report-stop-assignment":    `/api/api/service-areas/${SA_ID}/report/stop-assignment-summary`,
  "report-stopassignment":     `/api/api/service-areas/${SA_ID}/report/stopassignmentsummary`,
  "route-plans-detail":        `/api/api/service-areas/${SA_ID}/route-plans/${planId}`,
  "contacts":                  `/api/api/service-areas/${SA_ID}/contacts`,
};

for (const [key, path] of Object.entries(toFetch)) {
  const r = await get(path);
  results[key] = r;
  const d = r.data;
  const icon = r.status === 200 ? "✓" : r.status === 404 ? "✗" : `→${r.status}`;
  if (r.status === 200) {
    if (Array.isArray(d)) {
      console.log(`\n✓ ${key} — Array[${d.length}]`);
      if (d[0]) { console.log("  keys:", Object.keys(d[0]).join(", ")); console.log("  first:", JSON.stringify(d[0]).slice(0, 300)); }
    } else if (typeof d === "object" && d) {
      console.log(`\n✓ ${key} — Object`);
      console.log("  keys:", Object.keys(d).join(", "));
      console.log("  data:", JSON.stringify(d).slice(0, 300));
    } else {
      console.log(`\n✓ ${key}:`, String(d).slice(0, 200));
    }
  } else {
    console.log(`  ${icon} ${key} (${r.status})`);
  }
}

writeFileSync("scripts/dro-discoveries.json", JSON.stringify(results, null, 2));
console.log("\nSaved → scripts/dro-discoveries.json");
await browser.close();
