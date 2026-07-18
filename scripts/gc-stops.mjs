/**
 * Pull full stops + performance data for route-days.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CUSTOMER = 439;

function apiGet(cookieHdr, p) {
  return new Promise((resolve) => {
    const opts = { host: "www.groundcloud.io", path: p, headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" } };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data.slice(0, 300) }); } });
    }).on("error", e => resolve({ _err: e.message }));
  });
}

async function login() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("https://www.groundcloud.io/dashboard/login/", { waitUntil: "networkidle2" });
  const u = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const p = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (u) await u.type("Blake742Logistics", { delay: 30 });
  if (p) await p.type("dowell2026", { delay: 30 });
  await page.evaluate(() => { document.querySelector("form")?.submit(); });
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  const cookies = await page.cookies();
  await browser.close();
  const sid = cookies.find(c => c.name === "sessionid");
  const csrf = cookies.find(c => c.name === "csrftoken");
  if (!sid) throw new Error("Login failed. URL after: " + (await page?.url?.() || "unknown"));
  return `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
}

async function run() {
  console.log("Logging in...");
  const cookieHdr = await login();
  console.log("✅ Logged in");

  const result = {};

  // ── Get yesterday's route-days (we know 2026-07-15 has 13) ────────────────
  const DATE = "2026-07-15";
  console.log(`\n→ Route-days for ${DATE}...`);
  const rdResp = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${DATE}`);
  const routeDays = rdResp.results || [];
  console.log(`  ${routeDays.length} route-days`);
  result.routeDays = routeDays;

  if (routeDays.length > 0) {
    console.log("  Full keys:", Object.keys(routeDays[0]).join(", "));
    // Show performance metrics for each route
    routeDays.forEach(rd => {
      const driver = rd.driver?.user ? `${rd.driver.user.first_name} ${rd.driver.user.last_name}` : "?";
      console.log(`  route=${rd.route?.name} driver=${driver} mph=${rd.stops_per_hour} miles=${rd.miles_total} status=${rd.status}`);
    });
  }

  // ── Get stat-types from the stats endpoint ─────────────────────────────────
  console.log(`\n→ Fetching all stat types for ${DATE}...`);
  // Try broader range of stat types
  const allStatTypes = Array.from({length: 200}, (_, i) => i + 1);
  const statParams = allStatTypes.map(s => `stat_type[]=${s}`).join("&");
  const statsResp = await apiGet(cookieHdr, `/api/route-day-decimal-stats/?customer=${CUSTOMER}&route_day__day=${DATE}&${statParams}`);
  result.stats = statsResp.results || [];
  console.log(`  ${result.stats.length} stats`);

  if (result.stats.length > 0) {
    console.log("  Stat keys:", Object.keys(result.stats[0]).join(", "));
    const byType = {};
    result.stats.forEach(s => {
      if (!byType[s.stat_type]) byType[s.stat_type] = [];
      byType[s.stat_type].push(s.value);
    });
    Object.entries(byType).forEach(([type, vals]) => {
      console.log(`  stat_type=${type}: [${vals.slice(0,5).join(", ")}]`);
    });
  }

  // ── Pull full stop list for first route-day ────────────────────────────────
  if (routeDays.length > 0) {
    const rdId = routeDays[0].id;
    console.log(`\n→ Full route-day detail id=${rdId}...`);
    const detail = await apiGet(cookieHdr, `/api/route-days/${rdId}/`);
    result.sampleRouteDayDetail = detail;

    console.log("  Keys:", Object.keys(detail).join(", "));
    console.log("  stops_per_hour:", detail.stops_per_hour);
    console.log("  drive_time:", detail.drive_time, "s =", (detail.drive_time/3600).toFixed(1), "hrs");
    console.log("  miles_total:", detail.miles_total);

    const stops = detail.stops || [];
    console.log(`  stops: ${stops.length}`);
    if (stops[0]) {
      console.log("  stop keys:", Object.keys(stops[0]).join(", "));
      console.log("  sample stop:", JSON.stringify(stops[0]).slice(0, 500));
    }

    // ── Stop-level stats ────────────────────────────────────────────────────
    console.log(`\n→ Stop decimal stats...`);
    const stopStats = await apiGet(cookieHdr, `/api/stop-decimal-stats/?customer=${CUSTOMER}&route_day=${rdId}&limit=500`);
    result.stopStats = stopStats.results || [];
    console.log(`  ${result.stopStats.length} stop stats`);
    if (result.stopStats[0]) {
      console.log("  keys:", Object.keys(result.stopStats[0]).join(", "));
      console.log("  sample:", JSON.stringify(result.stopStats[0]).slice(0, 300));
    }
  }

  // ── All routes ─────────────────────────────────────────────────────────────
  console.log("\n→ All routes...");
  const routes = await apiGet(cookieHdr, `/api/routes/?customer=${CUSTOMER}&archived=false&limit=50`);
  result.routes = routes.results || [];
  console.log(`  ${result.routes.length} routes`);
  result.routes.slice(0, 5).forEach(r => {
    console.log(`  route id=${r.id} name="${r.name}" driver=${r.driver} terminal=${r.terminal?.name}`);
  });

  // ── Ryde scores? Look for score-related endpoints ──────────────────────────
  console.log("\n→ Checking score endpoints...");
  const scoreEndpoints = [
    `/api/ryde-scores/?customer=${CUSTOMER}`,
    `/api/scores/?customer=${CUSTOMER}`,
    `/api/driver-scores/?customer=${CUSTOMER}`,
    `/api/coaching-events/?customer=${CUSTOMER}&limit=5`,
    `/api/events/?customer=${CUSTOMER}&limit=5`,
    `/api/device-events/?customer=${CUSTOMER}&limit=5`,
  ];
  for (const ep of scoreEndpoints) {
    const r = await apiGet(cookieHdr, ep);
    if (r._raw || r._err) { console.log(`  ${ep.split('?')[0]} → 404/HTML`); continue; }
    const count = r.count ?? (Array.isArray(r) ? r.length : "?");
    console.log(`  ${ep.split('?')[0]} → ${count} results`);
    if (r.results?.[0]) console.log("    keys:", Object.keys(r.results[0]).slice(0,8).join(", "));
  }

  // ── Historical stops_per_hour across multiple days ─────────────────────────
  console.log("\n→ Historical performance (last 14 days)...");
  const perfData = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date("2026-07-16");
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const r = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${dateStr}`);
    const rds = r.results || [];
    if (rds.length > 0) {
      const avgSph = (rds.reduce((s, rd) => s + (parseFloat(rd.stops_per_hour) || 0), 0) / rds.length).toFixed(2);
      console.log(`  ${dateStr}: ${rds.length} routes, avg stops/hr=${avgSph}`);
      rds.forEach(rd => {
        const name = rd.driver?.user ? `${rd.driver.user.first_name} ${rd.driver.user.last_name}` : "?";
        perfData.push({ date: dateStr, route: rd.route?.name, driver: name, stops_per_hour: rd.stops_per_hour, miles: rd.miles_total, status: rd.status });
      });
    }
  }
  result.historicalPerf = perfData;

  fs.writeFileSync(path.join(__dirname, "groundcloud-stops.json"), JSON.stringify(result, null, 2));
  console.log("\n✅ Saved to scripts/groundcloud-stops.json");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
