/**
 * GroundCloud data pull — logs in fresh, queries all historical endpoints.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USERNAME = "Blake742Logistics";
const PASSWORD = "dowell2026";
const BASE = "https://www.groundcloud.io";
const CUSTOMER = 439;

function apiGet(cookieHdr, path) {
  return new Promise((resolve) => {
    const opts = { host: "www.groundcloud.io", path, headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" } };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data.slice(0, 200) }); } });
    }).on("error", e => resolve({ _err: e.message }));
  });
}

async function login() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto(`${BASE}/dashboard/login/`, { waitUntil: "networkidle2" });

  const userInput = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const passInput = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (userInput) await userInput.type(USERNAME, { delay: 30 });
  if (passInput) await passInput.type(PASSWORD, { delay: 30 });

  await page.evaluate(() => { const f = document.querySelector("form"); if (f) f.submit(); });
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

  const url = page.url();
  const cookies = await page.cookies();
  await browser.close();

  const sid = cookies.find(c => c.name === "sessionid");
  const csrf = cookies.find(c => c.name === "csrftoken");
  if (!sid) throw new Error("Login failed — no sessionid. URL: " + url);

  const cookieHdr = `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
  console.log("✅ Logged in. sessionid:", sid.value.slice(0, 20) + "...");
  return cookieHdr;
}

async function run() {
  const cookieHdr = await login();

  const result = {};

  // ── Drivers ────────────────────────────────────────────────────────────────
  console.log("\n→ Drivers...");
  const driversResp = await apiGet(cookieHdr, `/api/drivers/?customer=${CUSTOMER}&include_inactive=false`);
  result.drivers = driversResp.results || [];
  console.log(`  ${result.drivers.length} drivers`);
  if (result.drivers[0]) {
    console.log("  keys:", Object.keys(result.drivers[0]).join(", "));
    console.log("  sample:", JSON.stringify(result.drivers[0]).slice(0, 400));
  }

  // ── Vehicles ───────────────────────────────────────────────────────────────
  console.log("\n→ Vehicles...");
  const vehiclesResp = await apiGet(cookieHdr, `/api/vehicles/?customer=${CUSTOMER}`);
  result.vehicles = vehiclesResp.results || [];
  console.log(`  ${result.vehicles.length} vehicles`);
  if (result.vehicles[0]) {
    console.log("  keys:", Object.keys(result.vehicles[0]).join(", "));
  }

  // ── Route-days — find dates with data ──────────────────────────────────────
  console.log("\n→ Finding route-days with data...");
  const today = new Date();
  let routeDayData = [];
  let foundDate = null;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const r = await apiGet(cookieHdr, `/api/route-days/?mini=true&customer=${CUSTOMER}&day=${dateStr}`);
    const count = r.results?.length ?? 0;
    console.log(`  ${dateStr}: ${count} route-days`);
    if (count > 0) {
      routeDayData = r.results;
      foundDate = dateStr;
      break;
    }
  }

  if (foundDate) {
    console.log(`\n→ Full route-day data for ${foundDate}...`);
    result.routeDays = routeDayData;
    console.log("  keys:", Object.keys(routeDayData[0]).join(", "));
    console.log("  first route-day:", JSON.stringify(routeDayData[0]).slice(0, 600));

    // ── Route-day stats ─────────────────────────────────────────────────────
    console.log("\n→ Route-day stats (all stat types)...");
    // Stat types we know about: 1=stops, 2=packages, 100=score, etc.
    const statTypes = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
                       100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120];
    const statParams = statTypes.map(s => `stat_type[]=${s}`).join("&");
    const statsResp = await apiGet(cookieHdr,
      `/api/route-day-decimal-stats/?customer=${CUSTOMER}&route_day__day=${foundDate}&${statParams}`
    );
    result.stats = statsResp.results || [];
    console.log(`  ${result.stats.length} stats`);
    if (result.stats[0]) {
      console.log("  keys:", Object.keys(result.stats[0]).join(", "));
      // Group by stat_type
      const byType = {};
      result.stats.forEach(s => {
        if (!byType[s.stat_type]) byType[s.stat_type] = [];
        byType[s.stat_type].push({ route_day: s.route_day, value: s.value });
      });
      console.log("\n  Stat types found:", Object.keys(byType).join(", "));
      Object.entries(byType).forEach(([type, rows]) => {
        console.log(`  stat_type=${type}: ${rows.length} rows, values: ${rows.map(r => r.value).slice(0,5).join(", ")}`);
      });
    }

    // ── Full route-day detail ────────────────────────────────────────────────
    const firstRdId = routeDayData[0]?.id;
    if (firstRdId) {
      console.log(`\n→ Full route-day detail id=${firstRdId}...`);
      const rdDetail = await apiGet(cookieHdr, `/api/route-days/${firstRdId}/`);
      result.routeDayDetail = rdDetail;
      console.log("  keys:", Object.keys(rdDetail).join(", "));
      console.log("  data:", JSON.stringify(rdDetail).slice(0, 800));
    }
  }

  // ── API root discovery ─────────────────────────────────────────────────────
  console.log("\n→ API root...");
  const apiRoot = await apiGet(cookieHdr, "/api/");
  if (apiRoot && !apiRoot._raw) {
    result.apiEndpoints = Object.keys(apiRoot);
    console.log("  Available endpoints:", Object.keys(apiRoot).join(", "));
  } else {
    console.log("  API root:", JSON.stringify(apiRoot).slice(0, 200));
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  console.log("\n→ Manifests...");
  const manifests = await apiGet(cookieHdr, `/api/manifests/?customer=${CUSTOMER}&limit=5`);
  result.manifests = manifests.results || [];
  if (result.manifests[0]) {
    console.log("  keys:", Object.keys(result.manifests[0]).join(", "));
    console.log("  sample:", JSON.stringify(result.manifests[0]).slice(0, 400));
  } else {
    console.log("  raw:", JSON.stringify(manifests).slice(0, 200));
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  console.log("\n→ Routes...");
  const routes = await apiGet(cookieHdr, `/api/routes/?customer=${CUSTOMER}`);
  result.routesList = routes.results || [];
  if (result.routesList[0]) {
    console.log("  keys:", Object.keys(result.routesList[0]).join(", "));
    console.log("  sample:", JSON.stringify(result.routesList[0]).slice(0, 400));
  } else {
    console.log("  raw:", JSON.stringify(routes).slice(0, 200));
  }

  // Save everything
  fs.writeFileSync(path.join(__dirname, "groundcloud-data.json"), JSON.stringify(result, null, 2));
  console.log("\n✅ Saved to scripts/groundcloud-data.json");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
