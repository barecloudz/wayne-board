/**
 * Backfill 90 days of GroundCloud route-day data into gc_route_days.
 *
 * - Logs into GroundCloud once, reuses the session for all dates.
 * - Skips dates that already have data in the DB.
 * - Matches GC drivers to Wayne Board drivers by gc_driver_id (reliable),
 *   with a name-match fallback.
 * - Fetches detail endpoint per route-day for stops_per_hour.
 *
 * Run: node scripts/backfill-gc-history.mjs [days]
 *   days defaults to 90.
 */

import puppeteer from "puppeteer";
import https from "https";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// ── Load .env.local ──────────────────────────────────────────────────────────
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) {
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

const USERNAME = "Blake742Logistics";
const PASSWORD = "dowell2026";
const BASE     = "https://www.groundcloud.io";
const CUSTOMER = 439;
const DAYS     = parseInt(process.argv[2] || "90", 10);

// ── Helpers ──────────────────────────────────────────────────────────────────
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
        try { resolve(JSON.parse(data)); }
        catch { resolve({ _raw: data.slice(0, 300) }); }
      });
    }).on("error", (e) => resolve({ _err: e.message }));
  });
}

function normName(n) {
  return n.toLowerCase().trim().replace(/\s+/g, " ");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login() {
  console.log("Logging into GroundCloud...");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`${BASE}/dashboard/login/`, { waitUntil: "networkidle2" });

  const userInput = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const passInput = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (userInput) await userInput.type(USERNAME, { delay: 30 });
  if (passInput) await passInput.type(PASSWORD, { delay: 30 });
  await page.evaluate(() => { document.querySelector("form")?.submit(); });
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

  const cookies = await page.cookies();
  await browser.close();

  const sid  = cookies.find((c) => c.name === "sessionid");
  const csrf = cookies.find((c) => c.name === "csrftoken");
  if (!sid) throw new Error("Login failed — no sessionid. URL after login was unexpected.");

  const cookieHdr = `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
  console.log("✅ Logged in\n");
  return cookieHdr;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const cookieHdr = await login();

  // Build gc_driver_id → driver_id mapping from our DB
  const wbDrivers = await sql`SELECT driver_id, name, gc_driver_id FROM drivers WHERE active = true`;
  const gcMap = {};      // gc_driver_id (int) → { driverId, name }
  const nameMap = {};    // norm name string → driver_id (fallback)
  for (const d of wbDrivers) {
    if (d.gc_driver_id) gcMap[String(d.gc_driver_id)] = { driverId: d.driver_id, name: d.name };
    nameMap[normName(d.name)] = d.driver_id;
  }
  console.log(`Loaded ${Object.keys(gcMap).length} GC driver mappings from DB`);

  // Check which dates already have data
  const existingRows = await sql`SELECT DISTINCT date::text FROM gc_route_days`;
  const existingDates = new Set(existingRows.map((r) => r.date));
  console.log(`${existingDates.size} dates already in DB\n`);

  const today = new Date();
  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalNoData   = 0;

  for (let i = 1; i <= DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    if (existingDates.has(dateStr)) {
      console.log(`${dateStr} — already in DB, skipping`);
      continue;
    }

    // Fetch route-days list for this date
    const resp = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${dateStr}`);
    if (resp._err || resp._raw) {
      console.log(`${dateStr} — API error: ${resp._err || resp._raw}`);
      continue;
    }

    const routeDays = resp.results || [];
    if (routeDays.length === 0) {
      console.log(`${dateStr} — no data`);
      totalNoData++;
      continue;
    }

    console.log(`${dateStr} — ${routeDays.length} route-days, fetching details...`);
    let inserted = 0;

    for (const rd of routeDays) {
      // Fetch full detail for stops_per_hour and driver name
      const detail = await apiGet(cookieHdr, `/api/route-days/${rd.id}/`);
      if (detail._err || detail._raw) {
        console.log(`  route-day ${rd.id}: fetch error — ${detail._err || detail._raw}`);
        continue;
      }

      // Match driver to Wayne Board
      const gcDriverId = detail.driver?.id ?? null;
      let driverId = null;

      if (gcDriverId && gcMap[String(gcDriverId)]) {
        driverId = gcMap[String(gcDriverId)].driverId;
      } else if (detail.driver?.user) {
        // Fallback: name match
        const gcName = `${detail.driver.user.first_name} ${detail.driver.user.last_name}`.trim();
        const norm = normName(gcName);
        driverId = nameMap[norm] ?? null;
        if (!driverId) {
          // Try first-name-only match
          const firstName = norm.split(" ")[0];
          const hit = Object.entries(nameMap).find(([k]) => k.startsWith(firstName + " "));
          if (hit) driverId = hit[1];
        }
      }

      const gcName = detail.driver?.user
        ? `${detail.driver.user.first_name} ${detail.driver.user.last_name}`.trim()
        : "";
      const sph   = parseFloat(detail.stops_per_hour) || null;
      const miles = parseFloat(detail.miles_total)    || null;
      const trav  = parseFloat(detail.miles_traveled) || null;
      const dt    = detail.drive_time != null ? Math.round(parseFloat(detail.drive_time)) : null;

      try {
        await sql`
          INSERT INTO gc_route_days
            (gc_route_day_id, driver_id, driver_name, route_name, date,
             stops_per_hour, miles_total, miles_traveled, drive_time, status)
          VALUES (
            ${detail.id},
            ${driverId},
            ${gcName},
            ${detail.route?.name ?? ""},
            ${dateStr},
            ${sph},
            ${miles},
            ${trav},
            ${dt},
            ${detail.status ?? ""}
          )
          ON CONFLICT (gc_route_day_id) DO UPDATE SET
            driver_id      = EXCLUDED.driver_id,
            driver_name    = EXCLUDED.driver_name,
            route_name     = EXCLUDED.route_name,
            date           = EXCLUDED.date,
            stops_per_hour = EXCLUDED.stops_per_hour,
            miles_total    = EXCLUDED.miles_total,
            miles_traveled = EXCLUDED.miles_traveled,
            drive_time     = EXCLUDED.drive_time,
            status         = EXCLUDED.status,
            synced_at      = NOW()
        `;
        inserted++;
        const matchStr = driverId ? `→ ${driverId}` : "(unmatched)";
        console.log(`  ${gcName || "(no name)"} ${matchStr}  SPH=${sph ?? "—"}`);
      } catch (err) {
        console.error(`  INSERT failed for route-day ${detail.id}:`, err.message);
      }

      await sleep(50); // gentle rate limiting
    }

    totalInserted += inserted;
    totalSkipped  += routeDays.length - inserted;
    console.log(`  → Inserted ${inserted}/${routeDays.length}\n`);
    await sleep(200);
  }

  console.log("═══════════════════════════════════════");
  console.log(`✅ Backfill complete`);
  console.log(`   Days with no data: ${totalNoData}`);
  console.log(`   Total rows inserted/updated: ${totalInserted}`);
}

run().catch((err) => { console.error("Fatal:", err); process.exit(1); });
