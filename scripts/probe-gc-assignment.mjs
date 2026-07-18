/**
 * Phase 5 probe — discover how to assign a driver to a route-day in GroundCloud.
 *
 * Goals:
 * 1. Find today's route-days and their current driver assignments
 * 2. Find all available drivers
 * 3. Probe PATCH /api/route-days/{id}/ with a driver field change
 * 4. Screenshot the GroundCloud dispatch UI to understand the manual flow
 * 5. Document the exact API call needed
 *
 * Run: node scripts/probe-gc-assignment.mjs
 */

import puppeteer from "puppeteer";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) {
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const USERNAME = "Blake742Logistics";
const PASSWORD = "dowell2026";
const BASE     = "https://www.groundcloud.io";
const CUSTOMER = 439;

function apiGet(cookieHdr, path) {
  return new Promise((resolve) => {
    const opts = {
      host: "www.groundcloud.io",
      path,
      headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" },
    };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: { _raw: data.slice(0, 500) } }); }
      });
    }).on("error", (e) => resolve({ status: 0, data: { _err: e.message } }));
  });
}

function apiPatch(cookieHdr, path, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const cookie = cookieHdr;
    const csrfMatch = cookie.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : "";

    const opts = {
      host: "www.groundcloud.io",
      path,
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
        "X-CSRFToken": csrf,
        "Content-Length": Buffer.byteLength(payload),
        Referer: "https://www.groundcloud.io/",
      },
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: { _raw: data.slice(0, 500) } }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, data: { _err: e.message } }));
    req.write(payload);
    req.end();
  });
}

async function screenshot(page, name) {
  const p = path.join(__dirname, `probe-gc-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 Screenshot: scripts/probe-gc-${name}.png`);
  return p;
}

