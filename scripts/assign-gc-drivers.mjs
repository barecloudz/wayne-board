/**
 * Morning auto-assignment — assigns drivers to routes in GroundCloud.
 *
 * Flow:
 * 1. Load today's daily_work_area_assignments from Wayne Board DB
 *    (which driver is on which work area today)
 * 2. Map each assignment: driver → gc_driver_id, work_area → gc_route_id
 * 3. Get today's GroundCloud route-days
 * 4. PATCH each route-day with the correct driver
 *
 * Run: node scripts/assign-gc-drivers.mjs [YYYY-MM-DD]
 *   Date defaults to today.
 *
 * Also callable as a cron endpoint: POST /api/cron/assign-gc-drivers
 */

import puppeteer from "puppeteer";
import https from "https";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

const sql    = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const BASE   = "https://www.groundcloud.io";
const CUSTOMER = 439;

const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10);

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function apiGet(cookieHdr, path) {
  return new Promise((resolve) => {
    const opts = { host: "www.groundcloud.io", path, headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" } };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: { _raw: data.slice(0, 300) } }); } });
    }).on("error", e => resolve({ status: 0, body: { _err: e.message } }));
  });
}

function apiPatch(cookieHdr, path, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const csrfMatch = cookieHdr.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : "";
    const opts = {
      host: "www.groundcloud.io", path, method: "PATCH",
      headers: {
        Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json", "X-CSRFToken": csrf,
        "Content-Length": Buffer.byteLength(payload), Referer: "https://www.groundcloud.io/",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: { _raw: data.slice(0, 200) } }); } });
    });
    req.on("error", e => resolve({ status: 0, body: { _err: e.message } }));
    req.write(payload);
    req.end();
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login() {
  const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('gc_username', 'gc_password')`;
  const creds = Object.fromEntries(credsRows.map(r => [r.key, r.value]));
  const username = creds["gc_username"] || "Blake742Logistics";
  const password = creds["gc_password"] || "dowell2026";

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`${BASE}/dashboard/login/`, { waitUntil: "networkidle2" });
  const u = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const p = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (u) await u.type(username, { delay: 30 });
  if (p) await p.type(password, { delay: 30 });
  await page.evaluate(() => document.querySelector("form")?.submit());
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  const cookies = await page.cookies();
  await browser.close();
  const sid  = cookies.find(c => c.name === "sessionid");
  const csrf = cookies.find(c => c.name === "csrftoken");
  if (!sid) throw new Error("GroundCloud login failed — no sessionid");
  return `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🚚 GC Driver Assignment — ${targetDate}\n`);

  // ── Load route map: work_area_number → gc_route_id ────────────────────────
  const routeMapRows = await sql`SELECT work_area_number, gc_route_id, gc_route_name, dro_name FROM gc_route_map WHERE active = true`;
  const routeMap = Object.fromEntries(routeMapRows.map(r => [r.work_area_number, r]));
  // Also index by GC route name (no leading zero) for fallback lookup
  const routeByName = Object.fromEntries(routeMapRows.map(r => [r.gc_route_name ?? r.work_area_number.replace(/^0+/, ""), r]));
  console.log(`Loaded ${routeMapRows.length} routes from gc_route_map`);

  // ── Load driver map: driver_id → gc_driver_id ─────────────────────────────
  const driverRows = await sql`SELECT driver_id, name, gc_driver_id FROM drivers WHERE active = true AND gc_driver_id IS NOT NULL`;
  const driverMap = Object.fromEntries(driverRows.map(r => [r.driver_id, r]));
  console.log(`Loaded ${driverRows.length} drivers with GC IDs`);

  // ── Load today's work area assignments from Wayne Board ───────────────────
  // daily_work_area_assignments joins driver → work_area
  // work_areas has a name but we need the DRO workAreaNumber
  // Try dro_routes table first (has work_area_number, sort_date)
  const today = targetDate;

  // Check if there are daily work area assignments
  const assignments = await sql`
    SELECT
      dwa.driver_id,
      d.name AS driver_name,
      d.gc_driver_id,
      wa.name AS work_area_name
    FROM daily_work_area_assignments dwa
    JOIN drivers d ON d.driver_id = dwa.driver_id
    JOIN work_areas wa ON wa.id = dwa.work_area_id
    WHERE dwa.date = ${today}
  `;

  if (assignments.length === 0) {
    console.log(`\n⚠️  No daily work area assignments found for ${today} in Wayne Board.`);
    console.log("   Set the schedule in Wayne Board first, then run this script.\n");
    console.log("─── Today's GC route-days (unassigned check) ───");

    // Still show what GC has so we know what's there
    const cookieHdr = await login();
    const rdResp = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${today}`);
    for (const rd of rdResp.body?.results || []) {
      const routeRow = routeByName[String(rd.route)] || routeMapRows.find(r => r.gc_route_id === rd.route);
      console.log(`  Route ${routeRow?.dro_name ?? rd.route}  driver=${rd.driver ?? "UNASSIGNED"}  status=${rd.status}`);
    }
    return;
  }

  console.log(`\nFound ${assignments.length} assignments for ${today}:`);
  for (const a of assignments) {
    console.log(`  ${a.driver_name} → ${a.work_area_name}  (gc_driver_id=${a.gc_driver_id ?? "MISSING"})`);
  }

  // ── Login to GC ───────────────────────────────────────────────────────────
  const cookieHdr = await login();
  console.log("\n✅ Logged into GroundCloud\n");

  // ── Get today's GC route-days ─────────────────────────────────────────────
  const rdResp = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${today}`);
  const routeDays = rdResp.body?.results || [];
  console.log(`${routeDays.length} route-days found in GroundCloud for ${today}\n`);

  // Build index: gc_route_id → route-day
  const rdByRoute = Object.fromEntries(routeDays.map(rd => [String(rd.route), rd]));

  // ── Assign each driver ────────────────────────────────────────────────────
  const results = { success: [], failed: [], skipped: [] };

  for (const assignment of assignments) {
    const { driver_id, driver_name, gc_driver_id, work_area_name } = assignment;

    if (!gc_driver_id) {
      console.log(`  ⚠️  ${driver_name} — no gc_driver_id, skipping`);
      results.skipped.push({ driver_name, reason: "no gc_driver_id" });
      continue;
    }

    // Find the GC route ID for this work area
    // work_area_name from Wayne Board may be a route number ("255"), a DRO name ("ASHE HWY"),
    // or a work_area_number ("0255") — try all three
    const routeRow = routeMapRows.find(r =>
      r.dro_name?.toUpperCase() === work_area_name?.toUpperCase() ||
      r.work_area_number === work_area_name ||
      r.gc_route_name === work_area_name ||
      r.gc_route_name === work_area_name?.replace(/^0+/, "")
    );

    if (!routeRow) {
      console.log(`  ⚠️  ${driver_name} → "${work_area_name}" — no GC route mapping found`);
      results.skipped.push({ driver_name, reason: `no route mapping for "${work_area_name}"` });
      continue;
    }

    // Find the route-day for this route
    const rd = rdByRoute[String(routeRow.gc_route_id)];
    if (!rd) {
      console.log(`  ⚠️  ${driver_name} → ${routeRow.dro_name} — no route-day found in GC for today`);
      results.skipped.push({ driver_name, reason: `no route-day for route ${routeRow.gc_route_id}` });
      continue;
    }

    // PATCH the route-day
    const patch = await apiPatch(cookieHdr, `/api/route-days/${rd.id}/`, { driver: gc_driver_id });

    if (patch.status >= 200 && patch.status < 300) {
      console.log(`  ✅ ${driver_name} → ${routeRow.dro_name} (route-day ${rd.id})`);
      results.success.push({ driver_name, route: routeRow.dro_name, rd_id: rd.id });
    } else {
      console.log(`  ❌ ${driver_name} → ${routeRow.dro_name} — PATCH failed (${patch.status}): ${JSON.stringify(patch.body).slice(0, 100)}`);
      results.failed.push({ driver_name, route: routeRow.dro_name, status: patch.status });
    }

    await new Promise(r => setTimeout(r, 100)); // gentle rate limit
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════ SUMMARY ═══════════════");
  console.log(`✅ Assigned: ${results.success.length}`);
  if (results.skipped.length) console.log(`⚠️  Skipped:  ${results.skipped.length} (${results.skipped.map(s => s.driver_name).join(", ")})`);
  if (results.failed.length)  console.log(`❌ Failed:   ${results.failed.length}`);
  console.log("═══════════════════════════════════════\n");

  return results;
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