async function run() {
  const results = {};

  // ── Login via Puppeteer ───────────────────────────────────────────────────
  console.log("Logging into GroundCloud...");
  const browser = await puppeteer.launch({
    headless: false,   // visible so we can see what GC looks like
    args: ["--no-sandbox", "--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/dashboard/login/`, { waitUntil: "networkidle2" });

  const userInput = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const passInput = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (userInput) await userInput.type(USERNAME, { delay: 30 });
  if (passInput) await passInput.type(PASSWORD, { delay: 30 });
  await page.evaluate(() => { document.querySelector("form")?.submit(); });
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

  const cookies = await page.cookies();
  const sid  = cookies.find((c) => c.name === "sessionid");
  const csrf = cookies.find((c) => c.name === "csrftoken");
  if (!sid) throw new Error("Login failed — no sessionid");

  const cookieHdr = `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
  console.log("✅ Logged in\n");

  // ── Screenshot the dashboard ───────────────────────────────────────────────
  await screenshot(page, "1-dashboard");

  // ── Find a recent date with route-days ────────────────────────────────────
  console.log("Finding a date with route-days...");
  let foundDate = null;
  let routeDays = [];
  for (let i = 1; i <= 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const r = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${dateStr}&limit=5`);
    if (r.data?.results?.length > 0) {
      foundDate = dateStr;
      routeDays = r.data.results;
      console.log(`  Found ${routeDays.length} route-days on ${dateStr}`);
      break;
    }
  }

  if (!foundDate) {
    console.log("No recent route-days found. Checking API structure anyway...");
  } else {
    results.routeDaySample = routeDays[0];
    console.log("\n─── Route-day list item (raw) ───");
    console.log(JSON.stringify(routeDays[0], null, 2));

    // Fetch full detail of first route-day
    const detail = await apiGet(cookieHdr, `/api/route-days/${routeDays[0].id}/`);
    results.routeDayDetail = detail.data;
    console.log("\n─── Route-day detail (relevant fields) ───");
    const { id, driver, route, day, status, stops_per_hour } = detail.data;
    console.log(JSON.stringify({ id, driver: driver?.id, driverName: driver?.user ? `${driver.user.first_name} ${driver.user.last_name}` : null, route: route?.name, day, status, stops_per_hour }, null, 2));
  }

  // ── Get driver list ────────────────────────────────────────────────────────
  console.log("\n─── Available drivers (sample) ───");
  const driversResp = await apiGet(cookieHdr, `/api/drivers/?customer=${CUSTOMER}&limit=5`);
  results.driversSample = driversResp.data?.results?.slice(0, 3);
  if (driversResp.data?.results?.[0]) {
    console.log("Driver object keys:", Object.keys(driversResp.data.results[0]).join(", "));
    console.log("Sample driver:", JSON.stringify(driversResp.data.results[0]).slice(0, 300));
  }

  // ── Probe PATCH on a route-day (READ-ONLY test — we'll send current driver back) ──
  if (routeDays.length > 0) {
    const rd = routeDays[0];
    const detail = await apiGet(cookieHdr, `/api/route-days/${rd.id}/`);
    const currentDriverId = detail.data?.driver?.id;

    console.log(`\n─── Probing PATCH /api/route-days/${rd.id}/ ───`);
    console.log(`  Current driver id: ${currentDriverId}`);
    console.log("  Sending same driver back (no actual change) to test if endpoint accepts PATCH...");

    // Test 1: PATCH with driver as integer ID (same value — safe, no actual change)
    const patch1 = await apiPatch(cookieHdr, `/api/route-days/${rd.id}/`, {
      driver: currentDriverId,
    });
    console.log(`  PATCH {driver: ${currentDriverId}} → status ${patch1.status}`);
    if (patch1.status >= 200 && patch1.status < 300) {
      console.log("  ✅ PATCH accepted! Driver field is writable.");
      results.patchDriverWorks = true;
      results.patchDriverField = "driver";
    } else {
      console.log("  Response:", JSON.stringify(patch1.data).slice(0, 300));
    }

    // Test 2: Check what fields ARE patchable — try driver_id or driver_user_id
    if (patch1.status >= 400) {
      const allDriversResp = await apiGet(cookieHdr, `/api/drivers/?customer=${CUSTOMER}`);
      const sampleDriverId = allDriversResp.data?.results?.[0]?.id;
      console.log(`\n  Test 2: PATCH with driver (integer) = ${sampleDriverId}`);
      const patch2 = await apiPatch(cookieHdr, `/api/route-days/${rd.id}/`, {
        driver: sampleDriverId,
      });
      console.log(`  Status: ${patch2.status}`);
      console.log("  Response:", JSON.stringify(patch2.data).slice(0, 300));
    }
  }

  // ── Navigate to GroundCloud dispatch UI and take screenshots ──────────────
  console.log("\n─── Navigating GroundCloud UI ───");

  // Try to find the dispatch/routes view
  const pagesToVisit = [
    { url: `${BASE}/dashboard/`, name: "2-main" },
    { url: `${BASE}/dashboard/dispatch/`, name: "3-dispatch" },
    { url: `${BASE}/dashboard/routes/`, name: "4-routes" },
    { url: `${BASE}/dashboard/manage/`, name: "5-manage" },
  ];

  for (const { url, name } of pagesToVisit) {
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 10000 });
      await new Promise((r) => setTimeout(r, 1000));
      await screenshot(page, name);
      console.log(`  Visited: ${url}`);
    } catch (e) {
      console.log(`  ${url} — timeout or error`);
    }
  }

  // ── Check /api/route-days/ writable fields via OPTIONS ───────────────────
  console.log("\n─── Checking API options ───");
  const optionsResp = await new Promise((resolve) => {
    const csrfMatch = cookieHdr.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : "";
    const opts = {
      host: "www.groundcloud.io",
      path: `/api/route-days/`,
      method: "OPTIONS",
      headers: {
        Cookie: cookieHdr,
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrf,
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: { _raw: data.slice(0, 500) } }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, data: { _err: e.message } }));
    req.end();
  });

  if (optionsResp.data?.actions?.PUT || optionsResp.data?.actions?.PATCH) {
    const fields = Object.keys(optionsResp.data.actions?.PUT || optionsResp.data.actions?.PATCH || {});
    console.log("  Writable fields on route-days:", fields.join(", "));
    results.writableFields = fields;
  } else {
    console.log("  OPTIONS response:", JSON.stringify(optionsResp.data).slice(0, 400));
  }

  // ── Intercept network calls when manually visiting the route assignment UI ─
  console.log("\n─── Monitoring network for assignment API calls ───");
  const apiCalls = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/") && ["POST", "PUT", "PATCH"].includes(req.method())) {
      apiCalls.push({ method: req.method(), url: req.url(), body: req.postData()?.slice(0, 200) });
    }
  });

  // Navigate to a likely assignment page
  try {
    await page.goto(`${BASE}/dashboard/dispatch/`, { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "6-dispatch-loaded");
  } catch (e) {
    console.log("  Dispatch page timeout");
  }

  if (apiCalls.length > 0) {
    console.log("  API calls detected on dispatch page:");
    apiCalls.forEach((c) => console.log(`    ${c.method} ${c.url}  body=${c.body}`));
    results.detectedApiCalls = apiCalls;
  }

  await browser.close();

  // ── Save results ──────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, "probe-gc-assignment-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to scripts/probe-gc-assignment-results.json`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════ SUMMARY ═══════════════");
  if (results.patchDriverWorks) {
    console.log("✅ Driver assignment: PATCH /api/route-days/{id}/ with {driver: <gc_driver_id>}");
  } else {
    console.log("⚠️  PATCH driver assignment — needs more investigation");
  }
  if (results.writableFields) {
    console.log("   Writable fields:", results.writableFields.join(", "));
  }
  console.log("═══════════════════════════════════════");
}

run().catch((err) => { console.error("Fatal:", err); process.exit(1); });
